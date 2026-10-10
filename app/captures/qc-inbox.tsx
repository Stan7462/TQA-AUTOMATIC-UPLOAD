"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- vinext's client Link router currently throws in production; native links keep navigation reliable. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Expand, MapPin, X } from "lucide-react";
import AdminShell from "@/app/admin-shell";
import QcFilterBar from "@/app/qc-filter-bar";
import { useQcFilters } from "@/lib/use-qc-filters";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { fiscalMonthBounds, fiscalMonthKey } from "@/lib/fiscal-month";
type Attempt={id:string;attemptNumber:number;techId:string;jobNumber:string;address:string|null;screenshotId:string;photoIds:string[];status:string;submittedAt:number;reviewNote:string|null;trustUploadStatus:string;locationStatus:string|null;locationLatitude:number|null;locationLongitude:number|null;locationAccuracy:number|null;locationCapturedAt:number|null};
type Submission=Attempt&{rootSubmissionId:string;correctionPending:number;previousAttempts?:Attempt[]};
const reasons = [
  'Required tag(s) are missing.',
  'All TAP ports must be used or properly terminated.',
  'Photo is unclear. Retake a clear photo showing the required details.',
  'TAP photo is incomplete. Make sure all TAP ports are visible.',
  'Required house box is missing.',
  'Connectors are not properly crimped. Recrimp or replace them.',
  'Replace all old or black connectors.',
  'Required photo(s) are missing. Add them to the QC.',
  'Grounding or bonding attachment is incorrect. Fix the attachment.',
];
const rejectionClosing = 'Please correct this QC and submit new pictures within 72 hours.';

