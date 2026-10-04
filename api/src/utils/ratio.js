import Progress from "../schema/progress.js";

export const getUserRatio = async (_id) => {
  const [totals] = await Progress.aggregate([
    { $match: { userId: _id } },
    {
      $group: {
        _id: null,
        up: { $sum: { $ifNull: ["$uploaded.total", 0] } },
        down: { $sum: { $ifNull: ["$downloaded.total", 0] } },
      },
    },
  ]);

  const totalUp = Number(totals?.up ?? 0) || 0;
  const totalDown = Number(totals?.down ?? 0) || 0;

  return {
    up: totalUp,
    down: totalDown,
    ratio: totalDown === 0 ? -1 : Number((totalUp / totalDown).toFixed(2)),
  };
};
