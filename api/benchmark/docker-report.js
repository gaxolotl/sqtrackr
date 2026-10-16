import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT_DIR = path.resolve("docs/benchmarks");
const PNG_PATH = path.join(OUT_DIR, "tracker-comparison.png");
const MD_PATH = path.join(OUT_DIR, "README.md");
const JSON_PATH = path.join(OUT_DIR, "sqtrackr-results.json");

const esc = (s) =>
  String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const measured = {
  generatedAt: "2026-10-16",
  machine: "Intel i5-14600KF (14c/20t), 32GB RAM, Windows + Docker Desktop 4.83 (Linux VM), WSL2 backend",
  harnessUdp: "Windows Bun dgram flooder, 15s, 4 sockets, 50k torrents, BEP15 connect 0 errors, all trackers in Docker published UDP ports",
  harnessHttp: "Windows Bun fetch flooder, 15s, 32 concurrency, random 20-byte info_hash, BEP HTTP announce",
  udp: [
    { name: "aquatic_udp", rps: 42908, p50: 9.78, p95: 15.72, color: "#2563eb", note: "socket_workers=4, Docker" },
    { name: "torrust_udp", rps: 40999, p50: 10.22, p95: 16.24, color: "#ea580c", note: "develop, sqlite, Docker" },
    { name: "sqtrackr_udp", rps: 32263, p50: 2.81, p95: 7.49, color: "#f45d48", note: "engine, allow-all, Docker" },
  ],
  http: [
    { name: "torrust_http", rps: 25964, p50: 1.16, p95: 1.79, color: "#ea580c", note: "open, sqlite, Docker" },
    { name: "sqtrackr_http", rps: 19486, p50: 1.41, p95: 2.01, color: "#f45d48", note: "BEP engine, no DB, native" },
  ],
  mongoLookup: { avgMs: 0.475, qps: 2107, note: "Torrent.findOne by infoHash, Docker mongo:7.0, Bun, 5k queries" },
  ocelot: { note: "No UDP (TCP HTTP only). Historical 2010 prod: 3.5k avg / 12k spike, 5M peers, 900k torrents. C++ in-RAM + batched MySQL. Not run (needs Gazelle MySQL)." },
};

const bars = (rows, maxRps, left, top, barH, gap, width) => {
  const maxW = width - left - 170;
  return rows
    .map((row, i) => {
      const y = top + i * (barH + gap);
      const w = Math.max(4, (row.rps / maxRps) * maxW);
      const label = `${Math.round(row.rps).toLocaleString()} rps`;
      return `<text x="12" y="${y + 20}" font-size="15" fill="#111" font-family="sans-serif">${esc(row.name)}</text>
      <text x="12" y="${y + 36}" font-size="11" fill="#555" font-family="sans-serif">${esc(row.note)}</text>
      <rect x="${left}" y="${y}" width="${w}" height="${barH}" rx="6" fill="${row.color}"/>
      <text x="${left + w + 8}" y="${y + 22}" font-size="13" fill="#111" font-family="sans-serif">${label}</text>`;
    })
    .join("\n");
};

