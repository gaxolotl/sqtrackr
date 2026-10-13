import qs from "qs";
import bencode from "bencode";
import User from "../schema/user.js";
import Torrent from "../schema/torrent.js";
import Progress from "../schema/progress.js";
import CheatLog from "../schema/cheatLog.js";
import Snatch from "../schema/snatch.js";
import { envFlag } from "../utils/env.js";
import { getUserRatio } from "../utils/ratio.js";
import { getUserHitNRuns } from "../utils/hitnrun.js";

export const BYTES_GB = 1e9;

export const binaryToHex = (b) => Buffer.from(b, "binary").toString("hex");
export const hexToBinary = (h) => Buffer.from(h, "hex").toString("binary");

// Physically impossible upload speeds. The tracker asks clients to announce
// every 30s, so anything far above 10 Gbps sustained between announces is
// spoofed. Announce intervals below 10s with moving counters, downloads that
// exceed the torrent size, and completions with zero downloaded bytes are
// likewise logged for staff review (never enforced, to avoid false bans).
export const MAX_REASONABLE_UPLOAD_BPS = 1.25e9;
export const MIN_ANNOUNCE_INTERVAL_SECONDS = 10;
export const CHEAT_LOG_THROTTLE_MS = 24 * 60 * 60 * 1000;

export const evaluateAnnounceAnomalies = ({
  elapsedSeconds,
  uploadDelta,
  downloadDelta,
  downloadedTotal,
  torrentSize,
  freeleech,
  event,
}) => {
  const findings = [];
  if (
    elapsedSeconds != null &&
    elapsedSeconds >= MIN_ANNOUNCE_INTERVAL_SECONDS &&
    uploadDelta > 0 &&
    uploadDelta / elapsedSeconds > MAX_REASONABLE_UPLOAD_BPS
  ) {
    const bytesPerSecond = uploadDelta / elapsedSeconds;
    findings.push({
      reason: "impossible-upload-speed",
      details:
        `+${(uploadDelta / BYTES_GB).toFixed(2)} GB in ${elapsedSeconds.toFixed(0)}s ` +
        `(${(bytesPerSecond / 1e6).toFixed(0)} MB/s)`,
    });
  }
  if (
    elapsedSeconds != null &&
    elapsedSeconds < MIN_ANNOUNCE_INTERVAL_SECONDS &&
    (uploadDelta > 0 || downloadDelta > 0)
  ) {
    findings.push({
      reason: "announce-too-frequent",
      details:
        `+${uploadDelta} up / +${downloadDelta} down in ` +
        `${elapsedSeconds.toFixed(1)}s (minimum interval ${MIN_ANNOUNCE_INTERVAL_SECONDS}s)`,
    });
  }
  if (!freeleech && torrentSize > 0 && downloadedTotal > torrentSize) {
    findings.push({
      reason: "download-exceeds-size",
      details: `${downloadedTotal} downloaded for a ${torrentSize} byte torrent`,
    });
  }
  if (
    !freeleech &&
    event === "completed" &&
    torrentSize > 0 &&
    downloadedTotal === 0
  ) {
    findings.push({
      reason: "completed-without-download",
      details: "completed event with 0 bytes downloaded",
    });
  }
  return findings;
};

const logAnomalyThrottled = async ({
  userId,
  infoHash,
  peerId,
  reason,
  details,
}) => {
  try {
    const recent = await CheatLog.exists({
      userId,
      infoHash,
      reason,
      created: { $gt: Date.now() - CHEAT_LOG_THROTTLE_MS },
    });
    if (recent) return;
    await CheatLog.create({
      userId,
      infoHash,
      peerId,
      reason,
      details,
      created: Date.now(),
    });
  } catch (err) {
    console.error("[sq] failed to write cheat log:", err.message);
  }
};

