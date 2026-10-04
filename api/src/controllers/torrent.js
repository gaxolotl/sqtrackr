import bencode from "bencode";
import crypto from "crypto";
import mongoose from "mongoose";
import fuzzyHelpers from "mongoose-fuzzy-searching/helpers/index.js";

const { createNGrams, nGrams } = fuzzyHelpers;
import slugify from "slugify";
import contentDisposition from "content-disposition";
import Torrent from "../schema/torrent.js";
import TorrentSubmission from "../schema/torrentSubmission.js";
import User from "../schema/user.js";
import Comment from "../schema/comment.js";
import Group from "../schema/group.js";
import { createGroup, addToGroup, removeFromGroup } from "./group.js";
import { envFlag } from "../utils/env.js";
import { countSwarmPeers } from "../tracker/swarm-stats.js";
import { getAnnounceUrl } from "../utils/trackerUrl.js";
import {
  getTmdbMetadata,
  parseReleaseName,
  searchTmdb,
  TmdbError,
} from "../utils/tmdb.js";
import {
  getContentLimits,
  validateContentText,
} from "../utils/contentLimits.js";
import pluginEvents from "../plugins/eventBus.js";
import { shouldPremoderateUpload } from "../utils/premoderation.js";

const getTorrentCategories = () =>
  JSON.parse(process.env.SQ_TORRENT_CATEGORIES || "{}");

const getExtensionBlacklist = () =>
  JSON.parse(process.env.SQ_EXTENSION_BLACKLIST || "[]");

const urlReservedCharRegex = /[&$+,/:;=?@#<>\[\]{}|\\\^%]/g;

// bencode v4 decodes byte strings as Uint8Array, whose .toString() returns
// comma-joined decimal byte values instead of text. Decode bytes explicitly.
const bytesToString = (value) => {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return Buffer.from(value).toString("utf8");
  }
  return String(value);
};

const formatTag = (tag) =>
  tag
    .trim()
    .toLowerCase()
    .replaceAll(urlReservedCharRegex, "")
    .replaceAll(" ", "-");

const isValidInfoHash = (value) =>
  typeof value === "string" && /^[a-f0-9]{40}$/i.test(value);

const decodeTorrentPayload = (payload, maxSizeKb, res) => {
  if (typeof payload !== "string" || !payload) {
    res.status(400).send("A .torrent file is required");
    return null;
  }

  const maxBytes = maxSizeKb * 1024;
  if (payload.length > Math.ceil(maxBytes / 3) * 4 + 4) {
    res.status(413).send(`.torrent file cannot exceed ${maxSizeKb} KB`);
    return null;
  }

  try {
    const buffer = Buffer.from(payload, "base64");
    if (buffer.length > maxBytes) {
      res.status(413).send(`.torrent file cannot exceed ${maxSizeKb} KB`);
      return null;
    }
    return { buffer, parsed: bencode.decode(buffer) };
  } catch {
    res.status(400).send("Could not read the .torrent file");
    return null;
  }
};

export const embellishTorrentsWithTrackerScrape = async (tracker, torrents) => {
  if (!torrents.length) return [];

  try {
    return torrents.map((torrent) => {
      const torrentFromTracker = tracker.torrents[torrent.infoHash];
      const { seeders, leechers } = countSwarmPeers(torrentFromTracker);
      return {
        ...torrent,
        seeders,
        leechers,
      };
    });
  } catch (e) {
    console.error("[DEBUG] Error: could not embellish torrents from tracker");
    return torrents;
  }
};

export const identifyTorrent = async (req, res, next) => {
  try {
    const limits = getContentLimits();
    let releaseName =
      typeof req.body.query === "string" ? req.body.query.trim() : "";

    if (releaseName.length > 200) {
      res.status(400).send("Metadata search cannot exceed 200 characters");
      return;
    }

    if (!releaseName && typeof req.body.torrent === "string") {
      const decoded = decodeTorrentPayload(
        req.body.torrent,
        limits.torrentFileSizeKb,
        res,
      );
      if (!decoded) return;
      releaseName = bytesToString(decoded.parsed.info?.name ?? "");
    }

    if (!releaseName) {
      res.status(400).send("A release name or .torrent file is required");
      return;
    }

    const parsed = parseReleaseName(releaseName, req.body.type);
    const matches = await searchTmdb(parsed);
    res.json({ parsed, ...matches });
  } catch (error) {
    if (error instanceof TmdbError) {
      res.status(error.status).json({ message: error.message });
      return;
    }
    next(error);
  }
};

