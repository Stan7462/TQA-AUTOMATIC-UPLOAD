import { DatabaseSync } from "node:sqlite";
import { createDatabase } from "./database.mjs";
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync, unlinkSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";

export const DATA_DIR = resolve(process.env.TQA_DATA_DIR || ".tqa-data");
mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
mkdirSync(join(DATA_DIR, "captures"), { recursive: true, mode: 0o700 });

type Secrets = { ownerSalt: string; ownerHash: string; sessionKey: string; pinEncryptionKey: string };
const secretPath = join(DATA_DIR, "secrets.json");
export const secrets: Secrets | null = existsSync(secretPath)
  ? JSON.parse(readFileSync(secretPath, "utf8")) as Secrets
  : null;

const sqlite = process.env.DATABASE_URL ? null : new DatabaseSync(join(DATA_DIR, "tqa.sqlite"));
if (sqlite) {
  sqlite.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000");
  sqlite.exec("CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)");
  for (const name of [
    "0000_warm_rawhide_kid.sql",
    "0001_first_wolverine.sql",
    "0002_abandoned_amphibian.sql",
    "0003_freezing_vulture.sql",
    "0004_crazy_killraven.sql",
    "0005_qc_upload_photos.sql",
    "0006_trust_integration.sql",
    "0007_qc_location.sql",
    "0008_multi_tenant.sql",
    "0009_shared_domain_login.sql",
    "0010_admin_first_login.sql",
    "0011_global_login_id_unique.sql",
    "0012_company_scoped_technicians.sql",
    "0013_qc_attempts.sql",
    "0015_tenant_monthly_qc_goal.sql",
    "0016_technician_monthly_qc_goal.sql",
    "0017_push_notifications.sql",
    "0018_company_notification_policy.sql",
    "0019_notification_summaries.sql",
    "0020_single_push_phone.sql",
    "0021_qc_address.sql",
    "0022_catalyst_failure_workflow.sql",
  ]) {
    if (sqlite.prepare("SELECT 1 FROM local_migrations WHERE name = ?").get(name)) continue;
    const sql = readFileSync(join(process.cwd(), "drizzle", name), "utf8").replaceAll("--> statement-breakpoint", "");
    sqlite.exec("BEGIN");
    try {
      sqlite.exec(sql);
      sqlite.prepare("INSERT INTO local_migrations (name) VALUES (?)").run(name);
      sqlite.exec("COMMIT");
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  }
}

const database = createDatabase({ sqlite });
export const DB = {
  prepare(sql: string) {
    const statement = database.prepare(sql);
    return {
      bind(...values: import("./database.mjs").DbValue[]) { return DB.prepareBound(sql, values); },
      first<T>() { return statement.first<T>(); },
      async all<T>() { return { results: await statement.all<T>() }; },
      run() { return statement.run(); },
      sql, values: statement.values,
    };
  },
  prepareBound(sql: string, values: import("./database.mjs").DbValue[]) {
    const statement = database.prepare(sql).bind(...values);
    return {
      bind(...next: import("./database.mjs").DbValue[]) { return DB.prepareBound(sql, next); },
      first<T>() { return statement.first<T>(); },
      async all<T>() { return { results: await statement.all<T>() }; },
      run() { return statement.run(); },
      sql, values,
    };
  },
  batch: database.batch,
};

function capturePath(key: string) {
  if (!/^captures\/\d{13}-[a-f0-9-]{36}\.jpg$/.test(key)) throw new Error("Invalid photo key");
  return join(DATA_DIR, key);
}

export const BUCKET = {
  async size(key: string) {
    try { return statSync(capturePath(key)).size; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  },
  async put(key: string, bytes: Uint8Array, options?: unknown) {
    void options;
    const path = capturePath(key);
    const temp = path + "." + randomBytes(8).toString("hex") + ".tmp";
    writeFileSync(temp, bytes, { mode: 0o600 });
    renameSync(temp, path);
  },
  async get(key: string) {
    const path = capturePath(key);
    if (!existsSync(path)) return null;
    const data = readFileSync(path);
    return { body: new Uint8Array(data) };
  },
  async delete(keys: string | string[]) {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      const path = capturePath(key);
      try { unlinkSync(path); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  },
};

export const env = { DB, BUCKET, PIN_ENCRYPTION_KEY: secrets?.pinEncryptionKey };
