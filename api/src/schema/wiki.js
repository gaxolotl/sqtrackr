import mongoose from "mongoose";

const Wiki = new mongoose.Schema({
  title: String,
  slug: String,
  body: String,
  createdBy: mongoose.Schema.ObjectId,
  public: Boolean,
  created: Number,
  updated: Number,
});

Wiki.index({ slug: 1 });

export default mongoose.model("wiki", Wiki);