export const uploadTorrent = async (req, res, next) => {
  if (req.body.torrent && req.body.name && req.body.description) {
    try {
      const limits = getContentLimits();
      const decoded = decodeTorrentPayload(
        req.body.torrent,
        limits.torrentFileSizeKb,
        res,
      );
      if (!decoded) return;
      const parsed = decoded.parsed;
      const name = validateContentText(
        req.body.name,
        "Torrent name",
        limits.torrentName,
        res,
      );
      if (name === null) return;
      const description = validateContentText(
        req.body.description,
        "Description",
        limits.body,
        res,
        { trim: false },
      );
      if (description === null) return;
      const mediaInfo = validateContentText(
        req.body.mediaInfo,
        "MediaInfo",
        limits.mediaInfo,
        res,
        { required: false, trim: false },
      );
      if (mediaInfo === null) return;
      const tagsInput = validateContentText(
        req.body.tags,
        "Tags",
        limits.torrentTags,
        res,
        { required: false },
      );
      if (tagsInput === null) return;
      const tags = tagsInput
        .split(",")
        .map((tag) => formatTag(tag).slice(0, 50))
        .filter(Boolean)
        .slice(0, 50);

      const categories = getTorrentCategories();
      if (Object.keys(categories).length && !req.body.type) {
        res.status(400).send("Torrent must have a category");
        return;
      }

      if (Object.keys(categories).length) {
        const sources =
          categories[
            Object.keys(categories).find(
              (cat) => slugify(cat, { lower: true }) === req.body.type,
            )
          ];
        if (!sources) {
          res.status(400).send("Torrent must have a valid category");
          return;
        }
        if (
          sources.length &&
          !sources
            .map((source) => slugify(source, { lower: true }))
            .includes(req.body.source)
        ) {
          res.status(400).send("Torrent must have a source");
          return;
        }
      }

      const user = await User.findOne({ _id: req.userId }, { uid: 1 }).lean();

      let tmdb;
      if (req.body.tmdb !== undefined) {
        const selectedId = Number(req.body.tmdb?.id);
        const selectedType = req.body.tmdb?.mediaType;
        if (
          !Number.isInteger(selectedId) ||
          selectedId <= 0 ||
          (selectedType !== "movie" && selectedType !== "tv")
        ) {
          res.status(400).send("Invalid TMDB selection");
          return;
        }

        try {
          tmdb = await getTmdbMetadata(
            selectedType,
            selectedId,
            parseReleaseName(bytesToString(parsed.info.name), req.body.type),
          );
        } catch (error) {
          if (error instanceof TmdbError) {
            res.status(error.status).json({ message: error.message });
            return;
          }
          throw error;
        }
      }

      parsed.info.private = 1;
      parsed.announce = getAnnounceUrl(user.uid);
      delete parsed["announce-list"];

      const infoHash = crypto
        .createHash("sha1")
        .update(bencode.encode(parsed.info))
        .digest("hex");

      const existingTorrent = await Torrent.findOne(
        { infoHash },
        { _id: 1 },
      ).lean();

      if (existingTorrent) {
        res.status(409).send("Torrent with this info hash already exists");
        return;
      }
      const existingSubmission = await TorrentSubmission.findOne({
        infoHash,
        status: { $in: ["pending", "approving"] },
      }).lean();
      if (existingSubmission) {
        res
          .status(409)
          .send("Torrent with this info hash is already awaiting review");
        return;
      }

      let files;
      if (parsed.info.files) {
        files = parsed.info.files.map((file) => ({
          path: file.path.map((tok) => bytesToString(tok)).join("/"),
          size: file.length,
        }));
      } else {
        files = [
          {
            path: bytesToString(parsed.info.name),
            size: parsed.info.length,
          },
        ];
      }

      const hasBlackListedFiles = files.some((file) =>
        getExtensionBlacklist().some((ext) => file.path.endsWith(`.${ext}`)),
      );

      if (hasBlackListedFiles) {
        res
          .status(403)
          .send("One or more files have blacklisted file extensions");
        return;
      }

      let groupWithTorrent;

      if (req.body.groupWith) {
        const groupWith = req.body.groupWith;

        if (!isValidInfoHash(groupWith)) {
          res.status(400).send("Cannot group with an invalid torrent");
          return;
        }

        groupWithTorrent = await Torrent.findOne(
          {
            infoHash: groupWith,
          },
          { _id: 1, infoHash: 1, group: 1 },
        ).lean();

        if (!groupWithTorrent) {
          res.status(400).send("Cannot group with torrent that does not exist");
          return;
        }
      }

      const torrentData = {
        name,
        description,
        type: req.body.type,
        source: req.body.source,
        infoHash,
        binary: req.body.torrent,
        poster:
          typeof req.body.poster === "string" &&
          /^https?:\/\/.{1,500}$/i.test(req.body.poster.trim())
            ? req.body.poster.trim().slice(0, 500)
            : undefined,
        uploadedBy: req.userId,
        downloads: 0,
        anonymous:
          envFlag("SQ_ALLOW_ANONYMOUS_UPLOADS") && !!req.body.anonymous,
        size:
          parsed.info.length ||
          parsed.info.files.reduce((acc, cur) => {
            return acc + cur.length;
          }, 0),
        files,
        created: Date.now(),
        upvotes: [],
        downvotes: [],
        freeleech: false,
        tags,
        mediaInfo: mediaInfo || undefined,
        tmdb,
      };

      const requiresReview = shouldPremoderateUpload({
        enabled: envFlag("SQ_TORRENT_PREMODERATION"),
        role: req.userRole,
      });
      let submission = null;
      try {
        submission = await TorrentSubmission.create({
          ...torrentData,
          groupWith: groupWithTorrent?.infoHash,
          submittedAt: torrentData.created,
          status: requiresReview ? "pending" : "approving",
          requiresReview,
          reviewedBy: requiresReview ? undefined : req.userId,
        });
      } catch (createError) {
        if (createError?.code === 11000) {
          res
            .status(409)
            .send(
              "Torrent with this info hash already exists or is awaiting review",
            );
          return;
        }
        throw createError;
      }

      if (requiresReview) {
        res.status(202).json({
          infoHash,
          status: "pending",
          submissionId: submission._id,
        });
        return;
      }

      try {
        let groupId = groupWithTorrent?.group;
        if (groupWithTorrent && !groupId) {
          groupId = await createGroup([groupWithTorrent]);
        }
        const newTorrent = new Torrent({
          ...torrentData,
          group: groupId,
          submission: submission._id,
        });
        await newTorrent.save();

        if (groupId) await addToGroup(groupId, infoHash);

        await TorrentSubmission.findByIdAndUpdate(submission._id, {
          $set: {
            status: "approved",
            reviewedAt: Date.now(),
            torrent: newTorrent._id,
          },
          $unset: { binary: 1 },
        });

        res.status(200).json({ infoHash, status: "approved" });
      } catch (publishError) {
        if (submission?._id) {
          await TorrentSubmission.deleteOne({ _id: submission._id }).catch(
            () => {},
          );
        }
        throw publishError;
      }
    } catch (e) {
      if (e?.code === 11000) {
        res
          .status(409)
          .send(
            "Torrent with this info hash already exists or is awaiting review",
          );
        return;
      }
      next(e);
    }
  } else {
    res.status(400).send("Form is incomplete");
  }
};

