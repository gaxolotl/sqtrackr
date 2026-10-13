import express from "express";
import morgan from "morgan";
import chalk from "chalk";
import net from "net";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import cors from "cors";
import mongoose from "mongoose";
import nodemailer from "nodemailer";
import ratelimit from "express-rate-limit";
import Tracker from "bittorrent-tracker";
import * as Sentry from "@sentry/node";
import config from "../../config.js";
import validateConfig from "./utils/validateConfig.js";
import createTrackerRoute from "./tracker/routes.js";
import auth, { hasValidServerSecret } from "./middleware/auth.js";
import {
  accountRoutes,
  userRoutes,
  torrentRoutes,
  announcementRoutes,
  reportRoutes,
  adminRoutes,
  requestRoutes,
  groupRoutes,
  wikiRoutes,
  forumRoutes,
  messageRoutes,
  moderationRoutes,
  notificationRoutes,
} from "./routes/index.js";
import {
  register,
  login,
  initiatePasswordReset,
  finalisePasswordReset,
  verifyUserEmail,
} from "./controllers/user.js";
import {
  downloadTorrent,
  fetchTorrent,
  listLatest,
  listTags,
  searchTorrents,
} from "./controllers/torrent.js";
import { getWiki } from "./controllers/wiki.js";
import { rssFeed } from "./controllers/rss.js";
import createAdminUser from "./setup/createAdminUser.js";
import { envFlag } from "./utils/env.js";
import { loadRuntimeSettings } from "./utils/runtimeSettings.js";
import { serveAvatar } from "./controllers/profile.js";
import { getTrackerBaseUrl } from "./utils/trackerUrl.js";
import { getContentLimits } from "./utils/contentLimits.js";
import { createPluginHost } from "./plugins/host.js";
import pluginRegistry from "./plugins/registry.js";
import Torrent from "./schema/torrent.js";
import TorrentSubmission from "./schema/torrentSubmission.js";
import Conversation from "./schema/conversation.js";
import Message from "./schema/message.js";
import User from "./schema/user.js";
import Progress from "./schema/progress.js";
import Comment from "./schema/comment.js";
import Request from "./schema/request.js";
import Announcement from "./schema/announcement.js";
import Report from "./schema/report.js";
import Wiki from "./schema/wiki.js";
import ApiToken from "./schema/apiToken.js";
import Notification from "./schema/notification.js";
import Snatch from "./schema/snatch.js";
import Warning from "./schema/warning.js";
import Invite from "./schema/invite.js";
import AuditLog from "./schema/auditLog.js";
import CheatLog from "./schema/cheatLog.js";

mongoose.set("strictQuery", true);

