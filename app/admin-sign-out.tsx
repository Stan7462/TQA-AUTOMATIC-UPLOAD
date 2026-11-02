"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Use the existing server logout endpoint. */
import {useRef} from 'react';
import {LogOut} from 'lucide-react';

export default function AdminSignOut(){
 const dialog=useRef<HTMLDialogElement>(null);
 return <>
  <button type="button" className="admin-sign-out" aria-label="Sign out" title="Sign out" onClick={()=>dialog.current?.showModal()}><LogOut size={22} aria-hidden="true"/></button>
  <dialog ref={dialog} className="qc-reset-dialog" aria-labelledby="admin-sign-out-title" aria-describedby="admin-sign-out-description">
   <div className="qc-reset-icon" aria-hidden="true"><LogOut size={24}/></div>
   <h2 id="admin-sign-out-title">Sign out?</h2>
   <p id="admin-sign-out-description">You’ll need to sign in again to access your workspace.</p>
   <form method="dialog" className="qc-reset-actions">
    <button type="submit" className="button light" autoFocus>Cancel</button>
    <a href="/api/owner/logout" className="button dark">Sign out</a>
   </form>
  </dialog>
 </>;
}