export const editTorrent = async (req, res, next) => {
  if (req.body.name && req.body.type && req.body.description) {
    try {
      const { infoHash } = req.params;

      if (!isValidInfoHash(infoHash)) {
        res.status(404).send("Torrent does not exist");
        return;
      }

      const torrent = await Torrent.findOne(
        {
          infoHash,
        },
        { _id: 1, uploadedBy: 1 },
      ).lean();

      if (!torrent) {
        res.status(404).send("Torrent does not exist");
        return;
      }

      if (
        req.userRole !== "admin" &&
        req.userId.toString() !== torrent.uploadedBy.toString()
      ) {
        res.status(403).send("You do not have permission to edit this torrent");
        return;
      }

      const categories = getTorrentCategories();
      if (Object.keys(categories).length) {
        const sources =
          categories[
            Object.keys(categories).find(
              (cat) => slugify(cat, { lower: true }) === req.body.type,
            )
          ];
        if (!sources) {
          res.status(400).send("Torrent must have a valid category");
          return;
        }
        if (
          sources.length &&
          !sources
            .map((source) => slugify(source, { lower: true }))
            .includes(req.body.source)
        ) {
          res.status(400).send("Torrent must have a source");
          return;
        }
      }

      const limits = getContentLimits();
      const name = validateContentText(
        req.body.name,
        "Torrent name",
        limits.torrentName,
        res,
      );
      if (name === null) return;
      const type = String(req.body.type);
      const source = typeof req.body.source === "string" ? req.body.source : "";
      const description = validateContentText(
        req.body.description,
        "Description",
        limits.body,
        res,
        { trim: false },
      );
      if (description === null) return;
      const tagsInput = validateContentText(
        req.body.tags,
        "Tags",
        limits.torrentTags,
        res,
        { required: false },
      );
      if (tagsInput === null) return;
      const tags = tagsInput
        .split(",")
        .map((tag) => formatTag(tag).slice(0, 50))
        .filter(Boolean)
        .slice(0, 50);
      const mediaInfo = validateContentText(
        req.body.mediaInfo,
        "MediaInfo",
        limits.mediaInfo,
        res,
        { required: false, trim: false },
      );
      if (mediaInfo === null) return;

      const clone = { ...torrent, name };
      createNGrams(clone, ["name"]);

      await Torrent.findOneAndUpdate(
        { infoHash },
        {
          $set: {
            name,
            name_fuzzy: clone.name_fuzzy,
            type,
            source,
            description,
            tags,
          },
          mediaInfo: mediaInfo || undefined,
        },
      );

      res.sendStatus(200);
    } catch (e) {
      next(e);
    }
  } else {
    res.status(400).send("Form is incomplete");
  }
};

