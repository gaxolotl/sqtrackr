import dgram from "node:dgram";
import crypto from "node:crypto";

const PROTOCOL_ID = 0x41727101980n;
const ACTIONS = { CONNECT: 0, ANNOUNCE: 1 };

const randTx = () => crypto.randomBytes(4).readUInt32BE(0);

const buildConnect = (tx) => {
  const buf = Buffer.alloc(16);
  buf.writeBigUInt64BE(PROTOCOL_ID, 0);
  buf.writeUInt32BE(ACTIONS.CONNECT, 8);
  buf.writeUInt32BE(tx, 12);
  return buf;
};

const buildAnnounce = ({ connectionId, tx, infoHash, peerId, left }) => {
  const buf = Buffer.alloc(98);
  buf.writeBigUInt64BE(connectionId, 0);
  buf.writeUInt32BE(ACTIONS.ANNOUNCE, 8);
  buf.writeUInt32BE(tx, 12);
  Buffer.from(infoHash, "hex").copy(buf, 16);
  Buffer.from(peerId, "hex").copy(buf, 36);
  buf.writeBigUInt64BE(0n, 56);
  buf.writeBigUInt64BE(BigInt(left), 64);
  buf.writeBigUInt64BE(0n, 72);
  buf.writeUInt32BE(0, 80);
  buf.writeUInt32BE(0, 84);
  buf.writeUInt32BE(crypto.randomBytes(4).readUInt32BE(0), 88);
  buf.writeInt32BE(30, 92);
  buf.writeUInt16BE(6881 + Math.floor(Math.random() * 1000), 96);
  return buf;
};

export const udpLoadTest = async ({
  host = "127.0.0.1",
  port,
  durationSec = 15,
  sockets = 4,
  torrents = 50000,
  label = "udp",
}) => {
  const infoHashes = Array.from({ length: torrents }, () =>
    crypto.randomBytes(20).toString("hex"),
  );
  let sent = 0;
  let responses = 0;
  let connects = 0;
  let announces = 0;
  let errors = 0;
  const latencies = [];
  const pending = new Map();
  const conns = new Map();

  const clients = await Promise.all(
    Array.from({ length: sockets }, async (_, si) => {
      const sock = dgram.createSocket("udp4");
      await new Promise((resolve) => sock.bind(0, "127.0.0.1", resolve));
      sock.on("message", (msg) => {
        if (msg.length < 8) {
          errors += 1;
          return;
        }
        const action = msg.readUInt32BE(0);
        const tx = msg.readUInt32BE(4);
        const entry = pending.get(tx);
        if (action === 3) {
          errors += 1;
          if (entry) {
            pending.delete(tx);
          }
          return;
        }
        if (action === ACTIONS.CONNECT && msg.length >= 16) {
          const connId = msg.readBigUInt64BE(8);
          conns.set(si, { id: connId, at: Date.now() });
          connects += 1;
          responses += 1;
          if (entry) {
            latencies.push(performance.now() - entry.t0);
            pending.delete(tx);
          }
          return;
        }
        if (action === ACTIONS.ANNOUNCE && msg.length >= 20) {
          announces += 1;
          responses += 1;
          if (entry) {
            latencies.push(performance.now() - entry.t0);
            pending.delete(tx);
          }
          return;
        }
      });
      return sock;
    }),
  );

  const connectSocket = (si) =>
    new Promise((resolve) => {
      const tx = randTx();
      pending.set(tx, { t0: performance.now() });
      clients[si].send(buildConnect(tx), port, host, () => {
        sent += 1;
        resolve();
      });
    });

  for (let si = 0; si < sockets; si += 1) {
    await connectSocket(si);
  }
  await new Promise((r) => setTimeout(r, 300));

  const end = Date.now() + durationSec * 1000;
  let i = 0;
  const MAX_PENDING = 2000;
  const loop = async (si) => {
    while (Date.now() < end) {
      if (pending.size > MAX_PENDING) {
        await new Promise((r) => setTimeout(r, 1));
        continue;
      }
      const conn = conns.get(si);
      if (!conn || Date.now() - conn.at > 55000) {
        await connectSocket(si);
        continue;
      }
      const tx = randTx();
      const infoHash = infoHashes[i % infoHashes.length];
      const peerId = crypto.randomBytes(20).toString("hex");
      pending.set(tx, { t0: performance.now() });
      await new Promise((resolve) => {
        clients[si].send(
          buildAnnounce({
            connectionId: conn.id,
            tx,
            infoHash,
            peerId,
            left: i % 3 === 0 ? 0 : 1024,
          }),
          port,
          host,
          () => {
            sent += 1;
            resolve();
          },
        );
      });
      i += 1;
    }
  };
  await Promise.all(clients.map((_, si) => loop(si)));
  await new Promise((r) => setTimeout(r, 500));
  for (const sock of clients) {
    try {
      sock.close();
    } catch {}
  }
  latencies.sort((a, b) => a - b);
  const pct = (p) =>
    latencies.length
      ? latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))]
      : 0;
  return {
    label,
    host,
    port,
    sent,
    responses,
    connects,
    announces,
    errors,
    rps: responses / durationSec,
    p50: pct(50),
    p95: pct(95),
    timeouts: pending.size,
  };
};

if (import.meta.main) {
  const port = Number(process.argv[2] || 6970);
  const durationSec = Number(process.argv[3] || 15);
  const sockets = Number(process.argv[4] || 4);
  const out = await udpLoadTest({ port, durationSec, sockets });
  console.log(JSON.stringify(out, null, 2));
}
