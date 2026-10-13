import express from "express";
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

export default () => {
  router.post("/remove/:infoHash", limiter, removeTorrentFromGroup);
  router.get("/search", limiter, findFuzzyGroupMatches);
  return router;
};
