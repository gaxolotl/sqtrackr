import Torrent from "../schema/torrent.js";
import User from "../schema/user.js";
import { envFlag } from "../utils/env.js";

export const isTrackerOpen = () => envFlag("SQ_TRACKER_OPEN");

export const anonRequiresFreeleech = () => {
  const raw = process.env.SQ_TRACKER_ANON_REQUIRE_FREELEECH;
  if (raw == null || raw === "") return true;
  return raw !== "false";
};

export const isAnonymousAllowedForTorrent = (torrent) => {
  if (!isTrackerOpen()) {
    return { allowed: false, reason: "Tracker is private" };
  }
  if (anonRequiresFreeleech()) {
    const siteWide = envFlag("SQ_SITE_WIDE_FREELEECH");
    if (!torrent?.freeleech && !siteWide) {
      return { allowed: false, reason: "Torrent requires private announce" };
    }
  }
  return { allowed: true };
};

const UID_PATTERN = /^[a-f0-9]{32}$/i;

export const extractUidFromUrl = (urlString) => {
  if (!urlString || typeof urlString !== "string") return null;
  const queryIndex = urlString.indexOf("?");
  if (queryIndex === -1) return null;
  const query = urlString.slice(queryIndex + 1);
  for (const part of query.split("&")) {
    const [rawKey, rawValue = ""] = part.split("=");
    const key = decodeURIComponent(rawKey ?? "").toLowerCase();
    if (key !== "uid" && key !== "passkey" && key !== "auth" && key !== "key") {
      continue;
    }
    let value = rawValue;
    try {
      value = decodeURIComponent(rawValue);
    } catch {
      value = rawValue;
    }
    if (UID_PATTERN.test(value)) return value.toLowerCase();
  }
  return null;
};

export const extractUidFromWsParams = (params) => {
  const socket = params?.socket;
  if (socket?._sqtrackerUid && UID_PATTERN.test(socket._sqtrackerUid)) {
    return socket._sqtrackerUid.toLowerCase();
  }
  const upgradeUrl =
    socket?.upgradeReq?.url ?? socket?._sqtrackerUpgradeUrl ?? null;
  const fromUrl = extractUidFromUrl(upgradeUrl);
  if (fromUrl) return fromUrl;
  const headerUid =
    params?.headers?.["x-tracker-uid"] ?? params?.headers?.["x-passkey"];
  if (typeof headerUid === "string" && UID_PATTERN.test(headerUid)) {
    return headerUid.toLowerCase();
  }
  return null;
};

export const findWsAuthUser = async (uid) => {
  if (!uid || !UID_PATTERN.test(uid)) return null;
  const user = await User.findOne(
    { uid: uid.toLowerCase() },
    { banned: 1, emailVerified: 1 },
  ).lean();
  if (!user || user.banned || !user.emailVerified) return null;
  return user;
};

export const createTrackerFilter = () => async (infoHash, params, cb) => {
  try {
    const type = params?.type;
    if (type === "http" || !type) {
      cb(null);
      return;
    }
    const normalized = String(infoHash ?? "").toLowerCase();
    if (!/^[a-f0-9]{40}$/.test(normalized)) {
      cb(new Error("Invalid info_hash"));
      return;
    }

    if (type === "ws") {
      const uid = extractUidFromWsParams(params);
      if (uid) {
        const authed = await findWsAuthUser(uid);
        if (authed) {
          const torrent = await Torrent.findOne(
            { infoHash: normalized },
            { _id: 1 },
          ).lean();
          if (!torrent) {
            cb(new Error("Torrent not registered"));
            return;
          }
          cb(null);
          return;
        }
      }
    }

    const torrent = await Torrent.findOne(
      { infoHash: normalized },
      { _id: 1, freeleech: 1 },
    ).lean();
    if (!torrent) {
      cb(new Error("Torrent not registered"));
      return;
    }
    const decision = isAnonymousAllowedForTorrent(torrent);
    if (!decision.allowed) {
      cb(new Error(decision.reason));
      return;
    }
    cb(null);
  } catch (err) {
    cb(err);
  }
};
