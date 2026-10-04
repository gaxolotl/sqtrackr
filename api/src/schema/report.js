import mongoose from "mongoose";

const Report = new mongoose.Schema({
  torrent: mongoose.Schema.ObjectId,
  reportedBy: mongoose.Schema.ObjectId,
  reason: String,
  solved: Boolean,
  solvedAt: Number,
  updated: Number,
  created: Number,
});

Report.index({ solved: 1, created: -1 });

export default mongoose.model("report", Report);
