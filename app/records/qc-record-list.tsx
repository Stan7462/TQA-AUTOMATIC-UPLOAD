"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ChevronRight } from "lucide-react";
import Link from "next/link";
import QcFilterBar from "@/app/qc-filter-bar";
import { useQcFilters } from "@/lib/use-qc-filters";
import AdminShell from "@/app/admin-shell";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { fiscalMonthBounds, fiscalMonthKey } from "@/lib/fiscal-month";

export type RecordView = "all" | "needs-review" | "approved";
type Status = "pending" | "approved" | "rejected";
type Submission = { id: string; techId: string; jobNumber: string; screenshotId: string; photoIds: string[]; status: Status; submittedAt: number; reviewedAt: number | null; reviewNote: string | null; trustUploadStatus: "ready" | "failed" | "uploaded"; trustUploadedAt: number | null };
const pages: Record<RecordView, { title: string; status: "all" | Status; description: string }> = {
  all: { title: "All records", status: "all", description: "Every technician QC, including pending, approved, and rejected submissions." },
  "needs-review": { title: "Needs review", status: "pending", description: "Technician QCs waiting for your decision." },
  approved: { title: "Approved", status: "approved", description: "Technician QCs you approved." },
};
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function PhotoStrip({ item }: { item: Submission }) {
  const photos = [{ id: item.screenshotId, label: "Account screenshot" }, ...item.photoIds.map((id, index) => ({ id, label: `QC photo ${index + 1}` }))];
  return <div data-photo-gallery className="qc-record-photos" aria-label={`Photos for job ${item.jobNumber || "unknown"}`}>
    {photos.map((photo) => <button key={photo.id} type="button" aria-label={`Enlarge ${photo.label.toLowerCase()} for job ${item.jobNumber || "unknown"}`} title={photo.label}><img src={`/api/captures/${photo.id}`} alt={photo.label} loading="lazy"/></button>)}
  </div>;
}

