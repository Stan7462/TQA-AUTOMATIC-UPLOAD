"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, LockKeyhole } from "lucide-react";

type Rejected = { id: string; jobNumber: string; screenshotId: string; photoIds: string[]; submittedAt: number; reviewedAt: number | null; reviewNote: string | null };

export default function Profile() {
  const [techId, setTechId] = useState("");
  const [pin, setPin] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [rejected, setRejected] = useState<Rejected[]>([]);
  const [counts, setCounts] = useState<{ captured: number; uploaded: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    const response = await fetch("/api/profile", { cache: "no-store" });
    if (!response.ok) { setSignedIn(false); return; }
    const result = await response.json() as { techId: string; captured: number; uploaded: number; submissions: Rejected[] };
    setTechId(result.techId); setRejected(result.submissions); setCounts({ captured: result.captured, uploaded: result.uploaded }); setSignedIn(true);
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!signedIn) return;
    let controller: AbortController | null = null;
    async function refreshCounts() {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      try {
        const response = await fetch("/api/profile?count=1", { cache: "no-store", signal: current.signal });
        if (!response.ok) return;
        const result = await response.json() as { techId: string; captured: number; uploaded: number };
        if (!current.signal.aborted && result.techId === techId) setCounts({ captured: result.captured, uploaded: result.uploaded });
      } catch { /* Keep the last known counts until the next refresh. */ }
    }
    const interval = window.setInterval(() => void refreshCounts(), 30_000);
    const onFocus = () => void refreshCounts();
    const onVisible = () => { if (document.visibilityState === "visible") void refreshCounts(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => { controller?.abort(); window.clearInterval(interval); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVisible); };
  }, [signedIn, techId]);
  async function login(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/profile/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ techId, pin }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not sign in.");
      setPin(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not sign in."); }
    finally { setBusy(false); }
  }
  return <main className="management-page profile-page"><div className="management-head"><a href="/capture" className="back-link"><ArrowLeft size={18}/> New QC submission</a><span className="kicker">TQA AUTOMATIC UPLOAD</span><h1>My rejected QCs</h1><p>Review your failed QCs and the note explaining each decision.</p></div>
    {!signedIn ? <form className="management-card profile-login" onSubmit={login}><LockKeyhole size={28}/><h2>Technician sign in</h2><label>Tech ID<input value={techId} maxLength={32} autoComplete="username" onChange={(event) => setTechId(event.target.value.toUpperCase())} required /></label><label>Private 5-digit PIN<input value={pin} maxLength={8} inputMode="numeric" type="password" autoComplete="current-password" onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} required /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button dark" disabled={busy}>{busy ? "Signing in…" : "View my QCs"}</button></form> : <div className="profile-results"><p className="profile-identity">Tech ID {techId}</p><section className="qc-tech-counts" aria-label="My QC totals"><div><span>Captured QCs</span><strong>{counts?.captured ?? "—"}</strong><small>Submitted for review</small></div><div><span>Uploaded to Catalyst</span><strong>{counts?.uploaded ?? "—"}</strong><small>Successfully completed</small></div></section>{rejected.length === 0 ? <div className="qc-empty"><h2>No rejected QCs</h2></div> : rejected.map((item) => <article className="qc-submission-card" key={item.id}><div className="qc-submission-head"><div><span className="kicker">JOB {item.jobNumber || "—"}</span><h2>Rejected QC</h2><p>Submitted {new Date(item.submittedAt).toLocaleString()}</p></div><span className="qc-status rejected">Rejected</span></div><div className="profile-note"><strong>Review note</strong><p>{item.reviewNote || "No note was saved for this earlier QC."}</p></div><div className="qc-review-images"><div className="qc-account-image"><h3>Account screenshot</h3><button type="button" className="photo-enlarge-button"><img src={`/api/captures/${item.screenshotId}`} alt="Account screenshot" loading="lazy"/></button></div><div className="qc-live-images"><h3>Live photos</h3><div>{item.photoIds.map((id, index) => <button type="button" className="photo-enlarge-button" key={id}><img src={`/api/captures/${id}`} alt={`QC photo ${index + 1}`} loading="lazy"/></button>)}</div></div></div></article>)}</div>}
  </main>;
}
