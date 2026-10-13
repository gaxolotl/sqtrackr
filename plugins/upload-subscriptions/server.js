import { defineServerPlugin } from "@sqtrackr/plugin-sdk/server";

const INFO_HASH_PATTERN = /^[a-f0-9]{40}$/i;
const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;
const KINDS = Object.freeze(["tag", "category", "uploader"]);

// Mirrors the core tag normalization (lowercase, spaces become dashes)
// closely enough to match stored torrent tags.
export const normalizeSubscriptionInput = (kind, value) => {
  if (!KINDS.includes(kind)) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (kind === "tag") {
    const normalized = trimmed
      .toLowerCase()
      .replaceAll(/\s+/g, "-")
      .slice(0, 50);
    return normalized ? { kind, value: normalized } : null;
  }
  if (kind === "category") {
    const normalized = trimmed.slice(0, 100);
    return normalized ? { kind, value: normalized } : null;
  }
  const normalized = trimmed.toLowerCase();
  return OBJECT_ID_PATTERN.test(normalized) ? { kind, value: normalized } : null;
};

export const subscriptionMatchesTorrent = (subscription, torrent) => {
  if (!subscription || !torrent) return false;
  if (subscription.kind === "tag") {
    return (torrent.tags ?? []).includes(subscription.value);
  }
  if (subscription.kind === "category") {
    return torrent.type === subscription.value;
  }
  if (subscription.kind === "uploader") {
    return (
      typeof torrent.uploadedBy === "string" &&
      torrent.uploadedBy.toLowerCase() === subscription.value
    );
  }
  return false;
};

let Subscription;
let Match;
let pluginContext;

const getSettings = () => pluginContext.settings.get();

const subscriptionDto = (subscription) => ({
  id: subscription._id.toString(),
  kind: subscription.kind,
  value: subscription.value,
  label: subscription.label ?? null,
  createdAt: subscription.createdAt,
});

const matchDto = (match) => ({
  id: match._id.toString(),
  infoHash: match.infoHash,
  name: match.name,
  tags: [...(match.tags ?? [])],
  type: match.type ?? null,
  createdAt: match.createdAt,
  read: Boolean(match.read),
});

const normalizeTorrentPayload = (data) => {
  if (!data || typeof data !== "object") return null;
  const infoHash =
    typeof data.infoHash === "string" &&
    INFO_HASH_PATTERN.test(data.infoHash)
      ? data.infoHash.toLowerCase()
      : null;
  if (!infoHash) return null;
  if (typeof data.name !== "string" || !data.name.trim()) return null;
  return {
    torrentId: typeof data.torrentId === "string" ? data.torrentId : null,
    infoHash,
    name: data.name.trim().slice(0, 500),
    tags: Array.isArray(data.tags)
      ? data.tags.filter((tag) => typeof tag === "string").slice(0, 50)
      : [],
    type: typeof data.type === "string" ? data.type.slice(0, 100) : null,
    uploadedBy:
      typeof data.uploadedBy === "string" ? data.uploadedBy : null,
  };
};

const enforceMatchCap = async (userId, keep) => {
  const excess = await Match.find({ userId })
    .sort({ createdAt: -1 })
    .skip(keep)
    .select("_id")
    .lean();
  if (excess.length) {
    await Match.deleteMany({
      _id: { $in: excess.map((entry) => entry._id) },
    });
  }
};

const recordMatchesForTorrent = async (torrent) => {
  const settings = getSettings();
  const or = [];
  if (torrent.type) or.push({ kind: "category", value: torrent.type });
  if (torrent.uploadedBy)
    or.push({ kind: "uploader", value: torrent.uploadedBy.toLowerCase() });
  if (torrent.tags.length)
    or.push({ kind: "tag", value: { $in: torrent.tags } });
  if (!or.length) return;

  const subscriptions = await Subscription.find({ $or }).lean();
  const byUser = new Map();
  for (const subscription of subscriptions) {
    if (!subscriptionMatchesTorrent(subscription, torrent)) continue;
    const userId = String(subscription.userId);
    if (
      !settings.notifyOwnUploads &&
      torrent.uploadedBy &&
      userId === torrent.uploadedBy.toLowerCase()
    ) {
      continue;
    }
    if (!byUser.has(userId)) byUser.set(userId, []);
    byUser.get(userId).push(subscription);
  }
  if (!byUser.size) return;

  const now = new Date();
  for (const [userId] of byUser) {
    const exists = await Match.exists({ userId, infoHash: torrent.infoHash });
    if (exists) continue;
    await Match.create({
      userId,
      infoHash: torrent.infoHash,
      torrentId: torrent.torrentId,
      name: torrent.name,
      tags: torrent.tags,
      type: torrent.type,
      createdAt: now,
      read: false,
    });
    await enforceMatchCap(userId, settings.maxMatchesKept);
  }
};

