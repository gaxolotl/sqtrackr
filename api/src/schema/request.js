import mongoose from "mongoose";

const Request = new mongoose.Schema({
  index: Number,
  title: String,
  body: String,
  createdBy: mongoose.Schema.ObjectId,
  created: Number,
  candidates: [
    {
      torrent: mongoose.Schema.ObjectId,
      suggestedBy: mongoose.Schema.ObjectId,
    },
  ],
  fulfilledBy: {
    torrent: mongoose.Schema.ObjectId,
    suggestedBy: mongoose.Schema.ObjectId,
  },
});

Request.index({ index: 1 });
Request.index({ created: -1 });

export default mongoose.model("request", Request);
