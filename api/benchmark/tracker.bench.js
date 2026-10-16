import Tracker from "bittorrent-tracker";
import { countSwarmPeers } from "../src/tracker/swarm-stats.js";
import {
  evaluateAnnounceAnomalies,
} from "../src/tracker/announce.js";

const WARMUP_MS = 1000;

const randHex = (bytes) =>
  [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const percentile = (sorted, p) => {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
};

const benchHttpAnnounce = async (tracker, { torrents, durationMs }) => {
  const infoHashes = Array.from({ length: torrents }, () => randHex(20));
  const latencies = [];
  let completed = 0;
  const start = performance.now();
  const end = start + durationMs;
  let i = 0;
  while (performance.now() < end) {
    const infoHash = infoHashes[i % infoHashes.length];
    const peerId = randHex(20).slice(0, 40);
    const addr = `10.0.${i % 256}.${(i >> 8) % 256}:${6881 + (i % 1000)}`;
    const params = {
      type: "http",
      action: 0,
      info_hash: infoHash,
      peer_id: peerId,
      ip: addr.split(":")[0],
      port: Number(addr.split(":")[1]),
      addr,
      event: i % 10 === 0 ? "completed" : "update",
      left: i % 3 === 0 ? 0 : 1024,
      numwant: 30,
      compact: 1,
    };
    const t0 = performance.now();
    await new Promise((resolve) => {
      tracker._onRequest(params, () => resolve());
    });
    latencies.push(performance.now() - t0);
    completed += 1;
    i += 1;
  }
  latencies.sort((a, b) => a - b);
  const seconds = (performance.now() - start) / 1000;
  return {
    completed,
    rps: completed / seconds,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
  };
};

const benchUdpAnnounce = async (tracker, { durationMs }) => {
  const infoHash = randHex(20);
  let completed = 0;
  const latencies = [];
  const start = performance.now();
  const end = start + durationMs;
  let i = 0;
  while (performance.now() < end) {
    const params = {
      type: "udp",
      action: 0,
      info_hash: infoHash,
      peer_id: randHex(20).slice(0, 40),
      ip: `10.1.${i % 256}.${(i >> 8) % 256}`,
      port: 6881 + (i % 2000),
      addr: `10.1.${i % 256}.${(i >> 8) % 256}:${6881 + (i % 2000)}`,
      event: "update",
      left: i % 2 === 0 ? 0 : 2048,
      numwant: 30,
      compact: 1,
    };
    params.addr = `${params.ip}:${params.port}`;
    const t0 = performance.now();
    await new Promise((resolve) => {
      tracker._onRequest(params, () => resolve());
    });
    latencies.push(performance.now() - t0);
    completed += 1;
    i += 1;
  }
  latencies.sort((a, b) => a - b);
  const seconds = (performance.now() - start) / 1000;
  return {
    completed,
    rps: completed / seconds,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
  };
};

const benchPolicyCheck = ({ iterations }) => {
  const start = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    evaluateAnnounceAnomalies({
      elapsedSeconds: 31,
      uploadDelta: 1024 * 1024,
      downloadDelta: 512 * 1024,
      downloadedTotal: 1024 * 1024 * (i % 100),
      torrentSize: 1024 * 1024 * 200,
      freeleech: false,
      event: "update",
    });
  }
  const seconds = (performance.now() - start) / 1000;
  return { iterations, rps: iterations / seconds };
};

const benchScrape = async (tracker, { torrents }) => {
  for (let i = 0; i < torrents; i += 1) {
    const infoHash = randHex(20);
    await new Promise((resolve) => {
      tracker._onRequest(
        {
          type: "http",
          action: 1,
          info_hash: [infoHash],
        },
        () => resolve(),
      );
    });
  }
  const swarmCount = Object.keys(tracker.torrents).length;
  let counted = 0;
  const start = performance.now();
  for (const swarm of Object.values(tracker.torrents)) {
    countSwarmPeers(swarm);
    counted += 1;
    if (counted >= 1000) break;
  }
  const ms = performance.now() - start;
  return { swarms: swarmCount, counted, ms };
};

export const runTrackerBenchmarks = async ({
  httpDurationMs = 5000,
  udpDurationMs = 3000,
  torrents = 100,
} = {}) => {
  const tracker = new Tracker.Server({
    http: false,
    udp: false,
    ws: false,
    stats: false,
  });
  await new Promise((r) => setTimeout(r, WARMUP_MS));
  const memBefore = process.memoryUsage();
  const http = await benchHttpAnnounce(tracker, {
    torrents,
    durationMs: httpDurationMs,
  });
  const udp = await benchUdpAnnounce(tracker, { durationMs: udpDurationMs });
  const policy = benchPolicyCheck({ iterations: 50000 });
  const scrape = await benchScrape(tracker, { torrents });
  const memAfter = process.memoryUsage();
  const result = {
    meta: {
      at: new Date().toISOString(),
      node: process.version,
      bun: typeof Bun !== "undefined" ? Bun.version : null,
      platform: `${process.platform}-${process.arch}`,
      torrents,
    },
    http,
    udp,
    policy,
    scrape,
    memory: {
      beforeRssMb: memBefore.rss / 1024 / 1024,
      afterRssMb: memAfter.rss / 1024 / 1024,
      heapUsedMb: memAfter.heapUsed / 1024 / 1024,
    },
    swarms: Object.keys(tracker.torrents).length,
  };
  try {
    tracker.close();
  } catch {
    // ignore
  }
  return result;
};

if (import.meta.main) {
  const result = await runTrackerBenchmarks({});
  console.log(JSON.stringify(result, null, 2));
}
