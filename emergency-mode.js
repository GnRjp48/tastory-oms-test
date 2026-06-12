(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TastoryEmergencyMode = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const STATE_KEY = "tastory-oms-emergency-local-mode-v1";
  const AUDIT_QUEUE_KEY = "tastory-oms-emergency-audit-queue-v1";

  function read(storage) {
    try {
      const value = JSON.parse(storage.getItem(STATE_KEY));
      return value && typeof value === "object"
        ? { active: false, dirty: false, enabledAt: null, ...value }
        : { active: false, dirty: false, enabledAt: null };
    } catch {
      return { active: false, dirty: false, enabledAt: null };
    }
  }

  function write(storage, value) {
    storage.setItem(STATE_KEY, JSON.stringify(value));
    return value;
  }

  function enable(storage, { dirty = false } = {}) {
    const current = read(storage);
    return write(storage, {
      ...current,
      active: true,
      dirty: current.dirty || dirty,
      enabledAt: new Date().toISOString(),
    });
  }

  function markDirty(storage) {
    const current = read(storage);
    if (!current.active) return current;
    return write(storage, { ...current, dirty: true });
  }

  function disable(storage, { synchronized = false } = {}) {
    const current = read(storage);
    return write(storage, {
      ...current,
      active: false,
      dirty: synchronized ? false : current.dirty,
      disabledAt: new Date().toISOString(),
    });
  }

  function markSynchronized(storage) {
    const current = read(storage);
    return write(storage, {
      ...current,
      dirty: false,
      synchronizedAt: new Date().toISOString(),
    });
  }

  function queuedAudits(storage) {
    try {
      const value = JSON.parse(storage.getItem(AUDIT_QUEUE_KEY));
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function queueAudit(storage, action, metadata = {}) {
    const queue = queuedAudits(storage);
    queue.push({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      action,
      metadata,
      occurredAt: new Date().toISOString(),
    });
    storage.setItem(AUDIT_QUEUE_KEY, JSON.stringify(queue));
    return queue;
  }

  function removeQueuedAudit(storage, id) {
    const queue = queuedAudits(storage).filter((entry) => entry.id !== id);
    storage.setItem(AUDIT_QUEUE_KEY, JSON.stringify(queue));
    return queue;
  }

  return {
    AUDIT_QUEUE_KEY,
    STATE_KEY,
    disable,
    enable,
    markDirty,
    markSynchronized,
    queueAudit,
    read,
    queuedAudits,
    removeQueuedAudit,
  };
});
