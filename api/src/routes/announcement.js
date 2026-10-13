import express from "express";
import net from "net";
import ratelimit from "express-rate-limit";
import { hasValidServerSecret } from "../middleware/auth.js";
import {
  addComment,
  createAnnouncement,
  deleteAnnouncement,
  editAnnouncement,
  fetchAnnouncement,
  getAnnouncements,
  getPinnedAnnouncements,
  pinAnnouncement,
  getLatestAnnouncement,
} from "../controllers/announcement.js";

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
  if (process.env.SQ_ENABLE_ANNOUNCEMENTS === "false") {
    router.use((req, res) => res.status(403).send("Announcements are disabled"));
    return router;
  }
  router.post("/new", limiter, createAnnouncement);
  router.get("/pinned", limiter, getPinnedAnnouncements);
  router.get("/latest", limiter, getLatestAnnouncement);
  router.get("/page/:page", limiter, getAnnouncements);
  router.get("/:slug", limiter, fetchAnnouncement);
  router.delete("/:slug", limiter, deleteAnnouncement);
  router.post("/pin/:announcementId/:action", limiter, pinAnnouncement);
  router.post("/edit/:announcementId", limiter, editAnnouncement);
  router.post("/comment/:announcementId", limiter, addComment);
  return router;
};
