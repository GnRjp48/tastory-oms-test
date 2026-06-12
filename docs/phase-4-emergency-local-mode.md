# Phase 4 Emergency Local Mode

Emergency Local Mode is a temporary business-continuity feature for use only
when Shared Workspace is unavailable.

## Safety Flow

1. Only an Admin can see or enable Emergency Local Mode.
2. Activation requires a warning confirmation.
3. A persistent amber banner appears on every authenticated screen.
4. The Dashboard displays a current-device-only warning card.
5. Local order changes mark the emergency ledger as unsynchronized.
6. Returning to Shared Workspace requires one of these choices:
   - Import Local Orders
   - Export Backup
   - Continue Anyway

Shared Workspace remains the default. A legacy local provider selection without
an active emergency ledger is automatically returned to Shared Workspace.

## Persistence

The emergency ledger is stored in LocalStorage under:

```text
tastory-oms-emergency-local-mode-v1
```

This makes the banner and dirty-data warning persist across page refreshes,
browser restarts, and installed PWA launches.

## Audit Events

The Admin-only `log_oms_client_event` RPC records:

- `emergency_mode_enabled`
- `emergency_mode_disabled`
- `local_data_imported`
- `local_data_exported`

If Supabase is unavailable, events are queued on the device and delivered after
connectivity returns.

## Screenshots

- `screenshots/mobile-emergency-dashboard.png`
- `screenshots/mobile-emergency-activation-warning.png`
- `screenshots/mobile-emergency-exit-warning.png`
- `screenshots/desktop-emergency-dashboard.png`

## Data Protection

Export Backup downloads a fresh JSON snapshot. Import Local Orders uses the
existing checksum-based migration ledger and historical order snapshots.
Switching providers never deletes the browser's local order copy.
