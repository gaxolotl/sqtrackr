import crypto from "crypto";
import User from "../schema/user.js";
import Torrent from "../schema/torrent.js";
import { embellishTorrentsWithTrackerScrape } from "./torrent.js";
import { getAnnounceUrl } from "../utils/trackerUrl.js";

const escapeXml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// prettier-ignore
const getTorrentXml = (torrent, userId) => {
  return `<item>
      <title>${escapeXml(torrent.name)}</title>
      <description>${escapeXml(torrent.description)}</description>
      <guid>${escapeXml(torrent.infoHash)}</guid>
      <enclosure url="${escapeXml(process.env.SQ_API_URL)}/torrent/download/${encodeURIComponent(torrent.infoHash)}/${encodeURIComponent(userId)}" length="${Number(torrent.size) || 0}" type="application/x-bittorrent" />
      <torrent>
        <filename>${escapeXml(torrent.name)}</filename>
        <contentlength>${Number(torrent.size) || 0}</contentlength>
        <trackers>
          <group order="ordered">
            <tracker seeds="${torrent.seeders}" peers="${torrent.seeders + torrent.leechers}">
              ${escapeXml(getAnnounceUrl(userId))}
            </tracker>
          </group>
        </trackers>
      </torrent>
    </item>`
};

export const rssFeed = (tracker) => async (req, res, next) => {
  const { query, token } = req.query;

  try {
    let user;
    if (typeof token === "string" && token) {
      // Token-first: the per-user token (?token=) is the primary path
      // because feed readers cannot use the browser's local-storage JWT.
      // Newly issued tokens match by sha256 hash while legacy plaintext
      // tokens stored before hashing still match directly, so existing feed
      // URLs keep working with no mass migration. A legacy match is
      // accepted once, then auto-migrated to hash-only storage (never
      // re-displayed); subsequent reads match by hash.
      const tokenHash = hashRssToken(token);
      user = await User.findOne(
        {
          $or: [{ rssTokenHash: tokenHash }, { rssToken: token }],
        },
        { uid: 1, banned: 1, rssToken: 1, rssTokenHash: 1 },
      ).lean();
      if (user && user.rssToken === token && user.rssTokenHash !== tokenHash) {
        // Best-effort migration: must never break the feed read, so a
        // failure is swallowed and retried on the next feed fetch.
        void User.updateOne(
          { _id: user._id },
          { $set: { rssTokenHash: tokenHash }, $unset: { rssToken: 1 } },
        ).catch(() => {});
      }
    } else {
      res.status(401).send("Incorrect login details");
      return;
    }

    if (!user || user.banned) {
      res.status(401).send("Incorrect login details");
      return;
    }

    const searchQuery =
      typeof query === "string" ? escapeRegex(query.slice(0, 200)) : "";
    const rssProjection = { name: 1, description: 1, infoHash: 1, size: 1 };
    let torrents;
    // `query` arrives via the query parser: only honor plain
    // strings so crafted objects cannot bypass the search branch.
    if (typeof query === "string" && query) {
      torrents = await Torrent.find(
        {
          $or: [
            { name: { $regex: searchQuery, $options: "i" } },
            {
              description: { $regex: searchQuery, $options: "i" },
            },
          ],
        },
        rssProjection,
        { sort: { created: -1 }, limit: 100 },
      ).lean();
    } else {
      torrents = await Torrent.find({}, rssProjection, {
        sort: { created: -1 },
        limit: 100,
      }).lean();
    }

    const torrentsWithScrape = await embellishTorrentsWithTrackerScrape(
      tracker,
      torrents,
    );

    const torrentsXml = torrentsWithScrape
      .map((t) => getTorrentXml(t, user.uid))
      .join("\n");

    res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
    res.status(200).send(`<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(process.env.SQ_SITE_NAME)}: ${query ? "results" : "latest"}</title>
    <link>${escapeXml(process.env.SQ_BASE_URL)}</link>
    ${torrentsXml}
  </channel>
</rss>`);
  } catch (e) {
    next(e);
  }
};

const createRssToken = () => crypto.randomBytes(32).toString("hex");

const hashRssToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

export const getRssToken = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId, {
      rssToken: 1,
      rssTokenHash: 1,
    });
    if (!user) {
      res.status(404).send("User does not exist");
      return;
    }
    // Legacy plaintext tokens are never re-displayed: hash the value and
    // drop the plaintext so storage becomes hash-only from here on. The
    // existing feed URL keeps working (feed reads verify via the hash);
    // the RSS page prompts to regenerate for a fresh displayable URL.
    if (user.rssToken) {
      await User.updateOne(
        { _id: user._id },
        {
          $set: { rssTokenHash: hashRssToken(user.rssToken) },
          $unset: { rssToken: 1 },
        },
      );
      res.json({ token: null });
      return;
    }
    // Hash-only tokens cannot be revealed again: the plaintext was shown
    // exactly once when it was created/regenerated.
    if (user.rssTokenHash) {
      res.json({ token: null });
      return;
    }
    const plaintext = createRssToken();
    user.rssTokenHash = hashRssToken(plaintext);
    await user.save();
    res.json({ token: plaintext });
  } catch (error) {
    next(error);
  }
};

export const regenerateRssToken = async (req, res, next) => {
  try {
    const plaintext = createRssToken();
    const user = await User.findByIdAndUpdate(
      req.userId,
      {
        $set: { rssTokenHash: hashRssToken(plaintext) },
        $unset: { rssToken: 1 },
      },
      { new: true },
    );
    if (!user) {
      res.status(404).send("User does not exist");
      return;
    }
    // Only the hash is stored; the plaintext is returned exactly once.
    res.json({ token: plaintext });
  } catch (error) {
    next(error);
  }
};
