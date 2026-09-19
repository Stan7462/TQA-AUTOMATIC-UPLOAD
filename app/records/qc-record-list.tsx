"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ChevronRight, Search } from "lucide-react";
import AdminShell from "@/app/admin-shell";
import { fiscalMonthBounds, fiscalMonthKey } from "@/lib/fiscal-month";

export type RecordView = "all" | "needs-review" | "approved";
type Status = "pending" | "approved" | "rejected";
type Submission = { id: string; techId: string; jobNumber: string; screenshotId: string; photoIds: string[]; status: Status; submittedAt: number; reviewedAt: number | null; reviewNote: string | null; trustUploadStatus: "ready" | "failed" | "uploaded"; trustUploadedAt: number | null };
const pages: Record<RecordView, { title: string; status: "all" | Status; description: string }> = {
  all: { title: "All records", status: "all", description: "Every technician QC, including pending, approved, and rejected submissions." },
  "needs-review": { title: "Needs review", status: "pending", description: "Technician QCs waiting for your decision." },
  approved: { title: "Approved / reviewed", status: "approved", description: "Technician QCs you approved." },
};
const tabs: { view: RecordView; label: string }[] = [
  { view: "all", label: "All records" },
  { view: "needs-review", label: "Needs review" },
  { view: "approved", label: "Approved / reviewed" },
];
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function PhotoStrip({ item }: { item: Submission }) {
  const photos = [{ id: item.screenshotId, label: "Account screenshot" }, ...item.photoIds.map((id, index) => ({ id, label: `QC photo ${index + 1}` }))];
  return <div className="qc-record-photos" aria-label={`Photos for job ${item.jobNumber || "unknown"}`}>
    {photos.map((photo) => <button key={photo.id} type="button" aria-label={`Enlarge ${photo.label.toLowerCase()} for job ${item.jobNumber || "unknown"}`} title={photo.label}><img src={`/api/captures/${photo.id}`} alt={photo.label} loading="lazy"/></button>)}
  </div>;
}

