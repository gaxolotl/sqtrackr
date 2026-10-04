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
    { _id: 1, freeleech: 1 },
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

  // Anti-cheat: flag physically impossible upload speeds. The tracker asks
  // clients to announce every 30s, so anything far above 10 Gbps sustained
  // between announces is spoofed. Log only, never deny (avoids false bans).
  const MAX_REASONABLE_UPLOAD_BPS = 1.25e9;
  const prevUpdatedAt = prevProgressRecord?.updatedAt
    ? new Date(prevProgressRecord.updatedAt).getTime()
    : null;
  if (prevUpdatedAt && uploadDeltaSession > 0) {
    const elapsedSeconds = (Date.now() - prevUpdatedAt) / 1000;
    if (elapsedSeconds >= 10) {
      const bytesPerSecond = uploadDeltaSession / elapsedSeconds;
      if (bytesPerSecond > MAX_REASONABLE_UPLOAD_BPS) {
        const gb = (uploadDeltaSession / BYTES_GB).toFixed(2);
        const details =
          `+${gb} GB in ${elapsedSeconds.toFixed(0)}s ` +
          `(${(bytesPerSecond / 1e6).toFixed(0)} MB/s)`;
        CheatLog.create({
          userId: user._id,
          infoHash,
          peerId,
          reason: "impossible-upload-speed",
          details,
          created: Date.now(),
        }).catch((err) =>
          console.error("[sq] failed to write cheat log:", err.message),
        );
      }
    }
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
