import { defineServerPlugin } from "@sqtrackr/plugin-sdk/server";

const BYTES_GB = 1e9;
const DAY_MS = 24 * 60 * 60 * 1000;
const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

export const RANK_CLASSES = Object.freeze([
  "power",
  "elite",
  "veteran",
  "legend",
]);

export const RANK_NAMES = Object.freeze({
  member: "Member",
  power: "Power User",
  elite: "Elite",
  veteran: "Veteran",
  legend: "Legend",
});

// Pure helper so rank math is unit-testable without a database.
export const computeRank = (stats, settings, now = Date.now()) => {
  const uploadGb = Number(stats?.uploadBytes ?? 0) / BYTES_GB;
  const ratio = Number(stats?.ratio ?? -1);
  const ageDays =
    (now - Number(stats?.created ?? now)) / DAY_MS;
  const uploads = Number(stats?.uploads ?? stats?.uploadCount ?? 0);
  const hitnruns = Number(stats?.hitnruns ?? 0);

  const requirements = RANK_CLASSES.map((key) => ({
    key,
    name: RANK_NAMES[key],
    minUploadGb: Number(settings?.[`${key}MinUploadGb`] ?? Infinity),
    minRatio: Number(settings?.[`${key}MinRatio`] ?? Infinity),
    minAgeDays: Number(settings?.[`${key}MinAgeDays`] ?? Infinity),
    minUploads: Number(settings?.[`${key}MinUploads`] ?? Infinity),
  }));
  const maxHnr = Number(settings?.maxHnr ?? 0);

  const meets = (requirement) =>
    uploadGb >= requirement.minUploadGb &&
    (ratio === -1 || ratio >= requirement.minRatio) &&
    ageDays >= requirement.minAgeDays &&
    uploads >= requirement.minUploads &&
    hitnruns <= maxHnr;

  let achieved = -1;
  requirements.forEach((requirement, index) => {
    if (meets(requirement)) achieved = index;
  });

  const current =
    achieved === -1
      ? { key: "member", name: RANK_NAMES.member }
      : requirements[achieved];
  const next = requirements[achieved + 1] ?? null;

  const progress = next
    ? [
        {
          label: "Uploaded",
          current: Math.floor(uploadGb),
          target: next.minUploadGb,
          unit: "GB",
          met: uploadGb >= next.minUploadGb,
        },
        {
          label: "Ratio",
          current: ratio === -1 ? "∞" : ratio,
          target: next.minRatio,
          unit: "",
          met: ratio === -1 || ratio >= next.minRatio,
        },
        {
          label: "Account age",
          current: Math.floor(Math.max(ageDays, 0)),
          target: next.minAgeDays,
          unit: "days",
          met: ageDays >= next.minAgeDays,
        },
        {
          label: "Uploads",
          current: uploads,
          target: next.minUploads,
          unit: "",
          met: uploads >= next.minUploads,
        },
      ]
    : [];

  return {
    class: current.key,
    name: current.name,
    next: next
      ? { key: next.key, name: next.name, progress }
      : null,
    stats: {
      uploadGb: Math.floor(uploadGb * 100) / 100,
      ratio,
      ageDays: Math.floor(Math.max(ageDays, 0)),
      uploads,
      hitnruns,
    },
  };
};

export const evaluateWatchStatus = (rank, minimumRatio, maximumHitNRuns) => {
  const ratio = rank.stats.ratio;
  const lowRatio =
    minimumRatio !== null &&
    ratio !== -1 &&
    ratio < minimumRatio;
  const tooManyHnr =
    maximumHitNRuns !== null && rank.stats.hitnruns >= maximumHitNRuns;
  return { lowRatio, tooManyHnr, atRisk: lowRatio || tooManyHnr };
};

let pluginContext;

const getSettings = () => pluginContext.settings.get();

const getThresholds = () => {
  const settings = getSettings();
  return {
    classes: RANK_CLASSES.map((key) => ({
      key,
      name: RANK_NAMES[key],
      minUploadGb: settings[`${key}MinUploadGb`],
      minRatio: settings[`${key}MinRatio`],
      minAgeDays: settings[`${key}MinAgeDays`],
      minUploads: settings[`${key}MinUploads`],
    })),
    maxHnr: settings.maxHnr,
  };
};

