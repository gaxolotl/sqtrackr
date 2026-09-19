import mongoose from "mongoose";

const Conversation = new mongoose.Schema({
  participants: [mongoose.Schema.ObjectId],
  participantSince: [
    {
      userId: mongoose.Schema.ObjectId,
      created: Number,
    },
  ],
  createdBy: mongoose.Schema.ObjectId,
  created: Number,
  subject: String,
  system: { type: Boolean, default: false },
  readOnly: { type: Boolean, default: false },
  directKey: String,
  archivedBy: [mongoose.Schema.ObjectId],
  lastMessage: {
    userId: mongoose.Schema.ObjectId,
    body: String,
    created: Number,
  },
});

Conversation.index({ participants: 1 });
Conversation.index({ "lastMessage.created": -1 });
Conversation.index({ directKey: 1 }, { unique: true, sparse: true });

export default mongoose.model("conversation", Conversation);
