import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = resolve(import.meta.dirname, "..");
const dataDirectory = resolve(process.env.TQA_DATA_DIR || join(root, ".tqa-data"));
const databasePath = join(dataDirectory, "tqa.sqlite");
const prismaCli = join(root, "node_modules", "prisma", "build", "index.js");
const baseline = "20260919000000_baseline";

const requiredColumns = {
  local_migrations: ["name"],
  technicians: ["tech_id", "pin_salt", "pin_hash", "pin_ciphertext", "active", "failed_attempts", "locked_until", "created_at"],
  tech_sessions: ["token_hash", "tech_id", "expires_at", "created_at"],
  technician_removals: ["tech_id", "state", "started_at"],
  qc_submissions: ["id", "tech_id", "job_number", "screenshot_id", "photo_ids", "status", "submitted_at", "reviewed_at", "correction_deadline_at", "review_note", "trust_upload_status", "trust_uploaded_at", "trust_external_reference", "trust_upload_error", "trust_upload_attempts", "trust_last_attempt_at", "trust_uploaded_by_key_id"],
  qc_upload_photos: ["submission_id", "tech_id", "slot", "image", "created_at"],
  trust_api_keys: ["id", "label", "token_hash", "token_hint", "created_at", "last_used_at", "revoked_at"],
};

function runPrisma(...args) {
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: root,
    env: { ...process.env, TQA_DATA_DIR: dataDirectory },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Prisma ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}.`);
}

function inspectExistingDatabase() {
  if (!existsSync(databasePath)) {
    new DatabaseSync(databasePath).close();
    return { hasSchema: false, hasPrismaHistory: false };
  }
  const database = new DatabaseSync(databasePath);
  try {
    const tables = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name));
    const hasPrismaHistory = tables.has("_prisma_migrations");
    const applicationTables = [...tables].filter((name) => name !== "_prisma_migrations");
    if (applicationTables.length === 0) return { hasSchema: false, hasPrismaHistory };

    if (!hasPrismaHistory) {
      const problems = [];
      for (const [table, expected] of Object.entries(requiredColumns)) {
        if (!tables.has(table)) { problems.push(`missing table ${table}`); continue; }
        const columns = new Set(database.prepare(`PRAGMA table_info("${table}")`).all().map((row) => row.name));
        for (const column of expected) if (!columns.has(column)) problems.push(`missing column ${table}.${column}`);
      }
      if (problems.length) throw new Error(`Existing database cannot be baselined: ${problems.join(", ")}.`);
    }
    return { hasSchema: true, hasPrismaHistory };
  } finally {
    database.close();
  }
}

function reconcileRuntimeMigration(runtimeName, prismaName, table, columns, indexes = []) {
  if (!existsSync(databasePath)) return;
  const database = new DatabaseSync(databasePath);
  let shouldResolve = false;
  try {
    const tables = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
    if (!tables.has("local_migrations") || !tables.has("_prisma_migrations") || !tables.has(table)) return;
    const runtimeApplied = database.prepare("SELECT 1 FROM local_migrations WHERE name = ?").get(runtimeName);
    const prismaApplied = database.prepare("SELECT 1 FROM _prisma_migrations WHERE migration_name = ? AND finished_at IS NOT NULL").get(prismaName);
    const available = new Set(database.prepare(`PRAGMA table_info("${table}")`).all().map((row) => row.name));
    const availableIndexes = new Set(database.prepare(`PRAGMA index_list("${table}")`).all().map((row) => row.name));
    shouldResolve = Boolean(runtimeApplied && !prismaApplied && columns.every((column) => available.has(column)) && indexes.every((index) => availableIndexes.has(index)));
  } finally {
    database.close();
  }
  if (shouldResolve) {
    console.log(`Recording already-applied runtime migration as Prisma migration ${prismaName}.`);
    runPrisma("migrate", "resolve", "--applied", prismaName);
  }
}

mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
const existing = inspectExistingDatabase();
if (existing.hasSchema && !existing.hasPrismaHistory) {
  console.log(`Adopting existing SQLite schema as Prisma baseline ${baseline}.`);
  runPrisma("migrate", "resolve", "--applied", baseline);
}
reconcileRuntimeMigration("0007_qc_location.sql", "20260921000000_qc_location", "qc_submissions", ["location_status", "location_latitude", "location_longitude", "location_accuracy", "location_captured_at"]);
reconcileRuntimeMigration("0008_multi_tenant.sql", "20260929000000_multi_tenant", "qc_submissions", ["tenant_id"]);
reconcileRuntimeMigration("0009_shared_domain_login.sql", "20260930000000_shared_domain_login", "technicians", []);
reconcileRuntimeMigration("0010_admin_first_login.sql", "20260930010000_admin_first_login", "technicians", ["must_change_credentials", "credential_fingerprint"]);
reconcileRuntimeMigration("0011_global_login_id_unique.sql", "20260930020000_global_login_id_unique", "technicians", [], ["technicians_admin_credential_fingerprint_key", "technicians_tech_login_key"]);
reconcileRuntimeMigration("0012_company_scoped_technicians.sql", "20260930030000_company_scoped_technicians", "technicians", [], ["idx_technicians_global_tech_id", "technicians_admin_credential_fingerprint_key", "technicians_tech_login_key"]);
reconcileRuntimeMigration("0013_qc_attempts.sql", "20261005000000_qc_attempts", "qc_submissions", ["root_submission_id", "attempt_number", "correction_pending"], ["idx_qc_submissions_tenant_corrections"]);
reconcileRuntimeMigration("0014_rejection_deadline.sql", "20261005010000_rejection_deadline", "qc_submissions", ["correction_deadline_at"]);
runPrisma("migrate", "deploy");
