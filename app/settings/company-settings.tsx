"use client";
import { useCallback, useEffect, useState } from "react";
import { Building2, Check, Copy, Eye, EyeOff, Power, PowerOff, Trash2 } from "lucide-react";

type Company = { id: string; name: string; adminTechId: string | null; credential: string | null; setupPending: boolean; active: boolean; technicianCount: number; qcCount: number; uploadedQcCount: number };
type IssuedCompany = { id: string; name: string; setupId: string; setupPin: string; loginUrl: string };

async function readApiResult<T>(response: Response, fallback: string): Promise<T> {
  try { return await response.json() as T; }
  catch { throw Error(fallback); }
}

export default function CompanySettings() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [name, setName] = useState("");
  const [issued, setIssued] = useState<IssuedCompany | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/companies", { cache: "no-store", signal });
    const result = await readApiResult<{ companies?: Company[]; error?: string }>(response, "The app could not load companies. Refresh and try again.");
    if (!response.ok) throw Error(result.error || "Could not load companies.");
    if (!signal?.aborted) setCompanies(result.companies ?? []);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load companies."); });
    return () => controller.abort();
  }, [load]);

  async function addCompany(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice(""); setIssued(null); setCopied(false);
    try {
      const response = await fetch("/api/companies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const result = await readApiResult<{ company?: IssuedCompany; error?: string }>(response, "The app could not create the company. Refresh and try again.");
      if (!response.ok || !result.company) throw Error(result.error || "Could not create the company.");
      setIssued(result.company); setName(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create the company."); }
    finally { setBusy(false); }
  }

  async function setCompanyActive(company: Company, active: boolean) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/companies/${encodeURIComponent(company.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active }) });
      const result = await readApiResult<{ error?: string }>(response, "The app could not update the company. Refresh and try again.");
      if (!response.ok) throw Error(result.error || "Could not update the company.");
      await load(); setNotice(`${company.name} was ${active ? "reactivated" : "disabled"}. Its saved information was kept.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update the company."); }
    finally { setBusy(false); }
  }

  async function copySetup() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(`TQA Automatic Upload — Company setup\nCompany: ${issued.name}\n\n1. Open the app: ${issued.loginUrl}\nTemporary setup ID: ${issued.setupId}\nTemporary PIN: ${issued.setupPin}\n\n2. Sign in once and create your permanent Admin ID and password.\n\n3. Install the Catalyst extension: ${location.origin}/extension\nSign into the extension with the same permanent Admin ID and password.`);
      setCopied(true);
    } catch { setError("Could not copy the setup details. Copy them manually below."); }
  }

  async function copyCompanyLogin(company: Company) {
    if (!company.adminTechId || !company.credential) return;
    try {
      await navigator.clipboard.writeText(`TQA Automatic Upload\nCompany: ${company.name}\nLogin: ${location.origin}/login\nAdmin ID: ${company.adminTechId}\nPassword: ${company.credential}\n\nInstall the Catalyst extension: ${location.origin}/extension\nSign into the extension with the same Admin ID and password.`);
      setNotice(`Login details copied for ${company.name}.`);
    } catch { setError("Could not copy these login details."); }
  }

  async function deleteCompany(company: Company) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/companies/${encodeURIComponent(company.id)}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: deleteConfirmation }) });
      const result = await readApiResult<{ error?: string }>(response, "The app could not delete the company. Refresh and try again.");
      if (!response.ok) throw Error(result.error || "Could not delete the company.");
      if (issued?.id === company.id) setIssued(null);
      setDeleteTarget(null); setDeleteConfirmation(""); await load(); setNotice(`${company.name} and all of its stored information were permanently deleted.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete the company."); }
    finally { setBusy(false); }
  }

  return <div id="companies-settings"><section className="qc-pin-panel settings-panel"><div className="settings-section-title"><Building2 size={21}/><h2>Add company</h2></div><p>Create the company, then send its one-time setup login to the supervisor. They will choose their permanent Admin ID and password after signing in.</p><form className="company-create-form" onSubmit={(event) => void addCompany(event)}><label>Company name<input value={name} maxLength={80} placeholder="Example Cable Services" onChange={(event) => setName(event.target.value)} required/></label><button className="button dark" disabled={busy}>{busy ? "Creating…" : "Create company"}</button></form>{issued && <div className="issued-pin company-issued" role="status"><strong>{issued.name} setup login</strong><span className="company-login-link">{issued.loginUrl}</span><p>Setup ID: <b>{issued.setupId}</b> · Temporary PIN: <b>{issued.setupPin}</b></p><button type="button" className="button light" onClick={() => void copySetup()}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? "Copied" : "Copy setup details"}</button></div>}</section><section className="qc-pin-panel settings-panel"><div className="settings-section-title"><Building2 size={21}/><h2>Companies</h2></div><p>Completed supervisor credentials are visible only here on the platform owner page.</p>{companies.length ? <div className="qc-tech-rows">{companies.map((company) => <div className="qc-tech-manage-row company-row" key={company.id}><div><strong>{company.name}</strong>{company.setupPending ? <small>Waiting for supervisor setup · ID {company.adminTechId} · PIN {company.credential}</small> : <><small>Admin ID {company.adminTechId || "not assigned"}</small>{company.credential && <span className="qc-tech-pin">Password <strong>{visiblePasswords[company.id] ? company.credential : "••••••••"}</strong> <button type="button" className="company-password-toggle" aria-label={visiblePasswords[company.id] ? "Hide password" : "Show password"} onClick={() => setVisiblePasswords((current) => ({ ...current, [company.id]: !current[company.id] }))}>{visiblePasswords[company.id] ? <EyeOff size={15}/> : <Eye size={15}/>}</button></span>}</>}<span>{company.technicianCount} technicians · {company.qcCount} QCs · {company.uploadedQcCount} uploaded to Catalyst · {company.active ? "Active" : "Disabled"}</span></div><div className="qc-tech-manage-actions">{!company.setupPending && company.credential && <button type="button" className="button light" onClick={() => void copyCompanyLogin(company)}><Copy size={16}/>Copy login</button>}{company.active ? <button type="button" className="button light qc-remove-button" disabled={busy} onClick={() => void setCompanyActive(company, false)}><PowerOff size={16}/>Disable</button> : <button type="button" className="button light" disabled={busy} onClick={() => void setCompanyActive(company, true)}><Power size={16}/>Reactivate</button>}<button type="button" className="button danger" disabled={busy} onClick={() => { setDeleteTarget(company); setDeleteConfirmation(""); setError(""); }}><Trash2 size={16}/>Delete</button></div>{deleteTarget?.id === company.id && <div className="qc-delete-confirm company-delete-confirm"><strong>Permanently delete {company.name}?</strong><p>This erases every administrator, technician, QC, picture, API key, and saved record for this company. This cannot be undone. Type the complete company name to confirm.</p><input aria-label={`Type ${company.name} to confirm company deletion`} autoComplete="off" placeholder={company.name} value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)}/><div><button type="button" className="button light" disabled={busy} onClick={() => { setDeleteTarget(null); setDeleteConfirmation(""); }}>Cancel</button><button type="button" className="button danger" disabled={busy || deleteConfirmation.trim() !== company.name} onClick={() => void deleteCompany(company)}>{busy ? "Deleting…" : "Delete permanently"}</button></div></div>}</div>)}</div> : <p>No customer companies yet.</p>}</section>{notice && <p className="qc-notice" role="status">{notice}</p>}{error && <p className="form-error" role="alert">{error}</p>}</div>;
}
