(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TastoryBackupManager = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const CONFIG_KEY = "tastory-oms-backup-config-v1";
  const STATUS_KEY = "tastory-oms-backup-status-v1";
  const DB_NAME = "tastory-oms-backups";
  const BACKUP_STORE = "backups";
  const HANDLE_STORE = "handles";
  const FORMAT = "tastory-oms-supabase-backup";
  const FORMAT_VERSION = 1;
  const DEFAULT_CONFIG = {
    frequency: "weekly",
    time: "23:00",
    destination: "both",
    retention: 30,
    folderName: "",
  };

  function safeJson(value, fallback) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function readConfig(storage) {
    return { ...DEFAULT_CONFIG, ...safeJson(storage.getItem(CONFIG_KEY), {}) };
  }

  function writeConfig(storage, config) {
    const normalized = {
      ...DEFAULT_CONFIG,
      ...config,
      retention: [7, 30, 90].includes(Number(config.retention)) ? Number(config.retention) : 30,
    };
    storage.setItem(CONFIG_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function readStatus(storage) {
    return safeJson(storage.getItem(STATUS_KEY), {
      lastSuccessAt: null,
      lastFailureAt: null,
      lastError: "",
      lastBackup: null,
    });
  }

  function writeStatus(storage, status) {
    storage.setItem(STATUS_KEY, JSON.stringify(status));
    return status;
  }

  function localDateParts(date) {
    const pad = (value) => String(value).padStart(2, "0");
    return {
      date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      time: `${pad(date.getHours())}${pad(date.getMinutes())}`,
    };
  }

  function fileName(date = new Date(), prefix = "TastoryBackup") {
    const parts = localDateParts(date);
    return `${prefix}_${parts.date}_${parts.time}.json`;
  }

  function scheduledTime(date, time) {
    const [hours, minutes] = String(time || "23:00").split(":").map(Number);
    const result = new Date(date);
    result.setHours(hours || 0, minutes || 0, 0, 0);
    return result;
  }

  function nextScheduledAt(config, lastSuccessAt, now = new Date()) {
    const frequency = config.frequency || "weekly";
    const base = lastSuccessAt ? new Date(lastSuccessAt) : now;
    let next = scheduledTime(base, config.time);

    if (!lastSuccessAt) {
      if (next <= now) next.setDate(next.getDate() + 1);
      return next;
    }

    if (frequency === "daily") {
      next.setDate(next.getDate() + 1);
    } else if (frequency === "monthly") {
      next.setMonth(next.getMonth() + 1);
    } else {
      next.setDate(next.getDate() + 7);
    }
    return next;
  }

  function isMissed(config, status, now = new Date()) {
    if (!status.lastSuccessAt) return false;
    return nextScheduledAt(config, status.lastSuccessAt, now) <= now;
  }

  function validateBackup(backup) {
    const errors = [];
    if (!backup || backup.format !== FORMAT) errors.push("This is not a Tastory Shared Workspace backup.");
    if (Number(backup?.formatVersion) !== FORMAT_VERSION) errors.push("This backup version is not supported.");
    if (!backup?.createdAt || Number.isNaN(Date.parse(backup.createdAt))) errors.push("Backup date is missing or invalid.");
    if (!backup?.business?.id) errors.push("Business identity is missing.");
    if (!backup?.data || typeof backup.data !== "object") errors.push("Backup data is missing.");
    for (const key of ["customers", "orders", "orderItems", "pricing", "businessSettings", "staffAssignments"]) {
      if (!Array.isArray(backup?.data?.[key])) errors.push(`${key} data is missing.`);
    }
    return { valid: errors.length === 0, errors };
  }

  function counts(backup) {
    return {
      orders: backup?.data?.orders?.length || 0,
      customers: backup?.data?.customers?.length || 0,
      orderItems: backup?.data?.orderItems?.length || 0,
      staff: backup?.data?.staffAssignments?.length || 0,
      totalSales: Number(backup?.metadata?.totalSales || 0),
    };
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(BACKUP_STORE)) {
          db.createObjectStore(BACKUP_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(HANDLE_STORE)) {
          db.createObjectStore(HANDLE_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function transact(storeName, mode, operation) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const result = operation(tx.objectStore(storeName));
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function storeBackup(backup, details = {}) {
    const json = JSON.stringify(backup);
    const record = {
      id: backup.backupId || crypto.randomUUID(),
      createdAt: backup.createdAt,
      fileName: details.fileName || fileName(new Date(backup.createdAt)),
      kind: details.kind || "manual",
      size: new Blob([json]).size,
      counts: counts(backup),
      backup,
    };
    await transact(BACKUP_STORE, "readwrite", (store) => store.put(record));
    return record;
  }

  async function listBackups() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BACKUP_STORE, "readonly");
      const request = tx.objectStore(BACKUP_STORE).getAll();
      request.onsuccess = () => resolve((request.result || []).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      request.onerror = () => reject(request.error);
    });
  }

  async function pruneBackups(days, now = new Date()) {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - Number(days || 30));
    const records = await listBackups();
    const expired = records.filter((record) => new Date(record.createdAt) < cutoff);
    if (!expired.length) return 0;
    await transact(BACKUP_STORE, "readwrite", (store) => expired.forEach((record) => store.delete(record.id)));
    return expired.length;
  }

  async function saveDirectoryHandle(handle) {
    await transact(HANDLE_STORE, "readwrite", (store) => store.put(handle, "backup-directory"));
  }

  async function getDirectoryHandle() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, "readonly");
      const request = tx.objectStore(HANDLE_STORE).get("backup-directory");
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  return {
    FORMAT,
    FORMAT_VERSION,
    DEFAULT_CONFIG,
    readConfig,
    writeConfig,
    readStatus,
    writeStatus,
    fileName,
    nextScheduledAt,
    isMissed,
    validateBackup,
    counts,
    storeBackup,
    listBackups,
    pruneBackups,
    saveDirectoryHandle,
    getDirectoryHandle,
  };
});
