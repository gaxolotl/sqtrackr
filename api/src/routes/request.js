import express from "express";
import net from "net";
import ratelimit from "express-rate-limit";
import { hasValidServerSecret } from "../middleware/auth.js";
import {
  acceptCandidate,
  addCandidate,
  addComment as addCommentRequest,
  createRequest,
  deleteRequest,
  fetchRequest,
  getRequests,
  topUpRequest,
} from "../controllers/request.js";

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
  router.post("/new", limiter, createRequest);
  router.get("/page/:page", limiter, getRequests);
  router.get("/:index", limiter, fetchRequest);
  router.delete("/:index", limiter, deleteRequest);
  router.post("/comment/:requestId", limiter, addCommentRequest);
  router.post("/topup/:requestId", limiter, topUpRequest);
  router.post("/suggest/:requestId", limiter, addCandidate);
  router.post("/accept/:requestId", limiter, acceptCandidate);
  return router;
};
