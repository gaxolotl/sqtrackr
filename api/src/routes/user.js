import express from "express";
import net from "net";
import ratelimit from "express-rate-limit";
import { hasValidServerSecret } from "../middleware/auth.js";
import {
  banUser,
  fetchUser,
  issueWarning,
  resolveWarning,
  setUserRole,
  unbanUser,
} from "../controllers/user.js";

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
  router.post("/ban/:username", limiter, banUser);
  router.post("/unban/:username", limiter, unbanUser);
  router.post("/role/:username", limiter, setUserRole);
  router.post("/warn/:username", limiter, issueWarning);
  router.post("/unwarn/:warningId", limiter, resolveWarning);
  router.get("/:username", limiter, fetchUser(tracker));
  return router;
};
