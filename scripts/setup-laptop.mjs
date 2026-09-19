import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
const dir = resolve(process.env.TQA_DATA_DIR || '.tqa-data');
mkdirSync(dir, { recursive: true, mode: 0o700 });
const path = join(dir, 'secrets.json');
if (existsSync(path)) { console.log('Laptop setup already exists at ' + dir); process.exit(0); }
const password = randomBytes(18).toString('base64url');
const ownerSalt = randomBytes(16).toString('hex');
const ownerHash = scryptSync(password, ownerSalt, 32).toString('hex');
const value = { ownerSalt, ownerHash, sessionKey: randomBytes(32).toString('hex'), pinEncryptionKey: randomBytes(32).toString('hex') };
writeFileSync(path, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
writeFileSync(join(dir, 'owner-password.txt'), password + '\n', { mode: 0o600, flag: 'wx' });
console.log('Created private laptop data at ' + dir);
console.log('Owner password is in ' + join(dir, 'owner-password.txt'));
