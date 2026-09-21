"use client";
import { useCallback, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import AdminShell from "@/app/admin-shell";
import QcFilterBar from "@/app/qc-filter-bar";
import { useQcFilters } from "@/lib/use-qc-filters";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { fiscalMonthBounds } from "@/lib/fiscal-month";

type Qc = { id: string; techId: string; jobNumber: string; status: string; trustUploadStatus: string; submittedAt: number; photoIds: string[] };
const statuses = [["pending", "Needs review"], ["all", "All records"], ["approved", "Approved"], ["uploaded", "Uploaded to Catalyst"], ["rejected", "Rejected"]];
export default function Home() {
  const [items, setItems] = useState<Qc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const {filters, setFilters, ready} = useQcFilters("tqa-dashboard-filters");
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      let cursor: string | null = null;
      const found: Qc[] = [];
      do {
        const response: Response = await fetch('/api/qc-submissions?status=all&pageSize=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), {cache:'no-store', signal});
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
  const range = filters.month ? fiscalMonthBounds(filters.month) : null;
  const base = items.filter(q => (!range || (q.submittedAt >= range.start && q.submittedAt < range.end)) && (!filters.tech || q.techId === filters.tech));
  const matches = (q: Qc, status: string) => status === 'all' || (status === 'uploaded' ? q.status === 'approved' && q.trustUploadStatus === 'uploaded' : q.status === status);
  const visible = base.filter(q => matches(q,filters.status) && `${q.techId} ${q.jobNumber}`.toLowerCase().includes(filters.search.trim().toLowerCase()));
  return <AdminShell active="records">
    <section className="intro"><div><h1>All records</h1><p>Review progress and track uploads to Catalyst.</p></div><a className="button light" href="/records/approved">Export approved QCs</a></section>
    <section className="metrics status-metrics" aria-label="Filter QC records by status">{statuses.map(([value,label]) => <button key={value} className={`metric status-metric${filters.status===value?' active':''}`} aria-pressed={filters.status===value} onClick={()=>setFilters({...filters,status:filters.status===value?'all':value})}><span>{label}</span><strong>{loading ? '—' : base.filter(q=>matches(q,value)).length}</strong></button>)}</section>
    <section className="admin-page-content"><QcFilterBar value={filters} onChange={setFilters} techIds={items.map(q=>q.techId)}/>{range && <p className="fiscal-period-label">{new Date(range.start).toLocaleDateString()} – {new Date(range.end-1).toLocaleDateString()}</p>}
    {error && <p className="form-error" role="alert">{error} <button className="button light" onClick={()=>void load()}>Retry</button></p>}
    <div className="list-panel"><div className="panel-heading"><h2>{statuses.find(([v])=>v===filters.status)?.[1] || 'All records'}</h2><span>{visible.length} shown</span></div>
    {loading || !ready ? <p className="no-results">Loading QCs…</p> : visible.length ? <div className="table-wrap"><table className="qc-data-table"><thead><tr><th>Job</th><th>Tech ID</th><th>Submitted</th><th>Status</th><th><span className="sr-only">Open QC</span></th></tr></thead><tbody>{visible.map(q=><tr key={q.id}><td><a href={`/records/all?qc=${q.id}`}><strong>{q.jobNumber}</strong></a><small>{q.photoIds.length+1} pictures</small></td><td>{q.techId}</td><td>{new Date(q.submittedAt).toLocaleDateString()}<small>{new Date(q.submittedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</small></td><td><span className={`qc-status ${q.status}`}>{q.status==='pending'?'Needs review':q.status==='approved'?'Approved':'Rejected'}</span>{q.status==='approved' && <small>{q.trustUploadStatus==='uploaded'?'Uploaded to Catalyst':q.trustUploadStatus==='failed'?'Catalyst upload needs retry':'Ready for Catalyst'}</small>}</td><td><a className="open-row" aria-label={`Open job ${q.jobNumber}`} href={q.status==='pending'?`/captures?qc=${q.id}`:`/records/all?qc=${q.id}`}><ChevronRight size={18}/></a></td></tr>)}</tbody></table></div> : <p className="no-results">{items.length?'No QCs match these filters.':'No QCs submitted yet.'}</p>}
    </div></section>
  </AdminShell>;
}
