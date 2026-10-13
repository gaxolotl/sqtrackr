import mongoose from "mongoose";

const AuditLog = new mongoose.Schema({
  actorId: mongoose.Schema.ObjectId,
  action: String,
  target: String,
  details: String,
  created: Number,
});

AuditLog.index({ created: -1 });

export default mongoose.model("auditLog", AuditLog);
