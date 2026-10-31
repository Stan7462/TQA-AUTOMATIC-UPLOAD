import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const content=readFileSync(new URL('../chrome-extension/content.js',import.meta.url),'utf8');
const source=content.slice(content.indexOf('function rowData('),content.indexOf('function gridRows('));
const rowData=runInNewContext(`const clean=(value)=>String(value??'').replace(/\\s+/g,' ').trim();${source};rowData`);
const findSource=content.slice(content.indexOf('async function findJob('),content.indexOf('function detailValue('));
const cell=(text,attributes={})=>({textContent:text,getAttribute:name=>attributes[name]??null});
const row=(cells,href='')=>({
 querySelectorAll:()=>cells,
 querySelector:()=>href?{href}:null,
});

test('job search reads alternate Catalyst column identifiers',()=>{
 const parsed=rowData(row([
  cell('166900001',{'data-field':'internalJobId'}),
  cell('887947',{'data-column':'workOrderNumber'}),
  cell('7247',{'col-id':'technicianNumber'}),
 ]),'887947','7247');
 assert.deepEqual({...parsed},{jobId:'166900001',jobNumber:'887947',techId:'7247'});
});

test('job search recognizes the expected job and technician even when their columns move',()=>{
 const parsed=rowData(row([
  cell('166900002'),cell('7247'),cell('Some address'),cell('887947'),
 ]),'887947','7247');
 assert.deepEqual({...parsed},{jobId:'166900002',jobNumber:'887947',techId:'7247'});
});

test('job search can recover the Catalyst Job ID from a row link',()=>{
 const parsed=rowData(row([cell('Select'),cell('887947'),cell('7247')],'https://catalystqms.comcast.net/TechOps/observation/?jobid=166900003'),'887947','7247');
 assert.deepEqual({...parsed},{jobId:'166900003',jobNumber:'887947',techId:'7247'});
});

test('job search accepts an exact visible row when Catalyst omits its Rows counter',async()=>{
 const radios=[{checked:false},{checked:false,click(){this.checked=true;}},{checked:false}];
 const input={value:''};
 const search={textContent:'Search',click(){}};
 const context={
  location:{pathname:'/TechOps/jobs'},
  document:{
   body:{innerText:'Catalyst Jobs Pool'},
   querySelector:selector=>selector==='#job-no'?input:null,
   querySelectorAll:selector=>selector==="input[type='radio']"?radios:selector==='input'?[input]:[],
  },
  clean:value=>String(value??'').replace(/\s+/g,' ').trim(),
  buttons:()=>[search],visible:()=>true,pageLog(){},
  nativeValue:(field,value)=>{field.value=value;},
  gridRows:()=>[{jobId:'166900004',jobNumber:'887947',techId:'7247'}],
  waitFor:async(predicate,description)=>{const value=predicate();if(value)return value;throw new Error(`Timed out waiting for ${description}.`);},
 };
 const findJob=runInNewContext(`${findSource};findJob`,context);
 const result=await findJob('887947','7247');
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{rows:[{jobId:'166900004',jobNumber:'887947',techId:'7247'}],total:1});
 assert.equal(input.value,'887947');assert.equal(radios[1].checked,true);
});
