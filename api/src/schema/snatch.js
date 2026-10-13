import mongoose from "mongoose";

const Snatch = new mongoose.Schema({
  userId: mongoose.Schema.ObjectId,
  infoHash: String,
  snatchedAt: Number,
  seedTime: Number,
  completed: Boolean,
});

Snatch.index({ userId: 1, infoHash: 1 }, { unique: true, sparse: true });
Snatch.index({ userId: 1 });

export default mongoose.model("snatch", Snatch);
