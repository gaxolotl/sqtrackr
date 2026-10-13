// Tiny user-agent classifier for the logged-in devices list. Deliberately
// dependency-free and best-effort: unknown agents fall back to a generic
// label instead of leaking the raw string into the UI.
import net from "net";

const BROWSERS = Object.freeze([
  [/edg\/([\d.]+)/i, "Edge"],
  [/opr\/([\d.]+)/i, "Opera"],
  [/vivaldi\/([\d.]+)/i, "Vivaldi"],
  [/brave\/([\d.]+)/i, "Brave"],
  [/firefox\/([\d.]+)/i, "Firefox"],
  [/chrome\/([\d.]+)/i, "Chrome"],
  [/version\/([\d.]+).*safari/i, "Safari"],
  [/curl\/([\d.]+)/i, "curl"],
  [/wget\/([\d.]+)/i, "wget"],
  [/python-requests\/([\d.]+)/i, "python-requests"],
]);

const SYSTEMS = Object.freeze([
  [/windows nt/i, "Windows"],
  [/android/i, "Android"],
  [/iphone|ipad|ipod/i, "iOS"],
  [/mac os x/i, "macOS"],
  [/linux/i, "Linux"],
]);

export const parseDevice = (userAgent) => {
  if (typeof userAgent !== "string" || !userAgent.trim()) {
    return "Unknown device";
  }
  const agent = userAgent.trim();
  const browser = BROWSERS.find(([pattern]) => pattern.test(agent));
  const system = SYSTEMS.find(([pattern]) => pattern.test(agent));
  const browserName = browser ? browser[1] : null;
  if (/mobile/i.test(agent) && (!system || system[1] === "Linux")) {
    return browserName ? `${browserName} on mobile` : "Mobile browser";
  }
  if (browserName && system) return `${browserName} on ${system[1]}`;
  if (browserName) return browserName;
  if (system) return `Browser on ${system[1]}`;
  return "Unknown device";
};

export const getClientIp = (req) => {
  // X-Forwarded-For is client-controlled: honor only the first (leftmost)
  // entry, require it to parse as an IPv4/IPv6 address, and otherwise fall
  // back to the socket-derived address so spoofed garbage never lands in
  // the devices list. Display-only; never used for auth or rate limiting.
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first && net.isIP(first)) return first.slice(0, 100);
  }
  const socketIp =
    typeof req.ip === "string" && req.ip
      ? req.ip
      : req.socket?.remoteAddress;
  return (
    (typeof socketIp === "string" ? socketIp : String(socketIp ?? "")).slice(
      0,
      100,
    ) || undefined
  );
};
