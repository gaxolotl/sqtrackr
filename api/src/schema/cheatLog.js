import mongoose from "mongoose";

const CheatLog = new mongoose.Schema({
  userId: mongoose.Schema.ObjectId,
  infoHash: String,
  peerId: String,
  reason: String,
  details: String,
  created: Number,
});

CheatLog.index({ userId: 1, created: -1 });
CheatLog.index({ created: -1 });
CheatLog.index({ reason: 1, created: -1 });

export default mongoose.model("cheatLog", CheatLog);
