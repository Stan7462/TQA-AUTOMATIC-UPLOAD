import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source=readFileSync(new URL('../chrome-extension/content.js',import.meta.url),'utf8');
const wait=source.slice(source.indexOf('  async function waitFor('),source.indexOf('  function nativeValue('));
const prepare=source.slice(source.indexOf('  function savedFollowUp('),source.indexOf('  async function uploadFollowUpPhoto('));
function fixture({showDisposition=true,matching=true}={}){
 let time=0,opened=false,completeAt=null;const selections=[];
 const status={name:'status',disabled:false,getAttribute:()=>null};
 const disposition={name:'disposition',disabled:false,getAttribute:()=>null};
 const scope={textContent:'Follow-up Details',querySelector(){return null;},querySelectorAll(selector){
  if(selector!=="[role='combobox']")return [];
  if(!opened||time<400)return [];
  return completeAt!==null&&showDisposition&&time>=completeAt+800?[status,disposition]:[status];
 }};
 const document={body:{innerText:''},querySelectorAll:()=>opened?[scope]:[]};
 const run=runInNewContext(`${wait}\n${prepare}\nprepareFollowUp`,{
  document,Date:{now:()=>time},sleep:async ms=>{time+=ms;},visible:()=>true,
  pageLog:()=>{},detailValue:label=>label==='Job Number'?(matching?'839450':'999999'):'R019',
  button:name=>name==='Follow-up'?{click(){opened=true;}}:null,
  selectComboElement:async(combo,value)=>{assert.equal(combo,status);assert.equal(value,'Complete');selections.push(value);completeAt=time;}
 });
 return {run:()=>run('839450','R019'),time:()=>time,selections:()=>selections,opened:()=>opened};
}
test('starts with Status only, selects Complete, then waits for conditional Disposition',async()=>{
 const f=fixture();assert.equal((await f.run()).prepared,true);
 assert.deepEqual(f.selections(),['Complete']);assert.equal(f.time(),1200);
});
test('does not proceed to correction uploads when Disposition never appears',async()=>{
 const f=fixture({showDisposition:false});await assert.rejects(f.run(),/Disposition after selecting Complete/);
 assert.deepEqual(f.selections(),['Complete']);
});
test('wrong job prevents opening a follow-up',async()=>{
 const f=fixture({matching:false});await assert.rejects(f.run(),/matching failed observation/);
 assert.equal(f.opened(),false);assert.deepEqual(f.selections(),[]);
});

function savedFixture(photoCount=4,delayed=false) {
 let time=0;
 const combos=[{disabled:true,getAttribute:()=>null},{disabled:true,getAttribute:()=>null}];
 const scope={textContent:'Follow-up',querySelector:()=>({disabled:true}),querySelectorAll(selector){
  if(selector.includes('combobox'))return combos;
  if(selector.includes('single-value'))return [{textContent:'Complete'},{textContent:'Issues Corrected'}];
  if(selector==='tbody tr')return [{querySelectorAll:()=>[{textContent:'Complete'}]}];
  if(selector.includes('thumbnail'))return delayed&&time<1800?[]:Array.from({length:photoCount},(_,i)=>({id:`photo-${i}`}));
  return [];
 }};
 const run=runInNewContext(`${wait}\n${prepare}\nprepareFollowUp`,{
  Date:{now:()=>time},sleep:async ms=>{time+=ms;},document:{querySelectorAll:()=>[scope],body:{innerText:''}},visible:()=>true,clean:x=>String(x??'').trim(),
  pageLog:()=>{},detailValue:label=>label==='Job Number'?'839450':'R019',button:()=>({click(){}}),
  selectComboElement:()=>assert.fail('A saved correction must not be edited')
 });
 return {run:()=>run('839450','R019',4),time:()=>time};
}
test('recognizes persisted Complete / Issues Corrected and skips new uploads',async()=>{
 const result=await savedFixture().run();assert.equal(result.completed,true);assert.equal(result.photoKeys.length,4);
});
test('saved correction with the wrong photo count cannot be marked uploaded',async()=>{
 await assert.rejects(savedFixture(3).run(),/saved Complete.*4 correction photos/);
});

test('saved status arrives before correction photos: wait instead of seeking an editable Status',async()=>{
 const f=savedFixture(4,true);const result=await f.run();
 assert.equal(result.completed,true);assert.equal(result.photoKeys.length,4);assert.equal(f.time(),1800);
});
