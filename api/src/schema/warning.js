import mongoose from "mongoose";

const Warning = new mongoose.Schema({
  userId: mongoose.Schema.ObjectId,
  reason: String,
  issuedBy: mongoose.Schema.ObjectId,
  created: Number,
  resolved: Boolean,
  resolvedAt: Number,
  appeal: {
    text: String,
    created: Number,
  },
});

export default mongoose.model("warning", Warning);
