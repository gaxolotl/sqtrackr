import express from "express";
import ratelimit from "express-rate-limit";
import {
  approveTorrentSubmission,
  fetchTorrentSubmission,
  listTorrentSubmissions,
  notifyTorrentSubmissionDecision,
  rejectTorrentSubmission,
} from "../controllers/uploadModeration.js";

const router = express.Router();
const limiter = ratelimit({
  windowMs: 1000 * 60,
  max: 120,
  keyGenerator: (req) => req.userId?.toString() ?? req.ip,
  skip: (req) =>
    process.env.NODE_ENV !== "production" || req.method === "OPTIONS",
});

export default () => {
  router.get("/torrent-submissions", limiter, listTorrentSubmissions);
  router.get(
    "/torrent-submissions/:submissionId",
    limiter,
    fetchTorrentSubmission,
  );
  router.post(
    "/torrent-submissions/:submissionId/approve",
    limiter,
    approveTorrentSubmission,
  );
  router.post(
    "/torrent-submissions/:submissionId/reject",
    limiter,
    rejectTorrentSubmission,
  );
  router.post(
    "/torrent-submissions/:submissionId/notify",
    limiter,
    notifyTorrentSubmissionDecision,
  );
  return router;
};
