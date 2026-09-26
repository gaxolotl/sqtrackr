import mongoose from "mongoose";

const CheatLog = new mongoose.Schema({
  userId: mongoose.Schema.ObjectId,
  infoHash: String,
  peerId: String,
  reason: String,
  details: String,
  created: Number,
});

export default mongoose.model("cheatLog", CheatLog);
