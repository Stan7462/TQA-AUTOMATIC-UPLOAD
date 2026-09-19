'use client';

import { useState } from 'react';

export default function LoginPage() {
  const [techId, setTechId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
      const result = await response.json() as { techId?: string; isAdmin?: boolean; error?: string };
      if (!response.ok || !result.techId) throw new Error(result.error || 'Could not sign in.');

      if (result.isAdmin) {
        const requested = new URLSearchParams(location.search).get('return_to');
        const destination = requested && (requested === '/' || requested === '/captures' || requested === '/settings' || /^\/records\/(?:all|approved|needs-review)$/.test(requested)) ? requested : '/';
        location.replace(destination);
      } else {
        location.replace('/capture');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign in.');
      setBusy(false);
    }
  }

  return <main className="management-page login-dark"><div className="management-head"><span className="kicker">TQA AUTOMATIC UPLOAD</span><h1>Sign in</h1><p>Enter the Tech ID and five-digit PIN you were given.</p></div><form className="management-card profile-login" onSubmit={submit}><label>Tech ID<input type="text" autoComplete="username" value={techId} onChange={(event) => setTechId(event.target.value.toUpperCase())} maxLength={32} required/></label><label>5-digit PIN<input type="password" inputMode="numeric" autoComplete="current-password" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))} maxLength={5} pattern="[0-9]{5}" required/></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button dark" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form></main>;
}
