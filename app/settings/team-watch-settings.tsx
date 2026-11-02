"use client";
import {useEffect,useState} from 'react';
import {Bell} from 'lucide-react';
type Team={uploadEnabled:boolean;fixedEnabled:boolean;uploadMixed:boolean;fixedMixed:boolean};
export default function TeamWatchSettings({onSaved}:{onSaved?:()=>Promise<void>}){
 const [team,setTeam]=useState<Team|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{const controller=new AbortController();void fetch('/api/notifications/watch',{cache:'no-store',signal:controller.signal}).then(async response=>{if(!response.ok)throw Error('Could not load team submission alerts.');const result=await response.json() as {team:Team};if(!controller.signal.aborted)setTeam(result.team);}).catch(cause=>{if(!controller.signal.aborted)setError(cause.message);});return()=>controller.abort();},[]);
 async function save(event:'upload'|'fixed',enabled:boolean){
  setBusy(true);setError('');setNotice('');
  try{
   const response=await fetch('/api/notifications/watch',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope:'team',event,enabled})});
   if(!response.ok)throw Error('Could not save team submission alerts.');
   const refresh=await fetch('/api/notifications/watch',{cache:'no-store'});
   if(!refresh.ok)throw Error('Settings saved, but could not refresh them. Reopen Notifications to check.');
   setTeam((await refresh.json() as {team:Team}).team);
   setNotice(`${event==='upload'?'New QC':'Fixed QC'} alerts ${enabled?'enabled':'disabled'} for all supervisors and technicians. New technicians inherit this setting.`);
   await onSaved?.();
  }catch(cause){setError(cause instanceof Error?cause.message:'Could not save team submission alerts.');}
  finally{setBusy(false);}
 }
 return <div className="team-watch-settings"><div className="notification-section-head"><h3>Team submission alerts</h3><p>Apply to all supervisors and technicians in this company, including technicians added later. Changing a setting replaces individual choices for that alert. You can adjust individual technicians afterward.</p></div>{([['upload','Notify when QC uploaded','Alert supervisors when a technician submits a new QC to the app.','uploadEnabled','uploadMixed'],['fixed','Notify when QC fixed','Alert supervisors when a technician resubmits a correction for review.','fixedEnabled','fixedMixed']] as const).map(([event,label,description,key,mixed])=><div key={event}><label className="notification-option"><Bell size={20}/><span><strong>{label}</strong><small>{description}</small>{team?.[mixed]&&<small>Team default: {team[key]?'On':'Off'} · Some individual settings differ.</small>}</span><input type="checkbox" role="switch" aria-label={`Notify all supervisors when QC ${event==='upload'?'uploaded':'fixed'}`} checked={team?.[key]??false} disabled={busy||!team} onChange={e=>void save(event,e.target.checked)}/></label>{team?.[mixed]&&<button type="button" className="button light" disabled={busy} onClick={()=>void save(event,team[key])}>Apply {team[key]?'On':'Off'} to everyone for {event==='upload'?'new':'fixed'} QCs</button>}</div>)}<p>Supervisors must enable notifications on their device to receive alerts. “Uploaded” here means submitted to this app, not uploaded to Catalyst.</p>{busy&&<p role="status">Saving team submission alerts…</p>}{notice&&<p className="qc-notice" role="status">{notice}</p>}{error&&<p className="form-error" role="alert">{error}</p>}</div>;
}