export default function QcRecordList({ view }: { view: RecordView }) {
  const page = pages[view];
  const [items, setItems] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [exportPeriod, setExportPeriod] = useState<"all" | "month">("all");
  const [exportMonth, setExportMonth] = useState(() => fiscalMonthKey());
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState("");

  useEffect(() => {
    const search = new URLSearchParams(window.location.search).get("search");
    if (search) setQuery(search);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setItems([]);
    async function load() {
      try {
        let cursor: string | null = null;
        const found: Submission[] = [];
        do {
          const response: Response = await fetch(`/api/qc-submissions?status=${page.status}&pageSize=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store", signal: controller.signal });
          const result = await response.json() as { submissions?: Submission[]; nextCursor?: string | null; error?: string };
          if (!response.ok) throw new Error(result.error || "Could not load QC records.");
          found.push(...(result.submissions ?? []));
          if (!controller.signal.aborted) setItems([...found]);
          cursor = result.nextCursor ?? null;
        } while (cursor && !controller.signal.aborted);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load QC records.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [page.status]);

  const groups = useMemo(() => {
    const search = query.trim().toLowerCase();
    const filtered = items.filter((item) => `${item.techId} ${item.jobNumber} ${item.status}`.toLowerCase().includes(search));
    return Object.entries(Object.groupBy(filtered, (item) => item.techId)).sort((a, b) => collator.compare(a[0], b[0]));
  }, [items, query]);
  const shown = groups.reduce((count, [, group]) => count + (group?.length ?? 0), 0);
  const selectedExportCount = exportPeriod === "all" ? items.length : items.filter((item) => {
    const { start, end } = fiscalMonthBounds(exportMonth);
    return item.submittedAt >= start && item.submittedAt < end;
  }).length;

  async function downloadApprovedQcs() {
    setExportBusy(true); setExportError("");
    const period = exportPeriod === "all" ? "all" : exportMonth;
    try {
      const url = `/api/qc-export?period=${encodeURIComponent(period)}`;
      const preflight = await fetch(url, { method: "HEAD", cache: "no-store" });
      if (!preflight.ok) throw new Error(preflight.status === 409 ? "One of the approved QCs has a missing photo. Check the QC records before exporting." : preflight.status === 413 ? "This export is too large. Choose a fiscal month." : "Could not prepare the approved QC export.");
      const link = document.createElement("a");
      link.href = url;
      link.download = `TQA-approved-QCs-${period}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : "Could not export approved QCs.");
    } finally { setExportBusy(false); }
  }

  return <AdminShell active="records">
    <section className="intro"><div><small className="kicker">REVIEW WORKSPACE</small><h1>{page.title}</h1><p>{page.description}</p></div></section>
    {view === "approved" && <section className="qc-export-panel" aria-label="Export approved QCs"><div><h2>Export for Catalyst</h2><p>Download a ZIP that opens into one folder. Each approved QC has its own job-number folder with the account screenshot and live photos as JPG files.</p></div><div className="qc-export-controls"><label>Period<select value={exportPeriod} onChange={(event) => setExportPeriod(event.target.value as "all" | "month")}><option value="all">All approved QCs</option><option value="month">Fiscal month</option></select></label>{exportPeriod === "month" && <label>Fiscal month ends<input type="month" min="2000-01" max="2100-12" value={exportMonth} onChange={(event) => setExportMonth(event.target.value)} /></label>}<button type="button" className="button dark" disabled={loading || exportBusy || selectedExportCount === 0} onClick={() => void downloadApprovedQcs()}><ArrowDownToLine size={18}/>{exportBusy ? "Preparing ZIP…" : `Download ${selectedExportCount} approved ${selectedExportCount === 1 ? "QC" : "QCs"}`}</button></div>{exportError && <p className="form-error" role="alert">{exportError}</p>}</section>}
    <div className="admin-page-content qc-record-page">
    <div className="qc-record-content">
      <nav className="qc-record-tabs" aria-label="QC record lists">{tabs.map((tab) => <a key={tab.view} href={`/records/${tab.view}`} className={view === tab.view ? "active" : ""} aria-current={view === tab.view ? "page" : undefined}>{tab.label}</a>)}</nav>
      <div className="qc-record-toolbar"><label className="search"><Search size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Tech ID or job number" aria-label="Search QCs"/></label><span>{loading ? "Loading…" : `${shown} ${shown === 1 ? "QC" : "QCs"}`}</span></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading && !items.length ? <div className="qc-empty">Loading QC records…</div> : !shown ? <div className="qc-empty">{error ? "QC records could not load." : query ? "No QCs match your search." : "No QCs in this list yet."}</div> : <div className="qc-record-groups">{groups.map(([techId, group]) => <section className="qc-record-group" key={techId}><h2>Tech {techId} <small>{group?.length} {group?.length === 1 ? "QC" : "QCs"}</small></h2><div className="qc-record-rows">{group?.map((item) => <article className="qc-record-row" key={item.id}><div className="qc-record-meta"><div className="qc-record-line"><strong>Job {item.jobNumber || "—"}</strong><span className={`qc-status ${item.status}`}>{item.status === "pending" ? "Needs review" : item.status === "approved" ? "Approved" : "Rejected"}</span>{item.status === "approved" && <span className={`qc-trust-status ${item.trustUploadStatus}`}>Trust: {item.trustUploadStatus === "uploaded" ? "Uploaded" : item.trustUploadStatus === "failed" ? "Retry needed" : "Ready"}</span>}</div><small>Tech {item.techId} · {new Date(item.submittedAt).toLocaleString()}</small>{item.reviewNote && <span className="qc-record-note" title={item.reviewNote}>Note: {item.reviewNote}</span>}{item.status === "pending" && <a className="qc-record-review" href="/captures?status=pending">Review QC <ChevronRight size={15}/></a>}</div><PhotoStrip item={item}/></article>)}</div></section>)}</div>}
    </div>
    </div>
  </AdminShell>;
}
