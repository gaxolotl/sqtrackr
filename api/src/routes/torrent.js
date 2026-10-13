import express from "express";
import ratelimit from "express-rate-limit";
import { hasValidServerSecret } from "../middleware/auth.js";
import {
  addComment as addCommentTorrent,
  addVote,
  deleteTorrent,
  fetchTorrent,
  listLatest,
  listAll,
  removeVote,
  searchTorrents,
  toggleFreeleech,
  uploadTorrent,
  editTorrent,
  toggleBookmark,
  listTags,
  identifyTorrent,
  suggestTorrents,
} from "../controllers/torrent.js";
import { createReport } from "../controllers/moderation.js";

const router = express.Router();

const limiter = ratelimit({
  windowMs: 1000 * 60,
  max: 120,
  keyGenerator: (req) => {
    if (
      req.headers["x-forwarded-for"] &&
      hasValidServerSecret(req)
    ) {
      return req.headers["x-forwarded-for"].split(",")[0];
    }
    return req.ip;
  },
  skip: (req) => {
    return process.env.NODE_ENV !== "production" || req.method === "OPTIONS";
  },
});

const metadataLimiter = ratelimit({
  windowMs: 1000 * 60,
  max: 20,
  keyGenerator: (req) => req.userId?.toString() ?? req.ip,
  skip: (req) =>
    process.env.NODE_ENV !== "production" || req.method === "OPTIONS",
});

export default (tracker) => {
  router.post("/identify", metadataLimiter, identifyTorrent);
  router.post("/upload", limiter, uploadTorrent);
  router.get("/info/:infoHash", limiter, fetchTorrent(tracker));
  router.delete("/delete/:infoHash", limiter, deleteTorrent);
  router.post("/edit/:infoHash", limiter, editTorrent);
  router.post("/comment/:infoHash", limiter, addCommentTorrent);
  router.post("/vote/:infoHash/:vote", limiter, addVote);
  router.post("/unvote/:infoHash/:vote", limiter, removeVote);
  router.post("/report/:infoHash", limiter, createReport);
  router.post("/toggle-freeleech/:infoHash", limiter, toggleFreeleech);
  router.post("/bookmark/:infoHash", limiter, toggleBookmark);
  router.get("/latest", limiter, listLatest(tracker));
  router.get("/all", limiter, listAll);
  router.get("/suggestions", limiter, suggestTorrents);
  router.get("/search", limiter, searchTorrents(tracker));
  router.get("/tags", limiter, listTags);
  return router;
};