type FocusReviewCardProps={item:Submission;readOnly?:boolean;backHref?:string;note?:string;busy?:boolean;onNoteChange?:(value:string)=>void;onDecide?:(status:'approved'|'rejected')=>Promise<boolean>};
function FocusReviewCard({item,readOnly=false,backHref='/',note='',busy=false,onNoteChange,onDecide}:FocusReviewCardProps){
 const attempts=useMemo(()=>[...(item.previousAttempts??[]),item].sort((a,b)=>a.attemptNumber-b.attemptNumber),[item]);
 const [selectedAttempt,setSelectedAttempt]=useState(item.attemptNumber);
 const displayed=attempts.find(attempt=>attempt.attemptNumber===selectedAttempt)??item;
 const reviewingCurrent=displayed.attemptNumber===item.attemptNumber;
 const photos=[{id:displayed.screenshotId,label:'Account screenshot'},...displayed.photoIds.map((id,index)=>({id,label:`QC photo ${index+1}`}))];
 const [activePhoto,setActivePhoto]=useState(0);
 const [decisionEffect,setDecisionEffect]=useState<'approved'|'rejected'|null>(null);
 const selectPhoto=(index:number)=>setActivePhoto((index+photos.length)%photos.length);
 useEffect(()=>setActivePhoto(0),[selectedAttempt]);
 const location=displayed.locationStatus==='verified'&&displayed.locationLatitude!==null&&displayed.locationLongitude!==null;
 async function submitDecision(status:'approved'|'rejected'){
  if(readOnly||busy||decisionEffect||!onDecide)return;
  setDecisionEffect(status);
  const animationDelay=window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:1100;
  await new Promise(resolve=>setTimeout(resolve,animationDelay));
  const saved=await onDecide(status);
  if(!saved)setDecisionEffect(null);
 }
 const isUploaded=displayed.status==='approved'&&displayed.trustUploadStatus==='uploaded';
 const statusLabel=reviewingCurrent&&item.correctionPending===1?`Fixed · Attempt ${item.attemptNumber}`:isUploaded?'Uploaded to Catalyst':displayed.status==='pending'?'Needs review':displayed.status==='approved'?'Approved':`Rejected · Attempt ${displayed.attemptNumber}`;
 const statusClass=reviewingCurrent&&item.correctionPending===1?'correction-ready':isUploaded?'uploaded':displayed.status;
 return <article id={`qc-${item.id}`} className={`qc-submission-card qc-focus-review${readOnly?' is-readonly':''}${decisionEffect?` qc-decision-${decisionEffect}`:''}`} tabIndex={0} onKeyDown={event=>{
  if(event.target instanceof HTMLTextAreaElement||event.target instanceof HTMLSelectElement)return;
  if(event.key==='ArrowLeft'){event.preventDefault();selectPhoto(activePhoto-1);}
  if(event.key==='ArrowRight'){event.preventDefault();selectPhoto(activePhoto+1);}
 }}>
  <div className="qc-focus-layout">
   <section className="qc-focus-viewer" aria-label={`Pictures for job ${item.jobNumber}`} data-photo-gallery>
    <button type="button" className="qc-focus-main-photo" aria-label={`Enlarge ${photos[activePhoto].label} for job ${item.jobNumber}`}>
     <img src={`/api/captures/${photos[activePhoto].id}`} alt={photos[activePhoto].label}/>
     <span className="qc-focus-enlarge"><Expand size={17}/>Full screen</span>
    </button>
    <div className="qc-focus-photo-nav">
     <button type="button" aria-label="Previous picture" onClick={()=>selectPhoto(activePhoto-1)}><ChevronLeft size={20}/></button>
     <strong>{photos[activePhoto].label}</strong><span>{activePhoto+1} of {photos.length}</span>
     <button type="button" aria-label="Next picture" onClick={()=>selectPhoto(activePhoto+1)}><ChevronRight size={20}/></button>
    </div>
    <div className="qc-focus-thumbnails" aria-label="Choose a picture">
     {photos.map((photo,index)=><button type="button" className={index===activePhoto?'active':''} aria-pressed={index===activePhoto} aria-label={`Show ${photo.label}`} key={photo.id} onClick={()=>setActivePhoto(index)}><img src={`/api/captures/${photo.id}`} alt="" loading="lazy" data-photo-lightbox-ignore/><span>{index===0?'Account':index}</span></button>)}
    </div>
   </section>
   <aside className="qc-focus-details">
    {(readOnly||item.correctionPending===1)&&<a className="qc-focus-back" href={backHref}><ChevronLeft size={18}/>Back to All Data</a>}
    <div className="qc-focus-heading"><div><h3>Job {displayed.jobNumber}</h3><p>Tech {displayed.techId} · {new Date(displayed.submittedAt).toLocaleString()}</p></div><span className={`qc-status ${statusClass}`}>{statusLabel}</span></div>
    {attempts.length>1&&<div className="qc-attempt-tabs" aria-label="QC attempts">{attempts.map(attempt=><button type="button" key={attempt.attemptNumber} className={selectedAttempt===attempt.attemptNumber?'active':''} aria-pressed={selectedAttempt===attempt.attemptNumber} onClick={()=>setSelectedAttempt(attempt.attemptNumber)}>Attempt {attempt.attemptNumber}</button>)}</div>}
    <dl className="qc-focus-facts"><div className="qc-address-fact"><dt>Address</dt><dd>{displayed.address || "Address not detected"}</dd></div><div><dt>Pictures</dt><dd>{photos.length}</dd></div><div><dt>Current picture</dt><dd>{photos[activePhoto].label}</dd></div><div><dt>Location</dt><dd>{location?<a href={`https://www.google.com/maps?q=${displayed.locationLatitude},${displayed.locationLongitude}`} target="_blank" rel="noreferrer">Verified{displayed.locationAccuracy!==null?` · ±${Math.round(displayed.locationAccuracy)} m`:''}</a>:displayed.locationStatus==='unavailable'?'Unavailable':'Not recorded'}</dd></div></dl>
    {readOnly||!reviewingCurrent?<div className="qc-focus-readonly"><strong>{reviewingCurrent?'QC details':`Attempt ${displayed.attemptNumber}`}</strong><p>{displayed.status==='pending'?'This QC is waiting for supervisor review.':isUploaded?'This QC was uploaded to Catalyst.':displayed.status==='approved'?'This QC is approved and ready for Catalyst.':'This attempt was rejected.'}</p>{displayed.reviewNote&&<><strong>Review note</strong><p>{displayed.reviewNote}</p></>}</div>:<>
    <button className="button dark qc-focus-approve" disabled={busy||!!decisionEffect} onClick={()=>void submitDecision('approved')}><Check size={18}/>Approve QC</button>
    <label className="qc-focus-note">Rejection note<textarea aria-label={`Rejection note for job ${item.jobNumber}`} placeholder="Explain what needs fixing" value={note} maxLength={1000} onChange={event=>onNoteChange?.(event.target.value)}/></label>
    <label className="qc-reason-picker">Add a reason<select aria-label={`Add rejection reason for job ${item.jobNumber}`} value="" disabled={busy} onChange={event=>{
     const reason=event.target.value;if(!reason)return;
     const existing=note.trim();
     const withoutClosing=existing.endsWith(rejectionClosing)?existing.slice(0,-rejectionClosing.length).trim():existing;
     if(withoutClosing.includes(reason))return;
     const selected=[withoutClosing,reason].filter(Boolean).join(' ');
     onNoteChange?.(`${selected} ${rejectionClosing}`.trim().slice(0,1000));
    }}><option value="">Choose a reason…</option>{reasons.map(reason=><option key={reason} value={reason}>{reason}</option>)}</select></label>
    <button className="button light qc-focus-reject" disabled={busy||!!decisionEffect||!note.trim()} onClick={()=>void submitDecision('rejected')}><X size={18}/>Reject with note</button>
    </>}
    <small className="qc-focus-key-hint">Use the arrow keys or thumbnails to check every picture.</small>
   </aside>
  </div>
  {decisionEffect&&<div className={`qc-focus-decision-stamp ${decisionEffect}`} role="status" aria-live="polite"><span>{decisionEffect==='approved'?<Check size={58}/>:<X size={58}/>}</span><strong>{decisionEffect==='approved'?'QC approved':'QC rejected'}</strong></div>}
 </article>;
}
export default function QcInbox(){
 const {filters,setFilters,ready}=useQcFilters('tqa-approval-filters','pending');
 const [items,setItems]=useState<Submission[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [decisionBusy,setDecisionBusy]=useState<string|null>(null),[notes,setNotes]=useState<Record<string,string>>({});
 const [selected,setSelected]=useState(''),[readOnly,setReadOnly]=useState(false),[fixedReview,setFixedReview]=useState(false),[returnTo,setReturnTo]=useState('/');
 const generation=useRef(0);
 useEffect(()=>{const params=new URLSearchParams(location.search);setSelected(params.get('qc')||'');setReadOnly(params.get('readonly')==='1');setFixedReview(params.get('fixed')==='1');const requestedReturn=params.get('return');setReturnTo(requestedReturn?.startsWith('/')&&!requestedReturn.startsWith('//')?requestedReturn:'/');if(params.get('queue')==='pending'){setFilters({month:'',tech:'',status:'pending',search:''});history.replaceState(null,'','/captures');}},[setFilters]);
 const load=useCallback(async(signal?:AbortSignal)=>{
  const version=++generation.current;
  try{
   const id=new URLSearchParams(location.search).get('qc');
   const current=fiscalMonthBounds(fiscalMonthKey());
   let cursor:string|null=null;const found:Submission[]=[];
   do{const response: Response=await fetch(`/api/qc-submissions?status=all&pageSize=100&start=${current.start}&end=${current.end}${id?'&qc='+encodeURIComponent(id):''}${cursor?'&cursor='+encodeURIComponent(cursor):''}`,{cache:'no-store',signal});const data=await response.json() as {error?:string;submissions:Submission[];nextCursor:string|null};if(!response.ok)throw Error(data.error||'Could not load QCs.');found.push(...data.submissions);cursor=data.nextCursor;}while(cursor&&!signal?.aborted);
   if(!signal?.aborted&&generation.current===version){setItems(found);setError('');}
  }catch(cause){if(!signal?.aborted&&generation.current===version)setError(cause instanceof Error?cause.message:'Could not load QCs.');}
  finally{if(!signal?.aborted&&generation.current===version)setLoading(false);}
 },[]);
 useEffect(()=>{if(!ready)return;const controller=new AbortController();void load(controller.signal);return ()=>controller.abort();},[ready,load]);
 useAutoRefresh(load,ready&&!decisionBusy);
 async function decide(id:string,status:'approved'|'rejected'):Promise<boolean>{
  if(decisionBusy)return false;
  setDecisionBusy(id);setNotice('');setError('');++generation.current;
  try{const response: Response=await fetch(`/api/qc-submissions/${id}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,reviewNote:notes[id]||''})});const result=await response.json() as {error?:string};if(!response.ok)throw Error(result.error||'Could not save decision.');await load();setNotice(`Job ${items.find(q=>q.id===id)?.jobNumber || ''} ${status}.`);return true;}
  catch(cause){setError(cause instanceof Error?cause.message:'Could not save decision.');return false;}finally{setDecisionBusy(null);}
 }
 const visible=items.filter(q=>selected?q.id===selected:(!filters.tech||q.techId===filters.tech)&&(filters.status==='all'||(filters.status==='fixed'?q.status==='rejected'&&q.correctionPending===1:filters.status==='uploaded'?q.status==='approved'&&q.trustUploadStatus==='uploaded':filters.status==='approved'?q.status==='approved'&&q.trustUploadStatus!=='uploaded':q.status===filters.status))&&`${q.techId} ${q.jobNumber} ${q.address ?? ""}`.toLowerCase().includes(filters.search.trim().toLowerCase()));
 const groups=Object.entries(Object.groupBy(visible,q=>q.techId)).sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true}));
 return <AdminShell active={readOnly||fixedReview?'records':'approvals'}><section className="intro"><div><h1>{fixedReview?'Fixed QC review':readOnly?'QC details':'QC approvals'}</h1><p>{readOnly?'Review every picture and the saved QC information.':fixedReview?'Compare attempts, then approve the correction or reject it again.':'Check the pictures, then approve or leave a rejection note.'}</p></div>{selected&&!readOnly&&!fixedReview&&<a className="button light" href="/">Back to all data</a>}</section>
 <div className="admin-page-content qc-inbox">{selected?(readOnly||fixedReview)?null:<p className="qc-notice">Reviewing one job. <a href="/captures?queue=pending">Return to approval queue</a></p>:<QcFilterBar value={filters} onChange={setFilters} techIds={items.map(q=>q.techId)} currentMonthOnly/>}
 <div className="qc-inbox-content"><section className="qc-review-panel" aria-label="QC approval queue">
 {notice&&<p className="qc-notice" role="status">{notice}</p>}{error&&<p className="form-error" role="alert">{error}</p>}
 {loading||!ready?<p className="qc-empty">Loading QCs…</p>:!visible.length?<div className="qc-empty">{selected?'This QC is no longer available.':'No QCs match these filters.'}</div>:<div className="qc-submission-list">{groups.map(([techId,group])=><section className="qc-tech-group" key={techId}><h2>Tech {techId} <small>{group?.length} {group?.length === 1 ? "QC" : "QCs"}</small></h2>{group?.map(item=>readOnly?<FocusReviewCard key={item.id} item={item} readOnly backHref={returnTo}/>:item.status==='pending'||item.correctionPending===1?<FocusReviewCard key={item.id} item={item} backHref={returnTo} note={notes[item.id]||''} busy={!!decisionBusy} onNoteChange={value=>setNotes(current=>({...current,[item.id]:value}))} onDecide={status=>decide(item.id,status)}/>:<article id={`qc-${item.id}`} className="qc-approved-row" key={item.id}>
 <div className="qc-approved-meta"><strong>Job {item.jobNumber}</strong><span>{new Date(item.submittedAt).toLocaleString()}</span><span className={`qc-status ${item.status}`}>{item.status==='pending'?'Needs review':item.status==='approved'?'Approved':'Rejected'}</span>{item.status==='approved'&&<small>{item.trustUploadStatus==='uploaded'?'Uploaded to Catalyst':item.trustUploadStatus==='failed'?'Catalyst upload needs retry':'Ready for Catalyst'}</small>}{item.locationStatus==='verified'&&item.locationLatitude!==null&&item.locationLongitude!==null?<a className="qc-location-link" href={`https://www.google.com/maps?q=${item.locationLatitude},${item.locationLongitude}`} target="_blank" rel="noreferrer"><MapPin size={14}/>Location verified{item.locationAccuracy!==null?` · ±${Math.round(item.locationAccuracy)} m`:''}</a>:<span className="qc-location-missing"><MapPin size={14}/>{item.locationStatus==='unavailable'?'Location unavailable':'Location not recorded'}</span>}</div>
 <div className={`qc-unified-gallery${item.status!=='pending'?' compact':''}`} data-photo-gallery>{[{id:item.screenshotId,label:'Account screenshot'},...item.photoIds.map((id,i)=>({id,label:`QC photo ${i+1}`}))].map(p=><button type="button" key={p.id} aria-label={`Enlarge ${p.label} for job ${item.jobNumber}`}><img src={`/api/captures/${p.id}`} alt={p.label} loading="lazy"/><span>{p.label}</span></button>)}</div>
 {item.reviewNote&&<div className="profile-note"><strong>Review note</strong><p>{item.reviewNote}</p></div>}
 </article>)}</section>)}</div>}</section></div></div></AdminShell>;
}
