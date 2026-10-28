'use client';
import {useEffect,useState,type FormEvent} from 'react';
export default function LoginPage(){
 const [login,setLogin]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[checking,setChecking]=useState(true);
 useEffect(()=>{
  const controller=new AbortController();
  void fetch('/api/login'+location.search,{cache:'no-store',signal:controller.signal}).then(async response=>{
   if(!response.ok)return;
   const data=await response.json() as {destination:string};location.replace(data.destination);
  }).catch(()=>{}).finally(()=>{if(!controller.signal.aborted)setChecking(false);});
  return()=>controller.abort();
 },[]);
 async function submit(event:FormEvent){
  event.preventDefault();setBusy(true);setError('');
  try{
   const response=await fetch('/api/login'+location.search,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login,password})});
   const data=await response.json() as {role?:string;destination?:string;error?:string};
   if(!response.ok||!data.destination)throw Error(data.error||'Could not sign in.');
   if(data.role==='technician'){try{sessionStorage.setItem('tqa-permission-setup','1');}catch{}}
   location.replace(data.destination);
  }catch(cause){setError((cause as Error).message);setBusy(false);}
 }
 if(checking)return <main className="management-page login-dark"><div className="tech-access-loading"><p>Checking your sign in…</p></div></main>;
 return <main className="management-page login-dark"><div className="management-head"><span className="kicker">TQA AUTOMATIC UPLOAD</span><h1>Sign in</h1><p>One sign-in for technicians, supervisors, and super admin. Use your login ID and PIN or password.</p></div><form className="management-card profile-login" onSubmit={submit}><label>Login ID<input type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} value={login} onChange={e=>setLogin(e.target.value)} maxLength={254} required/></label><label>PIN or password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} maxLength={1024} required/></label>{error&&<p className="form-error" role="alert">{error}</p>}<button className="button dark" disabled={busy}>{busy?'Signing in…':'Sign in'}</button></form></main>;
}
