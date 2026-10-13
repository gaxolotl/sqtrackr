import express from "express";
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
  router.post("/new", limiter, createWiki);
  router.post("/update/:wikiId", limiter, updateWiki);
  router.get("*", limiter, getWiki);
  router.delete("*", limiter, deleteWiki);
  return router;
};
