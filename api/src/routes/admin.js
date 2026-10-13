import express from "express";
import net from "net";
import ratelimit from "express-rate-limit";
import { hasValidServerSecret } from "../middleware/auth.js";
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
    return req.method === "OPTIONS";
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
