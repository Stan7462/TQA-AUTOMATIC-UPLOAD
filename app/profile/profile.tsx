"use client";
import QcFeedbackStatus from "@/app/qc-feedback-status";
import CompanyAccessBanner from "@/app/company-access-banner";
import FailedQcUploadBadge from "@/app/failed-qc-upload-badge";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, LockKeyhole, RotateCcw } from "lucide-react";
import { readQcDraft, writeQcDraft } from "@/lib/qc-draft";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { fiscalMonthBounds, fiscalMonthKey } from "@/lib/fiscal-month";
type View='rejected'|'captured'|'uploaded'|'notes'|'all';
type Submission={id:string;jobNumber:string;address:string|null;screenshotId:string;photoIds:string[];submittedAt:number;reviewedAt:number|null;correctionDeadlineAt:number|null;reviewNote:string|null;feedbackAcknowledgedAt?:number|null;status:string;rejectionUploadMode?:string;trustUploadStatus:string;attemptNumber:number;correctionPending:number};
const titles={all:'All my QCs',notes:'Supervisor notes',rejected:'My rejected QCs',captured:'My captured QCs',uploaded:'Uploaded to Catalyst'};
function rejectionTimeLabel(deadlineAt:number,now:number){const hours=Math.ceil((deadlineAt-now)/(60*60*1000));return hours>0?`${hours}h left`:'Overdue';}
function cardDeadlineLabel(deadline:string){return deadline==='Overdue'?deadline:deadline.replace('h left',' hours left to fix');}
export default function Profile(){
 const [techId,setTechId]=useState(''),[pin,setPin]=useState(''),[view,setView]=useState<View>('rejected');
 const [signedIn,setSignedIn]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [items,setItems]=useState<Submission[]>([]),[needsCorrection,setNeedsCorrection]=useState(0);
 const [urgentRejectedAt,setUrgentRejectedAt]=useState<number|null>(null),[clock,setClock]=useState(()=>Date.now());
 const [acknowledging,setAcknowledging]=useState<string|null>(null),[feedbackError,setFeedbackError]=useState<{id:string;message:string}|null>(null);
 const [expanded,setExpanded]=useState<string|null>(null);
 const [redoTarget,setRedoTarget]=useState<Submission|null>(null);
 const [redoBusy,setRedoBusy]=useState(false);
 const [redoError,setRedoError]=useState('');
 const redoDialog=useRef<HTMLDialogElement>(null);
 const redoLock=useRef(false);
 useEffect(()=>{if(!loading&&expanded&&new URLSearchParams(location.search).get('qc')===expanded)document.getElementById(`qc-${expanded}`)?.scrollIntoView({block:'center'});},[loading,expanded]);
 useEffect(()=>{const timer=window.setInterval(()=>setClock(Date.now()),60000);return()=>window.clearInterval(timer);},[]);
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
     await writeQcDraft({techId,fiscalMonth:fiscalMonthKey(),submissionId:crypto.randomUUID(),redoSourceId:item.id,redoChanged:false,jobNumber:/^\d{1,6}$/.test(item.jobNumber)?item.jobNumber:'',address:item.address,screenshot:pictures[0],photos:pictures.slice(1),location:null,updatedAt:Date.now()});
     location.assign('/capture');
   }catch{
     const message='Could not load all pictures or save this QC. Your unfinished QC is unchanged. Please try again.';
     setRedoError(message);if(!replaceDraft)setError(message);
   }finally{redoLock.current=false;setRedoBusy(false);}
 }
 const load=useCallback(async(signal?:AbortSignal)=>{
  try{
   const selected=new URLSearchParams(location.search).get('view');const next:View=selected==='all'||selected==='captured'||selected==='uploaded'||selected==='notes'?selected:'rejected';setView(next);
   const range=fiscalMonthBounds(fiscalMonthKey());
   const target=new URLSearchParams(location.search).get('qc');
   const selectedNote=next==='notes'&&target?`&qc=${encodeURIComponent(target)}`:'';
   const response=await fetch(`/api/profile?view=${next}&start=${range.start}&end=${range.end}${selectedNote}`,{cache:'no-store',signal});
   if(response.status===401){setSignedIn(false);return;}
   if(!response.ok)throw Error('Could not load your QCs. Please try again.');
   const result=await response.json() as {techId:string;captured:number;rejected:number;uploaded:number;unreadFeedback:number;needsCorrection:number;urgentRejectedAt:number|null;submissions:Submission[]};
   if(!signal?.aborted){setTechId(result.techId);setNeedsCorrection(result.needsCorrection??0);setUrgentRejectedAt(result.urgentRejectedAt);setItems(next==='rejected'?[...result.submissions].sort((a,b)=>(a.correctionPending?Infinity:a.correctionDeadlineAt??Infinity)-(b.correctionPending?Infinity:b.correctionDeadlineAt??Infinity)):result.submissions);const target=new URLSearchParams(location.search).get('qc');if(target)setExpanded(target);else if(next==='notes'&&new URLSearchParams(location.search).get('unread')==='1')setExpanded(previous=>result.submissions.some(item=>item.id===previous)?previous:result.submissions.find(item=>!item.feedbackAcknowledgedAt)?.id??result.submissions[0]?.id??null);setSignedIn(true);setError('');}
  }catch(cause){if(!signal?.aborted)setError(cause instanceof Error?cause.message:'Could not load QCs.');}
  finally{if(!signal?.aborted)setLoading(false);}
 },[]);
 useEffect(()=>{const controller=new AbortController();void load(controller.signal);return ()=>controller.abort();},[load]);
 useAutoRefresh(load,signedIn&&!acknowledging);
 async function acknowledge(item:Submission){
  if(acknowledging)return;
  setAcknowledging(item.id);setFeedbackError(null);
  try{
   const response=await fetch(`/api/profile/feedback/${item.id}/acknowledge`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reviewedAt:Number(item.reviewedAt),reviewNote:item.reviewNote})});
   const result=await response.json() as {error?:string;feedbackAcknowledgedAt?:number};
   if(!response.ok){if(response.status===409)await load();throw Error(result.error||'Could not save acknowledgment.');}
   setItems(previous=>previous.map(note=>note.id===item.id?{...note,feedbackAcknowledgedAt:result.feedbackAcknowledgedAt}:note));
   await load();setExpanded(item.id);
  }catch(cause){setFeedbackError({id:item.id,message:cause instanceof Error?cause.message:'Could not save acknowledgment. Please try again.'});}
  finally{setAcknowledging(null);}
 }
 async function login(event:React.FormEvent){event.preventDefault();setBusy(true);setError('');try{const response=await fetch('/api/profile/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({techId,pin})});const result=await response.json() as {error?:string};if(!response.ok)throw Error(result.error||'Could not sign in.');setPin('');await load();}catch(cause){setError(cause instanceof Error?cause.message:'Could not sign in.');}finally{setBusy(false);}}
 return <main className="management-page profile-page profile-dark"><CompanyAccessBanner/><div className="management-head"><a href="/capture" className="back-link"><ArrowLeft size={18}/>Back to main menu</a><h1>{titles[view]}</h1><p>{view==='notes'?'Read your supervisor’s feedback and tap “I’ve read this.” Your QC stays approved.':view==='captured'?'QCs awaiting your supervisor’s review, including resubmitted corrections. Tap a row for details or a picture to enlarge it.':'Track your QCs. Tap a row for details or a picture to enlarge it.'}</p></div>
 <dialog ref={redoDialog} className="qc-reset-dialog" aria-labelledby="redo-title" aria-describedby="redo-description" onCancel={event=>{event.preventDefault();if(!redoBusy)setRedoTarget(null);}}>
 <h2 id="redo-title">Redo job {redoTarget?.jobNumber}?</h2>
 <p id="redo-description">This replaces your unfinished draft with this job’s existing photos and job number. You can remove or replace pictures before submitting.</p>
 <small>After you submit, it stays linked to the rejected QC as the next attempt.</small>
 {redoError&&<p className="form-error" role="alert">{redoError}</p>}
 <div className="qc-reset-actions"><button type="button" autoFocus className="button light" disabled={redoBusy} onClick={()=>setRedoTarget(null)}>Cancel</button><button type="button" className="button dark" disabled={redoBusy} onClick={()=>{if(redoTarget)void prepareRedo(redoTarget,true);}}>{redoBusy?'Starting…':'Redo QC'}</button></div>
 </dialog>
 {error&&<p className="form-error" role="alert">{error}</p>}
 {loading?<p role="status">Loading your QCs…</p>:!signedIn?<form className="management-card profile-login" onSubmit={login}><LockKeyhole/><h2>Sign in</h2><label>Tech ID<input value={techId} autoComplete="username" onChange={e=>setTechId(e.target.value.toUpperCase())} required/></label><label>Private PIN<input type="password" inputMode="numeric" autoComplete="current-password" maxLength={8} pattern="[0-9]{5}|[0-9]{8}" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))} required/></label><button className="button dark" disabled={busy}>Sign in</button></form>:<div className="profile-results"><p className="profile-identity">Tech {techId}</p>
 {view==='rejected'&&urgentRejectedAt!==null&&<section className="profile-deadline-banner"><strong>{needsCorrection} {needsCorrection===1?'QC needs':'QCs need'} attention</strong><p>{rejectionTimeLabel(urgentRejectedAt,clock)==='Overdue'?'Your nearest deadline has passed. Fix and resubmit the overdue QC now.':<>Your nearest deadline is in <b>{rejectionTimeLabel(urgentRejectedAt,clock).replace('h left',' hours')}</b>. Fix and resubmit rejected QCs before their timers expire.</>}</p></section>}
 {!items.length?<div className="qc-empty">{view==='notes'?'No supervisor notes yet.':view==='captured'?'No QCs are awaiting supervisor review.':'No QCs in this view yet.'}</div>:items.map(item=>{const label=item.correctionPending===1?`Supervisor reviewing · Attempt ${item.attemptNumber}`:item.status==='rejected'?'Rejected':item.trustUploadStatus==='uploaded'?'Uploaded to Catalyst':item.status==='approved'?(item.reviewNote?'Approved with feedback':'Approved'):'Supervisor reviewing';const deadline=item.status==='rejected'&&item.correctionPending===0&&item.correctionDeadlineAt?rejectionTimeLabel(item.correctionDeadlineAt,clock):null;const photos=[{id:item.screenshotId,label:'Account screenshot'},...item.photoIds.map((id,i)=>({id,label:`QC photo ${i+1}`}))];const gallery=<div className="qc-record-photos" data-photo-gallery>{photos.map(photo=><button key={photo.id} aria-label={`Enlarge ${photo.label} for job ${item.jobNumber}`}><img src={`/api/captures/${photo.id}`} alt={photo.label} loading="lazy"/></button>)}</div>;return <article className="profile-qc-row" id={`qc-${item.id}`} key={item.id}>
 <button className="profile-qc-toggle" aria-expanded={expanded===item.id} aria-controls={`details-${item.id}`} onClick={()=>setExpanded(expanded===item.id?null:item.id)}><span><strong>Job {item.jobNumber}</strong><small>{new Date(item.submittedAt).toLocaleDateString()}</small></span><span className="profile-qc-state">{deadline&&<span className={`qc-deadline${deadline==='Overdue'?' overdue':''}`}>{cardDeadlineLabel(deadline)}</span>}<span className={`qc-status ${item.status}`}>{label}</span><FailedQcUploadBadge {...item}/><QcFeedbackStatus {...item} technician/></span><ChevronDown size={17}/></button>
 {view!=='notes'&&gallery}
 {item.status==='rejected'&&item.correctionPending===0&&<div className="profile-redo-actions"><button type="button" className="button light" disabled={redoBusy} aria-label={`Redo QC for job ${item.jobNumber}`} onClick={()=>void prepareRedo(item)}><RotateCcw size={16}/>Redo QC</button><small>Keep pictures · replace the failed area with corrected photos</small></div>}
 {expanded===item.id&&<div id={`details-${item.id}`} className="profile-qc-details"><p>Submitted {new Date(item.submittedAt).toLocaleString()} · {photos.length} pictures</p>{item.reviewNote&&<div className="profile-note"><strong>{item.status==='rejected'?'Why this QC was rejected':'Supervisor feedback'}</strong><p>{item.reviewNote}</p>{item.status==='approved'&&<div className="qc-tech-feedback-actions">{item.feedbackAcknowledgedAt?<QcFeedbackStatus {...item} detailed technician/>:<><p className="qc-feedback-approved-hint">Your QC is approved. No redo is required.</p><button type="button" className="button light qc-feedback-acknowledge" disabled={acknowledging!==null} onClick={()=>void acknowledge(item)}>{acknowledging===item.id?'Saving…':"I’ve read this"}</button><small>Your supervisor will see your acknowledgment.</small></>}{feedbackError?.id===item.id&&<p className="form-error" role="alert">{feedbackError.message}</p>}</div>}</div>}{item.status==='pending'&&<p>Waiting for your supervisor’s review.</p>}{item.status==='approved'&&item.trustUploadStatus!=='uploaded'&&<p>{item.trustUploadStatus==='failed'?'Catalyst upload needs a retry.':'Approved and ready for Catalyst.'}</p>}</div>}
 {view==='notes'&&gallery}
 </article>;})}</div>}
 </main>;
}
