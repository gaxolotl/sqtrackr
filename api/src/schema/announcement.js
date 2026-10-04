import mongoose from "mongoose";

const Announcement = new mongoose.Schema({
  title: String,
  slug: String,
  body: String,
  createdBy: mongoose.Schema.ObjectId,
  pinned: Boolean,
  allowComments: Boolean,
  created: Number,
  updated: Number,
});

Announcement.index({ slug: 1 });
Announcement.index({ pinned: 1, created: -1 });

export default mongoose.model("announcement", Announcement);
