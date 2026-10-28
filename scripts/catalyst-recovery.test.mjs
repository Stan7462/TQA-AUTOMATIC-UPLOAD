import test from 'node:test';
import assert from 'node:assert/strict';
import {recoveryPhotoIndex} from '../chrome-extension/core.js';
const photos=[{id:'a'},{id:'b'},{id:'c'}];
const saved={photoIds:['a','b'],photoKeys:['thumb1','thumb2']};
test('resumes after confirmed photos instead of reuploading them',()=>{
 assert.equal(recoveryPhotoIndex(saved,{photoKeys:['thumb1','thumb2']},photos),2);
 assert.equal(recoveryPhotoIndex({...saved,photoIds:['a','b','c'],photoKeys:['1','2','3']},{photoKeys:['1','2','3']},photos),3);
});
test('unknown, deleted, or changed Catalyst photos block recovery',()=>{
 for(const photoKeys of [['thumb1'],['thumb1','thumb2','extra'],['other','thumb2']]) assert.throws(()=>recoveryPhotoIndex(saved,{photoKeys},photos),/do not match/);
});
test('changed QC files and uncertain completion block recovery',()=>{
 assert.throws(()=>recoveryPhotoIndex(saved,{photoKeys:saved.photoKeys},[{id:'different'},...photos.slice(1)]),/photos changed/);
 assert.throws(()=>recoveryPhotoIndex({...saved,completionStarted:true},{photoKeys:saved.photoKeys},photos),/Completion may already/);
});
test('clean observation can start with no uploaded photos',()=>assert.equal(recoveryPhotoIndex({photoIds:[],photoKeys:[]},{photoKeys:[]},photos),0));

import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {orderedPhotos,exactJobMatches,observationTypeAssignments} from '../chrome-extension/core.js';
const background=readFileSync(new URL('../chrome-extension/background.js',import.meta.url),'utf8');
const processSource=background.slice(background.indexOf('async function processOne('),background.indexOf('async function runQueue('));
test('interrupted failed QC reopens saved job and skips all previously confirmed photos',async()=>{
 let checkpoint, run={}, checks=0, uploads=0, searches=0;
 const selectedTypes=[];
 const keys=[]; const paths=[];
 const qc={id:'qc',jobNumber:'839450',techId:'R019',workflow:'observation',reviewStatus:'rejected',uploadStatus:'ready',outcome:'fail',photos:photos.map((p,i)=>({...p,order:i,url:p.id})),failureReasons:[{code:'TQA1',reason:'reason'}],supervisorComment:'fix'};
 const process=runInNewContext(`${processSource};processOne`,{
  MAX_QC_ATTEMPTS:3,stopRequested:false,detail:async()=>qc,
  setRun:async patch=>{run={...run,...patch};},stored:async()=>({run}),
  recovery:async(_id,patch)=>{if(patch===null)checkpoint=undefined;else if(patch)checkpoint={...checkpoint,...patch};return checkpoint;},
  orderedPhotos,exactJobMatches,recoveryPhotoIndex,safeError:e=>e.message,
  logEvent:async()=>{},
  navigate:async(_tab,url)=>{paths.push(url);},JOBS_URL:'jobs',OBSERVATIONS_URL:'observations',observationUrl:id=>`job/${id}`,
  photoBase64:async()=>'',waitForSuccess:async()=> 'Observation Saved',
  report:async()=>({uploadStatus:'uploaded'}),
  pageCommand:async(_tab,command,...args)=>{
   if(command==='FIND_JOB'){searches++;return {rows:[{jobId:'166425706',jobNumber:'839450',techId:'R019'}]};}
   if(command==='INSPECT_OBSERVATION')return {photoKeys:[...keys]};
   if(command==='PREPARE'){selectedTypes.push(args[0].observationType);return {technicianName:'Demo'};}
   if(command==='UPLOAD_PHOTO'){uploads++;keys.push(`thumb${uploads}`);return {};}
   if(command==='SET_CHECKS'&&checks++===0)throw new Error('dropdown interrupted');
   if(command==='FIND_COMPLETED_OBSERVATION')return {observationId:'999'};
   return {};
  }
 });
 await assert.rejects(process(qc,1,0,1,1,'Ride Along'),/dropdown interrupted/);
 assert.equal(run.status,'needs_review');assert.equal(uploads,3);assert.equal(checkpoint.jobId,'166425706');
 run.status='stopped';
 assert.equal((await process(qc,2,0,1,1,'Ride Along')).status,'uploaded');
 assert.deepEqual(selectedTypes,['After the Fact','After the Fact']);
 assert.equal(searches,1);assert.equal(uploads,3);assert.equal(paths.filter(p=>p==='job/166425706').length,2);assert.equal(checkpoint,undefined);
});

