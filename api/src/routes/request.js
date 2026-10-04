import express from "express";
import ratelimit from "express-rate-limit";
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
