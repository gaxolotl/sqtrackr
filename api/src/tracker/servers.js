import { envFlag } from "../utils/env.js";
import { getTrackerBaseUrl } from "../utils/trackerUrl.js";
import { restoreTrackerFromDb, snapshotTrackerToDb } from "./persistence.js";

export const isUdpEnabled = () => envFlag("SQ_TRACKER_UDP_ENABLED");

export const getUdpPort = () => {
  const parsed = Number(process.env.SQ_TRACKER_UDP_PORT || 6969);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535
    ? parsed
    : 6969;
};

export const isWsEnabled = () => envFlag("SQ_TRACKER_WS_ENABLED");

export const isPersistEnabled = () => {
  const raw = process.env.SQ_TRACKER_PERSIST_ENABLED;
  if (raw == null || raw === "") return true;
  return raw !== "false";
};

export const getPersistIntervalMs = () => {
  const parsed = Number(process.env.SQ_TRACKER_PERSIST_INTERVAL_SEC || 60);
  const seconds =
    Number.isInteger(parsed) && parsed >= 10 && parsed <= 3600 ? parsed : 60;
  return seconds * 1000;
};

export const getUdpAnnounceUrl = () => {
  if (!isUdpEnabled()) return "";
  try {
    const base = getTrackerBaseUrl();
    const host = new URL(base).hostname || "127.0.0.1";
    return `udp://${host}:${getUdpPort()}`;
  } catch {
    return `udp://127.0.0.1:${getUdpPort()}`;
  }
};

export const getWsAnnounceUrl = () => {
  if (!isWsEnabled()) return "";
  try {
    const base = getTrackerBaseUrl();
    const parsed = new URL(base);
    const protocol = parsed.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${parsed.host}/ws`;
  } catch {
    return "";
  }
};

export const attachWsUpgrade = ({ tracker, httpServer, logger = console }) => {
  if (!tracker?.ws || !httpServer) return () => {};
  const onUpgrade = (req, socket, head) => {
    let pathname = "";
    try {
      const parsed = new URL(req.url ?? "/ws", "http://localhost");
      pathname = parsed.pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== "/ws" && pathname !== "/websocket") return;
    try {
      socket._sqtrackerUpgradeUrl = req.url ?? "";
    } catch {
      // ignore
    }
    tracker.ws.handleUpgrade(req, socket, head, (ws) => {
      try {
        ws._sqtrackerUpgradeUrl = req.url ?? "";
        const query = (req.url ?? "").split("?")[1] ?? "";
        for (const part of query.split("&")) {
          const [k, v = ""] = part.split("=");
          const key = (k ?? "").toLowerCase();
          if (
            (key === "uid" || key === "passkey" || key === "auth") &&
            /^[a-f0-9]{32}$/i.test(v)
          ) {
            ws._sqtrackerUid = v.toLowerCase();
            break;
          }
        }
      } catch {
        // ignore auth parse failures; filter denies anonymous when private
      }
      tracker.ws.emit("connection", ws, req);
    });
  };
  httpServer.on("upgrade", onUpgrade);
  const connectionLogger = (socket, req) => {
    try {
      if (!socket._sqtrackerUpgradeUrl && req?.url) {
        socket._sqtrackerUpgradeUrl = req.url;
      }
    } catch {
      // ignore
    }
  };
  try {
    tracker.ws.on("connection", connectionLogger);
  } catch {
    // ignore
  }
  logger.log?.("[sq] websocket tracker listening on /ws");
  return () => {
    httpServer.removeListener("upgrade", onUpgrade);
    try {
      tracker.ws.removeListener("connection", connectionLogger);
    } catch {
      // ignore
    }
  };
};

export const startUdpListener = ({ tracker, logger = console }) =>
  new Promise((resolve) => {
    if (!isUdpEnabled() || !tracker?.udp4) {
      resolve(false);
      return;
    }
    const port = getUdpPort();
    const onError = (err) => {
      logger.error?.(`[sq] udp tracker failed on :${port}: ${err.message}`);
      resolve(false);
    };
    tracker.once("listening", () => {
      logger.log?.(`[sq] udp tracker listening on :${port}`);
      resolve(true);
    });
    tracker.once("error", onError);
    try {
      const pending = tracker._listenCalled ? null : port;
      if (pending != null) {
        tracker.listen({ udp: port });
      } else {
        resolve(true);
      }
    } catch (err) {
      logger.error?.(`[sq] udp tracker failed: ${err.message}`);
      resolve(false);
    }
  });

export const startPersistenceLoop = ({ tracker, logger = console }) => {
  if (!isPersistEnabled() || !tracker) return () => {};
  let stopped = false;
  let timer = null;
  restoreTrackerFromDb(tracker)
    .then((restored) => {
      if (restored.torrents) {
        logger.log?.(
          `[sq] restored ${restored.torrents} swarms (${restored.peers} peers) from db`,
        );
      }
    })
    .catch((err) => {
      logger.error?.(`[sq] swarm restore failed: ${err.message}`);
    })
    .finally(() => {
      if (stopped) return;
      timer = setInterval(() => {
        snapshotTrackerToDb(tracker).catch((err) => {
          logger.error?.(`[sq] swarm snapshot failed: ${err.message}`);
        });
      }, getPersistIntervalMs());
      if (typeof timer.unref === "function") timer.unref();
    });
  return async () => {
    stopped = true;
    if (timer) clearInterval(timer);
    try {
      await snapshotTrackerToDb(tracker);
    } catch {
      // shutdown snapshot is best-effort
    }
  };
};
