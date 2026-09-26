import mongoose from "mongoose";
import Report from "../schema/report.js";
import Torrent from "../schema/torrent.js";
import TorrentSubmission from "../schema/torrentSubmission.js";
import User from "../schema/user.js";
import Progress from "../schema/progress.js";
import CheatLog from "../schema/cheatLog.js";
import AuditLog from "../schema/auditLog.js";
import logAudit from "../utils/audit.js";
import Invite from "../schema/invite.js";
import Request from "../schema/request.js";
import Comment from "../schema/comment.js";
import { countSwarmPeers } from "../tracker/swarm-stats.js";
import { canModerate } from "../utils/roles.js";
import { fuzzyScore } from "../utils/fuzzy.js";
import {
  getContentLimits,
  validateContentText,
} from "../utils/contentLimits.js";

export const createReport = async (req, res, next) => {
  try {
      const reason = validateContentText(
        req.body.reason,
        "Reason",
        getContentLimits().comment,
        res,
        { trim: false },
      );
      if (reason === null) return;
      const torrent = await Torrent.findOne({
        infoHash: req.params.infoHash,
      }).lean();

      if (!torrent) {
        res.status(404).send("Torrent with that info hash does not exist");
        return;
      }

      const report = new Report({
        torrent: torrent._id,
        reportedBy: req.userId,
        reason,
        solved: false,
        created: Date.now(),
      });

      await report.save();
      res.sendStatus(200);
  } catch (e) {
    next(e);
  }
};

export const fetchReport = async (req, res, next) => {
  try {
    if (!canModerate(req.userRole)) {
      res.status(401).send("You do not have permission to view a report");
      return;
    }

    const report = await Report.findOne({ _id: req.params.reportId }).lean();

    if (!report) {
      res.status(404).send("Report could not be found");
      return;
    }

    report.reportedBy = await User.findOne({ _id: report.reportedBy }).select(
      "username created",
    );
    report.torrent = await Torrent.findOne({ _id: report.torrent }).select(
      "name description infoHash created",
    );

    res.json(report);
  } catch (e) {
    next(e);
  }
};

