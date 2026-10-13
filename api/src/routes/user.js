import express from "express";
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

export default (tracker) => {
  router.post("/ban/:username", limiter, banUser);
  router.post("/unban/:username", limiter, unbanUser);
  router.post("/role/:username", limiter, setUserRole);
  router.post("/warn/:username", limiter, issueWarning);
  router.post("/unwarn/:warningId", limiter, resolveWarning);
  router.get("/:username", limiter, fetchUser(tracker));
  return router;
};
