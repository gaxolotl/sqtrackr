import crypto from "node:crypto";
import mongoose from "mongoose";
import Torrent from "../schema/torrent.js";
import TorrentSubmission from "../schema/torrentSubmission.js";
import User from "../schema/user.js";
import { addToGroup, createGroup } from "./group.js";
import {
  getContentLimits,
  validateContentText,
} from "../utils/contentLimits.js";
import { sendSystemMessage } from "../utils/directMessage.js";
import pushNotification from "../utils/notify.js";
import logAudit from "../utils/audit.js";
import { canModerate } from "../utils/roles.js";

const pageSize = 25;
const approvalLeaseMs = 5 * 60_000;

const requireModerator = (req, res) => {
  if (canModerate(req.userRole)) return true;
  res.status(403).send("Staff access is required");
  return false;
};

const validSubmissionId = (value, res) => {
  if (mongoose.isValidObjectId(value)) return true;
  res.status(404).send("Submission does not exist");
  return false;
};

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const addUserRefs = async (submissions, { showAnonymousUploader = false } = {}) => {
  const userIds = [
    ...new Set(
      submissions
        .flatMap((submission) => [submission.uploadedBy, submission.reviewedBy])
        .filter(Boolean)
        .map(String),
    ),
  ];
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } }, { username: 1 }).lean()
    : [];
  const byId = new Map(users.map((user) => [String(user._id), user]));

  return submissions.map((submission) => ({
    ...submission,
    uploadedBy:
      submission.anonymous && !showAnonymousUploader
        ? undefined
        : byId.get(String(submission.uploadedBy)),
    reviewedBy: submission.reviewedBy
      ? byId.get(String(submission.reviewedBy))
      : undefined,
  }));
};

const notifyDecision = async (submission) => {
  if (submission.notifiedAt) return;
  const approved = submission.status === "approved";
  const body = approved
    ? `Your upload "${submission.name}" was approved.\n\nView it at /torrent/${submission.infoHash}`
    : `Your upload "${submission.name}" was rejected.\n\nReason: ${submission.rejectionReason}`;
  await sendSystemMessage({
    recipientId: submission.uploadedBy,
    body,
    notificationKey: `torrent-submission:${submission._id}:${submission.status}`,
  });
  await pushNotification(submission.uploadedBy, {
    type: "submission",
    title: approved
      ? `Upload "${submission.name}" was approved`
      : `Upload "${submission.name}" was rejected`,
    link: approved
      ? `/torrent/${submission.infoHash}`
      : `/moderation/uploads/${submission._id}`,
  });
  await logAudit(
    submission.reviewedBy,
    approved ? "submission.approved" : "submission.rejected",
    submission.name,
  );
  await TorrentSubmission.updateOne(
    { _id: submission._id, notifiedAt: { $exists: false } },
    { $set: { notifiedAt: Date.now() } },
  );
};

export const listTorrentSubmissions = async (req, res, next) => {
  if (!requireModerator(req, res)) return;
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 0, 0);
    const view = req.query.view === "reviewed" ? "reviewed" : "pending";
    const search =
      typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    const query = {
      status:
        view === "reviewed"
          ? { $in: ["approved", "rejected"] }
          : { $in: ["pending", "approving"] },
      requiresReview: { $ne: false },
      ...(search
        ? {
            $or: ["name", "infoHash"].map((field) => ({
              [field]: { $regex: escapeRegex(search), $options: "i" },
            })),
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      TorrentSubmission.find(query)
        .select("-binary")
        .sort(view === "reviewed" ? { reviewedAt: -1 } : { submittedAt: 1 })
        .skip(page * pageSize)
        .limit(pageSize)
        .lean(),
      TorrentSubmission.countDocuments(query),
    ]);
    res.json({
      items: await addUserRefs(items, {
        showAnonymousUploader: req.userRole === "admin",
      }),
      total,
      page,
      pageSize,
    });
  } catch (error) {
    next(error);
  }
};

export const listMyTorrentSubmissions = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 0, 0);
    const query = { uploadedBy: req.userId };
    const [items, total] = await Promise.all([
      TorrentSubmission.find(query)
        .select("-binary")
        .sort({ submittedAt: -1 })
        .skip(page * pageSize)
        .limit(pageSize)
        .lean(),
      TorrentSubmission.countDocuments(query),
    ]);
    res.json({ items, total, page, pageSize });
  } catch (error) {
    next(error);
  }
};