const handleAnnounce = async (req, res) => {
  const announceUid = req.originalUrl.split("?")[0].split("/")[2];

  const user = await User.findOne(
    { uid: announceUid },
    { emailVerified: 1, banned: 1 },
  ).lean();

  // if the uid does not match a registered user, deny announce
  if (!user) {
    const response = bencode.encode({
      "failure reason": "Announce denied: you are not registered.",
    });
    res.send(response);
    return;
  }

  if (user.banned) {
    const response = bencode.encode({
      "failure reason": "Announce denied: you are banned.",
    });
    res.send(response);
    return;
  }

  // if the users email is not verified, deny announce
  if (!user.emailVerified) {
    const response = bencode.encode({
      "failure reason": "Announce denied: email address must be verified.",
    });
    res.send(response);
    return;
  }

  const q = req.url.split("?")[1];
  const params = qs.parse(q, { decoder: unescape });

  const infoHash = binaryToHex(params.info_hash);

  // Anti-cheat: deny announces from banned clients (peer-ID prefix match).
  const peerId = params.peer_id ?? "";
  const clientBlacklist = JSON.parse(process.env.SQ_CLIENT_BLACKLIST ?? "[]");
  if (clientBlacklist.some((prefix) => prefix && peerId.startsWith(prefix))) {
    const response = bencode.encode({
      "failure reason": "Announce denied: Your client is banned.",
    });
    res.send(response);
    return;
  }

  const torrent = await Torrent.findOne(
    { infoHash },
    { _id: 1, freeleech: 1, size: 1 },
  ).lean();

  // if torrent info hash is not in the database, deny announce
  if (!torrent) {
    const response = bencode.encode({
      "failure reason":
        "Announce denied: cannot announce a torrent that has not been uploaded.",
    });
    res.send(response);
    return;
  }

  const { ratio } = await getUserRatio(user._id);
  const hitnruns = await getUserHitNRuns(user._id);

  // if users ratio is below the minimum threshold, and they are trying to download, deny announce
  if (
    Number(process.env.SQ_MINIMUM_RATIO) !== -1 &&
    ratio < Number(process.env.SQ_MINIMUM_RATIO) &&
    ratio !== -1 &&
    Number(params.left) > 0
  ) {
    const response = bencode.encode({
      "failure reason": `Announce denied: Ratio is below minimum threshold ${process.env.SQ_MINIMUM_RATIO}.`,
      peers: [],
      peers6: [],
    });
    res.send(response);
    return;
  }

  // if user has committed more than the allowed number of hit'n'runs, and they are trying to download, deny announce
  if (
    Number(process.env.SQ_MAXIMUM_HIT_N_RUNS) !== -1 &&
    hitnruns >= Number(process.env.SQ_MAXIMUM_HIT_N_RUNS) &&
    Number(params.left) > 0
  ) {
    const response = bencode.encode({
      "failure reason": `Announce denied: You have committed ${process.env.SQ_MAXIMUM_HIT_N_RUNS} or more hit'n'runs.`,
      peers: [],
      peers6: [],
    });
    res.send(response);
    return;
  }

  const uploaded = Number(params.uploaded);
  const downloaded = params.event === "started" ? 0 : Number(params.downloaded);

  const prevProgressRecord = await Progress.findOne({
    userId: user._id,
    peerId: peerId,
    infoHash,
  }).lean();

  const alreadyUploadedSession = prevProgressRecord?.uploaded?.session ?? 0;
  const uploadDeltaSession =
    uploaded >= alreadyUploadedSession ? uploaded - alreadyUploadedSession : 0;

  const alreadyDownloadedSession = prevProgressRecord?.downloaded?.session ?? 0;
  const downloadDeltaSession =
    downloaded >= alreadyDownloadedSession
      ? downloaded - alreadyDownloadedSession
      : 0;

  // Anti-cheat: flag anomalous announces for staff review. Log only,
  // throttled to one entry per user/torrent/reason per day.
  const prevUpdatedAt = prevProgressRecord?.updatedAt
    ? new Date(prevProgressRecord.updatedAt).getTime()
    : null;
  const elapsedSeconds =
    prevUpdatedAt == null ? null : (Date.now() - prevUpdatedAt) / 1000;
  const downloadedTotal =
    (prevProgressRecord?.downloaded?.total ?? 0) + downloadDeltaSession;
  const anomalies = evaluateAnnounceAnomalies({
    elapsedSeconds,
    uploadDelta: uploadDeltaSession,
    downloadDelta: downloadDeltaSession,
    downloadedTotal,
    torrentSize: Number(torrent.size ?? 0),
    freeleech:
      torrent.freeleech || envFlag("SQ_SITE_WIDE_FREELEECH"),
    event: params.event,
  });
  for (const anomaly of anomalies) {
    await logAnomalyThrottled({
      userId: user._id,
      infoHash,
      peerId,
      reason: anomaly.reason,
      details: anomaly.details,
    });
  }

  const [sumUploaded] = await Progress.aggregate([
    {
      $match: {
        userId: user._id,
      },
    },
    {
      $group: {
        _id: "uploaded",
        bytes: { $sum: "$uploaded.total" },
      },
    },
  ]);

  const { bytes } = sumUploaded ?? { bytes: 0 };
  const nextGb = Math.max(Math.ceil((bytes + 1) / BYTES_GB), 1);
  const currentGb = nextGb - 1;

  const gbAfterUpload = Math.floor((bytes + uploadDeltaSession) / BYTES_GB);

  if (gbAfterUpload >= nextGb) {
    const deltaGb = gbAfterUpload - currentGb;
    await User.findOneAndUpdate(
      { _id: user._id },
      { $inc: { bonusPoints: deltaGb * process.env.SQ_BP_EARNED_PER_GB } }
    );
  }

  await Progress.findOneAndUpdate(
    { userId: user._id, peerId: peerId, infoHash },
    {
      $set: {
        userId: user._id,
        infoHash,
        uploaded: {
          session: uploaded,
          total:
            (prevProgressRecord?.uploaded?.total ?? 0) + uploadDeltaSession,
        },
        left: Number(params.left),
      },
    },
    { upsert: true }
  );

  await Progress.findOneAndUpdate(
    { userId: user._id, infoHash },
    {
      $set: {
        userId: user._id,
        infoHash,
        downloaded: {
          session:
            torrent.freeleech || envFlag("SQ_SITE_WIDE_FREELEECH")
              ? prevProgressRecord?.downloaded?.session ?? 0
              : downloaded,
          total:
            torrent.freeleech || envFlag("SQ_SITE_WIDE_FREELEECH")
              ? prevProgressRecord?.downloaded?.total ?? 0
              : (prevProgressRecord?.downloaded?.total ?? 0) +
                downloadDeltaSession,
        },
        left: Number(params.left),
      },
    },
    { upsert: true }
  );

  if (params.event === "completed") {
    await Torrent.findOneAndUpdate({ infoHash }, { $inc: { downloads: 1 } });
    // Record the snatch; seedtime accumulates on later seeding announces.
    try {
      await Snatch.findOneAndUpdate(
        { userId: user._id, infoHash },
        {
          $setOnInsert: {
            userId: user._id,
            infoHash,
            snatchedAt: Date.now(),
            seedTime: 0,
          },
          $set: { completed: true },
        },
        { upsert: true },
      );
    } catch (err) {
      console.error("[sq] failed to record snatch:", err.message);
    }
  }

  // Accumulate seedtime on seeding announces, capped per announce so clock
  // jumps or long gaps cannot credit more than one hour at once.
  if (Number(params.left) === 0 && prevProgressRecord?.updatedAt) {
    const elapsedSeconds =
      (Date.now() - new Date(prevProgressRecord.updatedAt).getTime()) / 1000;
    if (elapsedSeconds > 0 && elapsedSeconds <= 3600) {
      try {
        await Snatch.findOneAndUpdate(
          { userId: user._id, infoHash },
          {
            $setOnInsert: {
              userId: user._id,
              infoHash,
              snatchedAt: Date.now(),
              completed: false,
            },
            $inc: { seedTime: elapsedSeconds },
          },
          { upsert: true },
        );
      } catch (err) {
        console.error("[sq] failed to accumulate seedtime:", err.message);
      }
    }
  }

  return { actor: { userId: user._id.toString() } };
};

export default handleAnnounce;
