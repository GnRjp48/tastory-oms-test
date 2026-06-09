# Phase 2 Scope: Supabase Frontend Integration

## Screens Modified

- Login and password-reset gate: new authenticated entry point.
- Dashboard: cloud/local mode indicator, sync state, import controls, and live metrics.
- New Order: saves customers, orders, and items transactionally in Supabase.
- Orders: reads shared orders and receives live changes from other users.
- Production Summary: receives live order and workflow updates.
- Daily Summary: reads the same shared live order collection.
- Pricing: reads and writes the shared product, variant, and effective-price catalog.

The visual structure and mobile bottom navigation remain intact.

## Browser Storage Functions Replaced

In Supabase mode:

- `loadOrders()` is replaced by the Supabase order repository.
- `saveOrders()` is replaced by transactional order RPCs.
- `loadSettings()` product pricing is replaced by the shared Supabase catalog.
- `saveSettings()` continues to retain device-only export-folder preferences, while
  product pricing is saved to Supabase.
- Production status changes use `advance_production_status`.
- Order deletion becomes a reversible archive operation.

The IndexedDB export-directory handle remains device-local because browser file
permissions cannot be shared through Supabase.

## Realtime Features

Supabase Realtime refreshes:

- Dashboard counts, revenue, outstanding balances, and delivery queue.
- Orders list and order detail.
- Production workflow and production totals.
- Daily order summary.
- Inventory data when inventory screens are introduced.

Catalog and business-setting changes are refreshed after a successful write.

## Local Data Protection

- LocalStorage remains untouched while cloud mode is used.
- Before the first import, the app creates
  `tastory-oms-backup-before-supabase-v1`.
- Imports use a SHA-256 checksum and migration ledger to prevent duplicate runs.
- Historical item prices are preserved during import.
- Local sample or business orders are never automatically deleted.

## Rollback

Set the provider to LocalStorage through the Dashboard control or run:

```js
localStorage.setItem("tastory-oms-data-provider-v2", "local");
location.reload();
```

The application immediately returns to the original LocalStorage data. Supabase
records are retained and can be reconciled; rollback does not delete either copy.

## Availability During Phase 2

The current OMS remains usable throughout development. LocalStorage is the
default provider until Jane explicitly signs in and activates Supabase mode.
Cloud failures display an error and allow an immediate return to local mode.
