import { createCipheriv, createHash, createHmac, pbkdf2Sync, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const dataDirectory = resolve(process.env.TQA_DATA_DIR || ".tqa-data");
const secretsPath = join(dataDirectory, "secrets.json");
const passwordPath = join(dataDirectory, "owner-password.txt");
mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });

if (!existsSync(secretsPath)) {
  const ownerPassword = randomBytes(18).toString("base64url");
  const ownerSalt = randomBytes(16).toString("hex");
  writeFileSync(secretsPath, JSON.stringify({
    ownerSalt,
    ownerHash: scryptSync(ownerPassword, ownerSalt, 32).toString("hex"),
    sessionKey: randomBytes(32).toString("hex"),
    pinEncryptionKey: randomBytes(32).toString("hex"),
  }), { mode: 0o600, flag: "wx" });
  writeFileSync(passwordPath, ownerPassword + "\n", { mode: 0o600, flag: "wx" });
  console.log("Created private application secrets in " + dataDirectory + ".");
}
chmodSync(secretsPath, 0o600);

function tenantConfig() {
  if (process.env.TQA_TENANTS_JSON?.trim()) {
    let parsed;
    try { parsed = JSON.parse(process.env.TQA_TENANTS_JSON); } catch { throw new Error("TQA_TENANTS_JSON must be valid JSON."); }
    if (!Array.isArray(parsed) || !parsed.length) throw new Error("TQA_TENANTS_JSON must be a non-empty array.");
    return parsed;
  }
  const adminTechId = process.env.TQA_ADMIN_TECH_ID?.trim().toUpperCase();
  const adminPin = process.env.TQA_ADMIN_PIN?.trim();
  if (!adminTechId && !adminPin) return [];
  if (!adminTechId || !adminPin) throw new Error("Set TQA_ADMIN_TECH_ID and TQA_ADMIN_PIN together.");
  return [{ id: process.env.TQA_TENANT_ID || "default", name: process.env.TQA_TENANT_NAME || "TQA", adminTechId, adminPin }];
}

function validateTenant(item, index) {
  if (!item || typeof item !== "object") throw new Error("Tenant " + (index + 1) + " must be an object.");
  const config = {
    id: String(item.id || "").trim().toLowerCase(),
    name: String(item.name || "").trim(),
    adminTechId: String(item.adminTechId || "").trim().toUpperCase(),
    adminPin: String(item.adminPin || "").trim(),
  };
  if (!/^[a-z0-9_-]{2,40}$/.test(config.id)) throw new Error("Tenant " + (index + 1) + " has an invalid id.");
  if (!config.name || config.name.length > 80) throw new Error("Tenant " + config.id + " needs a name of up to 80 characters.");
  if (!/^[A-Z0-9_-]{3,32}$/.test(config.adminTechId)) throw new Error("Tenant " + config.id + " has an invalid adminTechId.");
  if (!/^\d{5}$/.test(config.adminPin)) throw new Error("Tenant " + config.id + " adminPin must contain exactly five digits.");
  return config;
}

function credentialFingerprint(value, encryptionKey) {
  const key = createHash("sha256").update("credential:" + encryptionKey).digest();
  return createHmac("sha256", key).update(value).digest("hex");
}

