import { createCipheriv, pbkdf2Sync, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const dataDirectory = resolve(process.env.TQA_DATA_DIR || ".tqa-data");
const secretsPath = join(dataDirectory, "secrets.json");
const passwordPath = join(dataDirectory, "owner-password.txt");
const configuredTechId = process.env.TQA_ADMIN_TECH_ID?.trim().toUpperCase();
const configuredPin = process.env.TQA_ADMIN_PIN?.trim();

mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });

if (!existsSync(secretsPath)) {
  const ownerPassword = randomBytes(18).toString("base64url");
  const ownerSalt = randomBytes(16).toString("hex");
  const secrets = {
    ownerSalt,
    ownerHash: scryptSync(ownerPassword, ownerSalt, 32).toString("hex"),
    sessionKey: randomBytes(32).toString("hex"),
    pinEncryptionKey: randomBytes(32).toString("hex"),
  };
  writeFileSync(secretsPath, JSON.stringify(secrets), { mode: 0o600, flag: "wx" });
  writeFileSync(passwordPath, ownerPassword + "\n", { mode: 0o600, flag: "wx" });
  console.log(`Created private application secrets in ${dataDirectory}.`);
}
chmodSync(secretsPath, 0o600);

if (Boolean(configuredTechId) !== Boolean(configuredPin)) {
  throw new Error("Set TQA_ADMIN_TECH_ID and TQA_ADMIN_PIN together.");
}
if (!configuredTechId && !configuredPin) {
  console.log("Admin environment bootstrap skipped; TQA_ADMIN_TECH_ID and TQA_ADMIN_PIN are not set.");
} else {
  if (!/^[A-Z0-9_-]{3,32}$/.test(configuredTechId)) throw new Error("TQA_ADMIN_TECH_ID must be 3 to 32 letters, numbers, underscores, or hyphens.");
  if (!/^\d{5}$/.test(configuredPin)) throw new Error("TQA_ADMIN_PIN must contain exactly five digits.");

  const secrets = JSON.parse(readFileSync(secretsPath, "utf8"));
  if (!/^[0-9a-f]{64}$/i.test(secrets.pinEncryptionKey || "")) throw new Error("PIN encryption key is unavailable.");

  const database = new DatabaseSync(join(dataDirectory, "tqa.sqlite"));
  database.exec("PRAGMA busy_timeout=5000");
  try {
    const current = database.prepare("SELECT pin_salt AS salt, pin_hash AS hash, pin_ciphertext AS ciphertext, active FROM technicians WHERE tech_id = ?").get(configuredTechId);
    const candidate = current?.salt && /^[0-9a-f]+$/i.test(current.salt)
      ? pbkdf2Sync(configuredPin, Buffer.from(current.salt, "hex"), 100_000, 32, "sha256")
      : null;
    const stored = current?.hash && /^[0-9a-f]{64}$/i.test(current.hash) ? Buffer.from(current.hash, "hex") : null;
    const unchanged = current?.active === 1 && current.ciphertext && candidate && stored && timingSafeEqual(candidate, stored);

    database.exec("BEGIN IMMEDIATE");
    try {
      if (unchanged) {
        database.prepare("UPDATE technicians SET active = 1, failed_attempts = 0, locked_until = 0 WHERE tech_id = ?").run(configuredTechId);
      } else {
        const salt = randomBytes(16).toString("hex");
        const hash = pbkdf2Sync(configuredPin, Buffer.from(salt, "hex"), 100_000, 32, "sha256").toString("hex");
        const iv = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", Buffer.from(secrets.pinEncryptionKey, "hex"), iv);
        const encrypted = Buffer.concat([cipher.update(configuredPin, "utf8"), cipher.final(), cipher.getAuthTag()]);
        const ciphertext = `${iv.toString("hex")}:${encrypted.toString("hex")}`;
        database.prepare("INSERT INTO technicians (tech_id, pin_salt, pin_hash, pin_ciphertext, active, failed_attempts, locked_until, created_at) VALUES (?, ?, ?, ?, 1, 0, 0, ?) ON CONFLICT(tech_id) DO UPDATE SET pin_salt=excluded.pin_salt, pin_hash=excluded.pin_hash, pin_ciphertext=excluded.pin_ciphertext, active=1, failed_attempts=0, locked_until=0").run(configuredTechId, salt, hash, ciphertext, Date.now());
        database.prepare("DELETE FROM tech_sessions WHERE tech_id = ?").run(configuredTechId);
      }
      database.prepare("DELETE FROM technician_removals WHERE tech_id = ?").run(configuredTechId);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    console.log(`Admin Tech ID ${configuredTechId} is ready.`);
  } finally {
    database.close();
  }
}