test('Ride Along applies to passing observations only',()=>{
 const entries=observationTypeAssignments([{outcome:'fail'},{reviewStatus:'rejected'},{outcome:'pass'},{workflow:'follow_up'}],100);
 assert.deepEqual(entries.map(e=>e.observationType),['After the Fact','After the Fact','Ride Along','After the Fact']);
});

test('Ride Along split is calculated separately for each technician, regardless of batch order',()=>{
 const qcs=Array.from({length:10},(_,i)=>({id:String(i),techId:i%2?'R01T':'7462',outcome:'pass'}));
 qcs.push({id:'extra1',techId:'R01T',outcome:'pass'},{id:'extra2',techId:'7462',outcome:'pass'});
 for(const random of [()=>0,()=>0.99]){
  const assigned=observationTypeAssignments(qcs,50,random);
  for(const tech of ['R01T','7462']){
   const group=assigned.filter(e=>e.qc.techId===tech);
   assert.equal(group.length,6);
   assert.equal(group.filter(e=>e.observationType==='Ride Along').length,3);
  }
  assert.deepEqual(assigned.map(e=>e.qc.id),qcs.map(q=>q.id));
 }
});

test('per-technician rounding, endpoints, fails, and follow-ups stay independent',()=>{
 const qcs=[...Array.from({length:3},()=>({techId:'A',outcome:'pass'})),...Array.from({length:8},()=>({techId:'B',outcome:'pass'})),{techId:'A',outcome:'fail'},{techId:'A',reviewStatus:'rejected'},{techId:'A',workflow:'follow_up',outcome:'pass'}];
 for(const percentage of [0,30,50,100]){
  const assigned=observationTypeAssignments(qcs,percentage,()=>0);
  assert.equal(assigned.slice(0,3).filter(e=>e.observationType==='Ride Along').length,Math.round(3*percentage/100));
  assert.equal(assigned.slice(3,11).filter(e=>e.observationType==='Ride Along').length,Math.round(8*percentage/100));
  assert(assigned.slice(11).every(e=>e.observationType==='After the Fact'));
 }
 assert.deepEqual(observationTypeAssignments([],50),[]);
});

