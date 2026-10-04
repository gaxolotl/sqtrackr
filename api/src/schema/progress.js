import mongoose from "mongoose";

const Progress = new mongoose.Schema(
  {
    infoHash: String,
    userId: mongoose.Schema.ObjectId,
    peerId: String,
    uploaded: {
      session: Number,
      total: Number,
    },
    downloaded: {
      session: Number,
      total: Number,
    },
    left: Number,
  },
  { timestamps: true },
);

Progress.index({ userId: 1 });
Progress.index({ infoHash: 1, peerId: 1 });
Progress.index({ userId: 1, left: 1 });

export default mongoose.model("progress", Progress);
