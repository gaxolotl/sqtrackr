import Progress from "../schema/progress.js";
import Snatch from "../schema/snatch.js";

const getThresholds = () => ({
  minSeedSeconds: Number(process.env.SQ_MIN_SEEDTIME_HOURS ?? 72) * 3600,
  graceSeconds: Number(process.env.SQ_HNR_GRACE_HOURS ?? 24) * 3600,
});

// Per-snatch status shared by the HnR count and the dashboard.
export const getSnatchDetails = async (_id) => {
  const { minSeedSeconds, graceSeconds } = getThresholds();
  const now = Date.now();

  const snatches = (await Snatch.find({ userId: _id }).lean()) ?? [];
  const snatchedHashes = new Set(snatches.map((snatch) => snatch.infoHash));

  const progressRecords = (await Progress.find({ userId: _id }).lean()) ?? [];
  const totalsByHash = new Map();
  for (const record of progressRecords) {
    const current = totalsByHash.get(record.infoHash) ?? { up: 0, down: 0 };
    current.up += Number(record.uploaded?.total ?? 0) || 0;
    current.down += Number(record.downloaded?.total ?? 0) || 0;
    totalsByHash.set(record.infoHash, current);
  }

  const details = snatches.map((snatch) => {
    const totals = totalsByHash.get(snatch.infoHash) ?? { up: 0, down: 0 };
    const ratioOk = totals.down === 0 || totals.up >= totals.down;
    const seededEnough = (snatch.seedTime ?? 0) >= minSeedSeconds;
    const pastGrace = now - (snatch.snatchedAt ?? now) > graceSeconds;
    return {
      infoHash: snatch.infoHash,
      snatchedAt: snatch.snatchedAt,
      seedTime: snatch.seedTime ?? 0,
      uploaded: totals.up,
      downloaded: totals.down,
      pastGrace,
      ratioOk,
      seededEnough,
      isHnr: pastGrace && !ratioOk && !seededEnough,
      graceEndsAt: (snatch.snatchedAt ?? now) + graceSeconds,
    };
  });

  // Records predating snatch tracking keep the legacy up < down rule.
  let legacyCount = 0;
  for (const record of progressRecords) {
    if (record.left !== 0) continue;
    if (snatchedHashes.has(record.infoHash)) continue;
    if ((record.uploaded?.total ?? 0) < (record.downloaded?.total ?? 0)) {
      legacyCount += 1;
    }
  }

  return { details, legacyCount, minSeedSeconds, graceSeconds };
};

// A snatch is a hit'n'run when it is past the grace period and the user has
// neither seeded it to a 1:1 ratio nor for the minimum seedtime.
export const getUserHitNRuns = async (_id) => {
  const { details, legacyCount } = await getSnatchDetails(_id);
  return details.filter((snatch) => snatch.isHnr).length + legacyCount;
};
