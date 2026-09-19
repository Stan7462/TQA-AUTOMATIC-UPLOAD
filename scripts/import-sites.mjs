import { readFileSync, copyFileSync, existsSync, mkdirSync, unlinkSync, chmodSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, randomBytes, pbkdf2Sync, timingSafeEqual } from 'node:crypto';

const dir = resolve(process.env.TQA_DATA_DIR || '.tqa-data');
const source = join(dir, 'import-sites.json');
const manifestPath = process.argv[2];
if (!manifestPath) throw new Error('Provide exported asset manifest path');
const payload = JSON.parse(readFileSync(source, 'utf8'));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const secrets = JSON.parse(readFileSync(join(dir, 'secrets.json'), 'utf8'));
const assets = new Map(manifest.assets.filter(asset => asset.url.includes('/api/captures/')).map(asset => [asset.name, asset.path]));
const ids = new Set(payload.submissions.flatMap(row => [row.screenshot_id, ...JSON.parse(row.photo_ids)]));
for (const id of ids) {
  const file = assets.get(id);
  if (!file) throw new Error('Missing exported photo ' + id);
  const bytes = readFileSync(file);
  if (bytes.length < 500 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) throw new Error('Invalid JPEG ' + id);
}
mkdirSync(join(dir, 'captures'), { recursive: true, mode: 0o700 });
for (const id of ids) {
  const target = join(dir, 'captures', id);
  if (!existsSync(target)) copyFileSync(assets.get(id), target);
  chmodSync(target, 0o600);
}
const db = new DatabaseSync(join(dir, 'tqa.sqlite'));
db.exec('PRAGMA foreign_keys=ON; BEGIN');
try {
  const insertTech = db.prepare('INSERT OR IGNORE INTO technicians (tech_id,pin_salt,pin_hash,pin_ciphertext,active,failed_attempts,locked_until,created_at) VALUES (?,?,?,?,?,?,?,?)');
  for (const row of payload.technicians) {
    const pin = payload.pins[row.tech_id];
    if (!/^\d{5}$/.test(pin || '')) throw new Error('Missing five-digit PIN for ' + row.tech_id);
    const hash = pbkdf2Sync(pin, Buffer.from(row.pin_salt, 'hex'), 100000, 32, 'sha256');
    if (!timingSafeEqual(hash, Buffer.from(row.pin_hash, 'hex'))) throw new Error('PIN does not match imported technician');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(secrets.pinEncryptionKey, 'hex'), iv);
    const ciphertext = Buffer.concat([cipher.update(pin), cipher.final(), cipher.getAuthTag()]);
    insertTech.run(row.tech_id,row.pin_salt,row.pin_hash,iv.toString('hex')+':'+ciphertext.toString('hex'),row.active,0,0,row.created_at);
  }
  const insertRemoval = db.prepare('INSERT OR IGNORE INTO technician_removals (tech_id,state,started_at) VALUES (?,?,?)');
  for (const row of payload.removals) insertRemoval.run(row.tech_id,row.state,row.started_at);
  const insertQc = db.prepare('INSERT OR IGNORE INTO qc_submissions (id,tech_id,screenshot_id,photo_ids,status,submitted_at,reviewed_at,job_number,review_note) VALUES (?,?,?,?,?,?,?,?,?)');
  for (const row of payload.submissions) insertQc.run(row.id,row.tech_id,row.screenshot_id,row.photo_ids,row.status,row.submitted_at,row.reviewed_at,row.job_number,row.review_note);
  db.exec('COMMIT');
} catch (error) { db.exec('ROLLBACK'); throw error; }
console.log('Imported ' + payload.submissions.length + ' QCs, ' + ids.size + ' photos, ' + payload.technicians.length + ' active technician, and ' + payload.removals.length + ' blocked IDs.');
unlinkSync(source);
