import express from "express";
import ratelimit from "express-rate-limit";
import {
  approveTorrentSubmission,
  fetchTorrentSubmission,
  listMyTorrentSubmissions,
  listTorrentSubmissions,
  notifyTorrentSubmissionDecision,
  rejectManySubmissions,
  rejectTorrentSubmission,
} from "../controllers/uploadModeration.js";
import { getQueueCounts, listMembers } from "../controllers/moderation.js";

const router = express.Router();
const limiter = ratelimit({
  windowMs: 1000 * 60,
  max: 120,
  keyGenerator: (req) => req.userId?.toString() ?? req.ip,
  skip: (req) =>
    process.env.NODE_ENV !== "production" || req.method === "OPTIONS",
});

export default () => {
  router.get("/members", limiter, listMembers);
  router.get("/my-submissions", limiter, listMyTorrentSubmissions);
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
  router.post(
    "/torrent-submissions/reject-many",
    limiter,
    rejectManySubmissions,
  );
  router.get("/queue-counts", limiter, getQueueCounts);
  return router;
};
