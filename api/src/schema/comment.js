import mongoose from "mongoose";

const Comment = new mongoose.Schema({
  type: String, // torrent|announcement
  parentId: mongoose.Schema.ObjectId,
  userId: mongoose.Schema.ObjectId,
  comment: String,
  created: Number,
});

Comment.index({ parentId: 1, type: 1, created: -1 });
Comment.index({ userId: 1, created: -1 });

export default mongoose.model("comment", Comment);
