import mongoose from "mongoose";

const Attachment = new mongoose.Schema({
  filename: String,
  contentType: String,
  size: Number,
  data: Buffer,
  uploadedBy: mongoose.Schema.ObjectId,
  created: Number,
});

export default mongoose.model("attachment", Attachment);
