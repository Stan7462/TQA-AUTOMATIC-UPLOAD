import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {DatabaseSync,backup} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {importSqlite,tables} from './migrate-postgres.mjs';
import {postgresSql} from '../lib/database.mjs';
import {processNotifications} from './push-notifications.mjs';

const schema=readFileSync(new URL('../postgres/migrations/0001_baseline.sql',import.meta.url),'utf8');
function adapter(pg){return {prepare(sql){return {async get(...v){return (await pg.query(postgresSql(sql),v)).rows[0];},async all(...v){return (await pg.query(postgresSql(sql),v)).rows;},async run(...v){const r=await pg.query(postgresSql(sql),v);return {changes:r.affectedRows};}};}};}
test('all SQLite records and binary data preserve exact values in PostgreSQL',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'tqa-pg-test-'));
 const original=new DatabaseSync('.tqa-data/tqa.sqlite',{readOnly:true});
 await backup(original,join(directory,'source.sqlite'));original.close();
 const source=new DatabaseSync(join(directory,'source.sqlite')),pg=new PGlite();
 const account=source.prepare('SELECT tenant_id,tech_id FROM technicians LIMIT 1').get();
 source.prepare('INSERT INTO qc_upload_photos(tenant_id,submission_id,tech_id,slot,image,created_at) VALUES(?,?,?,?,?,?)').run(account.tenant_id,'migration-test-binary',account.tech_id,0,new Uint8Array([0,1,127,128,255]),Date.now());
 try {await pg.exec(schema);await pg.exec('BEGIN');const result=await importSqlite(source,pg);assert.equal(Object.keys(result).length,tables.length);await pg.exec('ROLLBACK');}
 finally{source.close();await pg.close();rmSync(directory,{recursive:true,force:true});}
});
test('PostgreSQL preserves company isolation, login guards, PIN uniqueness and notification logic',async()=>{
 const pg=new PGlite();try{
 await pg.exec(schema);
 await pg.exec("INSERT INTO tenants(id,name,created_at) VALUES('a','A',1),('b','B',1),('c','C',1)");
 const add=(tenant,id,admin,fingerprint)=>pg.query("INSERT INTO technicians(tenant_id,tech_id,pin_salt,pin_hash,is_admin,credential_fingerprint,created_at) VALUES($1,$2,'salt','hash',$3,$4,1)",[tenant,id,admin,fingerprint]);
 await add('a','1111',0,'pin-a');await add('b','1111',0,'pin-b');
 await assert.rejects(add('a','1111',0,'new-pin'),/duplicate key/);
 await assert.rejects(add('c','1111',1,'admin-pin'),/LOGIN_ID_NOT_AVAILABLE/);
 await assert.rejects(add('b','1111',0,'pin-a'),/duplicate key/);
 await add('a','ADMIN',1,'admin-a');
 await assert.rejects(add('b','ADMIN',0,'pin-c'),/LOGIN_ID_NOT_AVAILABLE/);
 await assert.rejects(add('b','OTHER',1,'admin-a'),/duplicate key/);
 await pg.exec("UPDATE technicians SET tech_id='NEWADMIN' WHERE tech_id='ADMIN'; DELETE FROM technicians WHERE tech_id='NEWADMIN'");
 await add('b','NEWADMIN',0,'pin-c');
 const now=Date.parse('2026-10-09T18:00:00Z'),db=adapter(pg);
 await pg.query("INSERT INTO push_accounts(tenant_id,tech_id,external_id,enabled,enabled_at) VALUES('a','1111','a-1111',1,$1)",[now-3600000]);
 await pg.query("INSERT INTO qc_submissions(id,tenant_id,tech_id,screenshot_id,photo_ids,job_number,status,submitted_at,reviewed_at,correction_deadline_at) VALUES('q','a','1111','photo','[]','123456','rejected',$1,$1,$2)",[now,now+72*3600000]);
 const sends=[];await processNotifications(db,{now,config:{sendingEnabled:true,apiKey:'test'},send:async e=>sends.push(e)});await processNotifications(db,{now:now+1000,config:{sendingEnabled:true,apiKey:'test'},send:async e=>sends.push(e)});
 assert.equal(sends.length,1);assert.equal(sends[0].message,'Job 123456 needs fixing. You have 72 hours.');
 const alias=await db.prepare('SELECT COUNT(*) AS qcCount FROM qc_submissions WHERE tenant_id=?').get('b');assert.equal(alias.qcCount,0);
 }finally{await pg.close();}
});

test('all literal API database queries parse against the PostgreSQL schema',async()=>{
 const {default:ts}=await import('typescript');const {readdirSync}=await import('node:fs');
 function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(`${dir}/${e.name}`):/\.ts$/.test(e.name)?[`${dir}/${e.name}`]:[]);}
 const pg=new PGlite();let checked=0;
 try{await pg.exec(schema);for(const file of [...files('app/api'),...files('lib').filter(f=>!f.endsWith('local-env.ts'))]){
 const ast=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
 const queries=[];function visit(n){if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='prepare'&&n.arguments[0]&&(ts.isStringLiteral(n.arguments[0])||ts.isNoSubstitutionTemplateLiteral(n.arguments[0])))queries.push(n.arguments[0].text);ts.forEachChild(n,visit);}visit(ast);
 for(const sql of queries){const text=postgresSql(sql);const parameters=[...text.matchAll(/\$(\d+)/g)].map(m=>Number(m[1]));try{await pg.query(`EXPLAIN ${text}`,Array(Math.max(0,...parameters)).fill(null));checked++;}catch(e){throw new Error(`${file}: ${e.message}\n${text}`);}}
 }assert.ok(checked>80,`Only checked ${checked} statements`);
 }finally{await pg.close();}
});
