const randInfoHash = () =>
  [...crypto.getRandomValues(new Uint8Array(20))]
    .map((b) => `%${b.toString(16).padStart(2, "0").toUpperCase()}`)
    .join("");
const peerId = "-AZ3020-123456789012";

export const httpAnnounceFlood = async ({
  baseUrl,
  durationSec = 15,
  concurrency = 32,
  label = "http",
}) => {
  const end = Date.now() + durationSec * 1000;
  let completed = 0;
  let errors = 0;
  const latencies = [];
  const worker = async () => {
    while (Date.now() < end) {
      const ih = randInfoHash();
      const url = `${baseUrl}?info_hash=${ih}&peer_id=${peerId}&port=6881&uploaded=0&downloaded=0&left=0&compact=1&event=started&numwant=30`;
      const t0 = performance.now();
      try {
        const res = await fetch(url);
        await res.arrayBuffer();
        if (!res.ok) errors += 1;
        completed += 1;
      } catch {
        errors += 1;
      }
      latencies.push(performance.now() - t0);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  latencies.sort((a, b) => a - b);
  const pct = (p) =>
    latencies.length
      ? latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))]
      : 0;
  return {
    label,
    baseUrl,
    completed,
    errors,
    rps: completed / durationSec,
    p50: pct(50),
    p95: pct(95),
  };
};

if (import.meta.main) {
  const baseUrl = process.argv[2];
  if (!baseUrl) {
    console.error("usage: bun http-load.js <announce-base-url>");
    process.exit(1);
  }
  const out = await httpAnnounceFlood({ baseUrl });
  console.log(JSON.stringify(out, null, 2));
}
