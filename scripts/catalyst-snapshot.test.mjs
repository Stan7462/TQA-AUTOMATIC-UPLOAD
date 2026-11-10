import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const source = readFileSync(new URL('../app/api/qc-stats/route.ts', import.meta.url), 'utf8');
const query = source.match(/prepare\(`(SELECT tech_id AS techId, COUNT\(DISTINCT[\s\S]*?)`\)/)[1];
test('snapshot counts confirmed first failures after corrections, once per job and within company/month', () => {
  const db = new DatabaseSync(':memory:');
  const cols = 'tenant_id TEXT, root_submission_id TEXT, attempt_number INTEGER, tech_id TEXT, status TEXT, trust_upload_status TEXT, submitted_at INTEGER';
  db.exec(`CREATE TABLE qc_submissions (id TEXT, ${cols}); CREATE TABLE qc_submission_attempts (submission_id TEXT, ${cols})`);
  const current = db.prepare('INSERT INTO qc_submissions VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const history = db.prepare('INSERT INTO qc_submission_attempts VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  current.run('a', 'company', 'a', 1, 'TECH', 'rejected', 'uploaded', 100);
  // A historical Fail still counts after its final correction is approved/uploaded.
  history.run('b', 'company', 'b', 1, 'TECH', 'rejected', 'uploaded', 100);
  current.run('b-fixed', 'company', 'b', 3, 'TECH', 'approved', 'uploaded', 150);
  history.run('b-mid', 'company', 'b', 2, 'TECH', 'rejected', 'uploaded', 130);
  // A duplicate archived copy must not inflate the count.
  history.run('a', 'company', 'a', 1, 'TECH', 'rejected', 'uploaded', 100);
  current.run('c', 'company', 'c', 1, 'TECH', 'rejected', 'ready', 100);
  current.run('d', 'company', 'd', 1, 'TECH', 'rejected', 'failed', 100);
  current.run('e', 'other', 'e', 1, 'TECH', 'rejected', 'uploaded', 100);
  history.run('f', 'company', 'f', 1, 'TECH', 'rejected', 'uploaded', 10);
  assert.deepEqual(db.prepare(query).all('company', 50, 200).map(row => ({...row})), [{ techId: 'TECH', failedUploaded: 2 }]);
  db.close();
});


test('type split totals, percentages and shared image keep counts and unknown types visible',async()=>{
 const {build}=await import('esbuild');const {runInNewContext}=await import('node:vm');
 const output=await build({entryPoints:['lib/catalyst-snapshot.ts'],bundle:true,write:false,format:'iife',globalName:'snapshot',platform:'browser'});
 const text=[],boxes=[];let canvas;
 const context={createLinearGradient:()=>({addColorStop(){}}),fillRect(...args){boxes.push(args);},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillText(value,x,y){text.push({value,x,y});}};
 const sandbox={File,Uint8Array,atob,Intl,Date,document:{createElement(){canvas={width:0,height:0,getContext:()=>context,toDataURL:()=> 'data:image/png;base64,aGVsbG8='};return canvas;}}};
 runInNewContext(output.outputFiles[0].text,sandbox);const {snapshotTypeTotals,snapshotPercentage,snapshotTypesPng}=sandbox.snapshot;
 const stats=[{techId:'R001',uploaded:4,failedUploaded:1,monthlyGoal:5,rideAlong:1,afterTheFact:2,notRecorded:1},{techId:'ZERO',uploaded:0,failedUploaded:0,monthlyGoal:5,rideAlong:0,afterTheFact:0,notRecorded:0}];
 assert.equal(snapshotPercentage(1,4),'25%');assert.equal(snapshotPercentage(0,0),'—');assert.equal(snapshotTypeTotals(stats).notRecorded,1);
 const file=snapshotTypesPng(stats,{start:1000000000000,end:1002592000000},5);assert.match(file.name,/type-split/);assert.equal(file.type,'image/png');
 for(const label of ['RIDE ALONG','AFTER THE FACT','NOT RECORDED','Tech R001','Tech ZERO','25%','50%','—'])assert(text.some(t=>t.value===label),label);
 assert(text.every(t=>t.y>=0&&t.y<canvas.height));assert(boxes.every(b=>b[0]>=0&&b[1]>=0&&b[0]+b[2]<=canvas.width&&b[1]+b[3]<=canvas.height));
});

test('team goal totals use individual requirements and successful uploads, including over-target and empty teams',async()=>{
 const {build}=await import('esbuild');const {runInNewContext}=await import('node:vm');
 const output=await build({entryPoints:['lib/catalyst-snapshot.ts'],bundle:true,write:false,format:'iife',globalName:'snapshot',platform:'browser'});
 const sandbox={Intl};runInNewContext(output.outputFiles[0].text,sandbox);
 const {snapshotGoalTotals}=sandbox.snapshot;
 const team=Array.from({length:10},(_,i)=>({uploaded:i<5?5:0,monthlyGoal:5,failedUploaded:7}));
 let totals=snapshotGoalTotals(team,5);assert.equal(totals.uploaded,25);assert.equal(totals.required,50);assert.equal(totals.remaining,25);assert.equal(totals.percentage,'50%');assert.equal(totals.progress,.5);
 totals=snapshotGoalTotals([{uploaded:4,monthlyGoal:10},{uploaded:1,monthlyGoal:null}],5);assert.equal(totals.required,15);assert.equal(totals.percentage,'33.3%');
 totals=snapshotGoalTotals([{uploaded:8,monthlyGoal:5}],5);assert.equal(totals.percentage,'160%');assert.equal(totals.remaining,0);assert.equal(totals.progress,1);
 totals=snapshotGoalTotals([],5);assert.equal(totals.required,0);assert.equal(totals.percentage,'—');assert.equal(totals.progress,0);
});

test('current snapshot image includes team totals without overlapping technician rows',async()=>{
 const {build}=await import('esbuild');const {runInNewContext}=await import('node:vm');
 const output=await build({entryPoints:['lib/catalyst-snapshot.ts'],bundle:true,write:false,format:'iife',globalName:'snapshot',platform:'browser'});
 for(const count of [10,27]){
  const text=[],boxes=[];let canvas;
  const context={createLinearGradient:()=>({addColorStop(){}}),fillRect(...args){boxes.push(args);},strokeRect(){},fillText(value,x,y){text.push({value,x,y});}};
  const sandbox={File,Uint8Array,atob,Intl,Date,document:{createElement(){canvas={width:0,height:0,getContext:()=>context,toDataURL:()=> 'data:image/png;base64,aGVsbG8='};return canvas;}}};
  runInNewContext(output.outputFiles[0].text,sandbox);
  const team=Array.from({length:count},(_,i)=>({techId:`T${i}`,uploaded:i<5?5:0,monthlyGoal:5,failedUploaded:0}));
  const file=sandbox.snapshot.snapshotPng(team,{start:1000000000000,end:1002592000000},5);
  assert.equal(file.type,'image/png');
  for(const label of ['Team monthly goal',`25 of ${count*5} required QCs uploaded`,`${count*5-25} remaining`,`Tech T${count-1}`])assert(text.some(t=>t.value===label),label);
  assert(text.find(t=>t.value==='TECHNICIAN').y>text.find(t=>t.value==='Team monthly goal').y);
  assert(text.every(t=>t.y>=0&&t.y<canvas.height));assert(boxes.every(b=>b[0]>=0&&b[1]>=0&&b[0]+b[2]<=canvas.width&&b[1]+b[3]<=canvas.height));
 }
});
