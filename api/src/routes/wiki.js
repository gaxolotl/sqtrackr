import express from "express";
import net from "net";
import ratelimit from "express-rate-limit";
import { hasValidServerSecret } from "../middleware/auth.js";
import {
  createWiki,
  getWiki,
  deleteWiki,
  updateWiki,
} from "../controllers/wiki.js";

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
  router.post("/new", limiter, createWiki);
  router.post("/update/:wikiId", limiter, updateWiki);
  router.get("*", limiter, getWiki);
  router.delete("*", limiter, deleteWiki);
  return router;
};
