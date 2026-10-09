import { DatabaseSync, backup } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createDatabase } from '../lib/database.mjs';

export const tables = ['tenants','technicians','tech_sessions','technician_removals','qc_submissions','qc_submission_attempts','qc_upload_photos','trust_api_keys','tenant_domains','push_accounts','push_company_preferences','push_watches','push_outbox','local_migrations'];
function normalized(value) { return value instanceof Uint8Array ? {binary:Buffer.from(value).toString('base64')} : value; }
export function digest(rows,columns) {
  const records=rows.map(row=>JSON.stringify(columns.map(c=>normalized(row[c])))).sort();
  return createHash('sha256').update(JSON.stringify(records)).digest('hex');
}
export async function importSqlite(source,client) {
  const available=source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'_prisma_migrations'").all().map(r=>r.name);
  if(available.some(name=>!tables.includes(name)) || tables.some(name=>!available.includes(name))) throw new Error('Source schema does not match the reviewed migration; refusing partial import.');
  const report={};
  for(const table of tables) {
    const columns=source.prepare(`PRAGMA table_info("${table}")`).all().map(r=>r.name);
    const target=(await client.query('SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1',[table])).rows.map(r=>r.column_name);
    const extras={push_accounts:['supervisor_summary','escalation','device_status','device_checked_at'],push_watches:['upload_enabled','fixed_enabled']};
    if(columns.some(c=>!target.includes(c)) || target.some(c=>!columns.includes(c)&&!extras[table]?.includes(c))) throw new Error(`Column mismatch for ${table}`);
    const rows=source.prepare(`SELECT * FROM "${table}"`).all();
    const sql=`INSERT INTO "${table}" (${columns.map(c=>`"${c}"`).join(',')}) VALUES (${columns.map((_,i)=>`$${i+1}`).join(',')})`;
    for(const row of rows) await client.query(sql,columns.map(c=>row[c] instanceof Uint8Array?Buffer.from(row[c]):row[c]));
    const imported=(await client.query(`SELECT * FROM "${table}"`)).rows;
    const sourceDigest=digest(rows,columns),targetDigest=digest(imported,columns);
    if(rows.length!==imported.length || sourceDigest!==targetDigest) throw new Error(`Data verification failed for ${table}`);
    report[table]={count:rows.length,sha256:sourceDigest};
  }
  return report;
}
async function upgradeNotifications(client) {
  if ((await client.query("SELECT 1 FROM tqa_postgres_migrations WHERE version='0002'")).rows.length) return;
  if (!(await client.query("SELECT 1 FROM information_schema.columns WHERE table_name='push_accounts' AND column_name='supervisor_summary'")).rows.length) await client.query(readFileSync(new URL('../postgres/migrations/0002_notification_summaries.sql',import.meta.url),'utf8'));
  await client.query('INSERT INTO tqa_postgres_migrations VALUES($1,$2,$3)', ['0002', Date.now(), '{}']);
}
export async function migratePostgres() {
  const directory=resolve(process.env.TQA_DATA_DIR || '.tqa-data');
  if(!existsSync(join(directory,'secrets.json'))) throw new Error('Existing application encryption secrets are required before database migration.');
  const db=createDatabase(),client=await db.pool.connect();
  let source;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(874601992)');
    const present=(await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).rows.map(r=>r.table_name);
    if(present.includes('tqa_postgres_migrations')) {
      const applied=(await client.query("SELECT version FROM tqa_postgres_migrations WHERE version='0001'")).rows;
      if(!applied.length) throw new Error('Unrecognized PostgreSQL migration state.');
      await upgradeNotifications(client);
      await client.query('COMMIT');
      console.log('PostgreSQL schema is current. SQLite is no longer used by the app.');
      return;
    }
    if(present.length) throw new Error('PostgreSQL destination is not empty; refusing to overwrite existing data.');
    if(!existsSync(join(directory,'tqa.sqlite'))) throw new Error('SQLite source is missing.');
    source=new DatabaseSync(join(directory,'tqa.sqlite'),{readOnly:true});
    if(source.prepare('PRAGMA integrity_check').get().integrity_check!=='ok') throw new Error('SQLite integrity check failed.');
    if(source.prepare('PRAGMA foreign_key_check').all().length) throw new Error('SQLite foreign key check failed.');
    const backupDirectory=join(directory,'backups',`postgres-migration-${Date.now()}`);
    mkdirSync(backupDirectory,{recursive:true,mode:0o700});
    await backup(source,join(backupDirectory,'tqa.sqlite'));
    writeFileSync(join(backupDirectory,'secrets.json'),readFileSync(join(directory,'secrets.json')),{mode:0o600});
    source.close();
    source=new DatabaseSync(join(backupDirectory,'tqa.sqlite'),{readOnly:true});
    await client.query(readFileSync(new URL('../postgres/migrations/0001_baseline.sql',import.meta.url),'utf8'));
    if(source.prepare("PRAGMA table_info(push_accounts)").all().some(c=>c.name==='supervisor_summary')) await client.query(readFileSync(new URL('../postgres/migrations/0002_notification_summaries.sql',import.meta.url),'utf8'));
    const report=await importSqlite(source,client);
    await client.query('CREATE TABLE tqa_postgres_migrations(version TEXT PRIMARY KEY, applied_at BIGINT NOT NULL, verification TEXT NOT NULL)');
    await client.query('INSERT INTO tqa_postgres_migrations VALUES($1,$2,$3)',['0001',Date.now(),JSON.stringify(report)]);
    await upgradeNotifications(client);
    await client.query('COMMIT');
    writeFileSync(join(backupDirectory,'verification.json'),JSON.stringify(report,null,2),{mode:0o600});
    console.log('PostgreSQL migration verified (row counts and SHA-256 of every column):',JSON.stringify(Object.fromEntries(Object.entries(report).map(([t,v])=>[t,v.count]))));
    console.log('SQLite backup:',backupDirectory);
  } catch(error) {await client.query('ROLLBACK');throw error;}
  finally {source?.close();client.release();await db.close();}
}
