"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, UserX, UsersRound } from "lucide-react";
import AdminShell from "@/app/admin-shell";
import TrustIntegrationSettings from "@/app/settings/trust-integration-settings";

type Technician = { techId: string; qcCount: number; hasPin: number; isAdmin: boolean; pin: string | null; state: "active" | "disabled" };

export default function TechnicianSettings() {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [techId, setTechId] = useState("");
  const [issued, setIssued] = useState<{ techId: string; pin: string } | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [confirmTechId, setConfirmTechId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [disableBusy, setDisableBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [section, setSection] = useState<"technicians" | "api">("technicians");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const sync = () => setSection(location.hash === "#api-settings" ? "api" : "technicians");
    sync(); window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const visibleTechnicians = technicians.filter(tech => tech.techId.toLowerCase().includes(search.trim().toLowerCase())).sort((a,b) => Number(a.state === "disabled") - Number(b.state === "disabled") || a.techId.localeCompare(b.techId, undefined, {numeric:true}));
  async function copyLogin(tech: Technician) {
    try {
      await navigator.clipboard.writeText(`TQA Automatic Upload\n${location.origin}/login\nTech ID: ${tech.techId}\nPIN: ${tech.pin}`);
      setNotice(`Login details copied for Tech ${tech.techId}.`);
    } catch { setError("Could not copy. Copy the Tech ID and PIN shown below manually."); }
  }

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

  async function disableTechnician(id: string) {
    setDisableBusy(id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/technicians/${encodeURIComponent(id)}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not disable this technician.");
      setConfirmTechId(null); setConfirmation(""); setIssued(null);
      await load(); setNotice(`Tech ${id} was disabled. Their QC records and pictures were kept.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not disable this technician."); await load().catch(() => undefined); }
    finally { setDisableBusy(null); }
  }

  return <AdminShell active="settings">
    <section className="intro"><div><h1>Settings</h1><p>Manage technicians and the Catalyst extension.</p></div></section>
    <nav className="settings-tabs" aria-label="Settings sections"><button type="button" aria-pressed={section === "technicians"} onClick={() => { location.hash = "technicians-settings"; setSection("technicians"); }}>Technicians</button><button type="button" aria-pressed={section === "api"} onClick={() => { location.hash = "api-settings"; setSection("api"); }}>API and documentation</button></nav>
    <div className="admin-page-content settings-page">
    <div className="settings-content">
    <div hidden={section !== "technicians"}>
      <section id="technicians-settings" className="qc-pin-panel settings-panel"><div className="settings-section-title"><KeyRound size={21}/><h2>Add, reactivate, or reset PIN</h2></div><p>Enter a Tech ID to issue a private 5-digit PIN. Resetting a PIN signs out that technician’s current sessions. Reactivating a disabled Tech ID keeps its existing QC history.</p><form onSubmit={issuePin}><input aria-label="Tech ID for PIN" placeholder="Tech ID" value={techId} maxLength={32} onChange={(event) => setTechId(event.target.value.toUpperCase())} required/><button className="button dark" disabled={pinBusy}>{pinBusy ? "Issuing…" : "Issue / reset PIN"}</button></form>{issued && <div className="issued-pin" role="status"><strong>Private PIN for Tech {issued.techId}</strong><span>{issued.pin}</span><p>This PIN is also shown in the technician list below whenever you open Settings.</p></div>}</section>
      <section className="qc-pin-panel settings-panel"><div className="settings-section-title"><UsersRound size={21}/><h2>Technicians</h2></div><p>Disabling a technician prevents login and new submissions while keeping their QC records and pictures. Issue a new PIN to reactivate the same Tech ID. Every submitted QC is retained for at least three full months.</p><label className="settings-tech-search">Find a technician<input type="search" placeholder="Search Tech ID" value={search} onChange={e => setSearch(e.target.value)}/></label>{loading ? <p>Loading technicians…</p> : visibleTechnicians.length ? <div className="qc-tech-rows">{visibleTechnicians.map((tech) => <div className="qc-tech-manage-row" key={tech.techId}><div><strong>Tech {tech.techId}{tech.isAdmin ? " · Admin" : ""}</strong><small>{tech.state === "disabled" ? `Disabled · ${tech.qcCount} QCs this month` : `${tech.qcCount} QCs this month · ${tech.hasPin ? "PIN active" : "No profile PIN"}`}</small>{tech.state === "active" && tech.pin && <span className="qc-tech-pin">Private PIN <strong>{tech.pin}</strong></span>}{tech.state === "active" && tech.hasPin && !tech.pin && <span className="qc-tech-legacy">Previous PIN cannot be displayed. Reset it to issue a visible 5-digit PIN.</span>}</div><div className="qc-tech-manage-actions">{tech.state === "active" && tech.pin && <button type="button" className="button light" onClick={() => void copyLogin(tech)}><Copy size={16}/>Copy login</button>}{!tech.isAdmin && <button type="button" className="button light" disabled={pinBusy || !!disableBusy} onClick={() => void issuePin(undefined, tech.techId)}><KeyRound size={16}/>{tech.state === "disabled" ? "Reactivate" : tech.pin ? "Reset PIN" : "Issue 5-digit PIN"}</button>}{tech.state === "active" && !tech.isAdmin && <button type="button" className="button light qc-remove-button" disabled={pinBusy || !!disableBusy} onClick={() => { setConfirmTechId(tech.techId); setConfirmation(""); }}><UserX size={16}/>Disable</button>}</div></div>)}</div> : <p>{search ? "No technicians match your search." : "No technicians yet."}</p>}{confirmTechId && <div className="qc-delete-confirm"><strong>Disable Tech {confirmTechId}?</strong><p>They will be signed out and unable to submit new QCs. Their QC records and pictures will be kept. Type the Tech ID to confirm.</p><input aria-label="Confirm Tech ID to disable" autoComplete="off" placeholder={confirmTechId} value={confirmation} onChange={(event) => setConfirmation(event.target.value.toUpperCase())}/><div><button type="button" className="button light" onClick={() => { setConfirmTechId(null); setConfirmation(""); }} disabled={!!disableBusy}>Cancel</button><button type="button" className="button danger" disabled={confirmation !== confirmTechId || !!disableBusy} onClick={() => void disableTechnician(confirmTechId)}>{disableBusy ? "Disabling…" : "Disable technician"}</button></div></div>}</section>
      </div>
      <div hidden={section !== "api"}><TrustIntegrationSettings/></div>
      {notice && <p className="qc-notice" role="status">{notice}</p>}{error && <p className="form-error" role="alert">{error}</p>}
    </div>
    </div>
  </AdminShell>;
}
