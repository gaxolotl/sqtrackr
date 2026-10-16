import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { runTrackerBenchmarks } from "./tracker.bench.js";
import { runHttpLoopbackBenchmark } from "./http.bench.js";

const OUT_DIR = path.resolve("docs/benchmarks");
const PNG_PATH = path.join(OUT_DIR, "tracker-comparison.png");
const MD_PATH = path.join(OUT_DIR, "README.md");
const JSON_PATH = path.join(OUT_DIR, "sqtrackr-results.json");

const REFERENCE = [
  { name: "aquatic_udp", rps: 351834, note: "1 core, bencher", color: "#2563eb" },
  { name: "opentracker", rps: 343570, note: "workers 1", color: "#16a34a" },
  { name: "torrust_udp", rps: 222330, note: "1 core class", color: "#ea580c" },
  { name: "chihaya", rps: 115159, note: "bencher", color: "#9333ea" },
  { name: "ocelot_hist", rps: 3500, note: "2010 prod avg", color: "#64748b" },
];

const esc = (s) =>
  String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const barChartSvg = ({ title, rows, maxRps, width = 980, barH = 34 }) => {
  const left = 220;
  const right = 150;
  const top = 70;
  const gap = 16;
  const height = top + rows.length * (barH + gap) + 90;
  const maxW = width - left - right;
  const bars = rows
    .map((row, i) => {
      const y = top + i * (barH + gap);
      const w = Math.max(3, (row.rps / maxRps) * maxW);
      const label = row.rps >= 1000 ? `${Math.round(row.rps / 1000)}k` : `${Math.round(row.rps)}`;
      return `<text x="12" y="${y + 22}" font-size="16" fill="#111" font-family="sans-serif">${esc(row.name)}</text>
      <text x="12" y="${y + 38}" font-size="12" fill="#555" font-family="sans-serif">${esc(row.note ?? "")}</text>
      <rect x="${left}" y="${y}" width="${w}" height="${barH}" rx="6" fill="${row.color}" ${row.dashed ? 'stroke="#111" stroke-dasharray="6 4" stroke-width="1.5"' : ""}/>
      <text x="${left + w + 8}" y="${y + 22}" font-size="14" fill="#111" font-family="sans-serif">${label} rps</text>`;
    })
    .join("\n");
  return `<text x="12" y="32" font-size="22" font-weight="bold" fill="#111" font-family="sans-serif">${esc(title)}</text>
  ${bars}
  <text x="12" y="${height - 42}" font-size="12" fill="#555" font-family="sans-serif">* sqtrackr-core = in-process swarm only (no sockets/DB). sqtrackr-http = Express loopback (no Mongo/auth). Others = end-to-end socket benches on dedicated Linux.</text>
  <text x="12" y="${height - 22}" font-size="12" fill="#555" font-family="sans-serif">Refs: aquatic bencher, Torrust benchmarking blog (Ryzen 9 7950X, 64GB, Ubuntu 23.04). Ocelot 2010 prod (3.5k avg, 12k spike).</text>`;
};

