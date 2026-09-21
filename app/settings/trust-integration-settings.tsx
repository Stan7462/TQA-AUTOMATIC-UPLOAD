"use client";

import { useEffect, useState } from "react";
import { BookOpen, Check, Copy, KeyRound, Trash2 } from "lucide-react";

type ApiKey = { id: string; label: string; tokenHint: string; createdAt: number; lastUsedAt: number | null };

export default function TrustIntegrationSettings() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [label, setLabel] = useState("Catalyst browser extension");
  const [newToken, setNewToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [documentation, setDocumentation] = useState("");
  const [docsOpen, setDocsOpen] = useState(false);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState("");
  const [copied, setCopied] = useState<"key" | "documentation" | "">("");

  async function load() {
    const response = await fetch("/api/integrations/trust/keys", { cache: "no-store" });
    const result = await response.json() as { keys?: ApiKey[]; error?: { message?: string } };
    if (!response.ok) throw new Error(result.error?.message || "Could not load extension keys.");
    setKeys(result.keys ?? []);
  }

  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load extension keys.")); }, []);

  async function createKey(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNewToken(""); setCopied("");
    try {
      const response = await fetch("/api/integrations/trust/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }) });
      const result = await response.json() as { token?: string; error?: { message?: string } };
      if (!response.ok || !result.token) throw new Error(result.error?.message || "Could not create extension key.");
      setNewToken(result.token);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create extension key."); }
    finally { setBusy(false); }
  }

  async function revokeKey(id: string) {
    if (!window.confirm("Revoke this extension key? The extension will stop accessing TQA until given a new key.")) return;
    setBusy(true); setError(""); setNewToken("");
    try {
      const response = await fetch(`/api/integrations/trust/keys/${id}`, { method: "DELETE" });
      const result = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message || "Could not revoke extension key.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not revoke extension key."); }
    finally { setBusy(false); }
  }

  async function loadDocumentation(): Promise<string> {
    if (documentation) return documentation;
    setDocsLoading(true); setDocsError("");
    try {
      const response = await fetch("/api/integrations/trust/documentation", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load API documentation.");
      const content = await response.text();
      setDocumentation(content);
      return content;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not load API documentation.";
      setDocsError(message);
      throw cause;
    } finally { setDocsLoading(false); }
  }

  async function toggleDocumentation() {
    if (docsOpen) { setDocsOpen(false); return; }
    try { await loadDocumentation(); setDocsOpen(true); } catch { /* The error is shown below. */ }
  }

  async function copyText(value: string, kind: "key" | "documentation") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
    } catch {
      if (kind === "key") setError("Copy failed. Select the key and copy it manually.");
      else setDocsError("Copy failed. Select the documentation and copy it manually.");
    }
  }

  async function copyDocumentation() {
    try { await copyText(await loadDocumentation(), "documentation"); }
    catch { /* The error is shown below. */ }
  }

  return <section id="api-settings" className="qc-pin-panel settings-panel trust-settings"><div className="settings-section-title"><KeyRound size={21}/><h2>API settings</h2></div>
    <p>Create a private key for the browser extension. It can read approved QCs and photos and report their Catalyst upload result. Keep the key inside the extension; you can revoke it here.</p>
    <h3>API keys</h3>
    <form onSubmit={(event) => void createKey(event)}><input aria-label="Extension key label" value={label} maxLength={80} onChange={(event) => setLabel(event.target.value)} required/><button className="button dark" disabled={busy}>Create API key</button></form>
    {newToken && <div className="issued-pin trust-new-token" role="status"><strong>Copy this key now. It will only be shown once.</strong><code>{newToken}</code><button type="button" className="button light" onClick={() => void copyText(newToken, "key")}>{copied === "key" ? <Check size={16}/> : <Copy size={16}/>}{copied === "key" ? "Copied" : "Copy key"}</button></div>}
    {keys.length > 0 && <div className="qc-tech-rows">{keys.map((key) => <div className="qc-tech-manage-row" key={key.id}><div><strong>{key.label}</strong><small>Key ending {key.tokenHint} · Created {new Date(key.createdAt).toLocaleDateString()}{key.lastUsedAt ? ` · Last used ${new Date(key.lastUsedAt).toLocaleString()}` : " · Never used"}</small></div><button type="button" className="button light qc-remove-button" disabled={busy} onClick={() => void revokeKey(key.id)}><Trash2 size={16}/>Revoke</button></div>)}</div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="trust-documentation"><div><div className="settings-section-title"><BookOpen size={21}/><h3>API documentation</h3></div><p>Full endpoint reference for the agent building your Catalyst extension. No private API key is included.</p></div><div className="trust-documentation-actions"><button type="button" className="button light" onClick={() => void toggleDocumentation()} disabled={docsLoading}><BookOpen size={16}/>{docsLoading ? "Loading…" : docsOpen ? "Hide documentation" : "View documentation"}</button><button type="button" className="button light" onClick={() => void copyDocumentation()} disabled={docsLoading}><Copy size={16}/>{copied === "documentation" ? "Copied" : "Copy all documentation"}</button></div>{docsError && <p className="form-error" role="alert">{docsError}</p>}{docsOpen && <pre className="trust-documentation-text" tabIndex={0} aria-label="Complete Catalyst extension API documentation">{documentation}</pre>}</div>
  </section>;
}
