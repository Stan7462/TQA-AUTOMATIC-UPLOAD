"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Trash2, UsersRound } from "lucide-react";
import AdminShell from "@/app/admin-shell";
import TrustIntegrationSettings from "@/app/settings/trust-integration-settings";

type Technician = { techId: string; qcCount: number; hasPin: number; isAdmin: boolean; pin: string | null; state: "active" | "deleting" | "removed" };

export default function TechnicianSettings() {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [techId, setTechId] = useState("");
  const [issued, setIssued] = useState<{ techId: string; pin: string } | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [confirmTechId, setConfirmTechId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [deleteBusy, setDeleteBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/technicians", { cache: "no-store", signal });
    const result = await response.json() as { error?: string; technicians?: Technician[] };
    if (!response.ok) throw new Error(result.error || "Could not load technicians.");
    if (!signal?.aborted) setTechnicians(result.technicians ?? []);
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load technicians."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [load]);

  async function issuePin(event?: React.FormEvent, selectedTechId?: string) {
    event?.preventDefault(); setPinBusy(true); setError(""); setNotice(""); setIssued(null);
    try {
      const response = await fetch("/api/technicians", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ techId: selectedTechId ?? techId }) });
      const result = await response.json() as { error?: string; techId?: string; pin?: string };
      if (!response.ok || !result.techId || !result.pin) throw new Error(result.error || "Could not issue PIN.");
      setIssued({ techId: result.techId, pin: result.pin }); setTechId(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not issue PIN."); }
    finally { setPinBusy(false); }
  }

  async function removeTechnician(id: string) {
    setDeleteBusy(id); setError(""); setNotice("");
    try {
      for (let batch = 0; batch < 100; batch++) {
        const response = await fetch(`/api/technicians/${encodeURIComponent(id)}`, { method: "DELETE" });
        const result = await response.json() as { error?: string; complete?: boolean };
        if (!response.ok) throw new Error(result.error || "Could not remove this technician.");
        if (result.complete) {
          setConfirmTechId(null); setConfirmation(""); setIssued(null);
          await load(); setNotice(`Tech ${id} and all their QCs and photos were removed.`);
          return;
        }
      }
      throw new Error("Removal is still in progress. Select Resume removal to continue.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove this technician."); await load().catch(() => undefined); }
    finally { setDeleteBusy(null); }
  }

  return <AdminShell active="settings">
    <section className="intro"><div><small className="kicker">REVIEW WORKSPACE</small><h1>Settings</h1><p>Manage technicians and the Trust extension API.</p><nav className="settings-shortcuts" aria-label="Settings sections"><a href="#technicians-settings">Technicians</a><a href="#api-settings">API settings and documentation</a></nav></div></section>
    <div className="admin-page-content settings-page">
    <div className="settings-content">
      <section id="technicians-settings" className="qc-pin-panel settings-panel"><div className="settings-section-title"><KeyRound size={21}/><h2>Add technician or reset PIN</h2></div><p>Enter a Tech ID to issue a private 5-digit PIN. The current PIN stays visible below in Settings. Resetting a PIN signs out that technician’s current profile sessions. Re-adding a removed ID allows new uploads under that ID.</p><form onSubmit={issuePin}><input aria-label="Tech ID for PIN" placeholder="Tech ID" value={techId} maxLength={32} onChange={(event) => setTechId(event.target.value.toUpperCase())} required/><button className="button dark" disabled={pinBusy}>{pinBusy ? "Issuing…" : "Issue / reset PIN"}</button></form>{issued && <div className="issued-pin" role="status"><strong>Private PIN for Tech {issued.techId}</strong><span>{issued.pin}</span><p>This PIN is also shown in the technician list below whenever you open Settings.</p></div>}</section>
      <section className="qc-pin-panel settings-panel"><div className="settings-section-title"><UsersRound size={21}/><h2>Technicians</h2></div><p>Only active technicians appear here. Removing a technician permanently deletes their profile, QC records, screenshots, and live photos. Their Tech ID stays blocked until you issue a new PIN for it. The admin Tech ID cannot be removed.</p>{loading ? <p>Loading technicians…</p> : technicians.length ? <div className="qc-tech-rows">{technicians.map((tech) => <div className="qc-tech-manage-row" key={tech.techId}><div><strong>Tech {tech.techId}{tech.isAdmin ? " · Admin" : ""}</strong><small>{tech.state === "deleting" ? "Removal in progress" : `${tech.qcCount} QCs · ${tech.hasPin ? "PIN active" : "No profile PIN"}`}</small>{tech.state === "active" && tech.pin && <span className="qc-tech-pin">Private PIN <strong>{tech.pin}</strong></span>}{tech.state === "active" && tech.hasPin && !tech.pin && <span className="qc-tech-legacy">Previous PIN cannot be displayed. Reset it to issue a visible 5-digit PIN.</span>}</div><div className="qc-tech-manage-actions">{tech.state === "active" && !tech.isAdmin && <button type="button" className="button light" disabled={pinBusy || !!deleteBusy} onClick={() => void issuePin(undefined, tech.techId)}><KeyRound size={16}/>{tech.pin ? "Reset PIN" : "Issue 5-digit PIN"}</button>}{!tech.isAdmin && <button type="button" className="button light qc-remove-button" disabled={pinBusy || !!deleteBusy} onClick={() => { setConfirmTechId(tech.techId); setConfirmation(""); }}><Trash2 size={16}/>{tech.state === "deleting" ? "Resume removal" : "Remove"}</button>}</div></div>)}</div> : <p>No active technicians yet.</p>}{confirmTechId && <div className="qc-delete-confirm"><strong>Remove Tech {confirmTechId} permanently?</strong><p>All their QCs, notes, screenshots, live photos, PIN, and profile sessions will be deleted. Type the Tech ID to confirm.</p><input aria-label="Confirm Tech ID to remove" autoComplete="off" placeholder={confirmTechId} value={confirmation} onChange={(event) => setConfirmation(event.target.value.toUpperCase())}/><div><button type="button" className="button light" onClick={() => { setConfirmTechId(null); setConfirmation(""); }} disabled={!!deleteBusy}>Cancel</button><button type="button" className="button danger" disabled={confirmation !== confirmTechId || !!deleteBusy} onClick={() => void removeTechnician(confirmTechId)}>{deleteBusy ? "Removing…" : "Delete technician and data"}</button></div></div>}</section>
      <TrustIntegrationSettings/>
      {notice && <p className="qc-notice" role="status">{notice}</p>}{error && <p className="form-error" role="alert">{error}</p>}
    </div>
    </div>
  </AdminShell>;
}
