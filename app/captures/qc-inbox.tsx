"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Inbox, X } from "lucide-react";
import AdminShell from "@/app/admin-shell";
import { fiscalMonthBounds, fiscalMonthKey } from "@/lib/fiscal-month";

type Status = "pending" | "approved" | "rejected";
type Submission = { id: string; techId: string; jobNumber: string; screenshotId: string; photoIds: string[]; status: Status; submittedAt: number; reviewedAt: number | null; reviewNote: string | null; trustUploadStatus: "ready" | "failed" | "uploaded" };
type Stat = { techId: string; submitted: number; approved: number; rejected: number; pending: number };
const filters: Array<{ value: "all" | Status; label: string }> = [{ value: "pending", label: "Needs approval" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }, { value: "all", label: "All QCs" }];
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function PhotoGallery({ item, compact = false }: { item: Submission; compact?: boolean }) {
  const photos = [{ id: item.screenshotId, label: "Account screenshot" }, ...item.photoIds.map((id, index) => ({ id, label: `QC photo ${index + 1}` }))];
  return <div className={compact ? "qc-unified-gallery compact" : "qc-unified-gallery"} aria-label={`Photos for job ${item.jobNumber || "unknown"}`}>
    {photos.map((photo) => <button key={photo.id} type="button" aria-label={`Enlarge ${photo.label.toLowerCase()} for job ${item.jobNumber || "unknown"}`} title={`Enlarge ${photo.label.toLowerCase()}`}><img src={`/api/captures/${photo.id}`} alt="" loading="lazy"/><span>{compact ? photo.label === "Account screenshot" ? "Account" : photo.label.replace("QC ", "") : photo.label}</span></button>)}
  </div>;
}

