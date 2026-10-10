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
  b.onResolve({filter:/^@\//},args=>args.path in mocks||args.path==='@/lib/trust-api'?{path:args.path,namespace:'fixture'}:{path:join(root,args.path.slice(2)+'.ts')});
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>{
   if(args.path in mocks)return{contents:mocks[args.path],loader:'ts'};
   let source=readFileSync(join(root,'lib/trust-api.ts'),'utf8').replace(/^import .*;\n/gm,'');
   const start=source.indexOf('export async function requireTrustKey'); const end=source.indexOf('export function trustQc',start);
   source=source.slice(0,start)+'export async function requireTrustKey(){return {id:null,label:"test",tenantId:globalThis.workflowTest.tenant};}\n'+source.slice(end);
   return{contents:source,loader:'ts'};
  });
 }}]});
 return import(output);
}
const routes={
 redo:await handler('app/api/qc-upload/route.ts','redo'),
 review:await handler('app/api/qc-submissions/[id]/route.ts','review'),
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
 const columns=`tenant_id TEXT NOT NULL,root_submission_id TEXT,attempt_number INTEGER DEFAULT 1,tech_id TEXT,job_number TEXT,address TEXT,screenshot_id TEXT,photo_ids TEXT,status TEXT,submitted_at INTEGER,reviewed_at INTEGER,review_note TEXT,trust_upload_status TEXT DEFAULT 'ready',trust_uploaded_at INTEGER,trust_external_reference TEXT,trust_upload_error TEXT,trust_upload_attempts INTEGER DEFAULT 0,trust_last_attempt_at INTEGER,trust_uploaded_by_key_id TEXT,location_status TEXT,location_latitude REAL,location_longitude REAL,location_accuracy REAL,location_captured_at INTEGER,catalyst_failures TEXT,trust_upload_kind TEXT DEFAULT 'observation',catalyst_observation_id TEXT`;
 db.exec(`CREATE TABLE qc_submissions(id TEXT PRIMARY KEY,${columns},correction_pending INTEGER DEFAULT 0,correction_deadline_at INTEGER);
 CREATE TABLE qc_submission_attempts(submission_id TEXT UNIQUE,${columns},UNIQUE(tenant_id,root_submission_id,attempt_number));
 CREATE TABLE technician_removals(tenant_id TEXT,tech_id TEXT,state TEXT);
 CREATE TABLE push_accounts(tenant_id TEXT,tech_id TEXT,enabled INTEGER);
 CREATE TABLE qc_upload_photos(tenant_id TEXT,submission_id TEXT,tech_id TEXT,slot INTEGER,image BLOB,created_at INTEGER,PRIMARY KEY(tenant_id,submission_id,tech_id,slot));
 INSERT INTO push_accounts VALUES('a','TECH',1);`);
 db.prepare(`INSERT INTO qc_submissions(id,tenant_id,root_submission_id,tech_id,job_number,screenshot_id,photo_ids,status,submitted_at) VALUES(?,'a',?,'TECH','776499',?,?,'pending',?)`).run(first,first,picture,JSON.stringify([picture,picture]),Date.now());
 const database=createDatabase({url:null,sqlite:db});
 const bucket=new Map([[`captures/${picture}`,Buffer.from('original-photo')]]);
 globalThis.workflowTest={tenant:'a',env:{DB:{prepare(sql){const statement=database.prepare(sql);return {bind(...args){const bound=statement.bind(...args);return{first:()=>bound.first(),run:()=>bound.run(),all:async()=>({results:await bound.all()}),sql:bound.sql,values:bound.values};}};},batch:database.batch},BUCKET:{put:async(k,v)=>bucket.set(k,v),delete:async k=>bucket.delete(k),get:async k=>bucket.has(k)?{body:bucket.get(k)}:null}}};
 return db;
}
function request(body,method='POST'){return new Request('http://localhost/test',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
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
async function queue(){return (await ok(await routes.list.GET(new Request('http://localhost/qcs')))).qcs;}
async function uploaded(id,reference='12345'){return ok(await routes.upload.PATCH(request({status:'uploaded',externalReference:reference},'PATCH'),context(id)));}
async function rejectedFolder(){return (await ok(await routes.profile.GET(new Request('http://localhost/profile?view=rejected')))).submissions;}

test('redo and approve before upload: original Fail first, final Fix second, intermediate retries never queued',async()=>{
 const db=fixture();try{
  await reject(first);const deadline=db.prepare('SELECT correction_deadline_at AS value FROM qc_submissions').get().value;
  await redo(first,second);await reject(second);
  assert.deepEqual((await queue()).map(q=>q.id),[first]);
  await redo(second,third);await approve(third);
  assert.deepEqual((await rejectedFolder()).map(q=>q.id),[third]);
  assert.deepEqual((await queue()).map(q=>[q.id,q.outcome,q.workflow]),[[first,'fail','observation']]);
  const original=await ok(await routes.detail.GET(new Request('http://localhost/qc'),context(first)));
  assert.equal(original.qc.photos[0].id,picture);assert.deepEqual(original.qc.failureReasons,[failure]);
  const photo=await routes.photo.GET(new Request('http://localhost/photo'),context(picture));assert.equal(photo.status,200);
  const result=await uploaded(first);assert.equal(result.qc.catalystObservationId,'12345');
  assert(deadline>0);
  assert.deepEqual((await queue()).map(q=>[q.id,q.outcome,q.workflow,q.catalystObservationId]),[[third,'pass','follow_up','12345']]);
  assert.equal((await uploaded(first)).alreadyUploaded,true);
  await uploaded(third);assert.equal((await queue()).length,0);assert.equal((await rejectedFolder()).length,0);
  const all=await ok(await routes.list.GET(new Request('http://localhost/qcs?uploadStatus=uploaded')));
  assert.deepEqual(all.qcs.map(q=>q.id),[first,third]);
  globalThis.workflowTest.tenant='b';assert.equal((await queue()).length,0);assert.equal((await routes.detail.GET(new Request('http://localhost/qc'),context(first))).status,404);
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
test('a QC approved without rejection uploads only once',async()=>{
 const db=fixture();try{await approve(first);assert.equal((await queue())[0].outcome,'pass');await uploaded(first);assert.equal((await queue()).length,0);assert.equal((await uploaded(first)).alreadyUploaded,true);}finally{db.close();}
});
test('extension uploads Fail then newly unlocked approved Fix in the same run',async()=>{
 const db=fixture();try{
  await reject(first);await redo(first,second);await approve(second);
  const processed=[];let run={};
  const background=readFileSync(join(root,'chrome-extension/background.js'),'utf8');
  const source=background.slice(background.indexOf('async function runQueue()'),background.indexOf('chrome.runtime.onMessage.addListener'));
  await runInNewContext(source+';runQueue()',{
   loadQueue:queue,rideAlongPercentage:async()=>50,observationTypeAssignments,
   setRun:async patch=>{run={...run,...patch};},stored:async()=>({run}),
   chrome:{tabs:{create:async()=>({id:1})}},JOBS_URL:'https://example.test',
   processOne:async qc=>{processed.push(qc.id);await uploaded(qc.id);return{status:'uploaded',jobNumber:qc.jobNumber};},
   stopRequested:false,activeRun:null,MAX_QC_ATTEMPTS:3,waitBeforeNextQc:async()=>{},safeError:String,
  });
  assert.deepEqual(processed,[first,second]);assert.equal(run.status,'done');assert.equal(run.total,2);
  assert.equal((await queue()).length,0);
 }finally{db.close();}
});
test.after(()=>{rmSync(temp,{recursive:true,force:true});delete globalThis.workflowTest;});
