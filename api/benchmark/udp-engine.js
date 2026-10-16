import Tracker from "bittorrent-tracker";

const port = Number(process.env.BENCH_UDP_PORT || 6970);
const tracker = new Tracker.Server({
  http: false,
  udp: {},
  ws: false,
  stats: false,
  trustProxy: true,
  filter: (infoHash, params, cb) => cb(null),
});
tracker.on("error", (e) => console.error("[bench] error", e.message));
tracker.on("warning", () => {});
tracker.listen({ udp: port }, () => {
  console.log(`[bench] sqtrackr-engine udp on :${port}`);
});
process.once("SIGINT", () => {
  try {
    tracker.close();
  } catch {}
  process.exit(0);
});
process.once("SIGTERM", () => {
  try {
    tracker.close();
  } catch {}
  process.exit(0);
});