export default function QcInbox() {
  const [filter, setFilter] = useState<"all" | Status>("pending");
  const [month, setMonth] = useState(fiscalMonthKey);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [stats, setStats] = useState<Stat[]>([]);
  const [loading, setLoading] = useState(true);
  const [decisionBusy, setDecisionBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => { const status = new URLSearchParams(window.location.search).get("status"); if (status === "pending" || status === "approved" || status === "rejected") setFilter(status); }, []);
  const bounds = fiscalMonthBounds(month);
  const fiscalLabel = new Date(bounds.end - 1).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  const load = useCallback(async (signal?: AbortSignal) => {
    const { start, end } = fiscalMonthBounds(month);
    const range = `start=${start}&end=${end}`;
    let cursor: string | null = null;
    const found: Submission[] = [];
    do {
      const response: Response = await fetch(`/api/qc-submissions?status=${filter}&pageSize=100&${range}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store", signal });
      const result = await response.json() as { error?: string; submissions?: Submission[]; nextCursor?: string | null };
      if (!response.ok) throw new Error(result.error || "Could not load QCs.");
      found.push(...(result.submissions ?? [])); cursor = result.nextCursor ?? null;
    } while (cursor && !signal?.aborted);
    const response = await fetch(`/api/qc-stats?${range}`, { cache: "no-store", signal });
    const result = await response.json() as { error?: string; technicians?: Stat[] };
    if (!response.ok) throw new Error(result.error || "Could not load technician totals.");
    if (!signal?.aborted) { setSubmissions(found); setStats(result.technicians ?? []); }
  }, [filter, month]);
  useEffect(() => { const controller = new AbortController(); setLoading(true); setError(""); setSubmissions([]); void load(controller.signal).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load QCs."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [load]);
  const groups = useMemo(() => Object.entries(Object.groupBy(submissions, (item) => item.techId)).sort((a, b) => collator.compare(a[0], b[0])), [submissions]);
  const orderedStats = useMemo(() => [...stats].sort((a, b) => collator.compare(a.techId, b.techId)), [stats]);

  async function decide(id: string, status: "approved" | "rejected") {
    setDecisionBusy(id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/qc-submissions/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, reviewNote: notes[id] ?? "" }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not save the decision.");
      await load(); setNotice(`QC ${status}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the decision."); }
    finally { setDecisionBusy(null); }
  }

  return <AdminShell active="approvals">
    <section className="intro"><div><small className="kicker">REVIEW WORKSPACE</small><h1>QC approvals</h1><p>Review every photo together, then approve or reject with a note.</p></div></section>
    <div className="admin-page-content qc-inbox">
    <div className="qc-inbox-content">
      <section className="qc-review-panel" aria-labelledby="qc-review-panel-title"><div className="qc-review-panel-head"><h2 id="qc-review-panel-title">QC approval queue</h2><p>Review submissions and record your decisions.</p></div>
      <div className="qc-filters" role="group" aria-label="Filter QC submissions">{filters.map((entry) => <button key={entry.value} className={filter === entry.value ? "active" : ""} onClick={() => setFilter(entry.value)}>{entry.label}</button>)}</div>
      {notice && <p className="qc-notice" role="status">{notice}</p>}{error && <p className="form-error" role="alert">{error}</p>}
      {loading ? <div className="qc-empty">Loading submissions…</div> : submissions.length === 0 ? <div className="qc-empty"><Inbox size={34}/><h2>No QCs in this view</h2></div> : <div className="qc-submission-list">{groups.map(([techId, items]) => <section className="qc-tech-group" key={techId}><h2>Tech {techId} <small>{items?.length ?? 0} QCs</small></h2>{items?.map((item) => item.status === "approved" ? <article className="qc-approved-row" key={item.id}><div className="qc-approved-meta"><strong>Job {item.jobNumber || "—"}</strong><span>{new Date(item.submittedAt).toLocaleDateString()} · {item.photoIds.length + 1} images</span><span className="qc-status approved">Approved</span><span className={`qc-trust-status ${item.trustUploadStatus}`}>Trust: {item.trustUploadStatus === "uploaded" ? "Uploaded" : item.trustUploadStatus === "failed" ? "Retry needed" : "Ready"}</span></div><PhotoGallery item={item} compact/></article> : <article className="qc-submission-card" key={item.id}><div className="qc-submission-head"><div><span className="kicker">JOB {item.jobNumber || "—"}</span><h2>QC submission</h2><p>Submitted {new Date(item.submittedAt).toLocaleString()} · {item.photoIds.length} live photos</p></div><span className={`qc-status ${item.status}`}>{item.status === "pending" ? "Needs approval" : "Rejected"}</span></div><PhotoGallery item={item}/>{item.reviewNote && <div className="profile-note"><strong>Review note</strong><p>{item.reviewNote}</p></div>}{item.status === "pending" && <div className="qc-review-actions"><button className="button dark" disabled={decisionBusy === item.id} onClick={() => void decide(item.id, "approved")}><Check size={18}/> Approve</button><div className="qc-reject"><textarea aria-label={`Rejection note for job ${item.jobNumber}`} placeholder="Why did this QC fail?" maxLength={1000} value={notes[item.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))}/><button className="button light" disabled={decisionBusy === item.id || !notes[item.id]?.trim()} onClick={() => void decide(item.id, "rejected")}><X size={18}/> Reject with note</button></div></div>}</article>)}</section>)}</div>}
      </section>
      <aside className="qc-dashboard" aria-label="Technician QC totals"><div className="qc-dashboard-head"><div><h2>QCs by technician</h2><p>Five approved QCs required per fiscal month.</p></div><label>Fiscal month ends <input type="month" value={month} onChange={(event) => setMonth(event.target.value || fiscalMonthKey())}/></label></div><p className="fiscal-period-label">{new Date(bounds.start).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – {fiscalLabel}</p>{orderedStats.length ? <div className="qc-stats-list">{orderedStats.map((stat) => <div className="qc-stat-row" key={stat.techId}><strong>Tech {stat.techId}</strong><div className="qc-stat-counts"><span className={stat.approved >= 5 ? "goal-met" : "goal-short"}>{stat.approved} approved</span><span className="qc-rejected-count">{stat.rejected} rejected</span></div></div>)}</div> : <p className="qc-stats-empty">No technician activity for this fiscal month.</p>}</aside>
    </div>
    </div>
  </AdminShell>;
}
