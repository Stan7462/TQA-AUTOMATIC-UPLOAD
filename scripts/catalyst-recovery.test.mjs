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

test('Catalyst save followed by reporting failure resumes without completing or uploading again',async()=>{
 let checkpoint,run={},uploads=0,completions=0,reports=0,lookups=0;const keys=[];
 const qc={id:'qc',jobNumber:'839450',techId:'R019',workflow:'observation',reviewStatus:'rejected',uploadStatus:'failed',outcome:'fail',photos:photos.map((p,i)=>({...p,order:i,url:p.id})),failureReasons:[],supervisorComment:'fix'};
 const process=runInNewContext(`${processSource};processOne`,{
 MAX_QC_ATTEMPTS:3,stopRequested:false,detail:async()=>qc,setRun:async patch=>{run={...run,...patch};},stored:async()=>({run}),
 recovery:async(_id,patch)=>{if(patch===null)checkpoint=undefined;else if(patch)checkpoint={...checkpoint,...patch};return checkpoint;},
 orderedPhotos,exactJobMatches,recoveryPhotoIndex,safeError:e=>e.message,navigate:async()=>{},JOBS_URL:'jobs',OBSERVATIONS_URL:'observations',observationUrl:id=>`job/${id}`,photoBase64:async()=>'',waitForSuccess:async()=> 'Observation Saved',
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