test('Catalyst save followed by reporting failure resumes without completing or uploading again',async()=>{
 let checkpoint,run={},uploads=0,completions=0,reports=0,lookups=0;const keys=[];
 const qc={id:'qc',jobNumber:'839450',techId:'R019',workflow:'observation',reviewStatus:'rejected',uploadStatus:'failed',outcome:'fail',photos:photos.map((p,i)=>({...p,order:i,url:p.id})),failureReasons:[],supervisorComment:'fix'};
 const process=runInNewContext(`${processSource};processOne`,{
 MAX_QC_ATTEMPTS:3,stopRequested:false,detail:async()=>qc,setRun:async patch=>{run={...run,...patch};},stored:async()=>({run}),
 recovery:async(_id,patch)=>{if(patch===null)checkpoint=undefined;else if(patch)checkpoint={...checkpoint,...patch};return checkpoint;},
 orderedPhotos,exactJobMatches,recoveryPhotoIndex,safeError:e=>e.message,navigate:async()=>{},JOBS_URL:'jobs',OBSERVATIONS_URL:'observations',observationUrl:id=>`job/${id}`,photoBase64:async()=>'',waitForSuccess:async()=> 'Observation Saved',
 logEvent:async()=>{},
 report:async(_id,status,reference)=>{assert.equal(status,'uploaded');assert.equal(reference,'8432353');if(reports++===0)throw new Error('TQA temporarily unavailable');return {uploadStatus:'uploaded'};},
 pageCommand:async(_tab,command)=>{
 if(command==='FIND_JOB')return {rows:[{jobId:'166425706',jobNumber:'839450',techId:'R019'}]};
 if(command==='INSPECT_OBSERVATION')return {photoKeys:[...keys]};
 if(command==='PREPARE')return {technicianName:'Dmytro Maleiko'};
 if(command==='UPLOAD_PHOTO'){uploads++;keys.push(`thumb${uploads}`);}
 if(command==='COMPLETE')completions++;
 if(command==='FIND_COMPLETED_OBSERVATION'){lookups++;return {observationId:'8432353'};}
 return {};
 }
 });
 await assert.rejects(process(qc,1,0,1,1,'After the Fact'),/TQA temporarily unavailable/);
 assert.equal(checkpoint.completionConfirmed,true);assert.equal(checkpoint.externalReference,'8432353');
 run.status='running';await process(qc,1,0,1,2,'After the Fact');
 assert.equal(uploads,3);assert.equal(completions,1);assert.equal(lookups,1);assert.equal(reports,2);assert.equal(checkpoint,undefined);
});

test('Observation Saved reports a failed QC even when optional observation ID lookup fails',async()=>{
 let checkpoint,run={},reported=false;const keys=[];const events=[];
 const qc={id:'failed',jobNumber:'849473',techId:'R02K',workflow:'observation',reviewStatus:'rejected',uploadStatus:'ready',outcome:'fail',photos:photos.map((p,i)=>({...p,order:i,url:p.id})),failureReasons:[],supervisorComment:'fix'};
 const process=runInNewContext(`${processSource};processOne`,{
  MAX_QC_ATTEMPTS:3,stopRequested:false,detail:async()=>qc,setRun:async patch=>{run={...run,...patch};},stored:async()=>({run}),
  recovery:async(_id,patch)=>{if(patch===null)checkpoint=undefined;else if(patch)checkpoint={...checkpoint,...patch};return checkpoint;},
  orderedPhotos,exactJobMatches,recoveryPhotoIndex,safeError:e=>e.message,JOBS_URL:'jobs',OBSERVATIONS_URL:'observations',observationUrl:id=>`job/${id}`,
  navigate:async()=>{},photoBase64:async()=>'',waitForSuccess:async()=> 'Observation Saved',logEvent:async(...args)=>events.push(args),
  report:async(_id,status,reference)=>{assert.equal(status,'uploaded');assert.equal(reference,undefined);reported=true;return {uploadStatus:'uploaded'};},
  pageCommand:async(_tab,command)=>{
   if(command==='FIND_JOB')return {rows:[{jobId:'166425706',jobNumber:'849473',techId:'R02K'}]};
   if(command==='INSPECT_OBSERVATION')return {photoKeys:[...keys]};
   if(command==='PREPARE')return {technicianName:'Viktor Shcherbakov'};
   if(command==='UPLOAD_PHOTO'){keys.push(`thumb${keys.length+1}`);return {};}
   if(command==='FIND_COMPLETED_OBSERVATION')throw new Error('Catalyst could not find technician Viktor Shcherbakov.');
   return {};
  }
 });
 const result=await process(qc,1,0,1,1,'After the Fact');
 assert.equal(result.status,'uploaded');assert.equal(reported,true);assert.equal(checkpoint,undefined);
 assert(events.some(([,step,message])=>step==='observation ID'&&message.includes('Observation Saved was confirmed')));
});