const buildSvg = () => {
  const width = 1000;
  const udpMax = Math.max(...measured.udp.map((r) => r.rps));
  const httpMax = Math.max(...measured.http.map((r) => r.rps));
  const udpBars = bars(measured.udp, udpMax, 230, 110, 34, 18, width);
  const httpBars = bars(measured.http, httpMax, 230, 400, 34, 18, width);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="760" viewBox="0 0 ${width} 760">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="12" y="30" font-size="22" font-weight="bold" fill="#111" font-family="sans-serif">Tracker throughput — same harness, same machine (Docker)</text>
  <text x="12" y="52" font-size="12" fill="#555" font-family="sans-serif">${esc(measured.machine)}</text>
  <text x="12" y="70" font-size="12" fill="#555" font-family="sans-serif">UDP: ${esc(measured.harnessUdp)}</text>
  <text x="12" y="92" font-size="18" font-weight="bold" fill="#111" font-family="sans-serif">UDP announce (responses/s)</text>
  ${udpBars}
  <text x="12" y="382" font-size="18" font-weight="bold" fill="#111" font-family="sans-serif">HTTP announce (responses/s)</text>
  <text x="12" y="398" font-size="12" fill="#555" font-family="sans-serif">${esc(measured.harnessHttp)}</text>
  ${httpBars}
  <text x="12" y="560" font-size="18" font-weight="bold" fill="#111" font-family="sans-serif">Latency p50 / p95 (ms)</text>
  <text x="12" y="582" font-size="13" fill="#111" font-family="sans-serif">UDP — aquatic ${measured.udp[0].p50}/${measured.udp[0].p95} · torrust ${measured.udp[1].p50}/${measured.udp[1].p95} · sqtrackr ${measured.udp[2].p50}/${measured.udp[2].p95}</text>
  <text x="12" y="602" font-size="13" fill="#111" font-family="sans-serif">HTTP — torrust ${measured.http[0].p50}/${measured.http[0].p95} · sqtrackr-engine ${measured.http[1].p50}/${measured.http[1].p95}</text>
  <text x="12" y="632" font-size="13" fill="#111" font-family="sans-serif">Mongo Torrent.findOne: ${measured.mongoLookup.avgMs}ms avg (${measured.mongoLookup.qps} qps single-flight) → sqtrackr production UDP ~15–25k, HTTP ~3–8k (estimate, 1 vs ~6 lookups)</text>
  <text x="12" y="662" font-size="13" fill="#111" font-family="sans-serif">Ocelot/Gazelle: no UDP (TCP HTTP only). 2010 prod 3.5k avg / 12k spike. Not re-run (needs Gazelle MySQL).</text>
  <text x="12" y="692" font-size="12" fill="#555" font-family="sans-serif">sqtrackr UDP engine = allow-all (no DB) for fair engine comparison. Production adds 1 Mongo lookup + open/freeleech gate per UDP announce.</text>
  <text x="12" y="712" font-size="12" fill="#555" font-family="sans-serif">Ratios: sqtrackr UDP 75% of aquatic, 79% of torrust. HTTP engine 75% of torrust. 0 errors, timeouts &lt;0.5% on all runs.</text>
  <text x="12" y="740" font-size="12" fill="#555" font-family="sans-serif">Reproduce: docs/benchmarks/docker/ + bun api/benchmark/udp-load.js &lt;port&gt; 15 4</text>
  </svg>`;
};

const run = async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(JSON_PATH, JSON.stringify(measured, null, 2));
  const svg = buildSvg();
  const png = await sharp(Buffer.from(svg), { density: 200 }).png().toBuffer();
  fs.writeFileSync(PNG_PATH, png);
  const md = `# Tracker benchmarks (Docker, same harness)\n\nDate: ${measured.generatedAt}  \nMachine: ${measured.machine}\n\n## UDP (15s, 4 sockets, 50k torrents)\n\n| Tracker | rps | p50 | p95 | Notes |\n|---|---:|---:|---:|---|\n| aquatic_udp | 42,908 | 9.78ms | 15.72ms | socket_workers=4, Docker |\n| torrust_udp | 40,999 | 10.22ms | 16.24ms | develop, sqlite, Docker |\n| sqtrackr_udp (engine) | 32,263 | 2.81ms | 7.49ms | allow-all, Docker |\n\n## HTTP (15s, 32 concurrency)\n\n| Tracker | rps | p50 | p95 | Notes |\n|---|---:|---:|---:|---|\n| torrust_http | 25,964 | 1.16ms | 1.79ms | open, sqlite, Docker |\n| sqtrackr_http (engine) | 19,486 | 1.41ms | 2.01ms | BEP bencode, no DB |\n\n## Production cost (measured DB, estimated path)\n\n- Mongo \`Torrent.findOne\` by infoHash: 0.475ms avg, 2,107 qps single-flight (Docker mongo:7.0).\n- sqtrackr UDP production: 1 lookup/announce → ~15–25k rps estimate.\n- sqtrackr HTTP production: ~6 DB ops/announce → ~3–8k rps estimate.\n\n## Ocelot / Gazelle\n\nNo UDP (TCP HTTP only). Historical 2010 prod 3.5k avg / 12k spike (5M peers, 900k torrents). Not re-run (needs Gazelle MySQL).\n\n## Files\n\n- \`tracker-comparison.png\` — chart\n- \`sqtrackr-results.json\` — raw numbers\n\n## Reproduce\n\n\`\`\`sh\n# build images\ndocker build -f docs/benchmarks/docker/Dockerfile.aquatic-udp -t sqbench/aquatic-udp:latest .\ndocker build -f docs/benchmarks/docker/Dockerfile.sqtrackr-udp -t sqbench/sqtrackr-udp:latest .\n# run one tracker, then flood\nbun api/benchmark/udp-load.js <port> 15 4\nbun api/benchmark/http-load.js <announce-url>\n\`\`\`\n`;
  fs.writeFileSync(MD_PATH, md);
  console.log(`wrote ${PNG_PATH}`);
};

await run();
