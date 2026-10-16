import express from "express";
import bencode from "bencode";
import Tracker from "bittorrent-tracker";
import parseHttpRequest from "bittorrent-tracker/lib/server/parse-http.js";

const PORT = 39670;
const tracker = new Tracker.Server({ http: false, udp: false, ws: false, stats: false });
const onRequest = tracker._onRequest.bind(tracker);
const app = express();
app.get("/announce", (req, res) => {
  let params;
  try {
    params = parseHttpRequest(req, { action: "announce", trustProxy: true });
  } catch (err) {
    res.end(bencode.encode({ "failure reason": err.message }));
    return;
  }
  onRequest(params, (err, response) => {
    if (err) {
      res.end(bencode.encode({ "failure reason": err.message }));
      return;
    }
    delete response.action;
    response.interval = 30;
    res.end(bencode.encode(response));
  });
});
const server = app.listen(PORT, "127.0.0.1", async () => {
  console.log(`up ${PORT}`);
  const { httpAnnounceFlood } = await import("./http-load.js");
  const out = await httpAnnounceFlood({
    baseUrl: `http://127.0.0.1:${PORT}/announce`,
    durationSec: 15,
    concurrency: 32,
    label: "sqtrackr-http-engine",
  });
  console.log(JSON.stringify({ ...out, port: PORT }, null, 2));
  server.close(() => process.exit(0));
  try { tracker.close(); } catch {}
});
