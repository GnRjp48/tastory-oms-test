import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const migrationDirectory = path.join(root, "supabase", "migrations");
const migrationFiles = fs
  .readdirSync(migrationDirectory)
  .filter((file) => file.endsWith(".sql"))
  .sort();

const failures = [];
const migrations = migrationFiles.map((file) => {
  const sql = fs.readFileSync(path.join(migrationDirectory, file), "utf8");
  const dollarQuotes = sql.match(/\$\$/g)?.length ?? 0;
  const parenthesisBalance = [...sql].reduce(
    (balance, character) =>
      balance + (character === "(" ? 1 : character === ")" ? -1 : 0),
    0,
  );

  if (dollarQuotes % 2 !== 0) {
    failures.push(`${file}: unbalanced function dollar quotes`);
  }
  if (parenthesisBalance !== 0) {
    failures.push(`${file}: unbalanced parentheses`);
  }

  return sql.toLowerCase();
});

const combinedSql = migrations.join("\n");
const requiredTables = [
  "business_settings",
  "customers",
  "customer_tags",
  "orders",
  "order_items",
  "activity_logs",
  "notification_outbox",
  "migration_staging",
  "staff_invitations",
];
const requiredFunctions = [
  "custom_access_token_hook",
  "create_business_with_defaults",
  "set_customer_status",
  "advance_production_status",
  "begin_local_storage_migration",
  "save_oms_catalog",
  "save_oms_order",
  "archive_oms_order",
  "list_staff_management",
  "change_staff_role",
  "set_staff_active",
  "remove_staff_member",
  "log_oms_client_event",
];
const rlsTables = [
  "businesses",
  "users",
  "customers",
  "orders",
  "order_items",
  "activity_logs",
  "migration_runs",
  "migration_staging",
];

for (const table of requiredTables) {
  if (!combinedSql.includes(`create table public.${table}`)) {
    failures.push(`missing required table: ${table}`);
  }
}

for (const functionName of requiredFunctions) {
  if (!combinedSql.includes(`function public.${functionName}`)) {
    failures.push(`missing required function: ${functionName}`);
  }
}

for (const table of rlsTables) {
  if (!combinedSql.includes(`alter table public.${table} enable row level security`)) {
    failures.push(`RLS is not enabled for: ${table}`);
  }
}

const backupSchema = JSON.parse(
  fs.readFileSync(path.join(root, "migration", "local-backup.schema.json"), "utf8"),
);
for (const property of ["orders", "settings", "sourceOrigin", "exportedAt"]) {
  if (!backupSchema.required?.includes(property)) {
    failures.push(`backup schema does not require: ${property}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`FAIL ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Backend validation passed for ${migrationFiles.length} ordered migrations and the local backup contract.`,
);
