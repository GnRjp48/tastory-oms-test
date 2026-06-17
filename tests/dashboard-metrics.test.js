const test = require("node:test");
const assert = require("node:assert/strict");
const metrics = require("../dashboard-metrics.js");

test("dashboard overview counts the same active current orders shown in coming up", () => {
  const orders = [
    {
      id: "TAS-1001",
      createdAt: "2026-06-15T01:30:00.000Z",
      latestDeliveryDate: "2026-06-17",
      productionStatus: "Baking",
    },
  ];

  const result = metrics.dashboardMetrics(orders);

  assert.equal(result.active.length, 1);
  assert.equal(result.dueSoon.length, 1);
  assert.deepEqual(result.overview, {
    total: 1,
    pending: 0,
    inProgress: 1,
    completed: 0,
    cancelled: 0,
  });
});

test("cancelled orders are visible in overview but not treated as active work", () => {
  const orders = [
    { id: "TAS-1002", productionStatus: "Cancelled", latestDeliveryDate: "2026-06-17" },
    { id: "TAS-1003", productionStatus: "Ready For Delivery", latestDeliveryDate: "2026-06-17" },
  ];

  const result = metrics.dashboardMetrics(orders);

  assert.equal(result.active.length, 1);
  assert.equal(result.ready.length, 1);
  assert.deepEqual(result.overview, {
    total: 2,
    pending: 0,
    inProgress: 1,
    completed: 0,
    cancelled: 1,
  });
});

test("archived orders are excluded from dashboard operational metrics", () => {
  const result = metrics.dashboardMetrics([
    { id: "TAS-1004", productionStatus: "Baking", archivedAt: "2026-06-17T02:00:00.000Z" },
    { id: "TAS-1005", productionStatus: "Waiting For Batch" },
  ]);

  assert.equal(result.operational.length, 1);
  assert.equal(result.active.length, 1);
  assert.deepEqual(result.overview, {
    total: 1,
    pending: 1,
    inProgress: 0,
    completed: 0,
    cancelled: 0,
  });
});
