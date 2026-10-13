import express from "express";
import ratelimit from "express-rate-limit";
import { hasValidServerSecret } from "../middleware/auth.js";
import {
  addParticipants,
  archiveConversation,
  createConversation,
  getConversation,
  getInbox,
  getMessages,
  getUnreadCount,
  leaveConversation,
  markConversationRead,
  sendMessage,
} from "../controllers/messages.js";

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

export default () => {
  router.get("/unread-count", limiter, getUnreadCount);
  router.get("/page/:page", limiter, getInbox);
  router.post("/", limiter, createConversation);
  router.get("/:conversationId/messages/page/:page", limiter, getMessages);
  router.post("/:conversationId/read", limiter, markConversationRead);
  router.post("/:conversationId/participants", limiter, addParticipants);
  router.post("/:conversationId/archive", limiter, archiveConversation);
  router.post("/:conversationId/leave", limiter, leaveConversation);
  router.get("/:conversationId", limiter, getConversation);
  router.post("/:conversationId", limiter, sendMessage);
  return router;
};