function encryptedPin(pin, encryptionKey) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(encryptionKey, "hex"), iv);
  const encrypted = Buffer.concat([cipher.update(pin, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

const configs = tenantConfig().map(validateTenant);
if (!configs.length) {
  console.log("Tenant admin bootstrap skipped; configure TQA_TENANTS_JSON or the legacy TQA_ADMIN variables.");
} else {
  const secrets = JSON.parse(readFileSync(secretsPath, "utf8"));
  if (!/^[0-9a-f]{64}$/i.test(secrets.pinEncryptionKey || "")) throw new Error("PIN encryption key is unavailable.");
  const database = new DatabaseSync(join(dataDirectory, "tqa.sqlite"));
  database.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON");
  try {
    database.exec("BEGIN IMMEDIATE");
    const claimedAdminIds = new Set();
    const claimedAdminPins = new Set();
    for (const config of configs) {
      if (claimedAdminIds.has(config.adminTechId)) throw new Error("Admin ID " + config.adminTechId + " is listed for more than one company.");
      if (claimedAdminPins.has(config.adminPin)) throw new Error("An admin PIN is listed for more than one company. Every administrator credential must be unique.");
      claimedAdminIds.add(config.adminTechId);
      claimedAdminPins.add(config.adminPin);
      const now = Date.now();
      database.prepare("INSERT INTO tenants (id, name, active, created_at) VALUES (?, ?, 1, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, active=1").run(config.id, config.name, now);

      const conflictingAdmin = database.prepare("SELECT tenant_id AS tenantId FROM technicians WHERE tech_id = ? AND is_admin = 1 AND tenant_id <> ?").get(config.adminTechId, config.id);
      if (conflictingAdmin) throw new Error("Admin ID " + config.adminTechId + " is already assigned to another company.");
      const fingerprint = credentialFingerprint(config.adminPin, secrets.pinEncryptionKey);
      const conflictingCredential = database.prepare("SELECT tenant_id AS tenantId FROM technicians WHERE credential_fingerprint = ? AND tenant_id <> ?").get(fingerprint, config.id);
      if (conflictingCredential) throw new Error("The configured admin PIN is already assigned to another company.");

      const current = database.prepare("SELECT pin_salt AS salt, pin_hash AS hash, pin_ciphertext AS ciphertext, active, is_admin AS isAdmin FROM technicians WHERE tenant_id = ? AND tech_id = ?").get(config.id, config.adminTechId);
      const candidate = current?.salt && /^[0-9a-f]+$/i.test(current.salt) ? pbkdf2Sync(config.adminPin, Buffer.from(current.salt, "hex"), 100_000, 32, "sha256") : null;
      const stored = current?.hash && /^[0-9a-f]{64}$/i.test(current.hash) ? Buffer.from(current.hash, "hex") : null;
      const unchanged = current?.active === 1 && current?.isAdmin === 1 && current.ciphertext && candidate && stored && timingSafeEqual(candidate, stored);
      database.prepare("UPDATE technicians SET is_admin = 0 WHERE tenant_id = ? AND tech_id <> ?").run(config.id, config.adminTechId);
      if (unchanged) {
        database.prepare("UPDATE technicians SET active=1,is_admin=1,must_change_credentials=0,credential_fingerprint=?,failed_attempts=0,locked_until=0 WHERE tenant_id=? AND tech_id=?").run(fingerprint, config.id, config.adminTechId);
      } else {
        const salt = randomBytes(16).toString("hex");
        const hash = pbkdf2Sync(config.adminPin, Buffer.from(salt, "hex"), 100_000, 32, "sha256").toString("hex");
        database.prepare("INSERT INTO technicians (tenant_id,tech_id,pin_salt,pin_hash,pin_ciphertext,active,is_admin,must_change_credentials,credential_fingerprint,failed_attempts,locked_until,created_at) VALUES (?,?,?,?,?,1,1,0,?,0,0,?) ON CONFLICT(tenant_id,tech_id) DO UPDATE SET pin_salt=excluded.pin_salt,pin_hash=excluded.pin_hash,pin_ciphertext=excluded.pin_ciphertext,active=1,is_admin=1,must_change_credentials=0,credential_fingerprint=excluded.credential_fingerprint,failed_attempts=0,locked_until=0").run(config.id, config.adminTechId, salt, hash, encryptedPin(config.adminPin, secrets.pinEncryptionKey), fingerprint, now);
        database.prepare("DELETE FROM tech_sessions WHERE tenant_id=? AND tech_id=?").run(config.id, config.adminTechId);
      }
      database.prepare("DELETE FROM technician_removals WHERE tenant_id=? AND tech_id=?").run(config.id, config.adminTechId);
      console.log("Tenant " + config.name + " admin " + config.adminTechId + " is ready on the shared login domain.");
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  } finally {
    database.close();
  }
}
