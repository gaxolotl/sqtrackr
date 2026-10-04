import crypto from "crypto";
import mongoose from "mongoose";

const User = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
  pwdVersion: {
    type: String,
    default: () => crypto.randomBytes(24).toString("hex"),
  },
  pwdVersionUpdatedAt: Number,
  uid: String,
  torrents: Object,
  created: Number,
  banned: Boolean,
  banReason: String,

  role: String,
  invitedBy: mongoose.Schema.ObjectId,
  remainingInvites: Number,
  emailVerified: Boolean,
  bonusPoints: Number,
  totp: {
    enabled: Boolean,
    secret: String,
    qr: String,
    backup: [String],
  },
  bookmarks: [mongoose.Schema.ObjectId],
  savedSearches: [
    {
      name: String,
      query: String,
      created: Number,
    },
  ],
  bio: String,
  location: String,
  website: String,
  avatar: {
    data: Buffer,
    contentType: String,
  },
  avatarUpdated: Number,
  rssToken: { type: String, unique: true, sparse: true },
});

User.index({ username: 1 });
User.index({ email: 1 });
User.index({ uid: 1 });

export default mongoose.model("user", User);
