import express from "express";
import morgan from "morgan";
import chalk from "chalk";
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
import auth from "./middleware/auth.js";
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

mongoose.set("strictQuery", true);

validateConfig(config)
  .then(async () => {
    if (process.env.SENTRY_DSN) {
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        tracesSampleRate: 1.0,
        environment:
          process.env.NODE_ENV === "production" ? "production" : "development",
      });

      Sentry.setContext("deployment", {
        name: process.env.SQ_SITE_NAME,
        url: process.env.SQ_BASE_URL,
        adminEmail: process.env.SQ_ADMIN_EMAIL,
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
    app.set("trust proxy", true);
    app.disable("x-powered-by");

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

    const redactSensitiveQuery = (url) =>
      url?.replace(/([?&](?:token|password|passkey)=)[^&]*/gi, "$1[redacted]");

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

    app.use(cors());

    // rate limit all API routes. if the request comes from Next SSR rather than
    // the client browser, we need to make use of the forwarded IP rather than
    // the origin of the request, as this will be the same for all users. to
    // prevent avoiding a client spoofing this to avoid the limit, we also verify
    // a secret only available to the server
    const rateLimitOptions = (max, windowMs) => ({
      windowMs,
      max,
      keyGenerator: (req) => {
        if (
          req.headers["x-forwarded-for"] &&
          req.headers["x-sq-server-secret"] === process.env.SQ_SERVER_SECRET
        )
          return req.headers["x-forwarded-for"].split(",")[0];
        return req.ip;
      },
      skip: (req) => {
        return (
          process.env.NODE_ENV !== "production" || req.method === "OPTIONS"
        );
      },
    });

    // coarse global limit shared by every route
    const limiter = ratelimit(rateLimitOptions(120, 1000 * 60));
    app.use(limiter);

    // stricter limits on endpoints that are attractive to brute force
    const authLimiter = ratelimit(rateLimitOptions(10, 1000 * 60 * 15));

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

    app.use(bodyParser.json({ limit: "15mb" }));
    app.use(cookieParser());

    app.get("/", (req, res) => {
      res.setHeader("Content-Type", "text/plain");
      res.send(`■ sqtracker running: ${process.env.SQ_SITE_NAME}`).status(200);
    });

    // Public, read-only configuration used by the Next.js client. Never expose
    // secrets, SMTP settings, or database credentials here.
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

    // rss feed (auth handled in cookies)
    app.get("/rss", (req, res, next) => {
      if (process.env.SQ_ENABLE_RSS === "false") {
        res.status(403).send("RSS is disabled");
        return;
      }
      rssFeed(tracker)(req, res, next);
    });

    // torrent file download (can download without auth, will not be able to announce)
    app.get("/torrent/download/:infoHash/:userId", downloadTorrent);

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
      console.error("[sq] error in", req.url, err);
      res.type("text/plain").status(500).send("sqtracker API error");
    });

    await databaseReady;
    await pluginHost.initialize();
    await pluginHost.ready();
    const port = process.env.SQ_PORT || 3001;
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
