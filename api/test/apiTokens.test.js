import assert from "node:assert/strict";
import test from "node:test";
import { API_TOKEN_TTL_MS, getApiTokenExpiry } from "../src/utils/apiTokens.js";

test("API tokens expire 90 days after creation", () => {
  assert.equal(getApiTokenExpiry({ created: 1_000 }), 1_000 + API_TOKEN_TTL_MS);
});

test("explicit expiry wins over the creation timestamp", () => {
  assert.equal(getApiTokenExpiry({ created: 1_000, expiresAt: 42 }), 42);
});

test("tokens without timestamps are treated as expired", () => {
  assert.equal(getApiTokenExpiry({}), 0);
});
