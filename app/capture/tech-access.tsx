'use client';
import { useEffect, useState } from 'react';
import QcSubmission from './qc-submission';
export default function TechAccess() {
  const [techId, setTechId] = useState(''); const [entryId, setEntryId] = useState(''); const [pin, setPin] = useState('');
  const [adminSession, setAdminSession] = useState(false);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function check() {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch('/api/profile?count=1', { cache: 'no-store', signal: controller.signal });
      if (response.ok) {
        const data = await response.json() as { techId: string; isAdmin: boolean };
        if (data.isAdmin) setAdminSession(true);
        else setTechId(data.techId);
      } else if (response.status !== 401) {
        setError('Could not check technician access. Check your connection and try again.');
      }
    } catch {
      setError('Could not check technician access. Check your connection and try again.');
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }
  useEffect(() => { void check(); }, []);
  async function signIn(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/profile/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ techId: entryId, pin }) });
      const data = await response.json() as { error?: string; techId?: string; isAdmin?: boolean };
      if (!response.ok) throw new Error(data.error || 'Could not sign in');
      setPin('');
      if (data.isAdmin) { window.location.replace('/'); return; }
      if (!data.techId) throw new Error('Could not confirm your Tech ID.');
      setTechId(data.techId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not sign in'); }
    finally { setBusy(false); }
  }
  if (loading) return <main className="management-page login-dark"><div className="tech-access-loading"><p>Checking technician access…</p></div></main>;
  if (techId) return <QcSubmission signedInTechId={techId} />;
  return <main className="management-page profile-page login-dark"><div className="management-head tech-access-header"><div><span className="kicker">TQA AUTOMATIC UPLOAD</span><h1>Sign in</h1><p>Enter your Tech ID and PIN to continue.</p>{adminSession && <p>Admin session active. <a href="/">Back to admin</a></p>}</div></div><form className="management-card profile-login" onSubmit={signIn}><label>Tech ID<input value={entryId} maxLength={32} autoComplete="username" onChange={event => setEntryId(event.target.value.toUpperCase())} required /></label><label>5-digit PIN<input value={pin} maxLength={5} inputMode="numeric" type="password" autoComplete="current-password" onChange={event => setPin(event.target.value.replace(/\D/g, ''))} required /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button dark" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form></main>;
}
