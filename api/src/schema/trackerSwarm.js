import mongoose from "mongoose";

const TrackerSwarmPeer = new mongoose.Schema(
  {
    id: String,
    peerId: String,
    ip: String,
    port: Number,
    type: { type: String, enum: ["http", "udp", "ws"] },
    complete: Boolean,
  },
  { _id: false },
);

const TrackerSwarm = new mongoose.Schema({
  _id: { type: String, required: true },
  complete: { type: Number, default: 0 },
  incomplete: { type: Number, default: 0 },
  peers: { type: [TrackerSwarmPeer], default: [] },
  updated: { type: Number, default: Date.now },
});

TrackerSwarm.index({ updated: 1 });

export default mongoose.models.trackerSwarm ??
  mongoose.model("trackerSwarm", TrackerSwarm);
