# Local Data Migration Foundation

The current OMS business data is stored under:

```text
localStorage["tastory-oms-orders-v1"]
localStorage["tastory-oms-settings-v1"]
```

IndexedDB stores only the local export-directory handle. That permission cannot be moved to Supabase and must be selected again on each browser.

## Backup Contract

The migration exporter must create a JSON file matching `local-backup.schema.json`:

```json
{
  "format": "tastory-oms-backup",
  "version": 1,
  "exportedAt": "2026-06-09T00:00:00.000Z",
  "sourceOrigin": "https://tastory4u.com",
  "orders": [],
  "settings": {}
}
```

Before importing:

1. Calculate the file SHA-256.
2. Call `begin_local_storage_migration`.
3. Stage each source entity with its source ID and checksum.
4. Upsert customers by normalized phone after duplicate review.
5. Map legacy product IDs to Supabase product variants.
6. Preserve each order item's historical `unitPrice`.
7. Map missing order sources to `Other / Legacy import`.
8. Map legacy delivery methods without guessing courier providers.
9. Use `migration_records` to make retries idempotent.
10. Reconcile counts and financial totals before calling `complete_migration_run`.

Never delete the original browser data or source backup until the production migration has been validated and retained through the rollback window.
