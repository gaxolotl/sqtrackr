import Progress from "../schema/progress.js";
import Snatch from "../schema/snatch.js";

// A snatch is a hit'n'run when it is past the grace period and the user has
// neither seeded it to a 1:1 ratio nor for the minimum seedtime.
export const getUserHitNRuns = async (_id) => {
  const minSeedSeconds =
    Number(process.env.SQ_MIN_SEEDTIME_HOURS ?? 72) * 3600;
  const graceSeconds = Number(process.env.SQ_HNR_GRACE_HOURS ?? 24) * 3600;
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

  let count = 0;
  for (const snatch of snatches) {
    const totals = totalsByHash.get(snatch.infoHash) ?? { up: 0, down: 0 };
    const ratioOk = totals.down === 0 || totals.up >= totals.down;
    const seededEnough = (snatch.seedTime ?? 0) >= minSeedSeconds;
    const pastGrace = now - (snatch.snatchedAt ?? now) > graceSeconds;
    if (pastGrace && !ratioOk && !seededEnough) count += 1;
  }

  // Records predating snatch tracking keep the legacy up < down rule.
  for (const record of progressRecords) {
    if (record.left !== 0) continue;
    if (snatchedHashes.has(record.infoHash)) continue;
    if ((record.uploaded?.total ?? 0) < (record.downloaded?.total ?? 0)) {
      count += 1;
    }
  }

  return count;
};
