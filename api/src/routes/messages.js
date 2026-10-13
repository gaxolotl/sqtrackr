import express from "express";
import net from "net";
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
