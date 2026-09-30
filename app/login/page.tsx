'use client';

import { useEffect, useState } from 'react';

export default function LoginPage() {
  const [techId, setTechId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const requested = new URLSearchParams(location.search).get('return_to');
    const adminDestination = requested && (requested === '/' || requested === '/captures' || requested === '/settings' || requested === '/history' || /^\/records\/(?:all|approved|needs-review)$/.test(requested)) ? requested : '/';
    void fetch('/api/profile?count=1', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) return;
        const result = await response.json() as { isAdmin?: boolean; requiresAdminSetup?: boolean };
        location.replace(result.requiresAdminSetup ? '/admin-setup' : result.isAdmin ? adminDestination : '/capture');
      })
      .catch(() => undefined)
      .finally(() => setCheckingSession(false));
    return () => controller.abort();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/profile/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ techId, pin }),
      });
      const result = await response.json() as { techId?: string; isAdmin?: boolean; requiresAdminSetup?: boolean; error?: string };
      if (!response.ok || !result.techId) throw new Error(result.error || 'Could not sign in.');

      if (result.requiresAdminSetup) {
        location.replace('/admin-setup');
      } else if (result.isAdmin) {
        const requested = new URLSearchParams(location.search).get('return_to');
        const destination = requested && (requested === '/' || requested === '/captures' || requested === '/settings' || /^\/records\/(?:all|approved|needs-review)$/.test(requested)) ? requested : '/';
        location.replace(destination);
      } else {
        sessionStorage.setItem('tqa-permission-setup', '1');
        location.replace('/capture');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign in.');
      setBusy(false);
    }
  }

  if (checkingSession) return <main className="management-page login-dark"><div className="tech-access-loading"><p>Checking your sign in…</p></div></main>;
  return <main className="management-page login-dark"><div className="management-head"><span className="kicker">TQA AUTOMATIC UPLOAD</span><h1>Sign in</h1><p>Technicians use their Tech ID and PIN. Supervisors use their Admin ID and password.</p></div><form className="management-card profile-login" onSubmit={submit}><label>Login ID<input type="text" autoComplete="username" value={techId} onChange={(event) => setTechId(event.target.value.toUpperCase())} maxLength={32} required/></label><label>PIN or password<input type="password" autoComplete="current-password" value={pin} onChange={(event) => setPin(event.target.value)} maxLength={72} required/></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button dark" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form></main>;
}
