import { defineServerPlugin } from "@sqtrackr/plugin-sdk/server";

const INFO_HASH_PATTERN = /^[a-f0-9]{40}$/i;
const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

export const normalizeInfoHash = (value) => {
  if (typeof value !== "string" || !INFO_HASH_PATTERN.test(value)) return null;
  return value.toLowerCase();
};

let Collage;
let pluginContext;

const getSettings = () => pluginContext.settings.get();

const canModerate = (role) => role === "staff" || role === "admin";

const collageDto = (collage, userId) => ({
  id: collage._id.toString(),
  name: collage.name,
  description: collage.description ?? "",
  createdBy: collage.createdBy,
  ownsCollage: userId ? collage.createdBy === userId : false,
  torrentCount: (collage.infoHashes ?? []).length,
  likeCount: (collage.likedBy ?? []).length,
  likedByMe: userId ? (collage.likedBy ?? []).includes(userId) : false,
  createdAt: collage.createdAt,
  updatedAt: collage.updatedAt,
});

const serverPlugin = defineServerPlugin({
  register(context) {
    pluginContext = context;
    context.settings.register({
      maxCollagesPerUser: {
        type: "integer",
        default: 20,
        min: 1,
        max: 1000,
        public: true,
      },
      maxTorrentsPerCollage: {
        type: "integer",
        default: 100,
        min: 1,
        max: 10000,
        public: true,
      },
    });

    Collage = context.storage.registerModel("collage", {
      name: { type: String, required: true },
      description: { type: String, default: "" },
      createdBy: { type: String, required: true, index: true },
      infoHashes: { type: [String], default: [] },
      likedBy: { type: [String], default: [] },
      createdAt: { type: Date, required: true },
      updatedAt: { type: Date, required: true },
    });

    const router = context.routes.user;

    router.get("/collages", async (req, res) => {
      const query =
        typeof req.query.q === "string" ? req.query.q.slice(0, 100) : "";
      const page = Math.max(parseInt(req.query.page, 10) || 0, 0);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 50);
      const userId = req.userId.toString();
      const filter = query
        ? { name: { $regex: query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }
        : {};
      const [collages, total] = await Promise.all([
        Collage.find(filter)
          .sort({ updatedAt: -1, _id: 1 })
          .skip(page * limit)
          .limit(limit)
          .lean(),
        Collage.countDocuments(filter),
      ]);
      res.json({
        collages: collages.map((collage) => collageDto(collage, userId)),
        page,
        limit,
        total,
      });
    });

    router.post("/collages", async (req, res) => {
      const name = String(req.body?.name ?? "").trim().slice(0, 100);
      const description = String(req.body?.description ?? "").trim().slice(0, 2000);
      if (!name) {
        res.status(400).send("Collage name is required");
        return;
      }
      const userId = req.userId.toString();
      const owned = await Collage.countDocuments({ createdBy: userId });
      if (owned >= getSettings().maxCollagesPerUser) {
        res.status(409).send("Maximum collages per user reached");
        return;
      }
      const now = new Date();
      const collage = await Collage.create({
        name,
        description,
        createdBy: userId,
        infoHashes: [],
        likedBy: [],
        createdAt: now,
        updatedAt: now,
      });
      res.status(201).json(collageDto(collage.toObject(), userId));
    });

    router.get("/collages/:id", async (req, res) => {
      const { id } = req.params;
      if (!OBJECT_ID_PATTERN.test(id)) {
        res.status(400).send("Invalid collage id");
        return;
      }
      const collage = await Collage.findById(id).lean();
      if (!collage) {
        res.status(404).send("Collage does not exist");
        return;
      }
      const userId = req.userId.toString();
      const torrents = await context.services.torrents.findMany(
        collage.infoHashes ?? [],
      );
      const torrentMap = new Map(
        torrents.map((torrent) => [torrent.infoHash, torrent]),
      );
      const ordered = (collage.infoHashes ?? [])
        .map((infoHash) => torrentMap.get(infoHash))
        .filter(Boolean)
        .map((torrent) => ({
          infoHash: torrent.infoHash,
          name: torrent.name,
          type: torrent.type,
          created: torrent.created,
        }));
      res.json({ ...collageDto(collage, userId), torrents: ordered });
    });

    router.put("/collages/:id", async (req, res) => {
      const { id } = req.params;
      if (!OBJECT_ID_PATTERN.test(id)) {
        res.status(400).send("Invalid collage id");
        return;
      }
      const collage = await Collage.findById(id).lean();
      if (!collage) {
        res.status(404).send("Collage does not exist");
        return;
      }
      if (collage.createdBy !== req.userId.toString()) {
        res.status(403).send("Only the owner can edit this collage");
        return;
      }
      const name = String(req.body?.name ?? "").trim().slice(0, 100);
      const description = String(req.body?.description ?? "").trim().slice(0, 2000);
      if (!name) {
        res.status(400).send("Collage name is required");
        return;
      }
      const updated = await Collage.findByIdAndUpdate(
        id,
        { $set: { name, description, updatedAt: new Date() } },
        { new: true },
      ).lean();
      res.json(collageDto(updated, req.userId.toString()));
    });

    router.delete("/collages/:id", async (req, res) => {
      const { id } = req.params;
      if (!OBJECT_ID_PATTERN.test(id)) {
        res.status(400).send("Invalid collage id");
        return;
      }
      const collage = await Collage.findById(id).lean();
      if (!collage) {
        res.status(404).send("Collage does not exist");
        return;
      }
      if (
        collage.createdBy !== req.userId.toString() &&
        !canModerate(req.userRole)
      ) {
        res.status(403).send("Only the owner or staff can delete this collage");
        return;
      }
      await Collage.findByIdAndDelete(id);
      res.sendStatus(204);
    });

    router.post("/collages/:id/torrents", async (req, res) => {
      const { id } = req.params;
      if (!OBJECT_ID_PATTERN.test(id)) {
        res.status(400).send("Invalid collage id");
        return;
      }
      const infoHash = normalizeInfoHash(req.body?.infoHash);
      if (!infoHash) {
        res.status(400).send("A valid info hash is required");
        return;
      }
      const collage = await Collage.findById(id).lean();
      if (!collage) {
        res.status(404).send("Collage does not exist");
        return;
      }
      if (collage.createdBy !== req.userId.toString()) {
        res.status(403).send("Only the owner can edit this collage");
        return;
      }
      const torrent =
        await context.services.torrents.findByInfoHash(infoHash);
      if (!torrent) {
        res.status(404).send("Torrent does not exist");
        return;
      }
      if ((collage.infoHashes ?? []).length >= getSettings().maxTorrentsPerCollage &&
        !(collage.infoHashes ?? []).includes(infoHash)) {
        res.status(409).send("Maximum torrents per collage reached");
        return;
      }
      const updated = await Collage.findByIdAndUpdate(
        id,
        {
          $addToSet: { infoHashes: infoHash },
          $set: { updatedAt: new Date() },
        },
        { new: true },
      ).lean();
      res.json(collageDto(updated, req.userId.toString()));
    });

    router.delete("/collages/:id/torrents/:infoHash", async (req, res) => {
      const { id, infoHash: rawHash } = req.params;
      if (!OBJECT_ID_PATTERN.test(id)) {
        res.status(400).send("Invalid collage id");
        return;
      }
      const infoHash = normalizeInfoHash(rawHash);
      if (!infoHash) {
        res.status(400).send("Invalid torrent info hash");
        return;
      }
      const collage = await Collage.findById(id).lean();
      if (!collage) {
        res.status(404).send("Collage does not exist");
        return;
      }
      if (collage.createdBy !== req.userId.toString()) {
        res.status(403).send("Only the owner can edit this collage");
        return;
      }
      const updated = await Collage.findByIdAndUpdate(
        id,
        {
          $pull: { infoHashes: infoHash },
          $set: { updatedAt: new Date() },
        },
        { new: true },
      ).lean();
      res.json(collageDto(updated, req.userId.toString()));
    });

    router.post("/collages/:id/like", async (req, res) => {
      const { id } = req.params;
      if (!OBJECT_ID_PATTERN.test(id)) {
        res.status(400).send("Invalid collage id");
        return;
      }
      const collage = await Collage.findById(id).lean();
      if (!collage) {
        res.status(404).send("Collage does not exist");
        return;
      }
      const userId = req.userId.toString();
      const liked = (collage.likedBy ?? []).includes(userId);
      const updated = await Collage.findByIdAndUpdate(
        id,
        liked
          ? { $pull: { likedBy: userId } }
          : { $addToSet: { likedBy: userId } },
        { new: true },
      ).lean();
      res.json(collageDto(updated, userId));
    });
  },
});

export default serverPlugin;
