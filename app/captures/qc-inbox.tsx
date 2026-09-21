"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, MapPin, X } from "lucide-react";
import Link from "next/link";
import AdminShell from "@/app/admin-shell";
import QcFilterBar from "@/app/qc-filter-bar";
import { useQcFilters } from "@/lib/use-qc-filters";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { fiscalMonthBounds, fiscalMonthKey } from "@/lib/fiscal-month";
type Submission={id:string;techId:string;jobNumber:string;screenshotId:string;photoIds:string[];status:string;submittedAt:number;reviewNote:string|null;trustUploadStatus:string;locationStatus:string|null;locationLatitude:number|null;locationLongitude:number|null;locationAccuracy:number|null;locationCapturedAt:number|null};
type Stat={techId:string;approved:number;rejected:number;pending:number};
const reasons = [
  'Job has been reviewed by another evaluator',
  'Missing tags',
  'All TAP ports need to be used or terminated',
  'Photo is unclear',
  'All old/black connectors need to be replaced',
  'Missing required photo/photos',
  'Improper grounding attachment/bonding',
];
export default function QcInbox(){
 const {filters,setFilters,ready}=useQcFilters('tqa-approval-filters','pending');
 const [items,setItems]=useState<Submission[]>([]),[stats,setStats]=useState<Stat[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [decisionBusy,setDecisionBusy]=useState<string|null>(null),[notes,setNotes]=useState<Record<string,string>>({});
 const [selected,setSelected]=useState(''),[underGoal,setUnderGoal]=useState(false);
 const generation=useRef(0);
 const statsMonth=fiscalMonthKey();
 useEffect(()=>{const params=new URLSearchParams(location.search);setSelected(params.get('qc')||'');if(params.get('queue')==='pending'){setFilters({month:'',tech:'',status:'pending',search:''});history.replaceState(null,'','/captures');}},[setFilters]);
 const load=useCallback(async(signal?:AbortSignal)=>{
  const version=++generation.current;
  try{
   const id=new URLSearchParams(location.search).get('qc');
   const current=fiscalMonthBounds(fiscalMonthKey());
   let cursor:string|null=null;const found:Submission[]=[];
   do{const response: Response=await fetch(`/api/qc-submissions?status=all&pageSize=100&start=${current.start}&end=${current.end}${id?'&qc='+encodeURIComponent(id):''}${cursor?'&cursor='+encodeURIComponent(cursor):''}`,{cache:'no-store',signal});const data=await response.json() as {error?:string;submissions:Submission[];nextCursor:string|null};if(!response.ok)throw Error(data.error||'Could not load QCs.');found.push(...data.submissions);cursor=data.nextCursor;}while(cursor&&!signal?.aborted);
   const {start,end}=fiscalMonthBounds(statsMonth);
   const response: Response=await fetch(`/api/qc-stats?start=${start}&end=${end}`,{cache:'no-store',signal});const data=await response.json() as {error?:string;technicians:Stat[]};if(!response.ok)throw Error(data.error||'Could not load totals.');
   if(!signal?.aborted&&generation.current===version){setItems(found);setStats(data.technicians);setError('');}
  }catch(cause){if(!signal?.aborted&&generation.current===version)setError(cause instanceof Error?cause.message:'Could not load QCs.');}
  finally{if(!signal?.aborted&&generation.current===version)setLoading(false);}
 },[statsMonth]);
 useEffect(()=>{if(!ready)return;const controller=new AbortController();void load(controller.signal);return ()=>controller.abort();},[ready,load]);
 useAutoRefresh(load,ready&&!decisionBusy);
 async function decide(id:string,status:'approved'|'rejected'){
  if(decisionBusy)return;
  setDecisionBusy(id);setNotice('');setError('');++generation.current;
  try{const response: Response=await fetch(`/api/qc-submissions/${id}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,reviewNote:notes[id]||''})});const result=await response.json() as {error?:string};if(!response.ok)throw Error(result.error||'Could not save decision.');await load();setNotice(`Job ${items.find(q=>q.id===id)?.jobNumber || ''} ${status}.`);}
  catch(cause){setError(cause instanceof Error?cause.message:'Could not save decision.');}finally{setDecisionBusy(null);}
 }
 const visible=items.filter(q=>selected?q.id===selected:(!filters.tech||q.techId===filters.tech)&&(filters.status==='all'||(filters.status==='uploaded'?q.status==='approved'&&q.trustUploadStatus==='uploaded':q.status===filters.status))&&`${q.techId} ${q.jobNumber}`.toLowerCase().includes(filters.search.trim().toLowerCase()));
 const groups=Object.entries(Object.groupBy(visible,q=>q.techId)).sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true}));
 const monthBounds=fiscalMonthBounds(statsMonth);
 return <AdminShell active="approvals"><section className="intro"><div><h1>QC approvals</h1><p>Check the pictures, then approve or leave a rejection note.</p></div>{selected&&<Link className="button light" href="/">Back to all data</Link>}</section>
 <div className="admin-page-content qc-inbox">{selected?<p className="qc-notice">Reviewing one job. <Link href="/captures?queue=pending">Return to approval queue</Link></p>:<QcFilterBar value={filters} onChange={setFilters} techIds={[...stats.map(s=>s.techId),...items.map(q=>q.techId)]} currentMonthOnly/>}
 <div className="qc-inbox-content"><section className="qc-review-panel" aria-label="QC approval queue">
 {notice&&<p className="qc-notice" role="status">{notice}</p>}{error&&<p className="form-error" role="alert">{error}</p>}
 {loading||!ready?<p className="qc-empty">Loading QCs…</p>:!visible.length?<div className="qc-empty">{selected?'This QC is no longer available.':'No QCs match these filters.'}</div>:<div className="qc-submission-list">{groups.map(([techId,group])=><section className="qc-tech-group" key={techId}><h2>Tech {techId} <small>{group?.length} {group?.length === 1 ? "QC" : "QCs"}</small></h2>{group?.map(item=><article id={`qc-${item.id}`} className={item.status==='pending'?'qc-submission-card':'qc-approved-row'} key={item.id}>
 <div className="qc-approved-meta"><strong>Job {item.jobNumber}</strong><span>{new Date(item.submittedAt).toLocaleString()}</span><span className={`qc-status ${item.status}`}>{item.status==='pending'?'Needs review':item.status==='approved'?'Approved':'Rejected'}</span>{item.status==='approved'&&<small>{item.trustUploadStatus==='uploaded'?'Uploaded to Catalyst':item.trustUploadStatus==='failed'?'Catalyst upload needs retry':'Ready for Catalyst'}</small>}{item.locationStatus==='verified'&&item.locationLatitude!==null&&item.locationLongitude!==null?<a className="qc-location-link" href={`https://www.google.com/maps?q=${item.locationLatitude},${item.locationLongitude}`} target="_blank" rel="noreferrer"><MapPin size={14}/>Location verified{item.locationAccuracy!==null?` · ±${Math.round(item.locationAccuracy)} m`:''}</a>:<span className="qc-location-missing"><MapPin size={14}/>{item.locationStatus==='unavailable'?'Location unavailable':'Location not recorded'}</span>}</div>
 <div className={`qc-unified-gallery${item.status!=='pending'?' compact':''}`} data-photo-gallery>{[{id:item.screenshotId,label:'Account screenshot'},...item.photoIds.map((id,i)=>({id,label:`QC photo ${i+1}`}))].map(p=><button type="button" key={p.id} aria-label={`Enlarge ${p.label} for job ${item.jobNumber}`}><img src={`/api/captures/${p.id}`} alt={p.label} loading="lazy"/><span>{p.label}</span></button>)}</div>
 {item.reviewNote&&<div className="profile-note"><strong>Review note</strong><p>{item.reviewNote}</p></div>}
 {item.status==='pending'&&<div className="qc-decision-panel"><button className="button dark" disabled={!!decisionBusy} onClick={()=>void decide(item.id,'approved')}><Check size={18}/>Approve QC</button><label>Rejection note<textarea aria-label={`Rejection note for job ${item.jobNumber}`} placeholder="Explain what needs fixing" value={notes[item.id]||''} maxLength={1000} onChange={e=>setNotes(current=>({...current,[item.id]:e.target.value}))}/></label><label className="qc-reason-picker">Add a reason<select aria-label={`Add rejection reason for job ${item.jobNumber}`} value="" disabled={!!decisionBusy} onChange={e=>{
  const reason=e.target.value;
  if(!reason)return;
  setNotes(current=>{
    const existing=(current[item.id]||'').trim();
    if(existing.split(';').map(part=>part.trim()).includes(reason))return current;
    return {...current,[item.id]:[existing,reason].filter(Boolean).join('; ').slice(0,1000)};
  });
}}><option value="">Choose a reason…</option>{reasons.map(reason=><option key={reason} value={reason}>{reason}</option>)}</select></label><button className="button light" disabled={!!decisionBusy||!notes[item.id]?.trim()} onClick={()=>void decide(item.id,'rejected')}><X size={18}/>Reject with note</button></div>}
 </article>)}</section>)}</div>}</section>
 <aside className="qc-dashboard" aria-label="Technician monthly progress"><h2>Current monthly progress</h2><p className="fiscal-period-label">{new Date(monthBounds.start).toLocaleDateString()} – {new Date(monthBounds.end-1).toLocaleDateString()}</p><label className="qc-goal-toggle"><input type="checkbox" checked={underGoal} onChange={e=>setUnderGoal(e.target.checked)}/>Under monthly goal</label><div className="qc-stats-list">{stats.filter(s=>!underGoal||s.approved<5).map(s=><div className="qc-stat-row" key={s.techId}><button className="qc-tech-filter" onClick={()=>{setFilters({...filters,tech:s.techId});if(selected){history.replaceState(null,'','/captures');setSelected('');void load();}}}>Tech {s.techId}</button><div className="qc-stat-counts"><span className={s.approved>=5?'goal-met':'goal-short'}>{s.approved} / 5 approved</span><small>{Math.max(0,5-s.approved)} remaining · {s.rejected} rejected</small></div></div>)}</div>{underGoal&&!stats.some(s=>s.approved<5)&&<p>All technicians have met the goal.</p>}</aside>
 </div></div></AdminShell>;
}
