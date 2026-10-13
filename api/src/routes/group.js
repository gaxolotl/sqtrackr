import express from "express";
import net from "net";
import ratelimit from "express-rate-limit";
import { hasValidServerSecret } from "../middleware/auth.js";
import {
  removeTorrentFromGroup,
  findFuzzyGroupMatches,
} from "../controllers/group.js";

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

export default () => {
  router.post("/remove/:infoHash", limiter, removeTorrentFromGroup);
  router.get("/search", limiter, findFuzzyGroupMatches);
  return router;
};
