"use client";

import { useEffect, useState } from "react";
import { Target } from "lucide-react";
import NotificationSettings from "@/app/notifications/settings";

const DEFAULT_MONTHLY_QC_GOAL = 5;

function validGoal(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 99;
}

export default function MonthlyGoalSettings() {
  const [value, setValue] = useState(String(DEFAULT_MONTHLY_QC_GOAL));
  const [savedGoal, setSavedGoal] = useState(DEFAULT_MONTHLY_QC_GOAL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/monthly-qc-goal", { cache: "no-store", signal: controller.signal });
        const result = await response.json() as { monthlyGoal?: number; error?: string };
        if (!response.ok || !validGoal(result.monthlyGoal)) throw new Error(result.error || "Could not load the monthly QC goal.");
        if (!controller.signal.aborted) {
          setValue(String(result.monthlyGoal));
          setSavedGoal(result.monthlyGoal);
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load the monthly QC goal.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const monthlyGoal = Number(value);
    setError("");
    setNotice("");
    if (!validGoal(monthlyGoal)) {
      setError("Enter a whole number from 1 to 99 QCs.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/monthly-qc-goal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyGoal }),
      });
      const result = await response.json() as { monthlyGoal?: number; error?: string };
      if (!response.ok || !validGoal(result.monthlyGoal)) throw new Error(result.error || "Could not save the monthly QC goal.");
      setValue(String(result.monthlyGoal));
      setSavedGoal(result.monthlyGoal);
      setNotice(`Monthly goal saved: ${result.monthlyGoal} approved QCs per technician.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the monthly QC goal.");
    } finally {
      setSaving(false);
    }
  }

  return <section id="monthly-goal-settings" className="qc-pin-panel settings-panel monthly-goal-settings">
    <div className="settings-section-title"><Target size={21}/><h2>Monthly QC goal</h2></div>
    <p>Set the number of approved QCs each technician in your company is expected to complete during every fiscal month.</p>
    <form className="monthly-goal-form" onSubmit={(event) => void save(event)}>
      <label>Approved QCs required per technician<input aria-label="Approved QCs required per technician" type="number" min="1" max="99" step="1" inputMode="numeric" value={value} disabled={loading || saving} onChange={(event) => setValue(event.target.value)}/></label>
      <button className="button dark" disabled={loading || saving}>{saving ? "Saving…" : "Save goal"}</button>
    </form>
    <small>Current setting: <strong>{savedGoal}</strong> approved QCs per technician.</small>
    {notice && <p className="qc-notice" role="status">{notice}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <details className="notification-general"><summary>General notification settings</summary><NotificationSettings supervisor embedded/></details>
  </section>;
}