function previousFiscalMonthKey() {
  const [year, month] = fiscalMonthKey().split("-").map(Number);
  const previous = new Date(year, month - 2, 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`;
}

export default function QcRecordList({ view, historyMode = false }: { view: RecordView; historyMode?: boolean }) {
  const page = pages[view];
  const [items, setItems] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { filters, setFilters, ready } = useQcFilters(historyMode ? "tqa-history-filters" : `tqa-record-filters-${view}`, page.status);
  const [selectedId, setSelectedId] = useState("");
  const [exportMonth, setExportMonth] = useState(() => fiscalMonthKey());
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState("");

  useEffect(() => {
    setSelectedId(new URLSearchParams(location.search).get("qc") || "");
  }, []);
  useEffect(() => {
    if (historyMode && ready && !filters.month) setFilters({ ...filters, month: previousFiscalMonthKey() });
  }, [historyMode, ready, filters, setFilters]);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const id = new URLSearchParams(location.search).get("qc");
      let cursor: string | null = null;
      const found: Submission[] = [];
      const range = fiscalMonthBounds(fiscalMonthKey());
      const currentRange = historyMode ? "" : `&start=${range.start}&end=${range.end}`;
      do {
        const response: Response = await fetch(`/api/qc-submissions?status=all&pageSize=100${currentRange}${id ? "&qc=" + encodeURIComponent(id) : ""}${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`, { cache: "no-store", signal });
        const result = await response.json() as {error?:string;submissions:Submission[];nextCursor:string|null};
        if (!response.ok) throw new Error(result.error || "Could not load QC records.");
        found.push(...result.submissions); cursor = result.nextCursor;
      } while (cursor && !signal?.aborted);
      if (!signal?.aborted) { setItems(found); setError(""); }
    } catch (cause) { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Could not load QC records."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [historyMode]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  useAutoRefresh(load);

  const groups = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    const range = filters.month ? fiscalMonthBounds(filters.month) : null;
    const filtered = items.filter(item => selectedId ? item.id === selectedId :
      (!range || (item.submittedAt >= range.start && item.submittedAt < range.end)) &&
      (!filters.tech || filters.tech === item.techId) &&
      (filters.status === "all" || (filters.status === "uploaded" ? item.status === "approved" && item.trustUploadStatus === "uploaded" : filters.status === item.status)) &&
      `${item.techId} ${item.jobNumber}`.toLowerCase().includes(search));
    return Object.entries(Object.groupBy(filtered, item => item.techId)).sort((a,b) => collator.compare(a[0],b[0]));
  }, [items, filters, selectedId]);
  const shown = groups.reduce((count, [, group]) => count + (group?.length ?? 0), 0);
  const selectedExportCount = items.filter(item => {
    if (item.status !== "approved") return false;
    const {start,end} = fiscalMonthBounds(exportMonth);
    return item.submittedAt >= start && item.submittedAt < end;
  }).length;

  async function downloadApprovedQcs() {
    setExportBusy(true); setExportError("");
    const period = exportMonth;
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

  return <AdminShell active={historyMode ? "history" : "records"}>
    <section className="intro"><div><h1>{selectedId ? "QC details" : historyMode ? "QC History" : "QC records"}</h1><p>{selectedId ? "All pictures and review information for this job." : historyMode ? "View previous QCs month by month. Archived QCs cannot be changed." : "Current fiscal month QCs, ending on the 21st."}</p></div></section>
    {view === "approved" && !historyMode && <section className="qc-export-panel" aria-label="Export approved QCs"><div><h2>Export for Catalyst</h2><p>Download the current fiscal month as a ZIP. Each approved QC has its own job-number folder with the account screenshot and live photos as JPG files.</p></div><div className="qc-export-controls"><label>Fiscal month ends<input type="month" min="2000-01" max="2100-12" value={exportMonth} onChange={(event) => setExportMonth(event.target.value)} /></label><button type="button" className="button dark" disabled={loading || exportBusy || selectedExportCount === 0} onClick={() => void downloadApprovedQcs()}><ArrowDownToLine size={18}/>{exportBusy ? "Preparing ZIP…" : `Download ${selectedExportCount} approved ${selectedExportCount === 1 ? "QC" : "QCs"}`}</button></div>{exportError && <p className="form-error" role="alert">{exportError}</p>}</section>}
    <div className="admin-page-content qc-record-page">{selectedId && <Link className="back-link" href="/">← Back to all data</Link>}
    <div className="qc-record-content">
      {!selectedId && <QcFilterBar value={filters} onChange={setFilters} techIds={items.map(item => item.techId)} currentMonthOnly={!historyMode} monthRequired={historyMode}/>}
      <div className="qc-record-toolbar"><span>{loading ? "Loading…" : `${shown} ${shown === 1 ? "QC" : "QCs"}`}</span></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {(loading || !ready) && !items.length ? <div className="qc-empty">Loading QC records…</div> : !shown ? <div className="qc-empty">{error ? "QC records could not load." : "No QCs match these filters."}</div> : <div className="qc-record-groups">{groups.map(([techId, group]) => <section className="qc-record-group" key={techId}><h2>Tech {techId} <small>{group?.length} {group?.length === 1 ? "QC" : "QCs"}</small></h2><div className="qc-record-rows">{group?.map((item) => <article className="qc-record-row" key={item.id}><div className="qc-record-meta"><div className="qc-record-line"><strong>Job {item.jobNumber || "—"}</strong><span className={`qc-status ${item.status}`}>{item.status === "pending" ? "Needs review" : item.status === "approved" ? "Approved" : "Rejected"}</span>{historyMode && <span className="qc-trust-status">View only</span>}{item.status === "approved" && <span className={`qc-trust-status ${item.trustUploadStatus}`}>Catalyst: {item.trustUploadStatus === "uploaded" ? "Uploaded" : item.trustUploadStatus === "failed" ? "Retry needed" : "Ready"}</span>}</div><small>Tech {item.techId} · {new Date(item.submittedAt).toLocaleString()}</small>{item.reviewNote && <span className="qc-record-note" title={item.reviewNote}>Note: {item.reviewNote}</span>}{!historyMode && item.status === "pending" && <a className="qc-record-review" href={`/captures?qc=${item.id}`}>Review QC <ChevronRight size={15}/></a>}</div><PhotoStrip item={item}/></article>)}</div></section>)}</div>}
    </div>
    </div>
  </AdminShell>;
}
