"use client";
import {useState} from "react";
import {Pencil,LockKeyhole} from "lucide-react";
type Item={id:string;jobNumber:string;trustUploadStatus:string;previousAttempts?:{trustUploadStatus:string}[]};
export default function QcJobNumberEditor({item,disabled,onSaved}:{item:Item;disabled?:boolean;onSaved:(jobNumber:string)=>void}){
 const [editing,setEditing]=useState(false),[value,setValue]=useState(item.jobNumber),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const locked=[item,...(item.previousAttempts??[])].some(q=>q.trustUploadStatus==='uploaded');
 async function save(event:React.FormEvent){
  event.preventDefault();if(saving||locked||disabled)return;setSaving(true);setError('');
  try{
   const response=await fetch(`/api/qc-submissions/${item.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobNumber:value,expectedJobNumber:item.jobNumber})});
   const result=await response.json() as {jobNumber:string;error?:string};
   if(!response.ok)throw Error(result.error||'Could not change the job number.');
   onSaved(result.jobNumber);setEditing(false);
  }catch(cause){setError(cause instanceof Error?cause.message:'Could not change the job number.');}finally{setSaving(false);}
 }
 return <div className="qc-job-number-editor">
  <div className="qc-job-number-title"><h3>Job {item.jobNumber}</h3><button type="button" className="qc-job-edit-icon" aria-label={locked?'Job number locked after Catalyst upload':'Edit job number'} title={locked?'This QC or an earlier attempt has a confirmed Catalyst upload.':'Edit job number'} disabled={locked||disabled||saving} onClick={()=>{setValue(item.jobNumber);setError('');setEditing(true);}}>{locked?<LockKeyhole size={15}/>:<Pencil size={16}/>}</button></div>
  {editing&&<form className="qc-job-edit-form" onSubmit={event=>void save(event)}>
   <label>Correct job number<input autoFocus aria-label="Correct job number" type="text" inputMode="numeric" pattern="[0-9]{1,6}" maxLength={6} value={value} disabled={saving} onChange={event=>setValue(event.target.value.replace(/\D/g,''))}/></label>
   <small>Check the screenshot. Stop any active extension upload before saving. Approval stays unchanged; technicians won’t be notified.</small>
   <div><button type="submit" className="button dark" disabled={saving||disabled||locked||!/^\d{1,6}$/.test(value)}>{saving?'Saving…':'Save number'}</button><button type="button" className="button light" disabled={saving} onClick={()=>setEditing(false)}>Cancel</button></div>
   {error&&<p className="form-error" role="alert">{error}</p>}
  </form>}
 </div>;
}
