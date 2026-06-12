const test = require("node:test");
const assert = require("node:assert/strict");
const backup = require("../backup-manager.js");

function storage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

test("backup settings default to weekly at 23:00 with 30-day retention", () => {
  assert.deepEqual(backup.readConfig(storage()), backup.DEFAULT_CONFIG);
});

test("daily missed schedule is detected after the next due time", () => {
  const config = { ...backup.DEFAULT_CONFIG, frequency: "daily", time: "23:00" };
  const status = { lastSuccessAt: "2026-06-10T15:00:00.000Z" };
  assert.equal(backup.isMissed(config, status, new Date("2026-06-12T01:00:00.000Z")), true);
});

test("new installations do not report a missed schedule", () => {
  assert.equal(backup.isMissed(backup.DEFAULT_CONFIG, { lastSuccessAt: null }, new Date()), false);
});

test("valid backup exposes business counts and historical sales", () => {
  const value = {
    format: backup.FORMAT,
    formatVersion: 1,
    createdAt: "2026-06-12T01:00:00.000Z",
    business: { id: "business-id" },
    metadata: { totalSales: 125.5 },
    data: {
      customers: [{ id: 1 }],
      orders: [{ id: 1 }, { id: 2 }],
      orderItems: [],
      pricing: [],
      businessSettings: [],
      staffAssignments: [],
    },
  };
  assert.equal(backup.validateBackup(value).valid, true);
  assert.deepEqual(backup.counts(value), {
    orders: 2,
    customers: 1,
    orderItems: 0,
    staff: 0,
    totalSales: 125.5,
  });
});

test("unsupported or incomplete files are rejected", () => {
  const result = backup.validateBackup({ format: "other", formatVersion: 99 });
  assert.equal(result.valid, false);
  assert.ok(result.errors.length >= 3);
});
