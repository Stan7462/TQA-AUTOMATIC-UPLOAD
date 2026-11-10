"use client";
import { useRef, useState } from "react";
import { LockKeyhole, Trash2 } from "lucide-react";

type DeletableQc = { id:string;jobNumber:string;techId:string;trustUploadStatus:string;previousAttempts?:{trustUploadStatus:string}[] };
export default function QcDeleteButton({item,disabled,onDeleted}:{item:DeletableQc;disabled?:boolean;onDeleted:(message:string)=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const confirmed=[item,...(item.previousAttempts??[])].some(attempt=>attempt.trustUploadStatus==='uploaded');
  async function remove(){
    if(busy||confirmed)return;
    setBusy(true);setError('');
    try{
      const response=await fetch(`/api/qc-submissions/${item.id}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({permanent:true,jobNumber:item.jobNumber,techId:item.techId})});
      const result=await response.json() as {error?:string;photoCleanupPending?:boolean};
      if(!response.ok)throw Error(result.error||'Could not delete this QC.');
      dialog.current?.close();
      onDeleted(`Job ${item.jobNumber} permanently deleted.${result.photoCleanupPending?' Photo cleanup is pending and will retry automatically.':''}`);
    }catch(cause){setError(cause instanceof Error?cause.message:'Could not delete this QC.');}
    finally{setBusy(false);}
  }
  return <section className="qc-delete-section" aria-label="Delete QC">
    <button type="button" className="button light qc-delete-trigger" disabled={confirmed||disabled||busy} onClick={()=>{setError('');dialog.current?.showModal();}}><Trash2 size={16}/>Delete QC</button>
    {confirmed&&<small className="qc-delete-locked"><LockKeyhole size={13}/>Deletion is unavailable: this QC or an earlier attempt has a confirmed Catalyst upload.</small>}
    <dialog ref={dialog} className="qc-reset-dialog qc-delete-dialog" aria-labelledby={`delete-title-${item.id}`} aria-describedby={`delete-description-${item.id}`} onCancel={event=>{if(busy)event.preventDefault();}}>
      <div className="qc-reset-icon" aria-hidden="true"><Trash2 size={24}/></div>
      <h2 id={`delete-title-${item.id}`}>Permanently delete QC?</h2>
      <p><strong>Job {item.jobNumber} · Tech {item.techId}</strong></p>
      <p id={`delete-description-${item.id}`}>This permanently removes this QC, all its correction attempts, photos, and supervisor feedback. It cannot be restored.</p>
      <p>Stop any active extension upload for this QC before deleting. Files or observations already sent to Catalyst cannot be recalled.</p>
      <small>QCs with any confirmed Catalyst upload cannot be deleted.</small>
      {error&&<p className="form-error" role="alert">{error}</p>}
      <div className="qc-reset-actions"><button type="button" className="button light" autoFocus disabled={busy} onClick={()=>dialog.current?.close()}>Cancel</button><button type="button" className="button dark qc-delete-permanent" disabled={busy||confirmed} onClick={()=>void remove()}>{busy?'Deleting…':'Delete permanently'}</button></div>
    </dialog>
  </section>;
}
