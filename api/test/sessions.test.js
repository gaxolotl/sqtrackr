import assert from "node:assert/strict";
import test from "node:test";
import Session from "../src/schema/session.js";
import { getClientIp, parseDevice } from "../src/utils/deviceInfo.js";

test("device parser names common browsers and systems", () => {
  assert.equal(
    parseDevice(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ),
    "Chrome on Windows",
  );
  assert.equal(
    parseDevice(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    ),
    "Safari on iOS",
  );
  assert.equal(
    parseDevice(
      "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
    ),
    "Firefox on Linux",
  );
  assert.equal(parseDevice("curl/8.5.0"), "curl");
  assert.equal(parseDevice(""), "Unknown device");
  assert.equal(parseDevice(undefined), "Unknown device");
  assert.equal(parseDevice("SomeRandomAgent/1.0"), "Unknown device");
});

test("client ip prefers the first forwarded address", () => {
  assert.equal(
    getClientIp({
      headers: { "x-forwarded-for": "203.0.113.7, 70.41.3.18" },
      ip: "127.0.0.1",
    }),
    "203.0.113.7",
  );
  assert.equal(
    getClientIp({ headers: {}, ip: "127.0.0.1" }),
    "127.0.0.1",
  );
});

test("login sessions carry a unique jti and a TTL", () => {
  const indexes = Session.schema.indexes();
  const jti = indexes.find(([fields]) => fields.jti === 1);
  assert.ok(jti, "expected a jti index");
  assert.equal(jti[1].unique, true);
  const ttl = indexes.find(([fields]) => fields.expiresAt === 1);
  assert.ok(ttl, "expected an expiresAt TTL index");
  assert.equal(ttl[1].expireAfterSeconds, 0);
  assert.ok(Session.schema.path("revoked"));
  assert.ok(Session.schema.path("device"));
});
