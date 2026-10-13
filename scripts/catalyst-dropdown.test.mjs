import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../chrome-extension/content.js',import.meta.url),'utf8');
const waitSource=source.slice(source.indexOf('  async function waitFor('),source.indexOf('  function nativeValue('));
const checksSource=source.slice(source.indexOf('  async function setChecks('),source.indexOf('  async function findCompletedObservation('));
function fixture(showDropdown){
  let time=0, clicked=false, selected=null, selectedReasons=[];
  const combo={disabled:false,getAttribute:()=>null};
  const makeRow=(code,replacement=false)=>{
    const radios=[{checked:false,click(){this.checked=true;}},{checked:false,click(){this.checked=true;clicked=true;}}];
    return {querySelector:()=>({textContent:code}),querySelectorAll(selector){
      if(selector.includes('radio'))return radios;
      if(selector.includes('combobox'))return replacement&&showDropdown&&time>=600?[combo]:[];
      return [];
    }};
  };
  const rows=Array.from({length:7},(_,i)=>makeRow(`TQA${i+1}`));
  const replacement=makeRow('TQA1',true);
  const document={querySelectorAll(selector){return selector.includes('row')?[clicked?replacement:rows[0],...rows.slice(1)]:[];}};
  const setChecks=runInNewContext(`${waitSource}\n${checksSource}\nsetChecks`,{
    document,Date:{now:()=>time},sleep:async ms=>{time+=ms;},visible:()=>true,clean:x=>String(x??'').trim(),
    selectComboElement:async(el,reason)=>{assert.equal(el,combo);selected=reason;selectedReasons.push(reason);},nativeValue:()=>{}
  });
  return {run:(failures=[{code:'TQA1',reason:'Correct reason'}])=>setChecks(failures),selectedReasons:()=>selectedReasons,selected:()=>selected,time:()=>time};
}
test('waits for delayed rejection dropdown on a replaced Catalyst row',async()=>{
  const f=fixture(true);const result=await f.run();
  assert.equal(f.selected(),'Correct reason');assert.equal(f.time(),600);assert.equal(result.notDisplayed,1);
});
test('times out safely if the rejection dropdown never appears',async()=>{
  const f=fixture(false);await assert.rejects(f.run(),/Timed out waiting for TQA1 Additional Information dropdown/);
  assert.equal(f.selected(),null);assert.equal(f.time(),15000);
});

const comboSource=source.slice(source.indexOf('  async function selectComboElement('),source.indexOf('  async function inspectObservation('));
function dropdownFixture(selects=true,multi=false,alreadySelected=false){
 let time=0,expanded=alreadySelected,value=alreadySelected?'Correct reason':'',keyOpens=0,clicks=0;
 const chip={textContent:'Correct reason'};
 const control={dispatchEvent(){},querySelectorAll:selector=>value&&selector.includes(multi?'multi-value__label':'single-value')?[chip]:[]};
 const combo={id:'reason',focus(){},closest:()=>control,getAttribute:key=>key==='aria-expanded'?String(expanded):expanded?'options':null,
 dispatchEvent(event){if(event.key==='Escape'){expanded=false;return;}keyOpens++;expanded=true;}};
 const item={textContent:'Correct reason',click(){clicks++;if(selects)value='Correct reason';expanded=multi;}};
 const document={getElementById:id=>id==='reason'?combo:id==='options'&&expanded?{querySelectorAll:()=>[item]}:null,querySelector:()=>null};
 const run=runInNewContext(`${waitSource}
${comboSource}
selectComboElement`,{
 document,Date:{now:()=>time},sleep:async ms=>{time+=ms;},clean:x=>String(x??'').trim(),
 MouseEvent:class{},KeyboardEvent:class{constructor(_type,props){Object.assign(this,props);}},window:{},pageLog(){}
 });
 return {run:()=>run(combo,'Correct reason','TQA1 Additional Information'),keyOpens:()=>keyOpens,clicks:()=>clicks,expanded:()=>expanded};
}
test('opens reason dropdown by keyboard when React ignores mouse event',async()=>{
 const f=dropdownFixture();await f.run();assert.equal(f.keyOpens(),1);
});
test('does not proceed when the reason click fails to select the value',async()=>{
 const f=dropdownFixture(false);await assert.rejects(f.run(),/selection to appear/);
});

test('recognizes multi-select reason tag and closes its menu',async()=>{
 const f=dropdownFixture(true,true);await f.run();assert.equal(f.clicks(),1);assert.equal(f.expanded(),false);
});
test('retains already selected reason on resume without clicking again',async()=>{
 const f=dropdownFixture(true,true,true);await f.run();assert.equal(f.clicks(),0);assert.equal(f.keyOpens(),0);assert.equal(f.expanded(),false);
});

const lookupSource=source.slice(source.indexOf('  async function findCompletedObservation('),source.indexOf('  async function prepareFollowUp('));
test('completed lookup waits for asynchronously loaded search controls',async()=>{
 let time=0,clicked=false;
 const radios=[{}, {checked:false,click(){clicked=true;this.checked=true;}}];
 const combo={getAttribute:()=>'',dispatchEvent(){}};
 const row={textContent:'839450 R019 Completed',querySelector:selector=>({textContent:selector.includes('JobNo')?'839450':selector.includes('TechID')?'R019':'Completed'}),querySelectorAll:()=>[{href:'https://example.test/observation?id=8432353',getAttribute:()=> 'view',querySelector:()=>true}]};
 const document={querySelector:()=>({querySelectorAll:()=>[{textContent:'Dmytro Maleiko',click(){}}]}),querySelectorAll:selector=>selector.includes('radio')?(time>=800?radios:[]):selector.includes('combobox')?[combo]:selector.includes('ag-row')?[row]:[]};
 const lookup=runInNewContext(`${waitSource}\n${lookupSource}\nfindCompletedObservation`,{document,location:{pathname:'/TechOps/observations',href:'https://example.test/observations'},Date:{now:()=>time},sleep:async ms=>{time+=ms;},visible:()=>true,clean:x=>String(x??'').trim(),nativeValue(){},KeyboardEvent:class{},URL});
 const result=await lookup('839450','Dmytro Maleiko','R019');assert.equal(result.observationId,'8432353');assert.equal(clicked,true);assert.equal(time,800);
});

test('selects both reasons in a single TQA row and counts one failed category',async()=>{
 const f=fixture(true);
 const result=await f.run([{code:'TQA1',reason:'Correct reason'},{code:'TQA1',reason:'Second reason'}]);
 assert.deepEqual(f.selectedReasons(),['Correct reason','Second reason']);
 assert.equal(result.notDisplayed,1);assert.equal(result.displayed,6);
});
