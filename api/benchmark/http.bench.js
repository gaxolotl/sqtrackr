import express from "express";
import Tracker from "bittorrent-tracker";

const PORT = 39669;
const DURATION_MS = 5000;
const CONCURRENCY = 32;

const randHex = (bytes) =>
  [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const startServer = async () => {
  const tracker = new Tracker.Server({
    http: false,
    udp: false,
    ws: false,
    stats: false,
  });
  const onRequest = tracker._onRequest.bind(tracker);
  const app = express();
  app.get("/announce", (req, res) => {
    const params = {
      type: "http",
      action: 0,
      info_hash: (req.query.info_hash ?? "").toString(),
      peer_id: (req.query.peer_id ?? "").toString(),
      ip: "127.0.0.1",
      port: 6881,
      addr: "127.0.0.1:6881",
      event: "update",
      left: 0,
      numwant: 30,
      compact: 1,
    };
    onRequest(params, (err, response) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ complete: response.complete, incomplete: response.incomplete });
    });
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(PORT, "127.0.0.1", () => resolve(s));
  });
  return { tracker, server };
};

const runLoad = async ({ durationMs, concurrency }) => {
  const infoHash = randHex(20);
  const latencies = [];
  let completed = 0;
  let errors = 0;
  const start = performance.now();
  const end = start + durationMs;
  const worker = async (id) => {
    let i = 0;
    while (performance.now() < end) {
      const peerId = `${String(id).padStart(4, "0")}${String(i).padStart(8, "0")}`.padEnd(40, "0");
      const url = `http://127.0.0.1:${PORT}/announce?info_hash=${infoHash}&peer_id=${peerId}`;
      const t0 = performance.now();
      try {
        const res = await fetch(url);
        if (!res.ok) errors += 1;
        else await res.json();
        completed += 1;
      } catch {
        errors += 1;
      }
      latencies.push(performance.now() - t0);
      i += 1;
    }
  };
  await Promise.all(
    Array.from({ length: concurrency }, (_, id) => worker(id)),
  );
  latencies.sort((a, b) => a - b);
  const seconds = (performance.now() - start) / 1000;
  const pct = (p) =>
    latencies.length
      ? latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))]
      : 0;
  return {
    completed,
    errors,
    rps: completed / seconds,
    p50: pct(50),
    p95: pct(95),
    p99: pct(99),
    concurrency,
  };
};

export const runHttpLoopbackBenchmark = async () => {
  const { tracker, server } = await startServer();
  await new Promise((r) => setTimeout(r, 500));
  const result = await runLoad({ durationMs: DURATION_MS, concurrency: CONCURRENCY });
  await new Promise((resolve) => server.close(() => resolve()));
  try {
    tracker.close();
  } catch {
    // ignore
  }
  return {
    meta: {
      at: new Date().toISOString(),
      port: PORT,
      durationMs: DURATION_MS,
      note: "Express loopback, in-memory swarm, no Mongo/auth/bencode. Real /announce/:uid adds Mongo lookups + bencode.",
    },
    ...result,
    memoryRssMb: process.memoryUsage().rss / 1024 / 1024,
  };
};

if (import.meta.main) {
  const result = await runHttpLoopbackBenchmark();
  console.log(JSON.stringify(result, null, 2));
}
