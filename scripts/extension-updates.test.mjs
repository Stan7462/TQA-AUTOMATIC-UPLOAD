import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const background=readFileSync('chrome-extension/background.js','utf8');
const checks=background.slice(background.indexOf('const INSTALLED_VERSION'),background.indexOf('async function configureSidePanel'));
function updater(){
 const data={},badges=[];let latest='0.7.21',offline=false;
 const context={chrome:{runtime:{getManifest:()=>({version:'0.7.20'})},storage:{local:{set:async v=>Object.assign(data,v),get:async()=>data}},action:{setBadgeText:async v=>badges.push(v.text),setBadgeBackgroundColor:async()=>{},setTitle:async()=>{}},alarms:{create:async()=>{},onAlarm:{addListener:()=>{}}}},storageReady:Promise.resolve(),TQA_APP_ORIGIN:'https://example.test',AbortSignal,fetch:async()=>{if(offline)throw Error('offline');return {ok:true,json:async()=>({version:latest,requiredVersion:latest})};}};
 const api=runInNewContext(checks+';({checkForUpdate,assertCurrentVersion})',context);
 return {data,badges,api,setLatest:v=>latest=v,setOffline:v=>offline=v};
}
test('outdated version sets toolbar badge and blocks uploads; updating clears the badge',async()=>{
 const f=updater();assert.equal((await f.api.checkForUpdate()).status,'update_required');assert.equal(f.badges.at(-1),'UPD');
 await assert.rejects(f.api.assertCurrentVersion(),e=>e.code==='EXTENSION_UPDATE_REQUIRED');
 f.setLatest('0.7.20');assert.equal((await f.api.checkForUpdate()).status,'current');assert.equal(f.badges.at(-1),'');await f.api.assertCurrentVersion();
});
test('offline checks cannot admit uploads and do not clear a known mandatory update',async()=>{
 const f=updater();f.setOffline(true);await assert.rejects(f.api.assertCurrentVersion(),e=>e.code==='EXTENSION_VERSION_UNAVAILABLE');assert.equal(f.badges.at(-1),'?');
 f.setOffline(false);await f.api.checkForUpdate();f.setOffline(true);await assert.rejects(f.api.assertCurrentVersion(),e=>e.code==='EXTENSION_UPDATE_REQUIRED');assert.equal(f.data.updateInfo.status,'update_required');
});
test('update published during a QC lets it finish and report, then blocks the next QC',async()=>{
 const source=background.slice(background.indexOf('async function runQueue('),background.indexOf('chrome.runtime.onMessage.addListener'));
 let run={},versionChecks=0;const finished=[],queue=[{id:'one',jobNumber:'111111'},{id:'two',jobNumber:'222222'}];
 await runInNewContext(source+';runQueue()',{
  assertCurrentVersion:async()=>{if(++versionChecks>=3){const e=Error('Update required');e.code='EXTENSION_UPDATE_REQUIRED';throw e;}},
  loadQueue:async()=>queue,rideAlongPercentage:async()=>50,setRun:async patch=>{run={...run,...patch};},stored:async()=>({run}),
  processOne:async qc=>{finished.push(qc.id);return {status:'uploaded',jobNumber:qc.jobNumber};},
  chrome:{tabs:{create:async()=>({id:1})}},JOBS_URL:'https://example.test',stopRequested:false,activeRun:null,MAX_QC_ATTEMPTS:3,safeError:String,
 });
 assert.deepEqual(finished,['one']);assert.equal(run.status,'update_required');
});
test('panel shows update instructions and disables new uploads while the current QC finishes',()=>{
 const html=readFileSync('chrome-extension/popup.html','utf8'),popup=readFileSync('chrome-extension/popup.js','utf8');
 const source=popup.slice(0,popup.indexOf('async function refreshState'));
 function panel(status,run={}){
  const element=()=>({classList:{toggle(){}},setAttribute(){},replaceChildren(){},append(){}});
  const nodes=Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(match=>[match[1],element()]));
  const state={hasAuth:true,queue:[{id:'qc',jobNumber:'123456',techId:'TECH',photos:[],workflow:'observation',outcome:'pass',uploadStatus:'ready'}],run,updateInfo:{status,installedVersion:'0.7.20',latestVersion:'0.7.21'}};
  runInNewContext(source+';state='+JSON.stringify(state)+';render();',{chrome:{runtime:{getManifest:()=>({version:'0.7.20'})}},document:{getElementById:id=>nodes[id],body:element(),createElement:element}});
  return nodes;
 }
 const outdated=panel('update_required',{status:'running'});
 assert.equal(outdated['extension-update'].hidden,false);assert.equal(outdated.start.disabled,true);assert.match(outdated['update-message'].textContent,/current QC will finish/);assert.equal(outdated['download-update'].hidden,false);
 const current=panel('current');assert.equal(current['extension-update'].hidden,true);assert.equal(current.start.disabled,false);assert.equal(current['extension-version'].textContent,'v0.7.20');
 const unavailable=panel('unavailable');assert.equal(unavailable.start.disabled,true);assert.equal(unavailable['extension-update'].hidden,false);
});
