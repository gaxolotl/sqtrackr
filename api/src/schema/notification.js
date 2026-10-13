import mongoose from "mongoose";

const Notification = new mongoose.Schema({
  userId: mongoose.Schema.ObjectId,
  type: String,
  title: String,
  link: String,
  read: Boolean,
  created: Number,
});

Notification.index({ userId: 1, created: -1 });
Notification.index({ userId: 1, read: 1 });

export default mongoose.model("notification", Notification);
