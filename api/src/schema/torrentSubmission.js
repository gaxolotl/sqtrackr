import mongoose from "mongoose";

const TorrentSubmission = new mongoose.Schema({
  infoHash: { type: String, required: true },
  binary: String,
  poster: String,
  uploadedBy: { type: mongoose.Schema.ObjectId, required: true, index: true },
  name: String,
  description: String,
  type: String,
  source: String,
  anonymous: Boolean,
  size: Number,
  files: Array,
  tags: Array,
  groupWith: String,
  mediaInfo: String,
  tmdb: mongoose.Schema.Types.Mixed,
  status: {
    type: String,
    enum: ["pending", "approving", "approved", "rejected"],
    default: "pending",
    index: true,
  },
  submittedAt: { type: Number, required: true },
  reviewedAt: Number,
  reviewedBy: mongoose.Schema.ObjectId,
  rejectionReason: String,
  torrent: mongoose.Schema.ObjectId,
  notifiedAt: Number,
  requiresReview: { type: Boolean, default: true },
  approvalToken: String,
  approvalStartedAt: Number,
});

TorrentSubmission.index({ status: 1, submittedAt: -1 });
TorrentSubmission.index(
  { infoHash: 1 },
  {
    unique: true,
    name: "pending_torrent_submission_info_hash",
    partialFilterExpression: { status: { $in: ["pending", "approving"] } },
  },
);

export default mongoose.model("torrentSubmission", TorrentSubmission);