const buildSvg = ({ core, http }) => {
  const rows = [
    ...REFERENCE,
    {
      name: "sqtrackr-core*",
      rps: core.udp.rps,
      note: "in-process udp",
      color: "#f45d48",
      dashed: true,
    },
    {
      name: "sqtrackr-http*",
      rps: http.rps,
      note: `loopback c${http.concurrency}`,
      color: "#f45d48",
      dashed: true,
    },
  ].sort((a, b) => b.rps - a.rps);
  const maxRps = Math.max(...rows.map((r) => r.rps));
  const width = 980;
  const chart = barChartSvg({
    title: "Tracker throughput comparison (requests/s, linear scale)",
    rows,
    maxRps,
    width,
  });
  const latencyRows = [
    { label: `sqtrackr-core p50 ${core.http.p50.toFixed(3)}ms`, value: core.http.p50, color: "#2563eb" },
    { label: `sqtrackr-core p95 ${core.http.p95.toFixed(3)}ms`, value: core.http.p95, color: "#16a34a" },
    { label: `sqtrackr-http p50 ${http.p50.toFixed(2)}ms`, value: http.p50, color: "#ea580c" },
    { label: `sqtrackr-http p95 ${http.p95.toFixed(2)}ms`, value: http.p95, color: "#9333ea" },
  ];
  const latMax = Math.max(...latencyRows.map((r) => r.value), 1);
  const latY0 = 480;
  const latBars = latencyRows
    .map((row, i) => {
      const y = latY0 + 40 + i * 50;
      const w = Math.max(3, (row.value / latMax) * 600);
      return `<text x="12" y="${y + 20}" font-size="14" fill="#111" font-family="sans-serif">${esc(row.label)}</text>
      <rect x="300" y="${y}" width="${w}" height="26" rx="5" fill="${row.color}"/>`;
    })
    .join("\n");
  const height = 820;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="12" y="60" font-size="13" fill="#555" font-family="sans-serif">sqtrackr ${esc(core.meta.at.slice(0, 10))} · ${esc(core.meta.platform)} · Bun ${esc(core.meta.bun ?? "?")} · HTTP loopback ${Math.round(http.rps)} rps · core ${Math.round(core.udp.rps)} rps</text>
  ${chart}
  <text x="12" y="${latY0}" font-size="18" font-weight="bold" fill="#111" font-family="sans-serif">sqtrackr latency (ms, same run)</text>
  ${latBars}
  <text x="12" y="${height - 20}" font-size="12" fill="#555" font-family="sans-serif">Feature gaps closed: UDP BEP15, WebSocket /ws, Mongo swarm persistence. HTTP /announce/:uid still authoritative for ratio/HnR/credits.</text>
  </svg>`;
};

export const generateBenchmarkReport = async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const core = await runTrackerBenchmarks({});
  const http = await runHttpLoopbackBenchmark();
  const payload = {
    generatedAt: new Date().toISOString(),
    sqtrackr: { core, httpLoopback: http },
    reference: REFERENCE,
    disclaimer:
      "Different harnesses/hardware. sqtrackr numbers are local micro/loopback on this machine (no DB/auth for core, no Mongo/auth for loopback). Aquatic/Torrust/Opentracker/Chihaya are end-to-end socket benches (aquatic_bencher / udp_load_test) on dedicated Linux, typically Ryzen 9 7950X 64GB. Ocelot is 2010 production (5M peers, 900k torrents, 3.5k avg / 12k spike), not a bench. Do not rank across harnesses.",
  };
  fs.writeFileSync(JSON_PATH, JSON.stringify(payload, null, 2));
  const svg = buildSvg({ core, http });
  const png = await sharp(Buffer.from(svg), { density: 200 })
    .png()
    .toBuffer();
  fs.writeFileSync(PNG_PATH, png);
  const md = `# Tracker benchmarks\n\nGenerated: ${payload.generatedAt}\n\n## sqtrackr (this machine)\n\n- Core swarm (in-process, no sockets/DB): HTTP ${Math.round(core.http.rps)} rps (p50 ${core.http.p50.toFixed(3)}ms, p95 ${core.http.p95.toFixed(3)}ms), UDP ${Math.round(core.udp.rps)} rps\n- HTTP loopback (Express, no Mongo/auth): ${Math.round(http.rps)} rps, p50 ${http.p50.toFixed(2)}ms, p95 ${http.p95.toFixed(2)}ms, errors ${http.errors}\n- Policy check: ${Math.round(core.policy.rps)}/s, scrape 100 swarms ${core.scrape.ms.toFixed(2)}ms, RSS ${core.memory.afterRssMb.toFixed(1)}MB\n\n## Reference (other harnesses, dedicated Linux)\n\n| Tracker | Throughput | Source |\n|---|---:|---|\n| aquatic_udp | 351,834/s (1 core) | aquatic_bencher |\n| opentracker | 343,570/s | aquatic_bencher |\n| torrust_udp | 222,330/s | Torrust blog / bencher |\n| chihaya | 115,159/s | aquatic_bencher |\n| ocelot (Gazelle, 2010 prod) | 3,500 avg / 12,000 spike | WhatCD history (5M peers) |\n\n## Disclaimer\n\n${payload.disclaimer}\n\n## Files\n\n- \`sqtrackr-results.json\` — raw numbers\n- \`tracker-comparison.png\` — chart image\n\n## Reproduce\n\n\`\`\`sh\nbun api/benchmark/tracker.bench.js\nbun api/benchmark/http.bench.js\nbun api/benchmark/report.js\n\`\`\`\n`;
  fs.writeFileSync(MD_PATH, md);
  return { core, http, pngPath: PNG_PATH, mdPath: MD_PATH, jsonPath: JSON_PATH };
};

if (import.meta.main) {
  const out = await generateBenchmarkReport();
  console.log(`wrote ${out.pngPath}`);
  console.log(`http loopback ${Math.round(out.http.rps)} rps, core udp ${Math.round(out.core.udp.rps)} rps`);
}
