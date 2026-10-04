import mongoose from "mongoose";

const Snatch = new mongoose.Schema({
  userId: mongoose.Schema.ObjectId,
  infoHash: String,
  snatchedAt: Number,
  seedTime: Number,
  completed: Boolean,
});

export default mongoose.model("snatch", Snatch);