validateConfig(config)
  .then(async () => {
    // Query-string secrets plus path-segment credentials: /announce/:uid
    // carries the tracker's per-user auth credential and
    // /torrent/download/:infoHash/:userId carries a user id, so both are
    // redacted before anything reaches logs or Sentry.
    const redactSensitiveQuery = (url) =>
      url
        ?.replace(
          /([?&](?:token|rssToken|password|passwd|passkey|secret|api[_-]?key)=)[^&]*/gi,
          "$1[redacted]",
        )
        ?.replace(/(\/announce\/)[^/?#\s]+/g, "$1[redacted]")
        ?.replace(
          /(\/torrent\/download\/[^/?#\s]+\/)[^/?#\s]+/g,
          "$1[redacted]",
        );

    if (process.env.SENTRY_DSN) {
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
        environment:
          process.env.NODE_ENV === "production" ? "production" : "development",
        beforeSend(event) {
          if (event.request?.headers) {
            delete event.request.headers.authorization;
            delete event.request.headers.cookie;
          }
          if (typeof event.request?.url === "string") {
            event.request.url = redactSensitiveQuery(event.request.url);
          }
          if (Array.isArray(event.breadcrumbs)) {
            for (const crumb of event.breadcrumbs) {
              if (crumb?.data?.url && typeof crumb.data.url === "string") {
                crumb.data.url = redactSensitiveQuery(crumb.data.url);
              }
            }
          }
          return event;
        },
      });

      Sentry.setContext("deployment", {
        name: process.env.SQ_SITE_NAME,
        url: process.env.SQ_BASE_URL,
      });
    }

    let mail;

    if (!envFlag("SQ_DISABLE_EMAIL")) {
      mail = nodemailer.createTransport({
        host: process.env.SQ_SMTP_HOST,
        port: process.env.SQ_SMTP_PORT,
        secure: envFlag("SQ_SMTP_SECURE"),
        auth: {
          user: process.env.SQ_SMTP_USER,
          pass: process.env.SQ_SMTP_PASS,
        },
      });
    }

    const connectToDb = () => {
      console.log("[sq] initiating db connection...");
      mongoose.connect(process.env.SQ_MONGO_URL).catch((e) => {
        console.error(`[sq] error on initial db connection: ${e.message}`);
        setTimeout(connectToDb, 5000);
      });
    };
    const databaseReady = new Promise((resolve, reject) => {
      mongoose.connection.once("open", async () => {
        try {
          console.log("[sq] connected to mongodb successfully");
          await Promise.all([
            Torrent.init(),
            TorrentSubmission.init(),
            Conversation.init(),
            Message.init(),
            User.init(),
            Progress.init(),
            Comment.init(),
            Request.init(),
            Announcement.init(),
            Report.init(),
            Wiki.init(),
            ApiToken.init(),
            Notification.init(),
            Snatch.init(),
            Warning.init(),
            Invite.init(),
            AuditLog.init(),
            CheatLog.init(),
          ]);
          await loadRuntimeSettings();
          await createAdminUser(mail);
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
    connectToDb();

    const app = express();
    // Single reverse-proxy hop (nginx OR traefik, never chained) between the
    // client and the API: api ports are bound to 127.0.0.1 and the proxy
    // appends $proxy_add_x_forwarded_for. Trusting exactly one hop keeps
    // req.ip/client-IP correct for rate limiting and logs, while `true`
    // (trust-all) would let any client spoof X-Forwarded-For past the proxy.
    // `loopback` alone is wrong here: the proxy reaches the API over the
    // docker bridge network, not loopback, so it would collapse every user
    // into one shared rate-limit bucket keyed by the proxy IP.
    app.set("trust proxy", 1);
    // Defense-in-depth: the flat "simple" parser cannot build nested objects
    // or arrays from `?a[b]=c` syntax, so crafted query strings cannot turn
    // flat `req.query` string checks (torrent/forum/search/RSS) into objects.
    app.set("query parser", "simple");
    app.disable("x-powered-by");
    app.use((req, res, next) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=(), browsing-topics=()",
      );
      if (process.env.NODE_ENV === "production") {
        res.setHeader(
          "Strict-Transport-Security",
          "max-age=63072000; includeSubDomains",
        );
      }
      next();
    });

    const colorizeStatus = (status) => {
      if (!status) return "?";
      if (status.startsWith("2")) {
        return chalk.green(status);
      } else if (status.startsWith("4") || status.startsWith("5")) {
        return chalk.red(status);
      } else {
        return chalk.cyan(status);
      }
    };

    app.use(
      morgan((tokens, req, res) => {
        return [
          chalk.grey(new Date().toISOString()),
          chalk.magenta(req.headers["x-forwarded-for"] ?? req.ip),
          chalk.yellow(tokens.method(req, res)),
          redactSensitiveQuery(tokens.url(req, res)),
          colorizeStatus(tokens.status(req, res)),
          `(${tokens["response-time"](req, res)} ms)`,
        ].join(" ");
      }),
    );

    // Open CORS in dev (localhost/127.0.0.1/port mixing); restrict by
    // SQ_BASE_URL in production only. Fail closed when no allowlist is set.
    const corsOrigins = (process.env.SQ_BASE_URL ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    const isProduction = process.env.NODE_ENV === "production";
    app.use(
      cors(
        corsOrigins.length
          ? { origin: corsOrigins, credentials: false }
          : isProduction
            ? { origin: false, credentials: false }
            : {},
      ),
    );

    // rate limit all API routes. if the request comes from Next SSR rather than
    // the client browser, we need to make use of the forwarded IP rather than
    // the origin of the request, as this will be the same for all users. to
    // prevent avoiding a client spoofing this to avoid the limit, we also verify
    // a secret only available to the server. The comparison is constant-time
    // (hasValidServerSecret) so the secret cannot be probed byte-by-byte, and
    // the forwarded value must parse as an IP, so spoofed garbage cannot shard
    // buckets or poison logs.
    const rateLimitOptions = (max, windowMs) => ({
      windowMs,
      max,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      keyGenerator: (req) => {
        const forwarded = req.headers["x-forwarded-for"];
        if (
          typeof forwarded === "string" &&
          forwarded &&
          hasValidServerSecret(req)
        ) {
          const first = forwarded.split(",")[0].trim();
          if (first && net.isIP(first)) return first;
        }
        return req.ip;
      },
      skip: (req) => {
        // Keep limits enabled in every environment so dev/staging clones with
        // production data cannot be brute-forced. OPTIONS stays exempt.
        return req.method === "OPTIONS";
      },
    });

    // coarse global limit shared by every route
    const limiter = ratelimit(rateLimitOptions(120, 1000 * 60));
    app.use(limiter);

    // stricter limits on endpoints that are attractive to brute force
    const authLimiter = ratelimit(rateLimitOptions(10, 1000 * 60 * 15));
    // expensive authenticated routes: search, RSS, avatar, download
    const searchLimiter = ratelimit(rateLimitOptions(30, 1000 * 60));
    const rssLimiter = ratelimit(rateLimitOptions(60, 1000 * 60));

    const tracker = new Tracker.Server({
      http: false,
      udp: false,
      ws: false,
    });
    const pluginHost = createPluginHost({ registry: pluginRegistry, tracker });
    await pluginHost.register();
    const onTrackerRequest = tracker._onRequest.bind(tracker);
    app.get("/announce/:uid", createTrackerRoute("announce", onTrackerRequest));
    app.get(
      "/announce/:uid/scrape",
      createTrackerRoute("scrape", onTrackerRequest),
    );
    // legacy tracker path, kept so already-downloaded torrents keep announcing
    app.get("/sq/*/announce", createTrackerRoute("announce", onTrackerRequest));
    app.get("/sq/*/scrape", createTrackerRoute("scrape", onTrackerRequest));

    // Small default body limit; large uploads mount a higher limit only on
    // their own routes so login/comments/votes cannot be used for memory DoS.
    const smallJson = bodyParser.json({ limit: "100kb" });
    // 16mb covers max legit torrent payload: 10240 KB raw -> ~13.6 MB base64.
    const largeJson = bodyParser.json({ limit: "16mb" });
    app.use((req, res, next) => {
      const largePath =
        req.path.startsWith("/torrent") ||
        req.path.includes("/avatar") ||
        req.path.startsWith("/plugins");
      return (largePath ? largeJson : smallJson)(req, res, next);
    });
    app.use(cookieParser());

    app.get("/", (req, res) => {
      res.setHeader("Content-Type", "text/plain");
      res.status(200).send(`■ sqtracker running: ${process.env.SQ_SITE_NAME}`);
    });

    // Public, read-only configuration used by the Next.js client. Never expose
    // secrets, SMTP settings, or database credentials here.
    // Intentionally not public: economy/HnR/blacklists (SQ_MINIMUM_RATIO,
    // SQ_MAXIMUM_HIT_N_RUNS, SQ_MIN_SEEDTIME_HOURS, SQ_HNR_GRACE_HOURS,
    // SQ_BP_*, SQ_EXTENSION/CLIENT_BLACKLIST) are admin-only via /admin/settings.
    app.get("/config", (req, res) => {
      const parseJson = (value, fallback) => {
        if (!value) return fallback;
        try {
          return JSON.parse(value);
        } catch {
          return fallback;
        }
      };

      res.json({
        siteName: process.env.SQ_SITE_NAME,
        siteDescription: process.env.SQ_SITE_DESCRIPTION,
        showPageInTitle: process.env.SQ_SHOW_PAGE_IN_TITLE !== "false",
        contentCentered: process.env.SQ_CONTENT_CENTERED === "true",
        contentMaxWidth: Number(process.env.SQ_CONTENT_MAX_WIDTH || 1040),
      shortenMatchedTorrentNames:
        process.env.SQ_SHORTEN_MATCHED_TORRENT_NAMES !== "false",
      contentLimits: getContentLimits(),
        allowRegister: process.env.SQ_ALLOW_REGISTER,
        allowAnonymousUploads:
          process.env.SQ_ALLOW_ANONYMOUS_UPLOADS === "true",
        torrentPremoderation:
          process.env.SQ_TORRENT_PREMODERATION === "true",
        categories: parseJson(process.env.SQ_TORRENT_CATEGORIES, {}),
        siteWideFreeleech: process.env.SQ_SITE_WIDE_FREELEECH === "true",
        allowUnregisteredView:
          process.env.SQ_ALLOW_UNREGISTERED_VIEW === "true",
        defaultLocale: process.env.SQ_SITE_DEFAULT_LOCALE || "en",
        customTheme: parseJson(process.env.SQ_CUSTOM_THEME, undefined),
        trackerUrl: getTrackerBaseUrl(),
        avatarMaxResolution: Number(
          process.env.SQ_AVATAR_MAX_RESOLUTION || 512,
        ),
        avatarMaxSizeKb: Number(process.env.SQ_AVATAR_MAX_SIZE_KB || 512),
        allowGifAvatars: process.env.SQ_ALLOW_GIF_AVATARS !== "false",
        rssReadersEnabled: process.env.SQ_ENABLE_RSS_READERS !== "false",
        torrentActionOrder: parseJson(process.env.SQ_TORRENT_ACTION_ORDER, [
          "upvote",
          "downvote",
          "bookmark",
          "freeleech",
          "delete",
        ]),
        forumEnabled: process.env.SQ_ENABLE_FORUM !== "false",
        announcementsEnabled: process.env.SQ_ENABLE_ANNOUNCEMENTS !== "false",
        rssEnabled: process.env.SQ_ENABLE_RSS !== "false",
      });
    });
    app.get("/user/:username/avatar", serveAvatar);

    // auth routes
    app.post("/register", authLimiter, register(mail));
    app.post("/login", authLimiter, login);
    app.post(
      "/reset-password/initiate",
      authLimiter,
      initiatePasswordReset(mail),
    );
    app.post("/reset-password/finalise", authLimiter, finalisePasswordReset);
    app.post("/verify-email", authLimiter, verifyUserEmail);

    // rss feed (token auth in query)
    app.get("/rss", rssLimiter, (req, res, next) => {
      if (process.env.SQ_ENABLE_RSS === "false") {
        res.status(403).send("RSS is disabled");
        return;
      }
      rssFeed(tracker)(req, res, next);
    });

    // torrent file download: pre-auth by design so RSS readers and
    // BitTorrent clients (which cannot use the browser JWT) can fetch via
    // the per-user announce uid in the path. That uid is a bearer
    // credential: anyone holding it can download as that user and announce
    // as them. Uids rotate only via POST /account/rotate-uid, and RSS
    // tokens are revoked on password change/sign-out-everywhere.
    app.get("/torrent/download/:infoHash/:userId", searchLimiter, downloadTorrent);

    const whenPublicViewingEnabled = (handler) => (req, res, next) => {
      if (!envFlag("SQ_ALLOW_UNREGISTERED_VIEW") || req.headers.authorization) {
        next();
        return;
      }
      handler(req, res, next);
    };
    app.get(
      "/torrent/info/:infoHash",
      whenPublicViewingEnabled(fetchTorrent(tracker)),
    );
    app.get("/torrent/latest", whenPublicViewingEnabled(listLatest(tracker)));
    app.get(
      "/torrent/search",
      searchLimiter,
      whenPublicViewingEnabled(searchTorrents(tracker)),
    );
    app.get("/torrent/tags", whenPublicViewingEnabled(listTags));
    app.get("/wiki", whenPublicViewingEnabled(getWiki));
    app.get("/wiki/*", whenPublicViewingEnabled(getWiki));
    app.use("/plugins", pluginHost.publicRouter);

    // everything from here on requires user auth
    app.use(auth);

    app.use("/plugins", pluginHost.userRouter);
    app.use("/plugins", pluginHost.staffRouter);
    app.use("/plugins", pluginHost.adminRouter);
    app.use("/admin/plugins", pluginHost.managementRouter);

    app.use("/account", accountRoutes(tracker, mail));
    app.use("/user", userRoutes(tracker));
    app.use("/torrent", torrentRoutes(tracker));
    app.use("/announcements", announcementRoutes());
    app.use("/reports", reportRoutes());
    app.use("/admin", adminRoutes(tracker));
    app.use("/requests", requestRoutes());
    app.use("/group", groupRoutes());
    app.use("/wiki", wikiRoutes());
    app.use("/forum", forumRoutes());
    app.use("/messages", messageRoutes());
    app.use("/moderation", moderationRoutes());
    app.use("/notifications", notificationRoutes());

    app.use((err, req, res, next) => {
      if (res.headersSent) {
        next(err);
        return;
      }
      console.error(
        "[sq] error in",
        redactSensitiveQuery(req.url),
        err?.message ?? err,
      );
      res.type("text/plain").status(500).send("sqtracker API error");
    });

    await databaseReady;
    await pluginHost.initialize();
    await pluginHost.ready();
    const parsedPort = Number(process.env.SQ_PORT || 3001);
    const port =
      Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535
        ? parsedPort
        : 3001;
    const server = await new Promise((resolve, reject) => {
      const listener = app.listen(port, () => resolve(listener));
      listener.once("error", reject);
    });
    console.log(`[sq] ■ sqtracker running http://localhost:${port}`);

    let stopping = false;
    const stop = async () => {
      if (stopping) return;
      stopping = true;
      try {
        await new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
        await pluginHost.stop();
        await mongoose.disconnect();
      } catch (error) {
        console.error("[sq] shutdown failed:", error);
        process.exitCode = 1;
      }
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  })
  .catch((error) => {
    console.error("[sq] startup failed:", error);
    process.exitCode = 1;
  });
