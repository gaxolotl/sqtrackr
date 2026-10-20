import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../schema/user.js";
import ApiToken from "../schema/apiToken.js";
import Session from "../schema/session.js";
import { SESSION_TOUCH_MS } from "../utils/sessions.js";
import { getApiTokenExpiry } from "../utils/apiTokens.js";

// Constant-time comparison for the Next-SSR server secret. Length is
// checked first because timingSafeEqual throws on mismatched lengths.
// Shared by the auth middleware and the per-route rate-limit key
// generators so forwarded-IP trust cannot be probed byte-by-byte.
export const hasValidServerSecret = (req) => {
  const presented = req.headers?.["x-sq-server-secret"];
  const expected = process.env.SQ_SERVER_SECRET;
  if (typeof presented !== "string" || typeof expected !== "string") {
    return false;
  }
  if (!presented || !expected) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

const auth = async (req, res, next) => {
  if (req.headers.authorization) {
    const parts = req.headers.authorization.split(" ");
    const token =
      parts.length === 2 && /^Bearer$/i.test(parts[0]) ? parts[1] : "";
    if (!token) {
      res.status(401).send("Invalid authentication token");
      return;
    }
    // Personal API tokens are random strings; JWTs are verified below.
    if (token.startsWith("sq_")) {
      try {
        const tokenHash = crypto
          .createHash("sha256")
          .update(token)
          .digest("hex");
        const apiToken = await ApiToken.findOne({
          tokenHash,
          revoked: false,
        }).lean();
        if (!apiToken) {
          res.status(401).send("Invalid authentication token");
          return;
        }
        if (getApiTokenExpiry(apiToken) <= Date.now()) {
          // Expired tokens are rejected even if never explicitly revoked.
          ApiToken.updateOne(
            { _id: apiToken._id },
            { $set: { revoked: true } },
          ).catch(() => {});
          res.status(401).send("Invalid authentication token");
          return;
        }
        const user = await User.findOne(
          { _id: apiToken.userId },
          { role: 1, banned: 1, banReason: 1 },
        ).lean();
        if (!user) {
          res.status(401).send("Invalid authentication token");
          return;
        }
        if (user.banned) {
          const reason = user.banReason || "none";
          res
            .status(403)
            .type("text/plain")
            .send(`User is banned. Reason: ${reason}`);
          return;
        }
        req.userId = user._id;
        req.userRole = user.role;
        ApiToken.updateOne(
          { _id: apiToken._id },
          { $set: { lastUsedAt: Date.now() } },
        ).catch(() => {});
        next();
      } catch (err) {
        console.error("[sq] authentication error:", err.message);
        res.status(401).send("Invalid authentication token");
      }
      return;
    }
    try {
      const decoded = jwt.verify(token, process.env.SQ_JWT_SECRET, {
        algorithms: ["HS256"],
      });
      // Only session tokens authenticate. Invite/reset/verify tokens share
      // the same secret, so reject any token whose typ is present but not
      // "auth". Legacy tokens without typ are accepted during rotation.
      if (decoded?.typ !== undefined && decoded.typ !== "auth") {
        res.status(401).send("Invalid authentication token");
        return;
      }
      if (decoded) {
        const user = await User.findOne(
          { _id: decoded.id },
          {
            role: 1,
            banned: 1,
            banReason: 1,
            pwdVersion: 1,
            pwdVersionUpdatedAt: 1,
          },
        ).lean();
        if (user) {
          if (user.banned) {
            const reason = user.banReason || "none";
            res
              .status(403)
              .type("text/plain")
              .send(`User is banned. Reason: ${reason}`);
            return;
          }
          if (
            decoded.pwdVersion &&
            user.pwdVersion &&
            decoded.pwdVersion !== user.pwdVersion
          ) {
            res.status(401).send("Invalid authentication token");
            return;
          }
          // "Sign out everywhere" invalidates tokens issued before the bump,
          // with a small skew allowance for same-second re-logins.
          if (
            user.pwdVersionUpdatedAt &&
            (!decoded.iat ||
              decoded.iat * 1000 < user.pwdVersionUpdatedAt - 5000)
          ) {
            res.status(401).send("Invalid authentication token");
            return;
          }
          req.userId = user._id;
          req.userRole = user.role;
          // Per-device sessions: tokens minted before session tracking
          // carry no jti and keep working; newer ones are revocable.
          if (decoded.jti) {
            const loginSession = await Session.findOne(
              { jti: decoded.jti },
              { userId: 1, revoked: 1, lastSeen: 1 },
            ).lean();
            if (
              !loginSession ||
              loginSession.revoked ||
              String(loginSession.userId) !== String(user._id)
            ) {
              res.status(401).send("Invalid authentication token");
              return;
            }
            req.sessionId = decoded.jti;
            if (
              !loginSession.lastSeen ||
              Date.now() - loginSession.lastSeen > SESSION_TOUCH_MS
            ) {
              Session.updateOne(
                { jti: decoded.jti },
                { $set: { lastSeen: Date.now() } },
              ).catch(() => {});
            }
          }
          next();
        } else {
          res.status(401).send("Invalid authentication token");
        }
      } else {
        res.status(401).send("Invalid authentication token");
      }
    } catch (err) {
      console.error("[sq] authentication error:", err.message);
      res.status(401).send("Invalid authentication token");
    }
  } else if (
    req.headers["x-sq-public-access"] === "true" &&
    hasValidServerSecret(req)
  ) {
    // Server-side public reads only: writes with an undefined identity would
    // persist owner-less records, so only safe idempotent methods pass here.
    // Authenticated writes must use a real JWT/API token via Authorization.
    if (
      req.method !== "GET" &&
      req.method !== "HEAD" &&
      req.method !== "OPTIONS"
    ) {
      res.status(401).send("Invalid authentication token");
      return;
    }
    next();
  } else {
    res.sendStatus(401);
  }
};

export default auth;
