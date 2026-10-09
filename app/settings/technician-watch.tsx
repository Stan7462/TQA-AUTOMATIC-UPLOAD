"use client";
import { useState } from "react";
import { Bell, ChevronDown } from "lucide-react";
export default function TechnicianWatch({ techId, enabled, fixedEnabled, onSaved }: { techId: string; enabled: boolean; fixedEnabled: boolean; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  async function change(value: boolean, fixed = fixedEnabled) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/notifications/watch", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ techId, enabled: value, fixedEnabled: fixed }) });
      if (!response.ok) throw new Error("Could not save upload notifications.");
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save."); }
    finally { setBusy(false); }
  }
  return <div className="technician-watch"><button type="button" className="button light" aria-expanded={open} onClick={() => setOpen(!open)}><Bell size={16}/>Notification settings<ChevronDown size={16}/></button>{open && <div className="technician-watch-panel"><label><span>Notify when QC uploaded<small>Send me an alert when Tech {techId} submits a QC.</small></span><input type="checkbox" role="switch" aria-label={`Notify when Tech ${techId} uploads QC`} checked={enabled} disabled={busy} onChange={event => void change(event.target.checked)}/></label><label><span>Notify when QC fixed<small>Alert me when Tech {techId} resubmits a correction.</small></span><input type="checkbox" role="switch" aria-label={`Notify when Tech ${techId} fixes QC`} checked={fixedEnabled} disabled={busy} onChange={e=>void change(enabled,e.target.checked)}/></label><small>{busy ? "Saving…" : `Uploads ${enabled ? "on" : "off"} · Fixed QCs ${fixedEnabled ? "on" : "off"}`}</small>{error && <small role="alert">{error}</small>}</div>}</div>;
}
