import crypto from "crypto";
import Session from "../schema/session.js";
import { getClientIp, parseDevice } from "./deviceInfo.js";

export const MAX_SESSIONS_PER_USER = 20;
export const SESSION_TTL_MS = 8 * 24 * 60 * 60 * 1000;
export const SESSION_TOUCH_MS = 15 * 60 * 1000;

// Records a browser login so it shows up in the devices list. Session
// tracking must never break authentication: if persistence fails we return
// undefined so the caller mints a jti-less (legacy) JWT, which the auth
// middleware still accepts. Returning a jti with no backing record would
// lock the user out with a 401 on every request.
export const createLoginSession = async (req, userId) => {
  const jti = crypto.randomUUID();
  const now = Date.now();
  const rawAgent =
    typeof req.headers?.["user-agent"] === "string"
      ? req.headers["user-agent"]
      : "";
  try {
    await Session.create({
      userId,
      jti,
      created: now,
      lastSeen: now,
      expiresAt: new Date(now + SESSION_TTL_MS),
      ip: getClientIp(req),
      device: parseDevice(rawAgent),
      userAgent: rawAgent.slice(0, 300) || undefined,
    });
  } catch (err) {
    console.error("[sq] failed to record login session:", err.message);
    return undefined;
  }
  try {
    const excess = await Session.find({ userId })
      .sort({ created: -1, _id: -1 })
      .skip(MAX_SESSIONS_PER_USER)
      .select("_id")
      .lean();
    if (excess.length) {
      await Session.deleteMany({
        _id: { $in: excess.map((entry) => entry._id) },
      });
    }
  } catch (err) {
    console.error("[sq] failed to prune login sessions:", err.message);
  }
  return jti;
};
