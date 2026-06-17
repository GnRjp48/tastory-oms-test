const TastoryDashboardMetrics = (() => {
  const PENDING_STATUSES = ["New Order", "Waiting For Batch"];
  const IN_PROGRESS_STATUSES = ["Scheduled For Baking", "Baking", "Packed", "Ready For Delivery"];
  const COMPLETED_STATUSES = ["Delivered", "Closed"];
  const CANCELLED_STATUSES = ["Cancelled"];
  const ACTIVE_EXCLUDED_STATUSES = [...COMPLETED_STATUSES, ...CANCELLED_STATUSES];

  function isArchived(order) {
    return Boolean(order?.archivedAt || order?.archived_at);
  }

  function operationalOrders(orders = []) {
    return orders.filter((order) => !isArchived(order));
  }

  function isActiveOrder(order) {
    return !ACTIVE_EXCLUDED_STATUSES.includes(order?.productionStatus);
  }

  function orderOverview(orders = []) {
    const currentOrders = operationalOrders(orders);
    return {
      total: currentOrders.length,
      pending: currentOrders.filter((order) => PENDING_STATUSES.includes(order.productionStatus)).length,
      inProgress: currentOrders.filter((order) => IN_PROGRESS_STATUSES.includes(order.productionStatus)).length,
      completed: currentOrders.filter((order) => COMPLETED_STATUSES.includes(order.productionStatus)).length,
      cancelled: currentOrders.filter((order) => CANCELLED_STATUSES.includes(order.productionStatus)).length,
    };
  }

  function dashboardMetrics(orders = []) {
    const operational = operationalOrders(orders);
    const active = operational.filter(isActiveOrder);
    const ready = active.filter((order) => order.productionStatus === "Ready For Delivery");
    const dueSoon = active
      .filter((order) => order.latestDeliveryDate)
      .sort((a, b) => a.latestDeliveryDate.localeCompare(b.latestDeliveryDate))
      .slice(0, 4);

    return {
      operational,
      active,
      ready,
      dueSoon,
      overview: orderOverview(operational),
    };
  }

  return {
    PENDING_STATUSES,
    IN_PROGRESS_STATUSES,
    COMPLETED_STATUSES,
    CANCELLED_STATUSES,
    operationalOrders,
    isActiveOrder,
    orderOverview,
    dashboardMetrics,
  };
})();

if (typeof module !== "undefined") {
  module.exports = TastoryDashboardMetrics;
}

if (typeof window !== "undefined") {
  window.TastoryDashboardMetrics = TastoryDashboardMetrics;
}
