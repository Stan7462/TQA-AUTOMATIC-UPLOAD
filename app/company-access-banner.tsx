'use client';
import {useEffect,useState} from 'react';
export default function CompanyAccessBanner(){
 const [access,setAccess]=useState<{name:string;allowed:boolean;message:string;isSuperAdmin:boolean;kind:string}|null>(null);
 useEffect(()=>{const abort=new AbortController();void fetch('/api/company-access',{cache:'no-store',signal:abort.signal}).then(async response=>{if(response.ok)setAccess(await response.json());}).catch(()=>{});return()=>abort.abort();},[]);
 if(!access||(!access.isSuperAdmin&&access.allowed&&access.kind!=='demo'))return null;
 return <div role="status" style={{marginBottom:20,padding:'14px 18px',border:'1px solid #668c9b',borderRadius:12,background:'#17323e',color:'#d9edf2',display:'flex',justifyContent:'space-between',alignItems:'center',gap:16,flexWrap:'wrap'}}><div>{access.isSuperAdmin&&<><strong>Viewing as super admin · {access.name}</strong><small style={{display:'block',color:'#a9c6d2'}}>Company access expires after 30 minutes. Your super admin session stays separate from company accounts.</small></>}{access.kind==='demo'&&<div>Demo company · sample data · live Catalyst uploads disabled</div>}{!access.allowed&&<div>{access.message}</div>}</div>{access.isSuperAdmin&&<form action="/api/super-admin/leave" method="post"><button className="button light">Back to super admin</button></form>}</div>;
}
