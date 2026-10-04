import bcrypt from "bcrypt";
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
  const { username, password } = req.cookies;
  const { query, token } = req.query;

  try {
    let user;
    if (typeof token === "string" && token) {
      user = await User.findOne(
        { rssToken: token },
        { uid: 1, banned: 1 },
      ).lean();
    } else if (username && password) {
      user = await User.findOne({ username }, { password: 1, uid: 1, banned: 1 }).lean();
      if (user && !(await bcrypt.compare(password, user.password))) user = null;
    }

    if (!user || user.banned) {
      res.status(401).send("Incorrect login details");
      return;
    }

    const searchQuery =
      typeof query === "string" ? escapeRegex(query.slice(0, 200)) : "";
    const rssProjection = { name: 1, description: 1, infoHash: 1, size: 1 };
    let torrents;
    if (query) {
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

export const getRssToken = async (req, res, next) => {
  try {
    let user = await User.findById(req.userId, { rssToken: 1 });
    if (!user) {
      res.status(404).send("User does not exist");
      return;
    }
    if (!user.rssToken) {
      user.rssToken = createRssToken();
      await user.save();
    }
    res.json({ token: user.rssToken });
  } catch (error) {
    next(error);
  }
};

export const regenerateRssToken = async (req, res, next) => {
  try {
    const rssToken = createRssToken();
    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: { rssToken } },
      { new: true },
    );
    if (!user) {
      res.status(404).send("User does not exist");
      return;
    }
    res.json({ token: rssToken });
  } catch (error) {
    next(error);
  }
};
