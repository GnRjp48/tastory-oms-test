# Phase 5 Backup & Restore

## Operating Model

Shared Workspace in Supabase remains the source of truth. Backups are recovery copies only and cannot be used as an alternate live workspace.

Only an authenticated Admin can open the Backup & Restore page, create a Supabase snapshot, preview a restore, or run a restore. Supabase verifies this permission again inside every backup RPC.

## Backup Contents

Format: `tastory-oms-supabase-backup`

Current format version: `1`

The JSON file includes:

- Customers, notes, preferences, status, and loyalty totals
- Customer tags and assignments
- Products, variants, and historical pricing
- Orders and historical order item prices
- Production status history
- Business settings
- Staff role assignments
- OMS and database schema versions

Staff authentication identities and passwords are never exported.

## Destinations

Every successful backup is retained in origin-private IndexedDB on the current device until its retention period expires.

- **Download:** Starts a normal browser download.
- **Selected folder:** Uses the File System Access API when supported and permission remains available.
- **Both:** Writes to the selected folder and starts a download copy.

Android and some PWA/browser combinations do not support persistent folder handles. In those environments the OMS falls back to a device download while retaining the protected IndexedDB copy.

## Scheduling

The browser cannot execute JavaScript while the browser or installed PWA is fully closed.

- While the OMS is open, the schedule is checked every minute.
- If a scheduled time passes while the OMS is closed, the Admin receives a missed-backup prompt at the next login.
- The default schedule is weekly at 23:00 with 30-day local retention.

## Restore Safety

1. The selected file is validated in the browser.
2. Supabase verifies the format, active business, and Admin permission.
3. Existing record IDs are counted and shown as duplicates.
4. The Admin chooses `Keep current records` or `Overwrite with backup values`.
5. A `PreRestoreBackup_YYYY-MM-DD_HHMM.json` safety copy is created.
6. The restore runs in one PostgreSQL transaction. Any failure rolls back the entire restore.

Staff assignments are restored only for Auth users that still exist. Restore never creates, deletes, or changes a staff password.

## Future Providers

Backup generation, retained storage, and destination writing are separated so Google Drive, OneDrive, Dropbox, and Hermes notifications can be added without changing the JSON format or restore RPC.