const listReports = (solved) => async (req, res, next) => {
  const pageSize = 25;
  const scanLimit = 200;
  try {
    if (!canModerate(req.userRole)) {
      res.status(401).send("You do not have permission to view reports");
      return;
    }

    let { page } = req.params;
    page = parseInt(page) || 0;
    const query =
      typeof req.query.q === "string" ? req.query.q.slice(0, 100) : "";
    const reports = await Report.aggregate([
      {
        $match: { solved },
      },
      {
        $sort: solved ? { solvedAt: -1, created: -1 } : { created: -1 },
      },
      {
        $limit: scanLimit,
      },
      {
        $lookup: {
          from: "users",
          as: "reportedBy",
          let: { userId: "$reportedBy" },
          pipeline: [
            {
              $match: { $expr: { $eq: ["$_id", "$$userId"] } },
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
        $lookup: {
          from: "torrents",
          as: "torrent",
          let: { torrentId: "$torrent" },
          pipeline: [
            {
              $match: { $expr: { $eq: ["$_id", "$$torrentId"] } },
            },
            {
              $project: {
                name: 1,
              },
            },
          ],
        },
      },
      {
        $unwind: {
          path: "$reportedBy",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: {
          path: "$torrent",
          preserveNullAndEmptyArrays: true,
        },
      },
    ]);

    const matched = query
      ? reports
          .map((report) => ({
            report,
            score: fuzzyScore(
              `${report.reason ?? ""} ${report.torrent?.name ?? ""}`,
              query,
            ),
          }))
          .filter((entry) => entry.score > 0)
          .sort((left, right) => right.score - left.score)
          .map((entry) => entry.report)
      : reports;

    res.json(matched.slice(page * pageSize, page * pageSize + pageSize));
  } catch (e) {
    next(e);
  }
};

export const getReports = listReports(false);
export const getSolvedReports = listReports(true);

export const setReportResolved = async (req, res, next) => {
  try {
    if (!canModerate(req.userRole)) {
      res.status(401).send("You do not have permission to resolve a report");
      return;
    }

    await Report.findOneAndUpdate(
      { _id: req.params.reportId },
      {
        $set: {
          solved: true,
          solvedAt: Date.now(),
          updated: Date.now(),
        },
      },
    );
    await logAudit(req.userId, "report.resolved", String(req.params.reportId));

    res.sendStatus(200);
  } catch (e) {
    next(e);
  }
};

export const resolveManyReports = async (req, res, next) => {
  try {
    if (!canModerate(req.userRole)) {
      res.status(401).send("You do not have permission to resolve reports");
      return;
    }
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const validIds = ids.filter((id) => mongoose.isValidObjectId(id));
    if (!validIds.length) {
      res.status(400).send("No valid report ids");
      return;
    }
    if (validIds.length > 100) {
      res.status(400).send("Too many reports at once (maximum 100)");
      return;
    }
    const result = await Report.updateMany(
      { _id: { $in: validIds }, solved: false },
      {
        $set: {
          solved: true,
          solvedAt: Date.now(),
          updated: Date.now(),
        },
      },
    );
    await logAudit(
      req.userId,
      "report.resolved-many",
      `${result.modifiedCount} reports`,
    );
    res.status(200).json({ resolved: result.modifiedCount });
  } catch (e) {
    next(e);
  }
};

export const getQueueCounts = async (req, res, next) => {
  try {
    if (!canModerate(req.userRole)) {
      res.status(401).send("You do not have permission to view queues");
      return;
    }
    const [pendingSubmissions, openReports] = await Promise.all([
      TorrentSubmission.countDocuments({
        status: { $in: ["pending", "approving"] },
        requiresReview: { $ne: false },
      }),
      Report.countDocuments({ solved: false }),
    ]);
    res.json({ pendingSubmissions, openReports });
  } catch (e) {
    next(e);
  }
};

export const updateReport = async (req, res, next) => {
  try {
    if (!canModerate(req.userRole)) {
      res.status(401).send("You do not have permission to edit a report");
      return;
    }

    const update = {};
    if (req.body.reason !== undefined) {
      const reason = validateContentText(
        req.body.reason,
        "Reason",
        getContentLimits().comment,
        res,
        { trim: false },
      );
      if (reason === null) return;
      update.reason = reason;
    }
    if (req.body.solved !== undefined) {
      if (typeof req.body.solved !== "boolean") {
        res.status(400).send("solved must be a boolean");
        return;
      }
      update.solved = req.body.solved;
      update.solvedAt = req.body.solved ? Date.now() : null;
    }
    if (!Object.keys(update).length) {
      res.status(400).send("Request must include reason or solved");
      return;
    }
    update.updated = Date.now();

    const report = await Report.findOneAndUpdate(
      { _id: req.params.reportId },
      { $set: update },
      { new: true },
    );
    if (!report) {
      res.status(404).send("Report could not be found");
      return;
    }
    res.sendStatus(200);
  } catch (e) {
    next(e);
  }
};

export const deleteReport = async (req, res, next) => {
  try {
    if (!canModerate(req.userRole)) {
      res.status(401).send("You do not have permission to delete a report");
      return;
    }

    const report = await Report.findOneAndDelete({
      _id: req.params.reportId,
    });
    if (!report) {
      res.status(404).send("Report could not be found");
      return;
    }
    res.sendStatus(200);
  } catch (e) {
    next(e);
  }
};

const computeTrackerStats = async (tracker) => {
  const registeredUsers = await User.countDocuments();
  const bannedUsers = await User.countDocuments({ banned: true });
  const uploadedTorrents = await Torrent.countDocuments();
  const completedDownloads = await Progress.countDocuments({ left: 0 });
  const totalInvitesSent = await Invite.countDocuments();
  const invitesAccepted = await Invite.countDocuments({ claimed: true });
  const totalRequests = await Request.countDocuments({});
  const filledRequests = await Request.countDocuments({
    fulfilledBy: { $exists: true },
  });
  const totalComments = await Comment.countDocuments();

  let activeTorrents = 0;
  let peers = 0;
  let seeders = 0;
  let leechers = 0;

  Object.keys(tracker.torrents).forEach((infoHash) => {
    const counts = countSwarmPeers(tracker.torrents[infoHash]);
    if (counts.peers > 0) activeTorrents++;
    peers += counts.peers;
    seeders += counts.seeders;
    leechers += counts.leechers;
  });

  return {
    registeredUsers,
    bannedUsers,
    uploadedTorrents,
    completedDownloads,
    totalInvitesSent,
    invitesAccepted,
    totalRequests,
    filledRequests,
    totalComments,
    activeTorrents,
    peers,
    seeders,
    leechers,
  };
};

export const listMembers = async (req, res, next) => {
  try {
    if (req.userRole !== "admin") {
      res.status(403).send("Only admins can view members");
      return;
    }
    const pageSize = 25;
    const page = Math.max(parseInt(req.query.page, 10) || 0, 0);
    const search =
      typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    const role =
      typeof req.query.role === "string" ? req.query.role.trim() : "";
    const bannedFilter =
      typeof req.query.banned === "string" ? req.query.banned.trim() : "";
    const query = {};
    if (search) {
      const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { username: { $regex: escaped, $options: "i" } },
        { email: { $regex: escaped, $options: "i" } },
      ];
    }
    if (["user", "staff", "admin"].includes(role)) query.role = role;
    if (bannedFilter === "banned") query.banned = true;
    else if (bannedFilter === "active") query.banned = { $ne: true };

    const [items, total] = await Promise.all([
      User.find(query)
        .select(
          "username email role created banned banReason remainingInvites bonusPoints emailVerified",
        )
        .sort({ created: -1 })
        .skip(page * pageSize)
        .limit(pageSize)
        .lean(),
      User.countDocuments(query),
    ]);
    res.json({
      items: items.map((item) => ({
        ...item,
        bonusPoints: Number(item.bonusPoints ?? 0),
        remainingInvites: Number(item.remainingInvites ?? 0),
      })),
      total,
      page,
      pageSize,
    });
  } catch (e) {
    next(e);
  }
};

export const getStats = (tracker) => async (req, res, next) => {
  try {
    if (req.userRole !== "admin") {
      res.status(401).send("You do not have permission to view tracker stats");
      return;
    }

    res.json(await computeTrackerStats(tracker));
  } catch (e) {
    console.error(e);
    next(e);
  }
};

export const refreshStats = (tracker) => async (req, res, next) => {
  try {
    if (req.userRole !== "admin") {
      res
        .status(401)
        .send("You do not have permission to refresh tracker stats");
      return;
    }

    // Refresh each swarm's cached complete/incomplete counters from the peers
    // currently connected, then rebuild the whole snapshot.
    Object.keys(tracker.torrents).forEach((infoHash) => {
      const swarm = tracker.torrents[infoHash];
      const { seeders, leechers } = countSwarmPeers(swarm);
      swarm.complete = seeders;
      swarm.incomplete = leechers;
    });

    res.json(await computeTrackerStats(tracker));
  } catch (e) {
    console.error(e);
    next(e);
  }
};

export const listTorrentPeers = (tracker) => async (req, res, next) => {
  try {
    if (req.userRole !== "admin") {
      res.status(401).send("You do not have permission to view peers");
      return;
    }

    const { infoHash } = req.params;
    const swarm = tracker.torrents[infoHash];
    const byPeerId = new Map();

    // Swarm entries are keyed by ip:port, so collapse the same client
    // announcing from multiple addresses into one peer.
    swarm?.peers?.keys?.forEach?.((key) => {
      const peer = swarm.peers.peek(key);
      if (!peer) return;
      const address = `${peer.ip}:${peer.port}`;
      const current = byPeerId.get(peer.peerId);
      if (current) {
        if (!current.addresses.includes(address))
          current.addresses.push(address);
        if (peer.complete) current.seeder = true;
      } else {
        byPeerId.set(peer.peerId, {
          peerId: peer.peerId,
          addresses: [address],
          seeder: peer.complete === true,
        });
      }
    });

    const peers = [...byPeerId.values()];
    peers.sort(
      (a, b) =>
        (a.seeder === b.seeder ? 0 : a.seeder ? -1 : 1) ||
        a.addresses[0].localeCompare(b.addresses[0]),
    );

    // Resolve the registered user behind each announce (swarm stores the
    // peer id as hex, the announce records keep it as raw bytes).
    const usernameByPeerId = new Map();
    if (peers.length) {
      const rawPeerIds = peers.map((peer) =>
        Buffer.from(peer.peerId, "hex").toString("binary"),
      );
      const progress = await Progress.find({
        infoHash,
        peerId: { $in: rawPeerIds },
      })
        .select("userId peerId")
        .lean();

      const userIds = [
        ...new Set(
          progress
            .map((record) => record.userId && String(record.userId))
            .filter(Boolean),
        ),
      ];
      const usernames = new Map();
      if (userIds.length) {
        const users = await User.find({ _id: { $in: userIds } })
          .select("username")
          .lean();
        users.forEach((user) => usernames.set(String(user._id), user.username));
      }

      progress.forEach((record) => {
        if (!record.peerId || !record.userId) return;
        const hex = Buffer.from(record.peerId, "binary").toString("hex");
        usernameByPeerId.set(hex, usernames.get(String(record.userId)) ?? null);
      });
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const perPage = Math.min(
      Math.max(parseInt(req.query.perPage, 10) || 10, 1),
      100,
    );
    const start = (page - 1) * perPage;

    res.json({
      infoHash,
      total: peers.length,
      page,
      perPage,
      peers: peers.slice(start, start + perPage).map((peer) => ({
        peerId: peer.peerId,
        ip: peer.addresses[0],
        addresses: peer.addresses,
        seeder: peer.seeder,
        username: usernameByPeerId.get(peer.peerId) ?? null,
      })),
    });
  } catch (e) {
    next(e);
  }
};

export const listCheatLog = async (req, res, next) => {
  try {
    if (!canModerate(req.userRole)) {
      res.status(401).send("You do not have permission to view the cheat log");
      return;
    }

    const page = Math.max(parseInt(req.params.page, 10) || 0, 0);
    const perPage = 25;
    const entries = await CheatLog.find({})
      .sort({ created: -1 })
      .skip(page * perPage)
      .limit(perPage)
      .lean();

    const userIds = [
      ...new Set(
        entries.map((entry) => entry.userId && String(entry.userId)).filter(Boolean),
      ),
    ];
    const usernames = new Map();
    if (userIds.length) {
      const users = await User.find({ _id: { $in: userIds } })
        .select("username")
        .lean();
      users.forEach((user) => usernames.set(String(user._id), user.username));
    }

    res.json(
      entries.map((entry) => ({
        ...entry,
        username: usernames.get(String(entry.userId)) ?? null,
      })),
    );
  } catch (e) {
    next(e);
  }
};

export const listAuditLog = async (req, res, next) => {
  try {
    if (!canModerate(req.userRole)) {
      res.status(401).send("You do not have permission to view the audit log");
      return;
    }

    const page = Math.max(parseInt(req.params.page, 10) || 0, 0);
    const perPage = 25;
    const [entries, total] = await Promise.all([
      AuditLog.find({})
        .sort({ created: -1 })
        .skip(page * perPage)
        .limit(perPage)
        .lean(),
      AuditLog.countDocuments(),
    ]);

    const actorIds = [
      ...new Set(
        entries.map((entry) => entry.actorId && String(entry.actorId)).filter(Boolean),
      ),
    ];
    const actors = actorIds.length
      ? await User.find({ _id: { $in: actorIds } })
          .select("username")
          .lean()
      : [];
    const actorNames = new Map(
      actors.map((actor) => [String(actor._id), actor.username]),
    );

    res.json({
      items: entries.map((entry) => ({
        ...entry,
        actorUsername: actorNames.get(String(entry.actorId)) ?? null,
      })),
      total,
      page,
      pageSize: perPage,
    });
  } catch (e) {
    next(e);
  }
};