export const downloadTorrent = async (req, res, next) => {
  try {
    const { infoHash, userId } = req.params;

    if (!isValidInfoHash(infoHash)) {
      res.status(404).send("Torrent does not exist");
      return;
    }

    const user = await User.findOne({ uid: userId }, { uid: 1 }).lean();

    if (!user) {
      res.status(401).send(`User does not exist`);
      return;
    }

    const torrent = await Torrent.findOne({ infoHash }).lean();
    if (!torrent || !torrent.binary) {
      res.status(404).send("Torrent does not exist");
      return;
    }
    const { binary } = torrent;
    let parsed;
    try {
      parsed = bencode.decode(Buffer.from(binary, "base64"));
    } catch {
      res.status(500).send("Could not read the .torrent file");
      return;
    }

    parsed.announce = getAnnounceUrl(user.uid);
    delete parsed["announce-list"];
    parsed.info.private = 1;

    const fileName = `${bytesToString(parsed.info.name)} - ${
      process.env.SQ_SITE_NAME
    }.torrent`;

    res.setHeader("Content-Type", "application/x-bittorrent");
    res.setHeader("Content-Disposition", contentDisposition(fileName));

    res.write(bencode.encode(parsed));
    res.end();
  } catch (e) {
    next(e);
  }
};

export const fetchTorrent = (tracker) => async (req, res, next) => {
  const { infoHash } = req.params;

  if (!isValidInfoHash(infoHash)) {
    res.status(404).send("Torrent does not exist");
    return;
  }

  try {
    const [torrent] = await Torrent.aggregate([
      {
        $match: { infoHash },
      },
      {
        $project: {
          name: 1,
          description: 1,
          type: 1,
          source: 1,
          infoHash: 1,
          uploadedBy: 1,
          downloads: 1,
          anonymous: 1,
          poster: 1,
          size: 1,
          files: 1,
          created: 1,
          upvotes: { $size: "$upvotes" },
          downvotes: { $size: "$downvotes" },
          userHasUpvoted: { $in: [req.userId, "$upvotes"] },
          userHasDownvoted: { $in: [req.userId, "$downvotes"] },
          freeleech: 1,
          tags: 1,
          group: 1,
          mediaInfo: 1,
          tmdb: 1,
        },
      },
      {
        $lookup: {
          from: "users",
          as: "uploadedBy",
          let: { userId: "$uploadedBy" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$userId"] } } },
            {
              $project: {
                username: 1,
                created: 1,
              },
            },
          ],
        },
      },
      { $unwind: { path: "$uploadedBy", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "users",
          as: "fetchedBy",
          let: { torrentId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", req.userId] } } },
            {
              $project: {
                bookmarks: 1,
              },
            },
            {
              $addFields: {
                bookmarked: { $in: ["$$torrentId", "$bookmarks"] },
              },
            },
            {
              $project: {
                bookmarked: 1,
              },
            },
          ],
        },
      },
      { $unwind: { path: "$fetchedBy", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "comments",
          as: "comments",
          let: { parentId: "$_id" },
          pipeline: [
            {
              $match: {
                type: "torrent",
                $expr: { $eq: ["$parentId", "$$parentId"] },
              },
            },
            {
              $lookup: {
                from: "users",
                as: "user",
                let: { userId: "$userId" },
                pipeline: [
                  {
                    $match: {
                      $expr: { $eq: ["$_id", "$$userId"] },
                    },
                  },
                  {
                    $project: {
                      username: 1,
                    },
                  },
                ],
              },
            },
            {
              $unwind: {
                path: "$user",
                preserveNullAndEmptyArrays: true,
              },
            },
            { $sort: { created: -1 } },
          ],
        },
      },
    ]);

    if (!torrent) {
      res.status(404).send("Torrent does not exist");
      return;
    }

    if (torrent.anonymous && req.userRole !== "admin")
      delete torrent.uploadedBy;

    const [embellishedTorrent] = await embellishTorrentsWithTrackerScrape(
      tracker,
      [torrent],
    );

    let groupTorrents = [];
    if (embellishedTorrent.group) {
      const group = await Group.findOne({
        _id: embellishedTorrent.group,
      }).lean();

      if (group) {
        const otherIds = group.torrents.filter(
          (id) => id.toString() !== embellishedTorrent._id.toString(),
        );
        groupTorrents = await Torrent.find(
          { _id: { $in: otherIds } },
          { name: 1, infoHash: 1, freeleech: 1, type: 1, created: 1 },
          { sort: { created: -1 } },
        ).lean();
        groupTorrents = await embellishTorrentsWithTrackerScrape(
          tracker,
          groupTorrents,
        );
      }
    }

    res.json({ ...embellishedTorrent, groupTorrents });
  } catch (e) {
    next(e);
  }
};

