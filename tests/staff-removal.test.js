const test = require("node:test");
const assert = require("node:assert/strict");
const access = require("../staff-access.js");

test("recognizes inactive profile access errors", () => {
  assert.equal(
    access.isRevokedError(new Error("This staff account is inactive")),
    true,
  );
});

test("recognizes removed business access errors", () => {
  assert.equal(
    access.isRevokedError(new Error("Active Tastory business is unavailable.")),
    true,
  );
});

test("does not sign out users for unrelated network errors", () => {
  assert.equal(
    access.isRevokedError(new Error("Failed to fetch")),
    false,
  );
});

test("provides a clear removed-or-disabled message", () => {
  assert.match(access.revokedMessage, /disabled or has been removed/i);
});
