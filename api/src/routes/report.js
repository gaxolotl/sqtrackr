import express from "express";
import net from "net";
import ratelimit from "express-rate-limit";
import { hasValidServerSecret } from "../middleware/auth.js";
import {
  deleteReport,
  fetchReport,
  getQueueCounts,
  getReports,
  getSolvedReports,
  resolveManyReports,
  setReportResolved,
  updateReport,
} from "../controllers/moderation.js";

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
  router.get("/page/:page", limiter, getReports);
  router.get("/solved/page/:page", limiter, getSolvedReports);
  router.post("/resolve-many", limiter, resolveManyReports);
  router.post("/resolve/:reportId", limiter, setReportResolved);
  router.put("/:reportId", limiter, updateReport);
  router.delete("/:reportId", limiter, deleteReport);
  router.get("/:reportId", limiter, fetchReport);
  return router;
};
