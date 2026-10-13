import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../chrome-extension/content.js',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('  async function inspectObservation('),source.indexOf('  async function prepare('));
test('inspects existing photos before Catalyst exposes QC table or Complete button',async()=>{
 const document={querySelector:()=>({type:'file'}),querySelectorAll:selector=>selector.includes('combobox')?[{},{}]:[{id:'thumbnail-image-container-2'},{id:'thumbnail-image-container-1'}]};
 const inspect=runInNewContext(`${fn};inspectObservation`,{document,visible:()=>true,detailValue:label=>label==='Job Number'?'839450':'R019',waitFor:async(pred,description)=>{const result=pred();assert.ok(result,description);return result;}});
 const result=await inspect('839450','R019');
 assert.deepEqual(Array.from(result.photoKeys),['thumbnail-image-container-1','thumbnail-image-container-2']);
});
test('mismatched technician prevents inspecting or adopting photos',async()=>{
 const inspect=runInNewContext(`${fn};inspectObservation`,{detailValue:()=> 'wrong',waitFor:async predicate=>{if(!predicate())throw new Error('identifier mismatch');}});
 await assert.rejects(inspect('839450','R019'),/identifier mismatch/);
});

const waitSource=source.slice(source.indexOf('  async function waitFor('),source.indexOf('  function nativeValue('));
const completedSource=source.slice(source.indexOf('  async function verifyCompletedObservation('),source.indexOf('  async function prepareFollowUp('));
function completedFixture({tech='R019',score='Fail',count=5,disabled=true}={}){
 let time=0;
 const verify=runInNewContext(`${waitSource}\n${completedSource}\nverifyCompletedObservation`,{
 location:{href:'https://example.test/TechOps/observation?id=8432353'},URL,
 Date:{now:()=>time},sleep:async ms=>{time+=ms;},visible:()=>true,clean:x=>String(x??'').trim(),
 detailValue:label=>label==='Job Number'?'839450':label==='Tech Number'?tech:'Oct 12, 2026 6:07 PM',
 document:{querySelector:()=>({disabled}),querySelectorAll:selector=>selector.includes('bg-danger')?[{textContent:score}]:Array.from({length:count},()=>({}))}
 });
 return ()=>verify('839450','R019','fail',5);
}
test('confirms completed Fail by actual observation ID and matching photos',async()=>assert.equal((await completedFixture()()).observationId,'8432353'));
test('rejects wrong tech, outcome, photo count, or incomplete observation',async()=>{
 for(const fixture of [{tech:'OTHER'},{score:'Pass'},{count:4},{disabled:false}])await assert.rejects(completedFixture(fixture)());
});
