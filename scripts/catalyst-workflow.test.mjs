import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { observationTypeAssignments } from '../chrome-extension/core.js';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { createDatabase } from '../lib/database.mjs';

const root=resolve(import.meta.dirname,'..');
const temp=mkdtempSync(join(tmpdir(),'tqa-workflow-tests-'));
const mocks={
 '@/lib/local-env':'export const env=new Proxy({}, {get:(_,key)=>globalThis.workflowTest.env[key]});',
 '@/lib/tech-auth':`export const sameOrigin=()=>true; export const normalizeTechId=x=>x; export const getTechSessionContext=async()=>({tenantId:globalThis.workflowTest.tenant,techId:'TECH',expiresAt:Date.now()+1e12}); export const getCookie=()=> 'a'.repeat(64); export const hashToken=async()=> 'test'; export const TECH_COOKIE='test'; export const TECH_SESSION_LIFETIME_SECONDS=1; export const techCookie=()=>'';`,
 '@/app/chatgpt-auth':'export const getChatGPTUser=async()=>({tenantId:globalThis.workflowTest.tenant});',
 '@/app/access':'export const isOwner=()=>true;',
 '@/lib/fiscal-month':'export const fiscalMonthKey=()=>"2026-10"; export const fiscalMonthBounds=()=>({start:Date.now()-86400000,end:Date.now()+20*86400000});',
};
// Test production handlers with isolated database, storage, and authentication adapters.
async function handler(file,name){
 const output=join(temp,`${name}.mjs`);
 await build({entryPoints:[join(root,file)],outfile:output,bundle:true,platform:'node',format:'esm',plugins:[{name:'workflow-fixtures',setup(b){
  b.onResolve({filter:/^@\//},args=>args.path in mocks||args.path==='@/lib/trust-api'?{path:args.path,namespace:'fixture'}:{path:join(root,args.path.slice(2)+(args.path.endsWith('.json')?'':'.ts'))});
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>{
   if(args.path in mocks)return{contents:mocks[args.path],loader:'ts'};
   let source=readFileSync(join(root,'lib/trust-api.ts'),'utf8').replace(/^import .*;\n/gm,'');
   const start=source.indexOf('export async function requireTrustKey'); const end=source.indexOf('export async function catalystIncludesScreenshot',start);
   source=source.slice(0,start)+'export async function requireTrustKey(){return {id:null,label:"test",tenantId:globalThis.workflowTest.tenant};}\n'+source.slice(end);
   return{contents:'import {env} from "@/lib/local-env";\n'+source,loader:'ts'};
  });
 }}]});
 return import(output);
}
const observationTypes=await handler('lib/qc-observation-type.ts','observation-types');
const routes={
 dashboard:await handler('app/api/qc-submissions/route.ts','dashboard'),
 activity:await handler('app/api/catalyst-activity/route.ts','activity'),
 stats:await handler('app/api/qc-stats/route.ts','stats'),
 redo:await handler('app/api/qc-upload/route.ts','redo'),
 review:await handler('app/api/qc-submissions/[id]/route.ts','review'),
 totals:await handler('app/api/integrations/trust/observation-totals/route.ts','totals'),
 list:await handler('app/api/integrations/trust/qcs/route.ts','list'),
 detail:await handler('app/api/integrations/trust/qcs/[id]/route.ts','detail'),
 upload:await handler('app/api/integrations/trust/qcs/[id]/upload/route.ts','upload'),
 photo:await handler('app/api/integrations/trust/photos/[id]/route.ts','photo'),
 profile:await handler('app/api/profile/route.ts','profile'),
};
const first='00000000-0000-4000-8000-000000000001';
const second='00000000-0000-4000-8000-000000000002';
const third='00000000-0000-4000-8000-000000000003';
const failure={code:'TQA4',reason:'Unused ports terminated / NAP ports closed'};
const picture='8000000000000-00000000-0000-4000-8000-000000000001.jpg';
function fixture(){
 const db=new DatabaseSync(':memory:');
 const columns=`tenant_id TEXT NOT NULL,root_submission_id TEXT,attempt_number INTEGER DEFAULT 1,tech_id TEXT,job_number TEXT,address TEXT,screenshot_id TEXT,photo_ids TEXT,status TEXT,submitted_at INTEGER,reviewed_at INTEGER,review_note TEXT,trust_upload_status TEXT DEFAULT 'ready',trust_uploaded_at INTEGER,trust_external_reference TEXT,trust_upload_error TEXT,trust_upload_attempts INTEGER DEFAULT 0,trust_last_attempt_at INTEGER,trust_uploaded_by_key_id TEXT,location_status TEXT,location_latitude REAL,location_longitude REAL,location_accuracy REAL,location_captured_at INTEGER,catalyst_failures TEXT,trust_upload_kind TEXT DEFAULT 'observation',catalyst_observation_id TEXT,catalyst_observation_type TEXT,rejection_upload_mode TEXT NOT NULL DEFAULT 'catalyst'`;
 db.exec(`CREATE TABLE qc_submissions(id TEXT PRIMARY KEY,${columns},correction_pending INTEGER DEFAULT 0,correction_deadline_at INTEGER);
 CREATE TABLE qc_submission_attempts(submission_id TEXT UNIQUE,${columns},UNIQUE(tenant_id,root_submission_id,attempt_number));
 CREATE TABLE tenants(id TEXT PRIMARY KEY,name TEXT,active INTEGER,company_kind TEXT,subscription_status TEXT,catalyst_include_screenshot INTEGER DEFAULT 1);
 INSERT INTO tenants VALUES('a','Demo',1,'customer','active',1),('b','Other',1,'customer','active',1);
 CREATE TABLE technician_removals(tenant_id TEXT,tech_id TEXT,state TEXT);
 CREATE TABLE push_accounts(tenant_id TEXT,tech_id TEXT,enabled INTEGER);
 CREATE TABLE qc_upload_photos(tenant_id TEXT,submission_id TEXT,tech_id TEXT,slot INTEGER,image BLOB,created_at INTEGER,PRIMARY KEY(tenant_id,submission_id,tech_id,slot));
 INSERT INTO push_accounts VALUES('a','TECH',1);`);
 db.prepare(`INSERT INTO qc_submissions(id,tenant_id,root_submission_id,tech_id,job_number,screenshot_id,photo_ids,status,submitted_at) VALUES(?,'a',?,'TECH','776499',?,?,'pending',?)`).run(first,first,picture,JSON.stringify([picture,picture]),Date.now());
 db.exec("ALTER TABLE tenants ADD COLUMN monthly_qc_goal INTEGER DEFAULT 5; CREATE TABLE technicians(tenant_id TEXT,tech_id TEXT,active INTEGER,is_admin INTEGER,monthly_qc_goal INTEGER); INSERT INTO technicians VALUES('a','TECH',1,0,NULL);");
 const database=createDatabase({url:null,sqlite:db});
 const bucket=new Map([[`captures/${picture}`,Buffer.from('original-photo')]]);
 globalThis.workflowTest={tenant:'a',env:{DB:{prepare(sql){const statement=database.prepare(sql);return {bind(...args){const bound=statement.bind(...args);return{first:()=>bound.first(),run:()=>bound.run(),all:async()=>({results:await bound.all()}),sql:bound.sql,values:bound.values};}};},batch:database.batch},BUCKET:{put:async(k,v)=>bucket.set(k,v),delete:async k=>bucket.delete(k),get:async k=>bucket.has(k)?{body:bucket.get(k)}:null}}};
 return db;
}
const extensionVersion=JSON.parse(readFileSync(join(root,'chrome-extension/manifest.json'),'utf8')).version;
function versionedRequest(url,options={}){const headers=new Headers(options.headers);headers.set('X-TQA-Extension-Version',extensionVersion);return new Request(url,{...options,headers});}
function request(body,method='POST'){return versionedRequest('http://localhost/test',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
const context=id=>({params:Promise.resolve({id})});
async function ok(response){assert(response.ok,`${response.status}: ${await response.clone().text()}`);return response.json();}
async function reject(id){return ok(await routes.review.POST(request({status:'rejected',reviewNote:'Missing terminators',failureReasons:[failure]}),context(id)));}
async function approve(id){return ok(await routes.review.POST(request({status:'approved'}),context(id)));}
async function redo(from,to){
 const bytes=Buffer.alloc(500);bytes[0]=255;bytes[1]=216;bytes[498]=255;bytes[499]=217;
 const details={techId:'TECH',jobNumber:'776499',submissionId:to,redoSourceId:from,redoChanged:true};
 for(let slot=0;slot<3;slot++)await ok(await routes.redo.POST(request({...details,action:'photo',slot,image:bytes.toString('base64')})));
 await ok(await routes.redo.POST(request({...details,action:'finalize',photoCount:2})));
}
async function queue(){return (await ok(await routes.list.GET(versionedRequest('http://localhost/qcs')))).qcs;}
async function uploaded(id,reference='12345'){return ok(await routes.upload.PATCH(request({status:'uploaded',externalReference:reference},'PATCH'),context(id)));}
async function uploadedFromToast(id){return ok(await routes.upload.PATCH(request({status:'uploaded'},'PATCH'),context(id)));}
async function rejectedFolder(){return (await ok(await routes.profile.GET(versionedRequest('http://localhost/profile?view=rejected')))).submissions;}

test('a started QC can finish reading photos and report success on the older version',async()=>{
 const db=fixture();try{
  await approve(first);
  const photo=await routes.photo.GET(new Request('http://localhost/photo',{headers:{'X-TQA-Extension-Version':'0.7.19'}}),context(picture));assert.equal(photo.status,200);
  const result=await routes.upload.PATCH(new Request('http://localhost/upload',{method:'PATCH',headers:{'Content-Type':'application/json','X-TQA-Extension-Version':'0.7.19'},body:JSON.stringify({status:'uploaded',externalReference:'12345'})}),context(first));
  assert.equal(result.status,200);assert.equal((await result.json()).qc.uploadStatus,'uploaded');
 }finally{db.close();}
});
test('Catalyst screenshot toggle filters passing queue and detail without changing stored review pictures',async()=>{
 const db=fixture();try{
  await approve(first);
  assert.equal((await queue())[0].photos.length,3);
  assert.equal((await queue())[0].photos[0].kind,'account_screenshot');
  db.prepare('UPDATE tenants SET catalyst_include_screenshot=0').run();
  const qc=(await queue())[0],detail=(await ok(await routes.detail.GET(versionedRequest('http://localhost/qcs/'+first),context(first)))).qc;
  assert.equal(qc.photos.length,2);assert(qc.photos.every(p=>p.kind==='live_photo'));assert.deepEqual(qc.photos.map(p=>p.order),[0,1]);assert.deepEqual(qc.photos,detail.photos);
  const stored=db.prepare('SELECT screenshot_id,photo_ids FROM qc_submissions WHERE id=?').get(first);assert.equal(stored.screenshot_id,picture);assert.equal(JSON.parse(stored.photo_ids).length,2);
  db.prepare('UPDATE tenants SET catalyst_include_screenshot=1').run();assert.equal((await queue())[0].photos.length,3);
 }finally{db.close();}
});
test('screenshot exclusion also applies to archived first failures and approved correction follow-ups',async()=>{
 const db=fixture();try{
  await reject(first);await redo(first,second);await approve(second);
  db.prepare('UPDATE tenants SET catalyst_include_screenshot=0').run();
  const fail=(await queue())[0];assert.equal(fail.outcome,'fail');assert.equal(fail.photos.length,2);assert(fail.photos.every(p=>p.kind==='live_photo'));
  await uploaded(first,'12345');
  const fix=(await queue())[0];assert.equal(fix.workflow,'follow_up');assert.equal(fix.photos.length,2);assert(fix.photos.every(p=>p.kind==='live_photo'));
 }finally{db.close();}
});
test('approval feedback reaches the technician and remains a normal passing QC after upload',async()=>{
 const db=fixture();try{
  const feedback='Secure the cable more neatly next time.';
  await ok(await routes.review.POST(request({status:'approved',reviewNote:`  ${feedback}  `,failureReasons:[failure]}),context(first)));
  const row=db.prepare('SELECT status,review_note,catalyst_failures,correction_deadline_at FROM qc_submissions WHERE id=?').get(first);
  assert.equal(row.status,'approved');assert.equal(row.review_note,feedback);
  assert.equal(row.catalyst_failures,null);assert.equal(row.correction_deadline_at,null);
  const tech=await ok(await routes.profile.GET(versionedRequest('http://localhost/profile?view=captured')));
  assert.equal(tech.submissions.find(q=>q.id===first).reviewNote,feedback);
  assert.equal((await rejectedFolder()).length,0);
  const queued=(await queue())[0];assert.equal(queued.outcome,'pass');assert.deepEqual(queued.failureReasons,[]);
  await uploaded(first);
  const after=await ok(await routes.profile.GET(versionedRequest('http://localhost/profile?view=uploaded')));
  assert.equal(after.submissions.find(q=>q.id===first).reviewNote,feedback);
 }finally{db.close();}
});

test('feedback validation preserves pending QCs and comment-only rejection still requires a Catalyst reason',async()=>{
 const db=fixture();try{
  for(const reviewNote of [42,'x'.repeat(1001)]){
   assert.equal((await routes.review.POST(request({status:'approved',reviewNote}),context(first))).status,400);
  }
  assert.equal((await routes.review.POST(request({status:'rejected',reviewNote:'Needs attention'}),context(first))).status,400);
  assert.equal(db.prepare('SELECT status FROM qc_submissions WHERE id=?').get(first).status,'pending');
  await ok(await routes.review.POST(request({status:'approved',reviewNote:'  '}),context(first)));
  assert.equal(db.prepare('SELECT review_note FROM qc_submissions WHERE id=?').get(first).review_note,null);
 }finally{db.close();}
});

test('redo and approve before upload: original Fail first, final Fix second, intermediate retries never queued',async()=>{
 const db=fixture();try{
  await reject(first);const deadline=db.prepare('SELECT correction_deadline_at AS value FROM qc_submissions').get().value;
  await redo(first,second);await reject(second);
  assert.deepEqual((await queue()).map(q=>q.id),[first]);
  await redo(second,third);await approve(third);
  assert.deepEqual((await rejectedFolder()).map(q=>q.id),[third]);
  assert.deepEqual((await queue()).map(q=>[q.id,q.outcome,q.workflow]),[[first,'fail','observation']]);
  const original=await ok(await routes.detail.GET(versionedRequest('http://localhost/qc'),context(first)));
  assert.equal(original.qc.photos[0].id,picture);assert.deepEqual(original.qc.failureReasons,[failure]);
  const photo=await routes.photo.GET(versionedRequest('http://localhost/photo'),context(picture));assert.equal(photo.status,200);
  const result=await uploaded(first);assert.equal(result.qc.catalystObservationId,'12345');
  assert(deadline>0);
  assert.deepEqual((await queue()).map(q=>[q.id,q.outcome,q.workflow,q.catalystObservationId]),[[third,'pass','follow_up','12345']]);
  assert.equal((await uploaded(first)).alreadyUploaded,true);
  await uploaded(third);assert.equal((await queue()).length,0);assert.equal((await rejectedFolder()).length,0);
  const all=await ok(await routes.list.GET(versionedRequest('http://localhost/qcs?uploadStatus=uploaded')));
  assert.deepEqual(all.qcs.map(q=>q.id),[first,third]);
  globalThis.workflowTest.tenant='b';assert.equal((await queue()).length,0);assert.equal((await routes.detail.GET(versionedRequest('http://localhost/qc'),context(first))).status,404);
 }finally{db.close();}
});
test('first Fail uploads before redo; deadline is not restarted; failed corrections remain redoable',async()=>{
 const db=fixture();try{
  await reject(first);const deadline=db.prepare('SELECT correction_deadline_at AS value FROM qc_submissions').get().value;
  await uploaded(first);assert.equal(db.prepare('SELECT correction_deadline_at AS value FROM qc_submissions').get().value,deadline);
  assert.equal((await rejectedFolder()).length,1);
  await redo(first,second);await reject(second);assert.equal((await queue()).length,0);
  await redo(second,third);await approve(third);assert.equal((await queue())[0].id,third);
  await uploaded(third);assert.equal((await rejectedFolder()).length,0);
 }finally{db.close();}
});
test('Observation Saved can confirm a first Fail before its optional Catalyst observation ID is known',async()=>{
 const db=fixture();try{
  await reject(first);
  const result=await uploadedFromToast(first);
  assert.equal(result.qc.uploadStatus,'uploaded');
  assert.equal(result.qc.catalystObservationId,null);
  assert.equal((await queue()).length,0);
  const linked=await uploaded(first,'98765');
  assert.equal(linked.alreadyUploaded,true);
  assert.equal(linked.qc.catalystObservationId,'98765');
 }finally{db.close();}
});
test('a QC approved without rejection uploads only once',async()=>{
 const db=fixture();try{await approve(first);assert.equal((await queue())[0].outcome,'pass');await uploaded(first);assert.equal((await queue()).length,0);assert.equal((await uploaded(first)).alreadyUploaded,true);}finally{db.close();}
});
test('extension uploads Fail then newly unlocked approved Fix in the same run',async()=>{
 const db=fixture();try{
  await reject(first);await redo(first,second);await approve(second);
  const processed=[];let run={};
  const background=readFileSync(join(root,'chrome-extension/background.js'),'utf8');
  const source=background.slice(background.indexOf('async function runQueue('),background.indexOf('chrome.runtime.onMessage.addListener'));
  await runInNewContext(source+';runQueue()',{
   assertCurrentVersion:async()=>{},loadQueue:queue,rideAlongPercentage:async()=>50,observationTypeAssignments,
   setRun:async patch=>{run={...run,...patch};},stored:async()=>({run}),
   chrome:{tabs:{create:async()=>({id:1})}},JOBS_URL:'https://example.test',
   processOne:async qc=>{processed.push(qc.id);await uploaded(qc.id);return{status:'uploaded',jobNumber:qc.jobNumber};},
   stopRequested:false,activeRun:null,MAX_QC_ATTEMPTS:3,waitBeforeNextQc:async()=>{},safeError:String,
  });
  assert.deepEqual(processed,[first,second]);assert.equal(run.status,'done');assert.equal(run.total,2);
  assert.equal(run.index,2);assert.equal(run.jobNumber,null);assert.equal(run.photoIndex,0);assert.equal(run.photoTotal,0);
  assert.equal((await queue()).length,0);
 }finally{db.close();}
});
test.after(()=>{rmSync(temp,{recursive:true,force:true});delete globalThis.workflowTest;});


test('activity drill-down finds an earlier submission uploaded today, including older fiscal submissions', async()=>{
 const db=fixture();
 const now=Date.now();
 const old=now-45*86400000;
 db.prepare("UPDATE qc_submissions SET submitted_at=?, trust_upload_status='uploaded',trust_uploaded_at=?,status='approved' WHERE id=?").run(old,now,first);
 const chart=await (await routes.activity.GET()).json();
 assert.equal(chart.uploads.length,1);
 const url=`http://localhost/api/qc-submissions?status=all&start=${chart.start}&end=${chart.end}`;
 const submitted=await (await routes.dashboard.GET(versionedRequest(url))).json();
 assert.equal(submitted.submissions.length,0);
 const uploaded=await (await routes.dashboard.GET(versionedRequest(url+'&dateBasis=uploaded'))).json();
 assert.equal(uploaded.submissions.length,1);
 assert.equal(uploaded.submissions[0].id,chart.uploads[0].id);
 assert.equal(uploaded.submissions[0].trustUploadedAt,now);
 // Another company and an unuploaded QC must not appear in the selected chart's records.
 db.prepare("INSERT INTO qc_submissions(id,tenant_id,tech_id,job_number,photo_ids,status,submitted_at,trust_upload_status,trust_uploaded_at) VALUES(?,'other','TECH','123','[]','approved',?,'uploaded',?)").run(second,now,now);
 db.prepare("INSERT INTO qc_submissions(id,tenant_id,tech_id,job_number,photo_ids,status,submitted_at,trust_upload_status) VALUES(?,'a','TECH','124','[]','approved',?,'ready')").run(third,now);
 const filtered=await (await routes.dashboard.GET(versionedRequest(url+'&dateBasis=uploaded'))).json();
 assert.deepEqual(filtered.submissions.map(q=>q.id),[first]);
 db.close();
});


test('review saves and queues multiple exact reasons from the same TQA category',async()=>{
 const db=fixture();
 try {
  const reasons=[{code:'TQA6',reason:'Approved Connector Properly Installed'},{code:'TQA6',reason:'Enclosure installed as required, located properly and clearances maintained'}];
  const response=await routes.review.POST(request({status:'rejected',reviewNote:'No house box and unsuitable fittings',failureReasons:reasons}),{params:Promise.resolve({id:first})});
  assert.equal(response.status,200);
  assert.deepEqual(JSON.parse(db.prepare('SELECT catalyst_failures FROM qc_submissions WHERE id=?').get(first).catalyst_failures),reasons);
  const detail=await (await routes.detail.GET(versionedRequest('http://localhost/test'),{params:Promise.resolve({id:first})})).json();
  assert.deepEqual(detail.qc.failureReasons,reasons);
 }finally{db.close();}
});

async function monthlyTotals(){return (await ok(await routes.totals.GET(versionedRequest('http://localhost/totals')))).technicians;}
test('monthly upload history records confirmed types once, isolates companies, and reports unknown older types',async()=>{
 const db=fixture();try{
  await approve(first);
  await ok(await routes.upload.PATCH(request({status:'uploaded',observationType:'Ride Along'},'PATCH'),context(first)));
  await ok(await routes.upload.PATCH(request({status:'uploaded',observationType:'Ride Along'},'PATCH'),context(first)));
  assert.deepEqual(await monthlyTotals(),[{techId:'TECH',rideAlong:1,afterTheFact:0,unknown:0}]);
  assert.equal((await routes.upload.PATCH(request({status:'uploaded',observationType:'After the Fact'},'PATCH'),context(first))).status,409);
  db.prepare("UPDATE qc_submissions SET catalyst_observation_type=NULL WHERE id=?").run(first);
  assert.equal((await monthlyTotals())[0].unknown,1);
  globalThis.workflowTest.tenant='other';assert.deepEqual(await monthlyTotals(),[]);
  globalThis.workflowTest.tenant='a';
  db.prepare('UPDATE qc_submissions SET trust_uploaded_at=? WHERE id=?').run(Date.now()-40*86400000,first);
  assert.deepEqual(await monthlyTotals(),[]);
 }finally{db.close();}
});
test('original failed observation counts as After the Fact after redo; fixed follow-up does not count twice',async()=>{
 const db=fixture();try{
  await reject(first);
  assert.equal((await routes.upload.PATCH(request({status:'uploaded',observationType:'Ride Along'},'PATCH'),context(first))).status,400);
  await uploaded(first);
  await redo(first,second);await approve(second);await uploaded(second);
  assert.deepEqual(await monthlyTotals(),[{techId:'TECH',rideAlong:0,afterTheFact:1,unknown:0}]);
  assert.equal(db.prepare('SELECT catalyst_observation_type FROM qc_submission_attempts WHERE submission_id=?').get(first).catalyst_observation_type,'After the Fact');
  assert.equal(db.prepare('SELECT catalyst_observation_type FROM qc_submissions WHERE id=?').get(second).catalyst_observation_type,null);
  const details=await ok(await routes.dashboard.GET(versionedRequest(`http://localhost/api/qc-submissions?status=all&qc=${second}`)));
  assert.equal(details.submissions[0].catalystObservationType,'After the Fact');
  assert.equal(details.submissions[0].previousAttempts[0].catalystObservationType,'After the Fact');
  // Do not infer an upload type when a historical failed upload has no record.
  db.prepare('UPDATE qc_submission_attempts SET catalyst_observation_type=NULL WHERE submission_id=?').run(first);
  const older=await ok(await routes.dashboard.GET(versionedRequest(`http://localhost/api/qc-submissions?status=all&qc=${second}`)));
  assert.equal(older.submissions[0].catalystObservationType,null);
  assert.equal(observationTypes.uploadedQcType(older.submissions[0]),'not_recorded');
  db.prepare("UPDATE qc_submission_attempts SET tenant_id='b',catalyst_observation_type='Ride Along' WHERE submission_id=?").run(first);
  const isolated=await ok(await routes.dashboard.GET(versionedRequest(`http://localhost/api/qc-submissions?status=all&qc=${second}`)));
  assert.equal(isolated.submissions[0].catalystObservationType,null);
  assert.equal(isolated.submissions[0].previousAttempts.length,0);
 }finally{db.close();}
});

test('PostgreSQL migrations and monthly counters handle confirmed uploads without double counting',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');
 const {postgresSql}=await import('../lib/database.mjs');
 const pg=new PGlite();
 try{
  for(const name of ['0001_baseline','0002_notification_summaries','0003_single_push_phone','0004_qc_address','0005_catalyst_failure_workflow','0006_catalyst_observation_type','0007_super_admin','0008_catalyst_screenshot','0009_local_rejection'])await pg.exec(readFileSync(join(root,`postgres/migrations/${name}.sql`),'utf8'));
  const db={prepare(sql){return{bind(...values){return{first:async()=> (await pg.query(postgresSql(sql),values)).rows[0],all:async()=>({results:(await pg.query(postgresSql(sql),values)).rows}),run:async()=>({meta:{changes:(await pg.query(postgresSql(sql),values)).affectedRows}}),sql,values};}};},async batch(statements){await pg.exec('BEGIN');try{const r=[];for(const statement of statements)r.push(await statement.run());await pg.exec('COMMIT');return r;}catch(e){await pg.exec('ROLLBACK');throw e;}}};
  globalThis.workflowTest={tenant:'a',env:{DB:db}};
  await pg.query("INSERT INTO tenants(id,name,created_at) VALUES('a','Demo',1)");
  await pg.query("INSERT INTO qc_submissions(id,tenant_id,root_submission_id,tech_id,job_number,screenshot_id,photo_ids,status,submitted_at) VALUES($1,'a',$1,'TECH','776499',$2,$3,'approved',$4)",[first,picture,JSON.stringify([picture]),Date.now()]);
  for(let i=0;i<2;i++)await ok(await routes.upload.PATCH(request({status:'uploaded',observationType:'Ride Along'},'PATCH'),context(first)));
  const totals=await monthlyTotals();assert.equal(totals.length,1);assert.equal(Number(totals[0].rideAlong),1);assert.equal(Number(totals[0].afterTheFact),0);
  let dashboard=await ok(await routes.dashboard.GET(versionedRequest('http://localhost/api/qc-submissions?status=all')));
  assert.equal(dashboard.submissions[0].catalystObservationType,'Ride Along');
  // A completed follow-up inherits its original observation type in PostgreSQL too.
  await pg.query("UPDATE qc_submissions SET trust_upload_kind='follow_up',root_submission_id=$1,catalyst_observation_type=NULL WHERE id=$2",[second,first]);
  await pg.query("INSERT INTO qc_submission_attempts(submission_id,tenant_id,root_submission_id,attempt_number,tech_id,job_number,screenshot_id,photo_ids,status,submitted_at,catalyst_observation_type,trust_upload_status) VALUES($1,'a',$1,1,'TECH','776499',$2,'[]','rejected',$3,'After the Fact','uploaded')",[second,picture,Date.now()]);
  dashboard=await ok(await routes.dashboard.GET(versionedRequest(`http://localhost/api/qc-submissions?status=all&qc=${first}`)));
  assert.equal(dashboard.submissions[0].catalystObservationType,'After the Fact');
  assert.equal(dashboard.submissions[0].previousAttempts[0].catalystObservationType,'After the Fact');
  await pg.query("INSERT INTO qc_submissions(id,tenant_id,root_submission_id,tech_id,job_number,screenshot_id,photo_ids,status,submitted_at) VALUES($1,'a',$1,'TECH','776499',$2,'[]','pending',$3)",[third,picture,Date.now()]);
  await rejectLocally(third);
  const local=await pg.query('SELECT rejection_upload_mode,review_note,catalyst_failures FROM qc_submissions WHERE id=$1',[third]);
  assert.deepEqual(local.rows[0],{rejection_upload_mode:'local',review_note:null,catalyst_failures:null});
  assert.deepEqual(await queue(),[]);
  await ok(await routes.stats.GET(versionedRequest(`http://localhost/stats?start=${Date.now()-86400000}&end=${Date.now()+86400000}`)));
 }finally{await pg.close();}
});


test('upload type filters distinguish confirmed types, older unknowns, and QCs awaiting upload',()=>{
 const uploaded=type=>({trustUploadStatus:'uploaded',catalystObservationType:type});
 assert.equal(observationTypes.matchesQcUploadType(uploaded('Ride Along'),'ride_along'),true);
 assert.equal(observationTypes.matchesQcUploadType(uploaded('After the Fact'),'ride_along'),false);
 assert.equal(observationTypes.matchesQcUploadType(uploaded('After the Fact'),'after_the_fact'),true);
 for(const missing of [null,undefined,'unexpected'])assert.equal(observationTypes.matchesQcUploadType(uploaded(missing),'not_recorded'),true);
 for(const state of ['ready','failed']){
  const qc={trustUploadStatus:state,catalystObservationType:null};
  assert.equal(observationTypes.uploadedQcType(qc),null);
  assert.equal(observationTypes.matchesQcUploadType(qc,'not_recorded'),false);
  assert.equal(observationTypes.matchesQcUploadType(qc,'all'),true);
 }
});


async function rejectLocally(id,note=''){
 return ok(await routes.review.POST(request({status:'rejected',rejectionUploadMode:'local',reviewNote:note,failureReasons:[failure]}),context(id)));
}
test('local rejection allows optional notes, returns to the technician, and blocks queue, detail, and upload reporting',async()=>{
 const db=fixture();try{
  await rejectLocally(first);
  let rejected=await rejectedFolder();assert.equal(rejected.length,1);assert.equal(rejected[0].reviewNote,null);assert.equal(rejected[0].rejectionUploadMode,'local');
  assert.deepEqual(await queue(),[]);
  assert.equal((await routes.detail.GET(versionedRequest('http://localhost/test'),context(first))).status,404);
  assert.equal((await routes.upload.PATCH(request({status:'uploaded'},'PATCH'),context(first))).status,409);
  await redo(first,second);
  assert.equal(db.prepare('SELECT rejection_upload_mode FROM qc_submission_attempts WHERE submission_id=?').get(first).rejection_upload_mode,'local');
  await approve(second);
  const queued=await queue();assert.deepEqual(queued.map(q=>[q.id,q.workflow,q.outcome]),[[second,'observation','pass']]);
  await uploaded(second);assert.deepEqual(await rejectedFolder(),[]);
  assert.deepEqual(await queue(),[]);
  assert.equal(db.prepare('SELECT trust_upload_status FROM qc_submission_attempts WHERE submission_id=?').get(first).trust_upload_status,'ready');
 }finally{db.close();}
});
test('repeated local rejections preserve notes and upload only the final approved pictures',async()=>{
 const db=fixture();try{
  await rejectLocally(first,'Please retake a clear photo.');
  assert.equal((await rejectedFolder())[0].reviewNote,'Please retake a clear photo.');
  await redo(first,second);await rejectLocally(second);await redo(second,third);await approve(third);
  const q=await queue();assert.deepEqual(q.map(q=>q.id),[third]);assert.equal(q[0].workflow,'observation');
  assert.equal(q[0].photos[1].id,JSON.parse(db.prepare('SELECT photo_ids FROM qc_submissions WHERE id=?').get(third).photo_ids)[0]);
  const old=await routes.detail.GET(versionedRequest('http://localhost/test'),context(first));assert.equal(old.status,404);
 }finally{db.close();}
});
test('a regular rejection after a local rejection creates the first Catalyst fail, then an approved follow-up',async()=>{
 const db=fixture();try{
  await rejectLocally(first);await redo(first,second);await reject(second);
  let q=await queue();assert.deepEqual(q.map(q=>[q.id,q.outcome]),[[second,'fail']]);
  await redo(second,third);await approve(third);
  q=await queue();assert.deepEqual(q.map(q=>q.id),[second]);
  await uploaded(second,'77777');q=await queue();assert.deepEqual(q.map(q=>[q.id,q.workflow]),[[third,'follow_up']]);
  await uploaded(third);
  const details=await ok(await routes.dashboard.GET(versionedRequest(`http://localhost/api/qc-submissions?status=all&qc=${third}`)));
  assert.equal(details.submissions[0].catalystObservationType,'After the Fact');
  assert.deepEqual(await monthlyTotals(),[{techId:'TECH',rideAlong:0,afterTheFact:1,unknown:0}]);
 }finally{db.close();}
});
test('a local rejection of a correction retains the original Catalyst failure for the final follow-up',async()=>{
 const db=fixture();try{
  await reject(first);await redo(first,second);await rejectLocally(second,'Still needs a better picture.');
  assert.deepEqual((await queue()).map(q=>q.id),[first]);
  await uploaded(first,'77777');assert.deepEqual(await queue(),[]);
  await redo(second,third);await approve(third);
  assert.deepEqual((await queue()).map(q=>[q.id,q.workflow,q.catalystObservationId]),[[third,'follow_up','77777']]);
 }finally{db.close();}
});


test('snapshot type counts use confirmed upload dates, exclude correction duplicates and disabled technicians, and preserve unknowns',async()=>{
 const db=fixture();try{
  await reject(first);await uploaded(first);await redo(first,second);await approve(second);await uploaded(second);
  const now=Date.now(),old=now-40*86400000,start=now-86400000,end=now+86400000;
  const insert=db.prepare("INSERT INTO qc_submissions(id,tenant_id,root_submission_id,attempt_number,tech_id,job_number,screenshot_id,photo_ids,status,submitted_at,trust_upload_kind,trust_upload_status,trust_uploaded_at,catalyst_observation_type) VALUES(?,?,?,1,?,'123456',?,'[]','approved',?,'observation',?,?,?)");
  insert.run(third,'a',third,'TECH',picture,old,'uploaded',now,'Ride Along');
  insert.run('legacy','a','legacy','TECH',picture,now,'uploaded',now,null);
  insert.run('outside','a','outside','TECH',picture,now,'uploaded',old,'Ride Along');
  insert.run('pending-upload','a','pending-upload','TECH',picture,now,'ready',null,'Ride Along');
  insert.run('other','b','other','TECH',picture,now,'uploaded',now,'Ride Along');
  insert.run('disabled','a','disabled','DISABLED',picture,now,'uploaded',now,'Ride Along');
  insert.run('admin','a','admin','ADMIN',picture,now,'uploaded',now,'Ride Along');
  db.exec("INSERT INTO technicians VALUES('a','ZERO',1,0,NULL),('a','DISABLED',0,0,NULL),('a','ADMIN',1,1,NULL),('b','TECH',1,0,NULL)");
  // Even an archived/current duplicate of the same first failure counts once.
  db.prepare("INSERT INTO qc_submissions(id,tenant_id,root_submission_id,attempt_number,tech_id,status,submitted_at,trust_upload_kind,trust_upload_status,trust_uploaded_at,catalyst_observation_type) SELECT submission_id,tenant_id,root_submission_id,attempt_number,tech_id,status,submitted_at,trust_upload_kind,trust_upload_status,trust_uploaded_at,catalyst_observation_type FROM qc_submission_attempts WHERE submission_id=?").run(first);
  const url=`http://localhost/stats?start=${start}&end=${end}`;
  let stats=(await ok(await routes.stats.GET(versionedRequest(url)))).technicians;
  assert.deepEqual(stats.map(q=>[q.techId,q.rideAlong,q.afterTheFact,q.notRecorded]),[['TECH',1,1,1],['ZERO',0,0,0]]);
  globalThis.workflowTest.tenant='b';stats=(await ok(await routes.stats.GET(versionedRequest(url)))).technicians;
  assert.deepEqual(stats.map(q=>[q.techId,q.rideAlong,q.afterTheFact,q.notRecorded]),[['TECH',1,0,0]]);
 }finally{db.close();}
});
