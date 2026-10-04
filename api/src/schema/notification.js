import mongoose from "mongoose";

const Notification = new mongoose.Schema({
  userId: mongoose.Schema.ObjectId,
  type: String,
  title: String,
  link: String,
  read: Boolean,
  created: Number,
});

export default mongoose.model("notification", Notification);