export const fetchTorrentSubmission = async (req, res, next) => {
  if (!requireModerator(req, res)) return;
  if (!validSubmissionId(req.params.submissionId, res)) return;
  try {
    const submission = await TorrentSubmission.findById(req.params.submissionId)
      .select("-binary")
      .lean();
    if (!submission) {
      res.status(404).send("Submission does not exist");
      return;
    }
    const [result] = await addUserRefs([submission], {
      showAnonymousUploader: req.userRole === "admin",
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const approveTorrentSubmission = async (req, res, next) => {
  if (!requireModerator(req, res)) return;
  if (!validSubmissionId(req.params.submissionId, res)) return;
  let approvalToken;
  try {
    let submission = await TorrentSubmission.findById(req.params.submissionId);
    if (!submission) {
      res.status(404).send("Submission does not exist");
      return;
    }
    if (submission.status === "rejected") {
      res.status(409).send("Rejected submissions cannot be approved");
      return;
    }
    if (submission.requiresReview === false) {
      res.status(409).send("This submission does not require review");
      return;
    }
    if (submission.status === "approved") {
      await notifyDecision(submission);
      res.json({ infoHash: submission.infoHash, status: submission.status });
      return;
    }

    let torrent = await Torrent.findOne({ submission: submission._id });
    let groupWithTorrent;
    if (submission.groupWith && !torrent?.group) {
      groupWithTorrent = await Torrent.findOne({
        infoHash: submission.groupWith,
      }).lean();
      if (!groupWithTorrent && !torrent) {
        if (submission.status === "approving") {
          await TorrentSubmission.updateOne(
            {
              _id: submission._id,
              status: "approving",
              $or: [
                { approvalStartedAt: { $exists: false } },
                {
                  approvalStartedAt: {
                    $lte: Date.now() - approvalLeaseMs,
                  },
                },
              ],
            },
            {
              $set: { status: "pending" },
              $unset: {
                reviewedBy: 1,
                approvalToken: 1,
                approvalStartedAt: 1,
              },
            },
          );
        }
        res.status(409).send("The requested torrent group no longer exists");
        return;
      }
    }

    approvalToken = crypto.randomUUID();
    const approvalStartedAt = Date.now();
    if (submission.status === "pending") {
      submission = await TorrentSubmission.findOneAndUpdate(
        { _id: submission._id, status: "pending" },
        {
          $set: {
            status: "approving",
            reviewedBy: req.userId,
            approvalToken,
            approvalStartedAt,
          },
        },
        { new: true },
      );
    } else {
      submission = await TorrentSubmission.findOneAndUpdate(
        {
          _id: submission._id,
          status: "approving",
          $or: [
            { approvalStartedAt: { $exists: false } },
            { approvalStartedAt: { $lte: approvalStartedAt - approvalLeaseMs } },
          ],
        },
        {
          $set: {
            reviewedBy: req.userId,
            approvalToken,
            approvalStartedAt,
          },
        },
        { new: true },
      );
    }
    if (!submission) {
      res.status(409).send("Submission is already being approved");
      return;
    }

    if (!torrent) {
      const duplicate = await Torrent.findOne({ infoHash: submission.infoHash })
        .select("_id")
        .lean();
      if (duplicate) {
        await TorrentSubmission.updateOne(
          {
            _id: submission._id,
            status: "approving",
            approvalToken,
          },
          {
            $set: { status: "pending" },
            $unset: {
              reviewedBy: 1,
              approvalToken: 1,
              approvalStartedAt: 1,
            },
          },
        );
        res.status(409).send("Torrent with this info hash already exists");
        return;
      }

      torrent = await Torrent.create({
        infoHash: submission.infoHash,
        binary: submission.binary,
        poster: submission.poster,
        uploadedBy: submission.uploadedBy,
        name: submission.name,
        description: submission.description,
        type: submission.type,
        source: submission.source,
        downloads: 0,
        anonymous: submission.anonymous,
        size: submission.size,
        files: submission.files,
        created: submission.submittedAt,
        upvotes: [],
        downvotes: [],
        freeleech: false,
        tags: submission.tags,
        mediaInfo: submission.mediaInfo,
        tmdb: submission.tmdb,
        submission: submission._id,
      });
    }

    if (groupWithTorrent && !torrent.group) {
      if (groupWithTorrent.group) {
        await addToGroup(groupWithTorrent.group, torrent.infoHash);
        torrent.group = groupWithTorrent.group;
        await torrent.save();
      } else {
        const group = await createGroup([groupWithTorrent, torrent]);
        torrent.group = group;
      }
    }

    submission = await TorrentSubmission.findOneAndUpdate(
      { _id: submission._id, status: "approving", approvalToken },
      {
        $set: {
          status: "approved",
          reviewedAt: Date.now(),
          reviewedBy: submission.reviewedBy || req.userId,
          torrent: torrent._id,
        },
        $unset: {
          binary: 1,
          rejectionReason: 1,
          approvalToken: 1,
          approvalStartedAt: 1,
        },
      },
      { new: true },
    );
    if (!submission) {
      res.status(409).send("Submission approval lease expired");
      return;
    }
    await notifyDecision(submission);
    res.json({ infoHash: submission.infoHash, status: submission.status });
  } catch (error) {
    if (approvalToken) {
      await TorrentSubmission.updateOne(
        {
          _id: req.params.submissionId,
          status: "approving",
          approvalToken,
        },
        {
          $set: { approvalStartedAt: 0 },
          $unset: { approvalToken: 1 },
        },
      ).catch(() => {});
    }
    next(error);
  }
};

export const rejectTorrentSubmission = async (req, res, next) => {
  if (!requireModerator(req, res)) return;
  if (!validSubmissionId(req.params.submissionId, res)) return;
  const reason = validateContentText(
    req.body.reason,
    "Rejection reason",
    getContentLimits().comment,
    res,
    { trim: false },
  );
  if (reason === null) return;

  try {
    let submission = await TorrentSubmission.findById(req.params.submissionId);
    if (!submission) {
      res.status(404).send("Submission does not exist");
      return;
    }
    if (submission.requiresReview === false) {
      res.status(409).send("This submission does not require review");
      return;
    }
    if (submission.status === "approved") {
      res.status(409).send("This submission can no longer be rejected");
      return;
    }
    if (submission.status === "approving") {
      const leaseExpired =
        !submission.approvalStartedAt ||
        submission.approvalStartedAt <= Date.now() - approvalLeaseMs;
      if (!leaseExpired) {
        res.status(409).send("This submission can no longer be rejected");
        return;
      }
      submission = await TorrentSubmission.findOneAndUpdate(
        {
          _id: submission._id,
          status: "approving",
          $or: [
            { approvalStartedAt: { $exists: false } },
            {
              approvalStartedAt: { $lte: Date.now() - approvalLeaseMs },
            },
          ],
        },
        {
          $set: {
            status: "rejected",
            rejectionReason: reason,
            reviewedAt: Date.now(),
            reviewedBy: req.userId,
          },
          $unset: { binary: 1, approvalToken: 1, approvalStartedAt: 1 },
        },
        { new: true },
      );
      if (!submission) {
        res.status(409).send("Submission is already being reviewed");
        return;
      }
      await notifyDecision(submission);
      res.json({ infoHash: submission.infoHash, status: submission.status });
      return;
    }
    if (submission.status === "pending") {
      submission = await TorrentSubmission.findOneAndUpdate(
        { _id: submission._id, status: "pending" },
        {
          $set: {
            status: "rejected",
            rejectionReason: reason,
            reviewedAt: Date.now(),
            reviewedBy: req.userId,
          },
          $unset: { binary: 1 },
        },
        { new: true },
      );
      if (!submission) {
        res.status(409).send("Submission is already being reviewed");
        return;
      }
    }
    await notifyDecision(submission);
    res.json({ infoHash: submission.infoHash, status: submission.status });
  } catch (error) {
    next(error);
  }
};

export const notifyTorrentSubmissionDecision = async (req, res, next) => {
  if (!requireModerator(req, res)) return;
  if (!validSubmissionId(req.params.submissionId, res)) return;
  try {
    const submission = await TorrentSubmission.findById(req.params.submissionId);
    if (!submission) {
      res.status(404).send("Submission does not exist");
      return;
    }
    if (submission.requiresReview === false) {
      res.status(409).send("This submission does not require review");
      return;
    }
    if (submission.status !== "approved" && submission.status !== "rejected") {
      res.status(409).send("A decision has not been made yet");
      return;
    }
    await notifyDecision(submission);
    res.sendStatus(200);
  } catch (error) {
    next(error);
  }
};
