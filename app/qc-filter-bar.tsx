"use client";
import type { QcFilters } from "@/lib/use-qc-filters";
import { fiscalMonthKey } from "@/lib/fiscal-month";
export default function QcFilterBar({ value, onChange, techIds, currentMonthOnly = false, monthRequired = false }: { value: QcFilters; onChange: (value: QcFilters) => void; techIds: string[]; currentMonthOnly?: boolean; monthRequired?: boolean }) {
  return <div className="qc-filter-bar">
    {!currentMonthOnly && !monthRequired && <label>Period<select value={value.month ? "month" : "all"} onChange={e => onChange({ ...value, month: e.target.value === "all" ? "" : fiscalMonthKey() })}><option value="all">All time</option><option value="month">Fiscal month</option></select></label>}
    {!currentMonthOnly && (monthRequired || value.month) && <label>Month ending on the 21st<input type="month" value={value.month} onChange={e => onChange({ ...value, month: e.target.value })}/></label>}
    <label>Technician<select value={value.tech} onChange={e => onChange({ ...value, tech: e.target.value })}><option value="">All technicians</option>{[...new Set([...techIds, ...(value.tech ? [value.tech] : [])])].sort((a,b) => a.localeCompare(b, undefined, {numeric:true})).map(id => <option key={id} value={id}>Tech {id}</option>)}</select></label>
    <label>Status<select value={value.status} onChange={e => onChange({ ...value, status: e.target.value })}>{[["all","All statuses"],["pending","Needs review"],["approved","Approved"],["rejected","Rejected"],["uploaded","Uploaded to Catalyst"]].map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    <label className="qc-filter-search">Search<input placeholder="Job number or Tech ID" aria-label="Search QCs" value={value.search} onChange={e => onChange({ ...value, search: e.target.value })}/></label>
  </div>;
}
