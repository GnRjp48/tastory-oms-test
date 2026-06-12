const test = require("node:test");
const assert = require("node:assert/strict");
const emergency = require("../emergency-mode.js");

function storage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

test("Emergency Local Mode remains inactive by default", () => {
  assert.deepEqual(emergency.read(storage()), {
    active: false,
    dirty: false,
    enabledAt: null,
  });
});

test("activation persists and local writes mark data unsynchronized", () => {
  const target = storage();
  emergency.enable(target);
  emergency.markDirty(target);
  assert.equal(emergency.read(target).active, true);
  assert.equal(emergency.read(target).dirty, true);
});

test("activation can preserve detection of pre-existing local-only data", () => {
  const target = storage();
  emergency.enable(target, { dirty: true });
  assert.equal(emergency.read(target).dirty, true);
});

test("synchronized exit clears dirty state", () => {
  const target = storage();
  emergency.enable(target);
  emergency.markDirty(target);
  emergency.disable(target, { synchronized: true });
  assert.equal(emergency.read(target).active, false);
  assert.equal(emergency.read(target).dirty, false);
});

test("continue-anyway exit retains pending local data", () => {
  const target = storage();
  emergency.enable(target);
  emergency.markDirty(target);
  emergency.disable(target, { synchronized: false });
  assert.equal(emergency.read(target).active, false);
  assert.equal(emergency.read(target).dirty, true);
});

test("offline audit events persist until removed after delivery", () => {
  const target = storage();
  const queue = emergency.queueAudit(target, "emergency_mode_enabled", { provider: "local" });
  assert.equal(queue.length, 1);
  emergency.removeQueuedAudit(target, queue[0].id);
  assert.equal(emergency.queuedAudits(target).length, 0);
});
