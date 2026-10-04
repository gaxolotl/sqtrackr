import express from "express";
import ratelimit from "express-rate-limit";
import {
  createForumCategory,
  createForumPost,
  createForumThread,
  deleteForumCategory,
  deleteForumPost,
  deleteForumThread,
  editForumCategory,
  editForumPost,
  editForumThread,
  getCategoryThreads,
  getForumCategories,
  getForumThread,
  getForumThreadPosts,
  searchForumThreads,
  setForumThreadLocked,
  setForumThreadPinned,
} from "../controllers/forum.js";

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
  if (process.env.SQ_ENABLE_FORUM === "false") {
    router.use((req, res) => res.status(403).send("Forum is disabled"));
    return router;
  }
  router.get("/categories", limiter, getForumCategories);
  router.post("/category", limiter, createForumCategory);
  router.post("/category/:categoryId/edit", limiter, editForumCategory);
  router.delete("/category/:categoryId", limiter, deleteForumCategory);
  router.get(
    "/category/:categoryId/threads/page/:page",
    limiter,
    getCategoryThreads,
  );
  router.post("/thread", limiter, createForumThread);
  router.get("/thread/:threadId", limiter, getForumThread);
  router.post("/thread/:threadId/edit", limiter, editForumThread);
  router.delete("/thread/:threadId", limiter, deleteForumThread);
  router.post("/thread/:threadId/pin/:action", limiter, setForumThreadPinned);
  router.post("/thread/:threadId/lock/:action", limiter, setForumThreadLocked);
  router.get(
    "/thread/:threadId/posts/page/:page",
    limiter,
    getForumThreadPosts,
  );
  router.post("/thread/:threadId/post", limiter, createForumPost);
  router.post("/post/:postId/edit", limiter, editForumPost);
  router.delete("/post/:postId", limiter, deleteForumPost);
  router.get("/search", limiter, searchForumThreads);
  return router;
};
