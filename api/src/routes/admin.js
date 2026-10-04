import express from "express";
import ratelimit from "express-rate-limit";
import {
  getStats,
  refreshStats,
  listAuditLog,
  listTorrentPeers,
  listCheatLog,
} from "../controllers/moderation.js";
import { fetchSettings, updateSettings } from "../controllers/settings.js";

const router = express.Router();

const limiter = ratelimit({
  windowMs: 1000 * 60,
  max: 120,
  keyGenerator: (req) => {
    if (
      req.headers["x-forwarded-for"] &&
      req.headers["x-sq-server-secret"] === process.env.SQ_SERVER_SECRET
    ) {
      return req.headers["x-forwarded-for"].split(",")[0];
    }
    return req.ip;
  },
  skip: (req) => {
    return process.env.NODE_ENV !== "production" || req.method === "OPTIONS";
  },
});

export default (tracker) => {
  router.get("/stats", limiter, getStats(tracker));
  router.post("/stats/refresh", limiter, refreshStats(tracker));
  router.get("/torrent/:infoHash/peers", limiter, listTorrentPeers(tracker));
  router.get("/cheat-log/page/:page", limiter, listCheatLog);
  router.get("/audit-log/page/:page", limiter, listAuditLog);
  router.get("/settings", limiter, fetchSettings);
  router.put("/settings", limiter, updateSettings);
  return router;
};
