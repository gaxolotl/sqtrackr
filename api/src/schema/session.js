import mongoose from "mongoose";

// One record per browser login (JWT `jti`). Powers the "logged in devices"
// list and per-device revocation. Expired documents are removed by MongoDB.
const Session = new mongoose.Schema({
  userId: { type: mongoose.Schema.ObjectId, required: true, index: true },
  jti: { type: String, required: true, unique: true },
  created: { type: Number, required: true },
  lastSeen: { type: Number, required: true },
  expiresAt: { type: Date, required: true },
  ip: { type: String },
  device: { type: String },
  userAgent: { type: String },
  revoked: { type: Boolean, default: false, index: true },
});

Session.index({ userId: 1, created: -1 });
Session.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("session", Session);
