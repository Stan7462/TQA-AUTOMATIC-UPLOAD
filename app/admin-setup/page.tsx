"use client";

import { useState } from "react";

export default function AdminSetupPage() {
  const [adminId, setAdminId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/profile/admin-setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adminId, password }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw Error(result.error || "Could not finish setup.");
      location.replace("/");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not finish setup."); setBusy(false); }
  }

  return <main className="management-page login-dark"><div className="management-head"><span className="kicker">TQA AUTOMATIC UPLOAD</span><h1>Create your admin login</h1><p>Choose the login you will use for your company.</p></div><form className="management-card profile-login" onSubmit={(event) => void submit(event)}><label>Admin ID<input value={adminId} minLength={4} maxLength={32} autoComplete="username" placeholder="At least 4 characters" onChange={(event) => setAdminId(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))} required/><small>Use letters, numbers, underscores, or hyphens.</small></label><label>Password<input type="password" value={password} minLength={8} maxLength={72} autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} required/><small>At least 8 characters with a letter and a number.</small></label><label>Confirm password<input type="password" value={confirmPassword} minLength={8} maxLength={72} autoComplete="new-password" onChange={(event) => setConfirmPassword(event.target.value)} required/></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button dark" disabled={busy}>{busy ? "Saving…" : "Create admin login"}</button></form></main>;
}
