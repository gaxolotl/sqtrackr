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

ApiToken.index({ tokenHash: 1 }, { unique: true });
ApiToken.index({ userId: 1, revoked: 1 });

export default mongoose.model("apiToken", ApiToken);
