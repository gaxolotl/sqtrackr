import mongoose from "mongoose";

const Invite = new mongoose.Schema({
  invitingUser: mongoose.Schema.ObjectId,
  created: Number,
  validUntil: Number,
  claimed: Boolean,
  token: String,
  email: String,
  role: String,
  reserved: Boolean,
});

Invite.index({ invitingUser: 1 });
Invite.index({ validUntil: 1 });

export default mongoose.model("invite", Invite);
