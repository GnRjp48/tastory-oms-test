const test = require("node:test");
const assert = require("node:assert/strict");
const access = require("../ux-access.js");

const session = { user: { id: "user-1" } };

test("blocks every application page without authentication", () => {
  ["dashboard", "orders", "production", "settings", "staff", "pricing", "backup"].forEach((page) => {
    assert.equal(access.canAccessPage(page, null, ["admin"]), false);
  });
});

test("allows authenticated staff to use operational pages", () => {
  ["dashboard", "orders", "production", "summary", "settings"].forEach((page) => {
    assert.equal(access.canAccessPage(page, session, ["production_staff"]), true);
  });
});

test("restricts administration pages to Admin", () => {
  assert.equal(access.canAccessPage("staff", session, ["manager"]), false);
  assert.equal(access.canAccessPage("pricing", session, ["sales_staff"]), false);
  assert.equal(access.canAccessPage("backup", session, ["production_staff"]), false);
  assert.equal(access.canAccessPage("staff", session, ["admin"]), true);
  assert.equal(access.canAccessPage("pricing", session, ["admin"]), true);
  assert.equal(access.canAccessPage("backup", session, ["admin"]), true);
});

test("restricts new order creation by role", () => {
  assert.equal(access.canAccessPage("new-order", session, ["sales_staff"]), true);
  assert.equal(access.canAccessPage("new-order", session, ["production_staff"]), false);
});

test("recognizes expired authentication errors without treating network errors as expiry", () => {
  assert.equal(access.isExpiredSessionError(new Error("JWT expired")), true);
  assert.equal(access.isExpiredSessionError(new Error("Invalid Refresh Token")), true);
  assert.equal(access.isExpiredSessionError(new Error("Failed to fetch")), false);
});
