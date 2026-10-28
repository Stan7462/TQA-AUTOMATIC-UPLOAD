import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {runInNewContext} from 'node:vm';
import {resolve} from 'node:path';

const {outputFiles}=await build({entryPoints:['app/capture/permission-setup.tsx'],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react/jsx-runtime','lucide-react'],plugins:[{name:'notification-test',setup(b){
 b.onResolve({filter:/^@\/lib\//},args=>args.path.endsWith('onesignal-client')?{path:'sdk',namespace:'fixture'}:{path:resolve(args.path.slice(2)+'.ts')});
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const loadOneSignal=async()=>globalThis.fixture.sdk; export const pushOriginSupported=()=>globalThis.fixture.https; export const reportPushDevice=async(_sdk,activate)=>{globalThis.fixture.reports.push(activate);return !!activate;};'}));
}}]});
function fixture({storage=new Map(),permission='default',allow=true,https=true,storageBlocked=false}={}){
 let cursor=0,effects=[],hooks=[];
 const f={https,requests:0,reports:[],cameraCalls:0,locationCalls:0};
 f.sdk={login:async()=>{},Notifications:{permission:permission==='granted',isPushSupported:()=>true,requestPermission:async()=>{f.requests++;f.sdk.Notifications.permission=allow;}},User:{PushSubscription:{id:'phone',optedIn:false,optIn:async()=>{f.sdk.User.PushSubscription.optedIn=true;}}}};
 const React={
  useState(initial){const i=cursor++;if(!(i in hooks))hooks[i]=initial;return [hooks[i],v=>{hooks[i]=typeof v==='function'?v(hooks[i]):v;}];},
  useRef(initial){const i=cursor++;return hooks[i]??(hooks[i]={current:initial});},
  useEffect(fn,deps){const i=cursor++;if(!hooks[i]||deps.some((v,j)=>v!==hooks[i][j])){hooks[i]=deps;effects.push(fn);}}
 };
 const module={exports:{}};
 const jsx=(type,props)=>type==='fragment'?props.children:({type,props});
 runInNewContext(outputFiles[0].text,{module,exports:module.exports,fixture:f,require(name){if(name==='react')return React;if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'fragment'};if(name==='lucide-react')return {};throw Error(name);},
  localStorage:{getItem:k=>{if(storageBlocked)throw Error('blocked');return storage.get(k);},setItem:(k,v)=>{if(storageBlocked)throw Error('blocked');storage.set(k,v);}},
  navigator:{userAgent:'Android',platform:'Linux',maxTouchPoints:0,mediaDevices:{getUserMedia:()=>{f.cameraCalls++;throw Error('Camera requested during onboarding');}},geolocation:{getCurrentPosition:()=>{f.locationCalls++;throw Error('Location requested during onboarding');}}},
  window:{matchMedia:()=>({matches:false})},Notification:{permission},fetch:async()=>({ok:true,json:async()=>({appId:'demo',account:{externalId:'a:TECH',enabled:true},configured:true,sendingEnabled:true})}),setTimeout
 });
 const props={techId:'TECH',tenantId:'a',children:'QC_WORKFLOW'};
 f.render=()=>{cursor=0;const tree=module.exports.default(props);for(const effect of effects.splice(0))effect();return tree;};
 f.setAccount=(tenantId,techId)=>Object.assign(props,{tenantId,techId});
 return f;
}
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
function buttons(node){if(!node||typeof node!=='object')return [];return [...(node.type==='button'?[node]:[]),...[node.props?.children].flat(2).flatMap(buttons)];}
async function ready(f){f.render();await flush();return f.render();}

test('opening setup never requests camera, location, or native notifications; skip persists across reopening',async()=>{
 const storage=new Map(),f=fixture({storage});
 const tree=await ready(f);assert.equal(f.requests,0);assert.equal(f.cameraCalls,0);assert.equal(f.locationCalls,0);
 const skip=buttons(tree).find(b=>String(b.props.children).includes('Not now'));assert(skip);skip.props.onClick();
 assert.equal(f.render(),'QC_WORKFLOW');
 const reopened=fixture({storage});assert.equal(await ready(reopened),'QC_WORKFLOW');assert.equal(reopened.requests,0);
});
test('enable asks only once and connects this phone; subsequent visits do not prompt',async()=>{
 const storage=new Map(),f=fixture({storage});const tree=await ready(f);
 const enable=buttons(tree).find(b=>b.props.className?.includes('setup-continue'));assert.equal(enable.props.disabled,false);
 enable.props.onClick();await flush();assert.equal(f.requests,1);assert.equal(f.render(),'QC_WORKFLOW');assert(f.reports.includes(true));
 const reopened=fixture({storage});assert.equal(await ready(reopened),'QC_WORKFLOW');assert.equal(reopened.requests,0);
});
test('denying or dismissing notifications does not block QCs or repeat on the next visit',async()=>{
 const storage=new Map(),f=fixture({storage,allow:false});const tree=await ready(f);
 buttons(tree).find(b=>b.props.className?.includes('setup-continue')).props.onClick();await flush();
 assert.equal(f.requests,1);assert.equal(f.render(),'QC_WORKFLOW');
 assert.equal(await ready(fixture({storage})),'QC_WORKFLOW');
});
test('blocked notifications and local HTTP previews can enter the QC workflow immediately',async()=>{
 for(const options of [{permission:'denied'},{https:false}]){const f=fixture(options);assert.equal(await ready(f),'QC_WORKFLOW');assert.equal(f.requests,0);}
});
test('prompt history is company scoped and storage failure still allows continuing',async()=>{
 const storage=new Map(),f=fixture({storage});buttons(await ready(f)).find(b=>String(b.props.children).includes('Not now')).props.onClick();
 const other=fixture({storage});other.setAccount('b','TECH');assert.notEqual(await ready(other),'QC_WORKFLOW');
 const blocked=fixture({storageBlocked:true});buttons(await ready(blocked)).find(b=>String(b.props.children).includes('Not now')).props.onClick();assert.equal(blocked.render(),'QC_WORKFLOW');
});
