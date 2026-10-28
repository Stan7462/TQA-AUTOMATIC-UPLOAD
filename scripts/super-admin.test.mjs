import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {build} from 'esbuild';
import {createDatabase,postgresSql} from '../lib/database.mjs';
import {PGlite} from '@electric-sql/pglite';
const root=resolve(import.meta.dirname,'..'),temp=mkdtempSync(join(tmpdir(),'tqa-super-tests-'));
const previous={login:process.env.SUPER_LOGIN,password:process.env.SUPER_PASSWORD};
process.env.SUPER_LOGIN='owner@example.test';process.env.SUPER_PASSWORD='local-test-password-12345';
async function module(file){const output=join(temp,file.replaceAll('/','-')+'.mjs');await build({entryPoints:[join(root,file)],outfile:output,bundle:true,platform:'node',format:'esm',plugins:[{name:'super-fixture',setup(b){b.onResolve({filter:/^next\/(headers|navigation)$/},args=>({path:args.path,namespace:'next-fixture'}));b.onLoad({filter:/.*/,namespace:'next-fixture'},args=>({contents:args.path==='next/headers'?"export async function cookies(){return {get(name){const value=(globalThis.superFixture.cookie??'').split('; ').find(c=>c.startsWith(name+'='))?.slice(name.length+1);return value?{value}:undefined;}};}":"export function redirect(url){throw Error('redirect: '+url);}"}));b.onResolve({filter:/^@\//},args=>args.path==='@/lib/local-env'?{path:'env',namespace:'test'}:{path:join(root,args.path.slice(2)+(/\.(mjs|json)$/.test(args.path)?'':'.ts'))});b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env=new Proxy({}, {get:(_,key)=>globalThis.superFixture.env[key]});'}));}}]});return import(output);}
const auth=await module('lib/super-auth.ts'),techAuth=await module('lib/tech-auth.ts'),pageAuth=await module('app/chatgpt-auth.ts');
const routes={trustList:await module('app/api/integrations/trust/qcs/route.ts'),trustDetail:await module('app/api/integrations/trust/qcs/[id]/route.ts'),version:await module('app/api/extension/version/route.ts'),extensionDownload:await module('app/api/extension/download/route.ts'),catalystSettings:await module('app/api/catalyst-settings/route.ts'),login:await module('app/api/super-admin/login/route.ts'),logout:await module('app/api/super-admin/logout/route.ts'),companies:await module('app/api/super-admin/companies/route.ts'),update:await module('app/api/super-admin/companies/[id]/route.ts'),context:await module('app/api/super-admin/context/route.ts'),leave:await module('app/api/super-admin/leave/route.ts'),profileLogin:await module('app/api/profile/login/route.ts'),profile:await module('app/api/profile/route.ts'),upload:await module('app/api/qc-upload/route.ts'),trust:await module('lib/trust-api.ts'),legacyCompanies:await module('app/api/companies/route.ts')};
const origin='https://qc.example.test';
function request(body,cookie='',method='POST',path='/test',requestOrigin=origin){return new Request(origin+path,{method,headers:{Origin:requestOrigin,Cookie:cookie,'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body)})});}
async function ok(response){assert(response.ok,`${response.status}: ${await response.clone().text()}`);return response.json();}
async function login(){const response=await routes.login.POST(request({login:process.env.SUPER_LOGIN,password:process.env.SUPER_PASSWORD}));await ok(response);return response.headers.get('set-cookie').split(';')[0];}
function fixture(){const db=new DatabaseSync(':memory:');for(const name of readdirSync('prisma/migrations').sort()){if(!name.startsWith('20'))continue;db.exec(readFileSync(join('prisma/migrations',name,'migration.sql'),'utf8'));}const database=createDatabase({url:null,sqlite:db}),bucket=new Map();const DB={prepare(sql){const statement=database.prepare(sql);return {bind(...values){const bound=statement.bind(...values);return{first:()=>bound.first(),all:async()=>({results:await bound.all()}),run:()=>bound.run(),sql:bound.sql,values:bound.values};},first:()=>statement.first(),all:async()=>({results:await statement.all()}),run:()=>statement.run()};},batch:database.batch};globalThis.superFixture={env:{DB,PIN_ENCRYPTION_KEY:'a'.repeat(64),BUCKET:{put:async(k,v)=>bucket.set(k,v),get:async k=>bucket.has(k)?{body:bucket.get(k)}:null,delete:async keys=>{for(const key of Array.isArray(keys)?keys:[keys])bucket.delete(key);}}}};return{db,bucket};}
async function addTech(db,tenant,id,pin='58326',admin=0){const salt='b'.repeat(32),hash=await techAuth.hashPin(pin,salt);db.prepare('INSERT INTO technicians(tenant_id,tech_id,pin_salt,pin_hash,active,is_admin,created_at) VALUES(?,?,?,?,1,?,?)').run(tenant,id,salt,hash,admin,Date.now());const response=await routes.profileLogin.POST(request({techId:id,pin}));await ok(response);return response.headers.get('set-cookie').split(';')[0];}
test('super credentials are separate; scoped secure sessions expire and rotate with environment credentials',async()=>{
 const {db}=fixture();try{
  const techCookie=await addTech(db,'default','TECH');
  assert.equal((await routes.companies.GET(request(null,techCookie,'GET'))).status,401);
  assert.equal((await routes.legacyCompanies.GET(request(null,techCookie,'GET'))).status,401);
  const supervisorCookie=await addTech(db,'default','SUPERVISOR','password12345',1);
  assert.equal((await routes.companies.GET(request(null,supervisorCookie,'GET'))).status,401);
  assert.equal((await routes.legacyCompanies.GET(request(null,supervisorCookie,'GET'))).status,401);
  assert.equal((await routes.login.POST(request({login:'TECH',password:'58326'}))).status,401);
  const cookie=await login();assert(cookie.startsWith('tqa_super_session='));assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tech_sessions').get().n,2);
  const session=await auth.getSuperSession(request(null,cookie,'GET'));assert(session);assert.equal(session.selectedTenantId,null);
  assert.equal(await techAuth.getTechSessionContext(request(null,cookie,'GET'),globalThis.superFixture.env.DB),null);
  assert.equal((await routes.profile.GET(request(null,cookie,'GET'))).status,401);
  const response=await routes.login.POST(request({login:process.env.SUPER_LOGIN,password:process.env.SUPER_PASSWORD}));assert.match(response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);assert.match(response.headers.get('set-cookie'),/Secure/);
  process.env.SUPER_PASSWORD+='changed';assert.equal(await auth.getSuperSession(request(null,cookie,'GET')),null);process.env.SUPER_PASSWORD='local-test-password-12345';
  db.prepare('UPDATE super_admin_sessions SET expires_at=0').run();assert.equal(await auth.getSuperSession(request(null,cookie,'GET')),null);
 }finally{db.close();}
});
test('super login rejects foreign origins, throttles failed attempts, and fails closed without configured credentials',async()=>{
 const {db}=fixture();try{
  assert.equal((await routes.login.POST(request({login:'x',password:'y'},'', 'POST','/test','https://evil.test'))).status,403);
  assert.equal((await routes.login.POST(request({login:'x',password:'y'},'', 'POST','/test','https://qc.example.test:9999'))).status,403);
  for(let i=0;i<10;i++)assert.equal((await routes.login.POST(request({login:'x',password:'y'}))).status,401);
  assert.equal((await routes.login.POST(request({login:process.env.SUPER_LOGIN,password:process.env.SUPER_PASSWORD}))).status,429);
  db.prepare('UPDATE super_admin_login_limits SET window_start=0').run();await login();
  delete process.env.SUPER_PASSWORD;assert.equal((await routes.login.POST(request({login:'x',password:'y'}))).status,503);process.env.SUPER_PASSWORD='local-test-password-12345';
 }finally{db.close();}
});
test('create and manage companies, isolated sample demos, and auditable company dashboard access',async()=>{
 const {db,bucket}=fixture();try{
  const cookie=await login();
  const created=await ok(await routes.companies.POST(request({name:'Example Customer',kind:'customer',status:'trial',plan:'Team'},cookie)));
  assert.equal(created.setup.pin.length,5);assert.equal(created.demoTechnicians.length,0);
  const demo=await ok(await routes.companies.POST(request({name:'Example Demo',kind:'demo'},cookie)));
  assert.equal(demo.demoTechnicians.length,3);assert.equal(bucket.size,18);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM qc_submissions WHERE tenant_id=?').get(demo.company.id).n,6);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM qc_submissions WHERE tenant_id=?').get(created.company.id).n,0);
  await ok(await routes.context.POST(request({tenantId:demo.company.id},cookie)));
  const session=await techAuth.getTechSessionContext(request(null,cookie,'GET'),globalThis.superFixture.env.DB);assert.equal(session.tenantId,demo.company.id);assert.equal(session.isSuperAdmin,true);
  globalThis.superFixture.cookie=cookie;const pageUser=await pageAuth.requireChatGPTUser('/');assert.equal(pageUser.tenantId,demo.company.id);assert.equal(pageUser.isSuperAdmin,true);
  assert.equal((await routes.profile.GET(request(null,cookie,'GET'))).status,200);
  const totals=await ok(await routes.companies.GET(request(null,cookie,'GET')));assert.equal(totals.companies.length,3);assert(totals.audit.some(item=>item.action==='company.enter'));
  const leave=await routes.leave.POST(request({},cookie));assert.equal(leave.status,303);assert.equal(await techAuth.getTechSessionContext(request(null,cookie,'GET'),globalThis.superFixture.env.DB),null);
  const out=await routes.logout.POST(request({},cookie));assert.equal(out.status,303);assert.equal(await auth.getSuperSession(request(null,cookie,'GET')),null);
 }finally{db.close();}
});
test('suspended companies retain sign-in and reading but new QCs and Catalyst access are blocked, including existing sessions',async()=>{
 const {db}=fixture();try{
  const cookie=await login(),created=await ok(await routes.companies.POST(request({name:'Company Access Test'},cookie))),id=created.company.id;
  const techCookie=await addTech(db,id,'WORKER');const adminCookie=await addTech(db,id,'ADMINTEST','password12345',1);
  const context={params:Promise.resolve({id})};
  await ok(await routes.update.PATCH(request({status:'suspended'},cookie,'PATCH'),context));
  await ok(await routes.profileLogin.POST(request({techId:'WORKER',pin:'58326'})));
  assert.equal((await routes.profile.GET(request(null,techCookie,'GET'))).status,200);
  const upload=await routes.upload.POST(request({action:'photo',techId:'WORKER',jobNumber:'123456',submissionId:crypto.randomUUID()},techCookie));assert.equal(upload.status,403);assert.match((await upload.json()).error,/paused/);
  const adminToken=adminCookie.split('=')[1];const denied=await routes.trust.requireTrustKey(new Request(origin+'/trust',{headers:{Authorization:`Session ${adminToken}`}}));assert(denied instanceof Response);assert.equal(denied.status,403);
  await ok(await routes.update.PATCH(request({status:'active'},cookie,'PATCH'),context));
  const allowed=await routes.trust.requireTrustKey(new Request(origin+'/trust',{headers:{Authorization:`Session ${adminToken}`}}));assert.equal(allowed.tenantId,id);
  await ok(await routes.update.PATCH(request({status:'cancelled'},cookie,'PATCH'),context));assert.equal((await routes.profile.GET(request(null,techCookie,'GET'))).status,200);
 }finally{db.close();}
});
test('demo companies cannot use Catalyst even with valid supervisor credentials, and context expires without touching normal sessions',async()=>{
 const {db}=fixture();try{
  const cookie=await login(),demo=await ok(await routes.companies.POST(request({name:'Safe Demo',kind:'demo'},cookie)));
  const techCookie=await addTech(db,'default','LOCALTECH');const adminCookie=await addTech(db,demo.company.id,'DEMOADMIN','password12345',1);
  const denied=await routes.trust.requireTrustKey(new Request(origin+'/trust',{headers:{Authorization:`Session ${adminCookie.split('=')[1]}`}}));assert.equal(denied.status,403);assert.equal((await denied.json()).error.code,'DEMO_COMPANY');
  await ok(await routes.context.POST(request({tenantId:demo.company.id},cookie)));
  const both=cookie+'; '+techCookie;assert.equal((await techAuth.getTechSessionContext(request(null,both,'GET'),globalThis.superFixture.env.DB)).tenantId,demo.company.id);
  db.prepare('UPDATE super_admin_sessions SET context_expires_at=0').run();assert.equal((await techAuth.getTechSessionContext(request(null,both,'GET'),globalThis.superFixture.env.DB)).tenantId,'default');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tech_sessions').get().n,2);
 }finally{db.close();}
});
test('new QCs require the deployed extension version, including older clients without a version header',async()=>{
 const {db}=fixture();try{
  const admin=await addTech(db,'default','ADMINTEST','password12345',1),authorization=`Session ${admin.split('=')[1]}`;
  const info=await ok(await routes.version.GET());assert.equal(info.version,JSON.parse(readFileSync('chrome-extension/manifest.json','utf8')).version);
  for(const version of [null,'0.7.19','999.0.0']){
   const headers={authorization,...(version?{'X-TQA-Extension-Version':version}:{})};
   const blocked=await routes.trustList.GET(new Request(origin+'/qcs',{headers}));assert.equal(blocked.status,426);assert.equal((await blocked.json()).error.code,'EXTENSION_UPDATE_REQUIRED');
   const detail=await routes.trustDetail.GET(new Request(origin+'/qcs/test',{headers}),{params:Promise.resolve({id:crypto.randomUUID()})});assert.equal(detail.status,426);
  }
  const current=await routes.trustList.GET(new Request(origin+'/qcs',{headers:{authorization,'X-TQA-Extension-Version':info.version}}));assert.equal(current.status,200);
 }finally{db.close();}
});
test('extension ZIP download requires supervisor access and returns a versioned installable package',async()=>{
 const {db}=fixture();try{
  assert.equal((await routes.extensionDownload.GET()).status,403);
  globalThis.superFixture.cookie=await addTech(db,'default','WORKER');assert.equal((await routes.extensionDownload.GET()).status,403);
  globalThis.superFixture.cookie=await addTech(db,'default','ADMINTEST','password12345',1);
  const response=await routes.extensionDownload.GET();assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/zip');
  const manifest=JSON.parse(readFileSync('chrome-extension/manifest.json','utf8'));assert.equal(response.headers.get('content-disposition'),`attachment; filename="tqa-catalyst-uploader-${manifest.version}.zip"`);
  const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.readUInt32LE(0),0x04034b50);assert.equal(Number(response.headers.get('content-length')),bytes.length);assert.match(response.headers.get('cache-control'),/no-store/);
 }finally{db.close();}
});
test('only supervisors can change their own company screenshot upload setting',async()=>{
 const {db}=fixture();try{
  assert.equal((await routes.catalystSettings.GET()).status,403);
  const worker=await addTech(db,'default','WORKER');globalThis.superFixture.cookie=worker;
  assert.equal((await routes.catalystSettings.PUT(request({includeScreenshot:false},worker,'PUT'))).status,403);
  const admin=await addTech(db,'default','ADMINTEST','password12345',1);globalThis.superFixture.cookie=admin;
  assert.equal((await ok(await routes.catalystSettings.GET())).includeScreenshot,true);
  assert.equal((await routes.catalystSettings.PUT(request({includeScreenshot:'false'},admin,'PUT'))).status,400);
  assert.equal((await routes.catalystSettings.PUT(request({includeScreenshot:false},admin,'PUT','/test','https://evil.test'))).status,403);
  const superCookie=await login(),other=await ok(await routes.companies.POST(request({name:'Other Company'},superCookie)));
  await ok(await routes.catalystSettings.PUT(request({includeScreenshot:false},admin,'PUT')));
  assert.equal((await ok(await routes.catalystSettings.GET())).includeScreenshot,false);
  assert.equal(db.prepare('SELECT catalyst_include_screenshot AS n FROM tenants WHERE id=?').get(other.company.id).n,1);
  await ok(await routes.catalystSettings.PUT(request({includeScreenshot:true},admin,'PUT')));
  assert.equal((await ok(await routes.catalystSettings.GET())).includeScreenshot,true);
 }finally{db.close();}
});
test('PostgreSQL supports separate auth, company creation, subscription changes and scoped demos',async()=>{
 const pg=new PGlite();try{
  for(const name of readdirSync('postgres/migrations').filter(n=>n.endsWith('.sql')).sort())await pg.exec(readFileSync(join('postgres/migrations',name),'utf8'));
  const DB={prepare(sql){return {sql,values:[],bind(...values){return {...this,values};},async first(){return (await pg.query(postgresSql(this.sql),this.values)).rows[0]??null;},async all(){return {results:(await pg.query(postgresSql(this.sql),this.values)).rows};},async run(){return {meta:{changes:(await pg.query(postgresSql(this.sql),this.values)).affectedRows}};}};},async batch(statements){await pg.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());await pg.exec('COMMIT');return result;}catch(error){await pg.exec('ROLLBACK');throw error;}}};
  const bucket=new Map();globalThis.superFixture={env:{DB,PIN_ENCRYPTION_KEY:'a'.repeat(64),BUCKET:{put:async(k,v)=>bucket.set(k,v),delete:async keys=>{for(const key of keys)bucket.delete(key);}}}};
  const cookie=await login();
  const demo=await ok(await routes.companies.POST(request({name:'Postgres Demo',kind:'demo'},cookie)));
  assert.equal(bucket.size,18);
  await ok(await routes.context.POST(request({tenantId:demo.company.id},cookie)));
  const session=await techAuth.getTechSessionContext(request(null,cookie,'GET'),DB);assert.equal(session.tenantId,demo.company.id);assert.equal(session.isSuperAdmin,true);
  await ok(await routes.update.PATCH(request({status:'suspended',renewalAt:'2026-12-01',plan:'Team'},cookie,'PATCH'),{params:Promise.resolve({id:demo.company.id})}));
  const list=await ok(await routes.companies.GET(request(null,cookie,'GET'))),company=list.companies.find(c=>c.id===demo.company.id);
  assert.equal(await routes.trust.catalystIncludesScreenshot(demo.company.id),true);
  await pg.query('UPDATE tenants SET catalyst_include_screenshot=0 WHERE id=$1',[demo.company.id]);assert.equal(await routes.trust.catalystIncludesScreenshot(demo.company.id),false);
  assert.equal(company.status,'suspended');assert.equal(company.totalQcs,6);assert.equal(company.technicians,3);assert.equal(company.plan,'Team');assert(list.audit.some(a=>a.action==='company.update'));
 }finally{await pg.close();}
});
test.after(()=>{rmSync(temp,{recursive:true,force:true});delete globalThis.superFixture;if(previous.login===undefined)delete process.env.SUPER_LOGIN;else process.env.SUPER_LOGIN=previous.login;if(previous.password===undefined)delete process.env.SUPER_PASSWORD;else process.env.SUPER_PASSWORD=previous.password;});
