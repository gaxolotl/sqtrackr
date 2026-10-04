import Progress from "../schema/progress.js";

export const getUserHitNRuns = async (_id) => {
  const progressRecords =
    (await Progress.find(
      { userId: _id, left: 0 },
      { "uploaded.total": 1, "downloaded.total": 1 },
    ).lean()) ?? [];
  return progressRecords.filter(
    (p) => (p.uploaded?.total ?? 0) < (p.downloaded?.total ?? 0),
  ).length;
};
