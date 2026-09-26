import mongoose from "mongoose";

const ApiToken = new mongoose.Schema({
  userId: mongoose.Schema.ObjectId,
  name: String,
  tokenHash: String,
  prefix: String,
  created: Number,
  lastUsedAt: Number,
  revoked: Boolean,
});

export default mongoose.model("apiToken", ApiToken);
