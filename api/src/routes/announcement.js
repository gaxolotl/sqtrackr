import express from "express";
import ratelimit from "express-rate-limit";
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
