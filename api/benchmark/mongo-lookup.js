import mongoose from "mongoose";
import crypto from "node:crypto";

const url = "mongodb://127.0.0.1:27017/sqbench";
await mongoose.connect(url);
const Torrent = mongoose.model(
  "benchTorrent",
  new mongoose.Schema({ infoHash: { type: String, unique: true }, freeleech: Boolean }),
);

await Torrent.deleteMany({});
const hashes = Array.from({ length: 5000 }, () => crypto.randomBytes(20).toString("hex"));
await Torrent.insertMany(hashes.map((h) => ({ infoHash: h, freeleech: Math.random() < 0.2 })));
await Torrent.createIndexes();

const N = 5000;
const start = performance.now();
for (let i = 0; i < N; i += 1) {
  await Torrent.findOne(
    { infoHash: hashes[i % hashes.length] },
    { _id: 1, freeleech: 1 },
  ).lean();
}
const ms = performance.now() - start;
console.log(JSON.stringify({
  queries: N,
  totalMs: Number(ms.toFixed(1)),
  avgMs: Number((ms / N).toFixed(3)),
  qps: Math.round((N / ms) * 1000),
}));
await mongoose.disconnect();