const serverPlugin = defineServerPlugin({
  register(context) {
    pluginContext = context;
    context.settings.register({
      maxSubscriptionsPerUser: {
        type: "integer",
        default: 50,
        min: 1,
        max: 500,
        public: true,
      },
      maxMatchesKept: {
        type: "integer",
        default: 100,
        min: 10,
        max: 1000,
      },
      notifyOwnUploads: {
        type: "boolean",
        default: false,
        public: true,
      },
    });

    Subscription = context.storage.registerModel("subscription", {
      userId: { type: String, required: true, index: true },
      kind: { type: String, required: true, enum: [...KINDS] },
      value: { type: String, required: true },
      label: { type: String },
      createdAt: { type: Date, required: true },
    });
    Subscription.schema.index(
      { userId: 1, kind: 1, value: 1 },
      { unique: true },
    );

    Match = context.storage.registerModel("match", {
      userId: { type: String, required: true, index: true },
      infoHash: { type: String, required: true, index: true },
      torrentId: { type: String },
      name: { type: String, required: true },
      tags: { type: [String], default: [] },
      type: { type: String },
      createdAt: { type: Date, required: true },
      read: { type: Boolean, default: false, index: true },
    });
    Match.schema.index({ userId: 1, infoHash: 1 }, { unique: true });

    const router = context.routes.user;

    router.get("/subscriptions", async (req, res) => {
      const userId = req.userId.toString();
      const subscriptions = await Subscription.find({ userId })
        .sort({ createdAt: 1, _id: 1 })
        .lean();
      res.json({ subscriptions: subscriptions.map(subscriptionDto) });
    });

    router.post("/subscriptions", async (req, res) => {
      const normalized = normalizeSubscriptionInput(
        req.body?.kind,
        req.body?.value,
      );
      if (!normalized) {
        res
          .status(400)
          .send("Subscription needs a valid kind (tag, category, uploader) and value");
        return;
      }
      const label =
        typeof req.body?.label === "string"
          ? req.body.label.trim().slice(0, 100) || undefined
          : undefined;
      const userId = req.userId.toString();
      const existing = await Subscription.findOne({
        userId,
        kind: normalized.kind,
        value: normalized.value,
      }).lean();
      if (existing) {
        res.json(subscriptionDto(existing));
        return;
      }
      const count = await Subscription.countDocuments({ userId });
      if (count >= getSettings().maxSubscriptionsPerUser) {
        res.status(409).send("Maximum number of subscriptions reached");
        return;
      }
      const created = await Subscription.create({
        userId,
        kind: normalized.kind,
        value: normalized.value,
        label,
        createdAt: new Date(),
      });
      res
        .status(201)
        .json(subscriptionDto(created.toObject ? created.toObject() : created));
    });

    router.delete("/subscriptions/:subscriptionId", async (req, res) => {
      const { subscriptionId } = req.params;
      if (!OBJECT_ID_PATTERN.test(subscriptionId)) {
        res.status(400).send("Invalid subscription id");
        return;
      }
      const deleted = await Subscription.findOneAndDelete({
        _id: subscriptionId,
        userId: req.userId.toString(),
      });
      if (!deleted) {
        res.status(404).send("Subscription does not exist");
        return;
      }
      res.sendStatus(204);
    });

    router.get("/matches", async (req, res) => {
      const userId = req.userId.toString();
      const unreadOnly = req.query.unread === "1";
      const matches = await Match.find({
        userId,
        ...(unreadOnly ? { read: false } : {}),
      })
        .sort({ createdAt: -1, _id: -1 })
        .limit(50)
        .lean();
      const unreadCount = await Match.countDocuments({ userId, read: false });
      res.json({
        matches: matches.map(matchDto),
        unreadCount,
      });
    });

    router.post("/matches/read", async (req, res) => {
      const userId = req.userId.toString();
      const ids = Array.isArray(req.body?.ids)
        ? req.body.ids.filter((id) => OBJECT_ID_PATTERN.test(id)).slice(0, 100)
        : null;
      await Match.updateMany(
        ids ? { userId, _id: { $in: ids } } : { userId, read: false },
        { $set: { read: true } },
      );
      res.sendStatus(204);
    });

    context.events.on("torrent.created", async ({ data }) => {
      const torrent = normalizeTorrentPayload(data);
      if (!torrent) return;
      await recordMatchesForTorrent(torrent);
    });
  },
});

export default serverPlugin;
