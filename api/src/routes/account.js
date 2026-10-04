import express from "express";
import ratelimit from "express-rate-limit";
import {
  appealWarning,
  createApiToken,
  deleteSavedSearch,
  fetchInvites,
  generateInvite,
  changePassword,
  getDashboard,
  getOwnWarnings,
  getSavedSearches,
  listApiTokens,
  revokeApiToken,
  rotateAnnounceUid,
  signOutEverywhere,
  getUserStats,
  getUserRole,
  getUserVerifiedEmailStatus,
  buyItems,
  generateTotpSecret,
  enableTotp,
  disableTotp,
  deleteAccount,
  getUserBookmarks,
  saveSearch,
} from "../controllers/user.js";
import {
  deleteAvatar,
  fetchOwnProfile,
  updateOwnProfile,
  uploadAvatar,
} from "../controllers/profile.js";
import { getRssToken, regenerateRssToken } from "../controllers/rss.js";

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

export default (tracker, mail) => {
  router.get("/invites", limiter, fetchInvites);
  router.post("/generate-invite", limiter, generateInvite(mail));
  router.post("/change-password", limiter, changePassword(mail));
  router.get("/get-stats", limiter, getUserStats);
  router.get("/dashboard", limiter, getDashboard);
  router.get("/searches", limiter, getSavedSearches);
  router.post("/searches", limiter, saveSearch);
  router.delete("/searches/:searchId", limiter, deleteSavedSearch);
  router.get("/warnings", limiter, getOwnWarnings);
  router.post("/warnings/:warningId/appeal", limiter, appealWarning);
  router.get("/tokens", limiter, listApiTokens);
  router.post("/tokens", limiter, createApiToken);
  router.delete("/tokens/:tokenId", limiter, revokeApiToken);
  router.post("/rotate-uid", limiter, rotateAnnounceUid);
  router.post("/sign-out-all", limiter, signOutEverywhere);
  router.get("/get-role", limiter, getUserRole);
  router.get("/get-verified", limiter, getUserVerifiedEmailStatus);
  router.post("/buy", limiter, buyItems);
  router.get("/totp/generate", limiter, generateTotpSecret);
  router.post("/totp/enable", limiter, enableTotp);
  router.post("/totp/disable", limiter, disableTotp);
  router.post("/delete", limiter, deleteAccount);
  router.get("/bookmarks", limiter, getUserBookmarks(tracker));
  router.get("/profile", limiter, fetchOwnProfile);
  router.patch("/profile", limiter, updateOwnProfile);
  router.post("/avatar", limiter, uploadAvatar);
  router.delete("/avatar", limiter, deleteAvatar);
  router.get("/rss-token", limiter, getRssToken);
  router.post("/rss-token/regenerate", limiter, regenerateRssToken);
  return router;
};