const getEnforcementThresholds = () => {
  const minimumRatio = Number(process.env.SQ_MINIMUM_RATIO ?? -1);
  const maximumHitNRuns = Number(process.env.SQ_MAXIMUM_HIT_N_RUNS ?? -1);
  return {
    minimumRatio: minimumRatio === -1 ? null : minimumRatio,
    maximumHitNRuns: maximumHitNRuns === -1 ? null : maximumHitNRuns,
  };
};

const toRankStats = (userStats) => ({
  uploadBytes: userStats.uploadBytes,
  ratio: userStats.ratio,
  created: userStats.created,
  uploads: userStats.uploadCount,
  hitnruns: userStats.hitnruns,
});

const rankResponse = (userStats) => {
  const rank = computeRank(toRankStats(userStats), getSettings());
  const { minimumRatio, maximumHitNRuns } = getEnforcementThresholds();
  return {
    user: {
      userId: userStats.userId,
      username: userStats.username,
      banned: userStats.banned,
    },
    rank,
    watch: evaluateWatchStatus(rank, minimumRatio, maximumHitNRuns),
    enforcement: { minimumRatio, maximumHitNRuns },
  };
};

const serverPlugin = defineServerPlugin({
  register(context) {
    pluginContext = context;
    context.settings.register({
      powerMinUploadGb: { type: "integer", default: 25, min: 0, max: 1000000, public: true },
      powerMinRatio: { type: "number", default: 1.0, min: 0, max: 1000, public: true },
      powerMinAgeDays: { type: "integer", default: 28, min: 0, max: 3650, public: true },
      powerMinUploads: { type: "integer", default: 5, min: 0, max: 100000, public: true },
      eliteMinUploadGb: { type: "integer", default: 100, min: 0, max: 1000000, public: true },
      eliteMinRatio: { type: "number", default: 1.2, min: 0, max: 1000, public: true },
      eliteMinAgeDays: { type: "integer", default: 90, min: 0, max: 3650, public: true },
      eliteMinUploads: { type: "integer", default: 25, min: 0, max: 100000, public: true },
      veteranMinUploadGb: { type: "integer", default: 500, min: 0, max: 1000000, public: true },
      veteranMinRatio: { type: "number", default: 1.5, min: 0, max: 1000, public: true },
      veteranMinAgeDays: { type: "integer", default: 365, min: 0, max: 3650, public: true },
      veteranMinUploads: { type: "integer", default: 100, min: 0, max: 100000, public: true },
      legendMinUploadGb: { type: "integer", default: 1000, min: 0, max: 1000000, public: true },
      legendMinRatio: { type: "number", default: 2.0, min: 0, max: 1000, public: true },
      legendMinAgeDays: { type: "integer", default: 730, min: 0, max: 3650, public: true },
      legendMinUploads: { type: "integer", default: 250, min: 0, max: 100000, public: true },
      maxHnr: { type: "integer", default: 1, min: 0, max: 1000, public: true },
    });

    const userRoutes = context.routes.user;

    userRoutes.get("/rank/thresholds", async (req, res) => {
      res.json({ ...getThresholds(), ...getEnforcementThresholds() });
    });

    userRoutes.get("/rank/me", async (req, res) => {
      const [stats] = await context.services.users.getStats([
        req.userId.toString(),
      ]);
      if (!stats) {
        res.status(404).send("User does not exist");
        return;
      }
      res.json(rankResponse(stats));
    });

    userRoutes.get("/rank/user/:userId", async (req, res) => {
      const { userId } = req.params;
      if (!OBJECT_ID_PATTERN.test(userId)) {
        res.status(400).send("Invalid user id");
        return;
      }
      const [stats] = await context.services.users.getStats([userId]);
      if (!stats) {
        res.status(404).send("User does not exist");
        return;
      }
      res.json(rankResponse(stats));
    });

    context.routes.staff.post("/watch/status", async (req, res) => {
      const ids = Array.isArray(req.body?.userIds) ? req.body.userIds : [];
      const valid = [
        ...new Set(ids.map((id) => String(id)).filter((id) => OBJECT_ID_PATTERN.test(id))),
      ].slice(0, 50);
      if (!valid.length) {
        res.status(400).send("Provide up to 50 user ids");
        return;
      }
      const stats = await context.services.users.getStats(valid);
      res.json({ users: stats.map(rankResponse) });
    });
  },
});

export default serverPlugin;