export const deleteTorrent = async (req, res, next) => {
  try {
    const torrent = await Torrent.findOne(
      {
        infoHash: req.params.infoHash,
      },
      { _id: 1, infoHash: 1, uploadedBy: 1, group: 1 },
    ).lean();

    if (!torrent) {
      res.status(404).send("Torrent could not be found");
      return;
    }

    if (
      req.userRole !== "admin" &&
      req.userId.toString() !== torrent.uploadedBy.toString()
    ) {
      res.status(403).send("You do not have permission to delete this torrent");
      return;
    }

    if (torrent.group) {
      await removeFromGroup(torrent.group, torrent.infoHash);
    }

    await Torrent.deleteOne({ infoHash: req.params.infoHash });

    pluginEvents.emitDetached(
      "torrent.deleted",
      { torrentId: torrent._id.toString(), infoHash: torrent.infoHash },
      { userId: req.userId.toString() },
    );

    res.sendStatus(200);
  } catch (e) {
    next(e);
  }
};

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getTorrentSearchStages = (query) => {
  if (!query) {
    return { hasTextQuery: false, textStages: [], mediaStages: [] };
  }

  const parsed = parseReleaseName(query);
  const searchTitle = parsed.query.trim();
  const queryNGrams = searchTitle
    ? nGrams(searchTitle, false, 2, false).join(" ")
    : "";
  const textStages = queryNGrams
    ? [
        {
          $match: {
            $text: {
              $search: queryNGrams,
            },
          },
        },
        {
          $addFields: { confidenceScore: { $meta: "textScore" } },
        },
      ]
    : [];
  const season = parsed.season;
  const episodes = parsed.episodes;
  const mediaStages = [];

  if (season !== undefined) {
    const seasonNumber = escapeRegex(String(season));
    const seasonPattern = new RegExp(
      `(?:\\bs0*${seasonNumber}(?:[^0-9]|$)|\\bseason[ ._-]*0*${seasonNumber}(?:[^0-9]|$)|\\b0*${seasonNumber}x)`,
      "i",
    );

    if (episodes.length) {
      const episodePatterns = episodes.map((episode) => {
        const episodeNumber = escapeRegex(String(episode));
        return new RegExp(
          `(?:\\bs0*${seasonNumber}[ ._-]*e0*${episodeNumber}(?:[^0-9]|$)|\\b0*${seasonNumber}x0*${episodeNumber}(?:[^0-9]|$)|\\bseason[ ._-]*0*${seasonNumber}[ ._-]*(?:episode|ep)[ ._-]*0*${episodeNumber}(?:[^0-9]|$))`,
          "i",
        );
      });
      mediaStages.push({
        $match: {
          $or: [
            {
              "tmdb.season": season,
              "tmdb.episodes": { $all: episodes },
            },
            {
              $and: episodePatterns.map((pattern) => ({ name: pattern })),
            },
          ],
        },
      });
    } else {
      mediaStages.push({
        $match: {
          $or: [{ "tmdb.season": season }, { name: seasonPattern }],
        },
      });
    }
  }

  return {
    hasTextQuery: Boolean(queryNGrams),
    textStages,
    mediaStages,
  };
};