test('saved follow-up reports success without reuploading, and retries only reporting after an API failure',async()=>{
 let checkpoint,run={},reports=0,opens=0;
 const qc={id:'fixed',jobNumber:'839450',techId:'R019',workflow:'follow_up',reviewStatus:'approved',uploadStatus:'failed',outcome:'pass',catalystObservationId:'8432353',photos:photos.map((p,i)=>({...p,order:i,url:p.id,kind:'live_photo'}))};
 const process=runInNewContext(`${processSource};processOne`,{
 MAX_QC_ATTEMPTS:3,stopRequested:false,detail:async()=>qc,setRun:async patch=>{run={...run,...patch};},stored:async()=>({run}),
 recovery:async(_id,patch)=>{if(patch===null)checkpoint=undefined;else if(patch)checkpoint={...checkpoint,...patch};return checkpoint;},
 orderedPhotos,safeError:e=>e.message,navigate:async()=>{opens++;},completedObservationUrl:id=>`observation?id=${id}`,
 report:async(_id,status,reference)=>{assert.equal(status,'uploaded');assert.equal(reference,'8432353');if(reports++===0)throw new Error('TQA unavailable');return {uploadStatus:'uploaded'};},
 pageCommand:async(_tab,command,data)=>{assert.equal(command,'PREPARE_FOLLOW_UP');assert.equal(data.photoCount,3);return {completed:true};}
 });
 await assert.rejects(process(qc,1,0,1,1,'After the Fact'),/TQA unavailable/);
 assert.equal(checkpoint.completionConfirmed,true);assert.equal(run.status,'needs_review');
 run.status='running';await process(qc,1,0,1,2,'After the Fact');
 assert.equal(opens,1);assert.equal(reports,2);assert.equal(checkpoint,undefined);
});

test('new correction is verified from persisted Catalyst state before reporting',async()=>{
 let checkpoint,run={},uploads=0,saves=0,verified=false,reports=0;
 const qc={id:'fixed',jobNumber:'839450',techId:'R019',workflow:'follow_up',reviewStatus:'approved',uploadStatus:'ready',outcome:'pass',catalystObservationId:'8432353',photos:photos.map((p,i)=>({...p,order:i,url:p.id,kind:'live_photo'}))};
 const process=runInNewContext(`${processSource};processOne`,{
 MAX_QC_ATTEMPTS:3,stopRequested:false,detail:async()=>qc,setRun:async patch=>{run={...run,...patch};},stored:async()=>({run}),
 recovery:async(_id,patch)=>{if(patch===null)checkpoint=undefined;else if(patch)checkpoint={...checkpoint,...patch};return checkpoint;},
 orderedPhotos,safeError:e=>e.message,navigate:async()=>{},completedObservationUrl:id=>`observation?id=${id}`,photoBase64:async()=>'',
 report:async()=>{assert.equal(verified,true);reports++;return {uploadStatus:'uploaded'};},
 pageCommand:async(_tab,command)=>{
  if(command==='PREPARE_FOLLOW_UP')return {prepared:true};
  if(command==='UPLOAD_FOLLOW_UP_PHOTO'){uploads++;return {};}
  if(command==='SAVE_FOLLOW_UP'){saves++;return {clicked:true};}
  if(command==='VERIFY_SAVED_FOLLOW_UP'){verified=true;return {completed:true};}
  assert.fail(command);
 }
 });
 await process(qc,1,0,1,1,'After the Fact');assert.equal(uploads,3);assert.equal(saves,1);assert.equal(reports,1);
});

test('new batches use each technician monthly history, including failed observations',()=>{
 const qc={id:'next',techId:'A',outcome:'pass'};
 const history=[{techId:'A',rideAlong:0,afterTheFact:2},{techId:'B',rideAlong:3,afterTheFact:0}];
 assert.equal(observationTypeAssignments([qc],50,()=>0.99,history)[0].observationType,'Ride Along');
 history[0].rideAlong++;
 assert.equal(observationTypeAssignments([qc],50,()=>0.99,history)[0].observationType,'Ride Along');
 assert.equal(observationTypeAssignments([{...qc,techId:'B'}],50,()=>0,history)[0].observationType,'After the Fact');
 assert.equal(observationTypeAssignments([{...qc,outcome:'fail'}],100,()=>0,history)[0].observationType,'After the Fact');
 // Failed uploads do not advance server history: the next run makes the same choice.
 assert.equal(observationTypeAssignments([qc],50,()=>0.99,history)[0].observationType,'Ride Along');
});
