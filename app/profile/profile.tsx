"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, LockKeyhole, RotateCcw } from "lucide-react";
import { readQcDraft, writeQcDraft } from "@/lib/qc-draft";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { fiscalMonthBounds, fiscalMonthKey } from "@/lib/fiscal-month";
type View='rejected'|'captured'|'uploaded';
type Submission={id:string;jobNumber:string;screenshotId:string;photoIds:string[];submittedAt:number;reviewNote:string|null;status:string;trustUploadStatus:string};
const titles={rejected:'My rejected QCs',captured:'My captured QCs',uploaded:'Uploaded to Catalyst'};
export default function Profile(){
 const [techId,setTechId]=useState(''),[pin,setPin]=useState(''),[view,setView]=useState<View>('rejected');
 const [signedIn,setSignedIn]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [items,setItems]=useState<Submission[]>([]),[counts,setCounts]=useState({captured:0,rejected:0,uploaded:0});
 const [expanded,setExpanded]=useState<string|null>(null);
 const [redoTarget,setRedoTarget]=useState<Submission|null>(null);
 const [redoBusy,setRedoBusy]=useState(false);
 const [redoError,setRedoError]=useState('');
 const redoDialog=useRef<HTMLDialogElement>(null);
 const redoLock=useRef(false);
 useEffect(()=>{
   if(!redoTarget||!redoDialog.current)return;
   const dialog=redoDialog.current;
   dialog.showModal();
   const previous=document.body.style.overflow;
   document.body.style.overflow='hidden';
   return ()=>{dialog.close();document.body.style.overflow=previous;};
 },[redoTarget]);
 async function prepareRedo(item:Submission,replaceDraft=false){
   if(redoLock.current||item.status!=='rejected')return;
   redoLock.current=true;setRedoBusy(true);setRedoError('');setError('');
   try{
     const draft=await readQcDraft(techId);
     if(!replaceDraft&&draft&&(draft.jobNumber||draft.screenshot||draft.photos.length)){
       setRedoTarget(item);return;
     }
     // Load every image before replacing the saved draft, so a failed download loses nothing.
     const pictures=await Promise.all([item.screenshotId,...item.photoIds].map(async id=>{
       const response=await fetch(`/api/captures/${encodeURIComponent(id)}`,{cache:'no-store',signal:AbortSignal.timeout(30000)});
       if(!response.ok)throw new Error('Photo unavailable');
       const blob=await response.blob();
       if(!blob.size||!blob.type.startsWith('image/'))throw new Error('Invalid photo');
       return blob;
     }));
     await writeQcDraft({techId,fiscalMonth:fiscalMonthKey(),submissionId:crypto.randomUUID(),redoSourceId:item.id,redoChanged:false,jobNumber:/^\d{1,6}$/.test(item.jobNumber)?item.jobNumber:'',screenshot:pictures[0],photos:pictures.slice(1),location:null,updatedAt:Date.now()});
     location.assign('/capture');
   }catch{
     const message='Could not load all pictures or save this QC. Your unfinished QC is unchanged. Please try again.';
     setRedoError(message);if(!replaceDraft)setError(message);
   }finally{redoLock.current=false;setRedoBusy(false);}
 }
 const load=useCallback(async(signal?:AbortSignal)=>{
  try{
   const selected=new URLSearchParams(location.search).get('view');const next:View=selected==='captured'||selected==='uploaded'?selected:'rejected';setView(next);
   const range=fiscalMonthBounds(fiscalMonthKey());
   const response=await fetch(`/api/profile?view=${next}&start=${range.start}&end=${range.end}`,{cache:'no-store',signal});
   if(response.status===401){setSignedIn(false);return;}
   if(!response.ok)throw Error('Could not load your QCs. Please try again.');
   const result=await response.json() as {techId:string;captured:number;rejected:number;uploaded:number;submissions:Submission[]};
   if(!signal?.aborted){setTechId(result.techId);setCounts(result);setItems(result.submissions);setSignedIn(true);setError('');}
  }catch(cause){if(!signal?.aborted)setError(cause instanceof Error?cause.message:'Could not load QCs.');}
  finally{if(!signal?.aborted)setLoading(false);}
 },[]);
 useEffect(()=>{const controller=new AbortController();void load(controller.signal);return ()=>controller.abort();},[load]);
 useAutoRefresh(load,signedIn);
 async function login(event:React.FormEvent){event.preventDefault();setBusy(true);setError('');try{const response=await fetch('/api/profile/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({techId,pin})});const result=await response.json() as {error?:string};if(!response.ok)throw Error(result.error||'Could not sign in.');setPin('');await load();}catch(cause){setError(cause instanceof Error?cause.message:'Could not sign in.');}finally{setBusy(false);}}
 return <main className="management-page profile-page profile-dark"><div className="management-head"><a href="/capture" className="back-link"><ArrowLeft size={18}/>New QC submission</a><h1>{titles[view]}</h1><p>Track your QCs. Tap a row for details or a picture to enlarge it.</p></div>
 <dialog ref={redoDialog} className="qc-reset-dialog" aria-labelledby="redo-title" aria-describedby="redo-description" onCancel={event=>{event.preventDefault();if(!redoBusy)setRedoTarget(null);}}>
 <h2 id="redo-title">Redo job {redoTarget?.jobNumber}?</h2>
 <p id="redo-description">This replaces your unfinished draft with this job’s existing photos and job number. You can remove or replace pictures before submitting.</p>
 <small>After you submit, this QC moves from Rejected to Captured.</small>
 {redoError&&<p className="form-error" role="alert">{redoError}</p>}
 <div className="qc-reset-actions"><button type="button" autoFocus className="button light" disabled={redoBusy} onClick={()=>setRedoTarget(null)}>Cancel</button><button type="button" className="button dark" disabled={redoBusy} onClick={()=>{if(redoTarget)void prepareRedo(redoTarget,true);}}>{redoBusy?'Starting…':'Redo QC'}</button></div>
 </dialog>
 {error&&<p className="form-error" role="alert">{error}</p>}
 {loading?<p role="status">Loading your QCs…</p>:!signedIn?<form className="management-card profile-login" onSubmit={login}><LockKeyhole/><h2>Sign in</h2><label>Tech ID<input value={techId} autoComplete="username" onChange={e=>setTechId(e.target.value.toUpperCase())} required/></label><label>Private PIN<input type="password" inputMode="numeric" autoComplete="current-password" maxLength={8} pattern="[0-9]{5}|[0-9]{8}" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))} required/></label><button className="button dark" disabled={busy}>Sign in</button></form>:<div className="profile-results"><p className="profile-identity">Tech {techId}</p><nav className="profile-view-links" aria-label="My QC lists">{(['rejected','captured','uploaded'] as View[]).map(v=><a key={v} href={`/profile?view=${v}`} className={view===v?'active':''} aria-label={`${v === 'uploaded' ? 'Uploaded to Catalyst' : v === 'captured' ? 'Captured' : 'Rejected'} ${counts[v]}`}>{v==='rejected'?'Rejected':v==='captured'?'Captured':'Uploaded'} <strong>{counts[v]}</strong></a>)}</nav>
 {!items.length?<div className="qc-empty">No QCs in this view yet.</div>:items.map(item=>{const label=item.status==='rejected'?'Rejected':item.trustUploadStatus==='uploaded'?'Uploaded to Catalyst':item.status==='approved'?'Approved':'Supervisor reviewing';const photos=[{id:item.screenshotId,label:'Account screenshot'},...item.photoIds.map((id,i)=>({id,label:`QC photo ${i+1}`}))];return <article className="profile-qc-row" key={item.id}>
 <button className="profile-qc-toggle" aria-expanded={expanded===item.id} aria-controls={`details-${item.id}`} onClick={()=>setExpanded(expanded===item.id?null:item.id)}><span><strong>Job {item.jobNumber}</strong><small>{new Date(item.submittedAt).toLocaleDateString()}</small></span><span className={`qc-status ${item.status}`}>{label}</span><ChevronDown size={17}/></button>
 <div className="qc-record-photos" data-photo-gallery>{photos.map(photo=><button key={photo.id} aria-label={`Enlarge ${photo.label} for job ${item.jobNumber}`}><img src={`/api/captures/${photo.id}`} alt={photo.label} loading="lazy"/></button>)}</div>
 {item.status==='rejected'&&<div className="profile-redo-actions"><button type="button" className="button light" disabled={redoBusy} aria-label={`Redo QC for job ${item.jobNumber}`} onClick={()=>void prepareRedo(item)}><RotateCcw size={16}/>Redo QC</button><small>Keep pictures · remove or retake what needs fixing</small></div>}
 {expanded===item.id&&<div id={`details-${item.id}`} className="profile-qc-details"><p>Submitted {new Date(item.submittedAt).toLocaleString()} · {photos.length} pictures</p>{item.reviewNote&&<div className="profile-note"><strong>{item.status==='rejected'?'Why this QC was rejected':'Review note'}</strong><p>{item.reviewNote}</p></div>}{item.status==='pending'&&<p>Waiting for your supervisor’s review.</p>}{item.status==='approved'&&item.trustUploadStatus!=='uploaded'&&<p>{item.trustUploadStatus==='failed'?'Catalyst upload needs a retry.':'Approved and ready for Catalyst.'}</p>}</div>}
 </article>;})}</div>}
 </main>;
}