export const getTorrentsPage = async ({
  skip = 0,
  limit = 25,
  ids,
  query,
  category,
  source,
  tag,
  uploadedBy,
  userId,
  userRole,
  sort,
  tracker,
}) => {
  const { hasTextQuery, textStages, mediaStages } =
    getTorrentSearchStages(query);

  const safeCategory = typeof category === "string" ? category : undefined;
  const safeSource = typeof source === "string" ? source : undefined;
  const safeTag = typeof tag === "string" ? tag : undefined;
  const safeSkip = Math.max(0, Number(skip) || 0);
  const safeLimit = Math.min(Math.max(1, Number(limit) || 25), 100);

  const ALLOWED_SORT_FIELDS = new Set([
    "created",
    "size",
    "downloads",
    "name",
  ]);
  const [sortField, sortDirString] = sort?.split(":") ?? [];
  const sortDir = sortDirString === "asc" ? 1 : -1;

  const combinedSort = {};
  if (sortField && ALLOWED_SORT_FIELDS.has(sortField))
    combinedSort[sortField] = sortDir;
  if (hasTextQuery) combinedSort.confidenceScore = { $meta: "textScore" };
  if (!combinedSort.created) combinedSort.created = -1;

  const filterStages = [
    ...(Array.isArray(ids)
      ? [
          {
            $match: { $expr: { $in: ["$_id", ids] } },
          },
        ]
      : []),
    ...(safeCategory
      ? [
          {
            $match: {
              type: safeCategory,
            },
          },
        ]
      : []),
    ...(safeSource
      ? [
          {
            $match: {
              source: safeSource,
            },
          },
        ]
      : []),
    ...(safeTag
      ? [
          {
            $match: {
              $expr: { $in: [safeTag, "$tags"] },
            },
          },
        ]
      : []),
    ...(uploadedBy
      ? [
          {
            $match: {
              uploadedBy,
            },
          },
        ]
      : []),
  ];

  const countPipeline = [
    ...textStages,
    ...mediaStages,
    ...filterStages,
    {
      $count: "total",
    },
  ];

  const dataPipeline = [
    ...textStages,
    ...mediaStages,
    ...filterStages,
    {
      $project: {
        infoHash: 1,
        name: 1,
        description: 1,
        type: 1,
        source: 1,
        downloads: 1,
        uploadedBy: 1,
        anonymous: 1,
        created: 1,
        freeleech: 1,
        tags: 1,
        "tmdb.title": 1,
        "tmdb.mediaType": 1,
        "tmdb.season": 1,
        "tmdb.episodes": 1,
        "tmdb.episodeTitle": 1,
        confidenceScore: 1,
      },
    },
    {
      $sort: combinedSort,
    },
    {
      $skip: safeSkip,
    },
    {
      $limit: safeLimit,
    },
    {
      $lookup: {
        from: "comments",
        as: "comments",
        let: { parentId: "$_id" },
        pipeline: [
          {
            $match: {
              type: "torrent",
              $expr: { $eq: ["$parentId", "$$parentId"] },
            },
          },
          { $count: "count" },
        ],
      },
    },
    {
      $unwind: {
        path: "$comments",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $lookup: {
        from: "users",
        as: "fetchedBy",
        let: { torrentId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", userId] } } },
          {
            $project: {
              bookmarks: 1,
            },
          },
          {
            $addFields: {
              bookmarked: { $in: ["$$torrentId", "$bookmarks"] },
            },
          },
          {
            $project: {
              bookmarked: 1,
            },
          },
        ],
      },
    },
    { $unwind: { path: "$fetchedBy", preserveNullAndEmptyArrays: true } },
  ];

  const [torrents, [count]] = await Promise.all([
    Torrent.aggregate(dataPipeline),
    Torrent.aggregate(countPipeline),
  ]);

  const stripped =
    userRole === "admin"
      ? torrents
      : torrents.map((t) => {
          if (t.anonymous) {
            const { uploadedBy: _removed, ...rest } = t;
            return rest;
          }
          return t;
        });

  return {
    torrents: await embellishTorrentsWithTrackerScrape(tracker, stripped),
    total: count?.total ?? stripped.length,
  };
};

export const listLatest = (tracker) => async (req, res, next) => {
  let { count } = req.query;
  count = parseInt(count) || 25;
  count = Math.min(Math.max(count, 1), 100);
  try {
    const { torrents } = await getTorrentsPage({
      limit: count,
      userId: req.userId,
      userRole: req.userRole,
      tracker,
    });
    res.json(torrents);
  } catch (e) {
    next(e);
  }
};

export const listAll = async (req, res, next) => {
  try {
    const torrents = await Torrent.find({}, { infoHash: 1 })
      .sort({ created: -1 })
      .limit(5000)
      .lean();
    res.json(torrents);
  } catch (e) {
    next(e);
  }
};

export const searchTorrents = (tracker) => async (req, res, next) => {
  const { query, category, source, tag, page, sort } = req.query;
  try {
    const safePage = Math.max(0, parseInt(page, 10) || 0);
    const torrents = await getTorrentsPage({
      skip: safePage * 25,
      limit: 25,
      query: typeof query === "string" ? query.trim().slice(0, 200) : undefined,
      category,
      source,
      tag: tag ? decodeURIComponent(tag) : undefined,
      userId: req.userId,
      userRole: req.userRole,
      sort: sort ? decodeURIComponent(sort) : undefined,
      tracker,
    });
    res.json(torrents);
  } catch (e) {
    next(e);
  }
};

export const suggestTorrents = async (req, res, next) => {
  try {
    const query =
      typeof req.query.query === "string"
        ? req.query.query.trim().slice(0, 200)
        : "";
    if (query.length < 2) {
      res.status(400).send("Query must be at least 2 characters");
      return;
    }

    const { hasTextQuery, textStages, mediaStages } =
      getTorrentSearchStages(query);
    const results = await Torrent.aggregate([
      ...textStages,
      {
        $project: {
          infoHash: 1,
          name: 1,
          type: 1,
          tmdb: 1,
          confidenceScore: 1,
          created: 1,
        },
      },
      ...mediaStages,
      {
        $sort: hasTextQuery
          ? { confidenceScore: { $meta: "textScore" }, created: -1 }
          : { created: -1 },
      },
      { $limit: 6 },
    ]);

    res.json({ results });
  } catch (e) {
    next(e);
  }
};

export const addComment = async (req, res, next) => {
  try {
    const commentText = validateContentText(
      req.body.comment,
      "Comment",
      getContentLimits().comment,
      res,
      { trim: false },
    );
    if (commentText === null) return;
      const { infoHash } = req.params;

      const torrent = await Torrent.findOne(
        { infoHash },
        { _id: 1 },
      ).lean();

      if (!torrent) {
        res.status(404).send("Torrent does not exist");
        return;
      }

      const comment = new Comment({
        type: "torrent",
        parentId: torrent._id,
        userId: req.userId,
        comment: commentText,
        created: Date.now(),
      });
      await comment.save();

      res.sendStatus(200);
  } catch (e) {
    next(e);
  }
};

export const addVote = async (req, res, next) => {
  const { infoHash, vote } = req.params;
  try {
    const torrent = await Torrent.findOne({ infoHash }, { _id: 1 }).lean();

    if (!torrent) {
      res.status(404).send("Torrent could not be found");
      return;
    }

    if (vote === "up" || vote === "down") {
      await Torrent.findOneAndUpdate(
        { infoHash },
        {
          $addToSet: {
            [vote === "up" ? "upvotes" : "downvotes"]: mongoose.Types.ObjectId(
              req.userId,
            ),
          },
          $pull: {
            [vote === "down" ? "upvotes" : "downvotes"]:
              mongoose.Types.ObjectId(req.userId),
          },
        },
      );
      res.sendStatus(200);
    } else {
      res.status(400).send("Vote must be one of up, down");
    }
  } catch (e) {
    next(e);
  }
};

export const removeVote = async (req, res, next) => {
  const { infoHash, vote } = req.params;
  try {
    const torrent = await Torrent.findOne({ infoHash }, { _id: 1 }).lean();

    if (!torrent) {
      res.status(404).send("Torrent could not be found");
      return;
    }

    if (vote === "up" || vote === "down") {
      await Torrent.findOneAndUpdate(
        { infoHash },
        {
          $pull: {
            [vote === "up" ? "upvotes" : "downvotes"]: mongoose.Types.ObjectId(
              req.userId,
            ),
          },
        },
      );
      res.sendStatus(200);
    } else {
      res.status(400).send("Vote must be one of (up, down)");
    }
  } catch (e) {
    next(e);
  }
};

export const toggleFreeleech = async (req, res, next) => {
  const { infoHash } = req.params;
  try {
    if (req.userRole !== "admin") {
      res.status(401).send("You do not have permission to toggle freeleech");
      return;
    }

    const torrent = await Torrent.findOne(
      { infoHash },
      { _id: 1, freeleech: 1 },
    ).lean();

    if (!torrent) {
      res.status(404).send("Torrent could not be found");
      return;
    }

    await Torrent.findOneAndUpdate(
      { infoHash },
      { $set: { freeleech: !torrent.freeleech } },
    );
    res.sendStatus(200);
  } catch (e) {
    next(e);
  }
};

export const toggleBookmark = async (req, res, next) => {
  const { infoHash } = req.params;
  try {
    const torrent = await Torrent.findOne(
      { infoHash },
      { _id: 1 },
    ).lean();

    if (!torrent) {
      res.status(404).send("Torrent could not be found");
      return;
    }

    const user = await User.findOne(
      { _id: req.userId },
      { bookmarks: 1 },
    ).lean();

    const isBookmarked = (user?.bookmarks?.length
      ? user.bookmarks.map((b) => b.toString())
      : []
    ).includes(torrent._id.toString());

    await User.findOneAndUpdate(
      { _id: req.userId },
      { [isBookmarked ? "$pull" : "$addToSet"]: { bookmarks: torrent._id } },
    );
    res.sendStatus(200);
  } catch (e) {
    next(e);
  }
};

export const listTags = async (req, res, next) => {
  try {
    const tags = await Torrent.distinct("tags", {
      tags: { $exists: true, $ne: [] },
    });

    res.json(tags.filter((t) => t !== ""));
  } catch (e) {
    next(e);
  }
};
