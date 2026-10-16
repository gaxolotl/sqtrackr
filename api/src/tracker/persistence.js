import TrackerSwarm from "../schema/trackerSwarm.js";

export const MAX_PERSISTED_PEERS_PER_TORRENT = 200;
const PERSIST_PRUNE_DAYS = 7;

const getSwarmKeys = (swarm) => {
  const keys = swarm?.peers?.keys;
  if (!keys) return [];
  if (typeof keys === "function") return keys.call(swarm.peers) ?? [];
  if (Array.isArray(keys)) return keys;
  if (typeof keys.forEach === "function") {
    const collected = [];
    keys.forEach((key) => collected.push(key));
    return collected;
  }
  return [];
};

export const snapshotTrackerToDb = async (tracker) => {
  if (!tracker?.torrents) return { torrents: 0, peers: 0 };
  const entries = Object.entries(tracker.torrents);
  let peerCount = 0;
  await Promise.all(
    entries.map(async ([infoHash, swarm]) => {
      try {
        const keys = getSwarmKeys(swarm).slice(
          0,
          MAX_PERSISTED_PEERS_PER_TORRENT,
        );
        const peers = [];
        for (const key of keys) {
          const peer =
            typeof swarm.peers.peek === "function"
              ? swarm.peers.peek(key)
              : swarm.peers.get?.(key);
          if (!peer) continue;
          peers.push({
            id: String(key).slice(0, 128),
            peerId: String(peer.peerId ?? "").slice(0, 40),
            ip: String(peer.ip ?? "").slice(0, 64),
            port: Number(peer.port) || 0,
            type:
              peer.type === "udp" || peer.type === "ws" ? peer.type : "http",
            complete: Boolean(peer.complete),
          });
        }
        peerCount += peers.length;
        const complete = Number(swarm.complete) || 0;
        const incomplete = Number(swarm.incomplete) || 0;
        if (!peers.length && complete === 0 && incomplete === 0) {
          await TrackerSwarm.deleteOne({ _id: infoHash }).catch(() => {});
          return;
        }
        await TrackerSwarm.findOneAndUpdate(
          { _id: infoHash },
          {
            $set: {
              complete,
              incomplete,
              peers,
              updated: Date.now(),
            },
          },
          { upsert: true },
        ).catch(() => {});
      } catch {
        // snapshot must never break announces
      }
    }),
  );
  try {
    await TrackerSwarm.deleteMany({
      updated: { $lt: Date.now() - PERSIST_PRUNE_DAYS * 24 * 3600 * 1000 },
    });
  } catch {
    // ignore prune failures
  }
  return { torrents: entries.length, peers: peerCount };
};

export const restoreTrackerFromDb = async (tracker) => {
  if (!tracker) return { torrents: 0, peers: 0 };
  let docs = [];
  try {
    docs = await TrackerSwarm.find({}, { complete: 1, incomplete: 1, peers: 1 })
      .limit(5000)
      .lean();
  } catch {
    return { torrents: 0, peers: 0 };
  }
  let restoredPeers = 0;
  for (const doc of docs) {
    const infoHash = String(doc._id ?? "").toLowerCase();
    if (!/^[a-f0-9]{40}$/.test(infoHash)) continue;
    try {
      const swarm = await new Promise((resolve) => {
        tracker.getSwarm(infoHash, (err, existing) => {
          if (err || existing) {
            resolve(existing ?? null);
            return;
          }
          tracker.createSwarm(infoHash, (createErr, created) => {
            resolve(createErr ? null : created);
          });
        });
      });
      if (!swarm) continue;
      let complete = 0;
      let incomplete = 0;
      for (const peer of doc.peers ?? []) {
        if (!peer?.peerId || !peer?.ip) continue;
        const id =
          peer.type === "ws"
            ? String(peer.peerId)
            : String(peer.id || `${peer.ip}:${peer.port}`);
        if (!id) continue;
        try {
          swarm.peers.set(id.slice(0, 128), {
            type: peer.type === "udp" || peer.type === "ws" ? peer.type : "http",
            complete: Boolean(peer.complete),
            peerId: String(peer.peerId).slice(0, 40),
            ip: String(peer.ip).slice(0, 64),
            port: Number(peer.port) || 0,
            socket: null,
          });
          restoredPeers += 1;
          if (peer.complete) complete += 1;
          else incomplete += 1;
        } catch {
          // ignore malformed peers
        }
        if (restoredPeers > 20000) break;
      }
      swarm.complete = complete || Number(doc.complete) || 0;
      swarm.incomplete = incomplete || Number(doc.incomplete) || 0;
    } catch {
      // ignore restore failures per torrent
    }
    if (restoredPeers > 20000) break;
  }
  return { torrents: docs.length, peers: restoredPeers };
};
