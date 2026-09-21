"use client";
import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Share2, UsersRound, X } from "lucide-react";
import AdminShell from "@/app/admin-shell";
import QcFilterBar from "@/app/qc-filter-bar";
import { useQcFilters } from "@/lib/use-qc-filters";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { fiscalMonthBounds, fiscalMonthKey } from "@/lib/fiscal-month";

type Qc = { id: string; techId: string; jobNumber: string; status: string; trustUploadStatus: string; submittedAt: number; photoIds: string[] };
type SnapshotStat = { techId: string; uploaded: number };
const statuses = [["pending", "Needs review"], ["all", "All records"], ["approved", "Approved"], ["uploaded", "Uploaded to Catalyst"], ["rejected", "Rejected"]];
const metricStatuses = statuses.filter(([value]) => value !== "pending");

function snapshotPng(stats: SnapshotStat[], range: { start: number; end: number }) {
  const dense = stats.length > 10;
  const columns = dense ? 2 : 1;
  const rows = Math.max(1, Math.ceil(stats.length / columns));
  const width = 1080;
  const rowHeight = dense ? 62 : 78;
  const height = 330 + rows * rowHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot create the snapshot.");
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#22333f");
  gradient.addColorStop(1, "#0c1821");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#8edbd2";
  context.font = "700 22px system-ui, sans-serif";
  context.fillText("TQA AUTOMATIC UPLOAD", 64, 70);
  context.fillStyle = "#edf4fb";
  context.font = "700 58px system-ui, sans-serif";
  context.fillText("Uploaded to Catalyst", 64, 138);
  context.fillStyle = "#b7c7d3";
  context.font = "28px system-ui, sans-serif";
  const period = `${new Date(range.start).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${new Date(range.end - 1).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  context.fillText(period, 64, 184);
  const tableX = 64;
  const tableY = 220;
  const tableWidth = width - 128;
  const columnWidth = tableWidth / columns;
  context.fillStyle = "#293c49";
  context.fillRect(tableX, tableY, tableWidth, 50);
  context.fillStyle = "#aabdc9";
  context.font = "700 18px system-ui, sans-serif";
  context.fillText("TECHNICIAN", tableX + 22, tableY + 32);
  context.textAlign = "right";
  context.fillText("UPLOADED", tableX + tableWidth - 22, tableY + 32);
  context.textAlign = "left";
  stats.forEach((stat, index) => {
    const column = dense ? index % 2 : 0;
    const row = dense ? Math.floor(index / 2) : index;
    const x = tableX + column * columnWidth;
    const y = tableY + 50 + row * rowHeight;
    context.fillStyle = row % 2 ? "#192934" : "#1d2d38";
    context.fillRect(x, y, columnWidth, rowHeight);
    context.strokeStyle = "#405969";
    context.strokeRect(x, y, columnWidth, rowHeight);
    context.fillStyle = "#edf4fb";
    context.font = `700 ${dense ? 23 : 27}px system-ui, sans-serif`;
    context.fillText(`Tech ${stat.techId}`, x + 22, y + rowHeight / 2 + 9, columnWidth - 170);
    context.textAlign = "right";
    context.font = `700 ${dense ? 28 : 34}px system-ui, sans-serif`;
    context.fillText(String(stat.uploaded), x + columnWidth - 82, y + rowHeight / 2 + 10);
    context.fillStyle = "#bed0dc";
    context.font = `600 ${dense ? 18 : 21}px system-ui, sans-serif`;
    context.fillText("of 5", x + columnWidth - 20, y + rowHeight / 2 + 9);
    context.textAlign = "left";
  });
  context.fillStyle = "#91a7b6";
  context.font = "20px system-ui, sans-serif";
  context.textAlign = "right";
  context.fillText(`Updated ${new Date().toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`, width - 64, height - 34);
  const encoded = canvas.toDataURL("image/png").split(",")[1];
  const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
  return new File([bytes], `catalyst-qc-progress-${fiscalMonthKey()}.png`, { type: "image/png" });
}
export default function Home() {
  const [items, setItems] = useState<Qc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [snapshotStats, setSnapshotStats] = useState<SnapshotStat[]>([]);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotError, setSnapshotError] = useState("");
  const [snapshotSharing, setSnapshotSharing] = useState(false);
  const [snapshotShareNote, setSnapshotShareNote] = useState("");
  const {filters, setFilters, ready} = useQcFilters("tqa-dashboard-filters");
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const currentMonth = fiscalMonthBounds(fiscalMonthKey());
      let cursor: string | null = null;
      const found: Qc[] = [];
      do {
        const response: Response = await fetch(`/api/qc-submissions?status=all&pageSize=100&start=${currentMonth.start}&end=${currentMonth.end}` + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), {cache:'no-store', signal});
        const data = await response.json() as {error?:string;submissions:Qc[];nextCursor:string|null};
        if (!response.ok) throw new Error(data.error || 'Could not load QCs.');
        found.push(...data.submissions); cursor=data.nextCursor;
      } while(cursor && !signal?.aborted);
      if (!signal?.aborted) {setItems(found);setError('');}
    } catch(cause) {if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'Could not load QCs.');}
    finally {if (!signal?.aborted) setLoading(false);}
  }, []);
  useEffect(()=>{const controller=new AbortController();void load(controller.signal);return ()=>controller.abort();},[load]);
  useAutoRefresh(load);
  const base = items.filter(q => !filters.tech || q.techId === filters.tech);
  const matches = (q: Qc, status: string) => status === 'all' || (status === 'uploaded' ? q.status === 'approved' && q.trustUploadStatus === 'uploaded' : q.status === status);
  const visible = base.filter(q => matches(q,filters.status) && `${q.techId} ${q.jobNumber}`.toLowerCase().includes(filters.search.trim().toLowerCase()));
  const snapshotMonth = fiscalMonthKey();
  const snapshotRange = fiscalMonthBounds(snapshotMonth);
  async function openSnapshot() {
    setSnapshotOpen(true); setSnapshotLoading(true); setSnapshotError(""); setSnapshotShareNote("");
    try {
      const response = await fetch(`/api/qc-stats?start=${snapshotRange.start}&end=${snapshotRange.end}`, { cache: "no-store" });
      const data = await response.json() as { error?: string; technicians?: SnapshotStat[] };
      if (!response.ok) throw new Error(data.error || "Could not load Catalyst totals.");
      setSnapshotStats((data.technicians ?? []).sort((a, b) => b.uploaded - a.uploaded || a.techId.localeCompare(b.techId, undefined, { numeric: true })));
    } catch (cause) { setSnapshotError(cause instanceof Error ? cause.message : "Could not load Catalyst totals."); }
    finally { setSnapshotLoading(false); }
  }
  async function shareSnapshot() {
    setSnapshotSharing(true); setSnapshotShareNote("");
    try {
      const file = snapshotPng(snapshotStats, snapshotRange);
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: "Uploaded to Catalyst", text: "Current technician QC progress", files: [file] });
      } else {
        const url = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = url; link.download = file.name; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setSnapshotShareNote("Image downloaded. You can share it from Photos or Files.");
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setSnapshotShareNote(cause instanceof Error ? cause.message : "Could not share the snapshot.");
    } finally { setSnapshotSharing(false); }
  }
  return <AdminShell active="records">
    <section className="intro"><div><h1>All records</h1><p>Review progress and track uploads to Catalyst.</p></div><div className="intro-actions"><button type="button" className="button light" onClick={() => void openSnapshot()}><UsersRound size={18}/>Catalyst snapshot</button><a className="button light" href="/records/approved">Export approved QCs</a></div></section>
    {snapshotOpen && <div className="qc-confirm-overlay qc-snapshot-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSnapshotOpen(false); }}><section className={`qc-team-snapshot${snapshotStats.length>10?' is-dense':''}`} role="dialog" aria-modal="true" aria-labelledby="qc-snapshot-title"><button type="button" className="qc-snapshot-close" aria-label="Close Catalyst snapshot" onClick={() => setSnapshotOpen(false)}><X size={22}/></button><span className="kicker">TQA AUTOMATIC UPLOAD</span><h2 id="qc-snapshot-title">Uploaded to Catalyst</h2><p className="qc-snapshot-period">{new Date(snapshotRange.start).toLocaleDateString(undefined,{month:"short",day:"numeric"})} – {new Date(snapshotRange.end-1).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})}</p>{snapshotLoading ? <p className="qc-snapshot-empty">Loading totals…</p> : snapshotError ? <p className="form-error" role="alert">{snapshotError}</p> : snapshotStats.length ? <div className="qc-snapshot-table" role="table" aria-label="Technician Catalyst upload progress"><div className="qc-snapshot-table-head" role="row"><span role="columnheader">Technician</span><span role="columnheader">Uploaded</span></div>{snapshotStats.map(stat => <div className="qc-snapshot-row" role="row" key={stat.techId}><strong role="cell">Tech {stat.techId}</strong><span role="cell"><b>{stat.uploaded}</b> of 5</span></div>)}</div> : <p className="qc-snapshot-empty">No active technicians.</p>}<div className="qc-snapshot-footer"><button type="button" className="qc-snapshot-share" disabled={snapshotLoading || !!snapshotError || !snapshotStats.length || snapshotSharing} onClick={() => void shareSnapshot()}><Share2 size={15}/>{snapshotSharing ? "Preparing…" : "Share snapshot"}</button><small>Updated {new Date().toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</small></div>{snapshotShareNote && <p className="qc-snapshot-share-note" role="status">{snapshotShareNote}</p>}</section></div>}
    <section className="metrics status-metrics" aria-label="Filter QC records by status">{metricStatuses.map(([value,label]) => <button key={value} className={`metric status-metric${filters.status===value?' active':''}`} aria-pressed={filters.status===value} onClick={()=>setFilters({...filters,status:filters.status===value?'all':value})}><span>{label}</span><strong>{loading ? '—' : base.filter(q=>matches(q,value)).length}</strong></button>)}</section>
    <section className="admin-page-content"><QcFilterBar value={filters} onChange={setFilters} techIds={items.map(q=>q.techId)} currentMonthOnly/>
    {error && <p className="form-error" role="alert">{error} <button className="button light" onClick={()=>void load()}>Retry</button></p>}
    <div className="list-panel"><div className="panel-heading"><h2>{statuses.find(([v])=>v===filters.status)?.[1] || 'All records'}</h2><span>{visible.length} shown</span></div>
    {loading || !ready ? <p className="no-results">Loading QCs…</p> : visible.length ? <div className="table-wrap"><table className="qc-data-table"><thead><tr><th>Job</th><th>Tech ID</th><th>Submitted</th><th>Status</th><th><span className="sr-only">Open QC</span></th></tr></thead><tbody>{visible.map(q=>{const destination=q.status==='pending'?`/captures?qc=${q.id}`:`/records/all?qc=${q.id}`;const open=()=>window.location.assign(destination);return <tr className="qc-clickable-row" key={q.id} role="link" tabIndex={0} aria-label={`Open job ${q.jobNumber}`} onClick={open} onKeyDown={(event)=>{if(event.key==='Enter')open();}}><td><strong>{q.jobNumber}</strong><small>{q.photoIds.length+1} pictures</small></td><td>{q.techId}</td><td>{new Date(q.submittedAt).toLocaleDateString()}<small>{new Date(q.submittedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</small></td><td><span className={`qc-status ${q.status}`}>{q.status==='pending'?'Needs review':q.status==='approved'?'Approved':'Rejected'}</span>{q.status==='approved' && <small>{q.trustUploadStatus==='uploaded'?'Uploaded to Catalyst':q.trustUploadStatus==='failed'?'Catalyst upload needs retry':'Ready for Catalyst'}</small>}</td><td><span className="open-row" aria-hidden="true"><ChevronRight size={18}/></span></td></tr>})}</tbody></table></div> : <p className="no-results">{items.length?'No QCs match these filters.':'No QCs submitted yet.'}</p>}
    </div></section>
  </AdminShell>;
}
