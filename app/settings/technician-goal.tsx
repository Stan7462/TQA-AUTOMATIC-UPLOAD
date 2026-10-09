"use client";
import { useEffect, useState } from "react";

export default function TechnicianGoal({ techId, monthlyGoal, onSaved }: { techId: string; monthlyGoal: number | null; onSaved: () => Promise<void> }) {
  const [value, setValue] = useState(monthlyGoal === null ? "" : String(monthlyGoal));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => setValue(monthlyGoal === null ? "" : String(monthlyGoal)), [monthlyGoal]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(""); setFailed(false);
    try {
      const response = await fetch(`/api/technicians/${encodeURIComponent(techId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ monthlyGoal: value === "" ? null : Number(value) }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not save goal.");
      await onSaved(); setMessage(value === "" ? "Using company goal" : "Goal saved");
    } catch (cause) { setFailed(true); setMessage(cause instanceof Error ? cause.message : "Could not save goal."); }
    finally { setBusy(false); }
  }
  return <form className="technician-goal-form" onSubmit={event => void save(event)}>
    <label>Monthly QC goal<input type="number" aria-label={`Monthly QC goal for Tech ${techId}`} min="1" max="99" step="1" inputMode="numeric" placeholder="Company goal" value={value} onChange={event => { setValue(event.target.value); setMessage(""); }} disabled={busy}/></label>
    <button className="button light" disabled={busy}>{busy ? "Saving…" : "Save goal"}</button>
    <small>Leave empty to use the company goal.</small>
    {message && <small role={failed ? "alert" : "status"}>{message}</small>}
  </form>;
}
