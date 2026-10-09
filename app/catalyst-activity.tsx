"use client";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { activityDay, groupActivity, type CatalystUpload } from "@/lib/catalyst-activity";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
function techColor(id: string) {
  let hash = 0;
  for (const letter of id) hash = (Math.imul(hash, 31) + letter.charCodeAt(0)) >>> 0;
  return `hsl(${(hash * 137.508) % 360} 65% 72%)`;
}
type Activity = { days: string[]; techIds: string[]; uploads: CatalystUpload[] };
function dayLabel(day: string) { return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" }); }
export default function CatalystActivity({ tech, search, onTechIds }: { tech: string; search: string; onTechIds: (ids: string[]) => void }) {
  const [data, setData] = useState<Activity | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<{ techId: string; day: string } | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/catalyst-activity", { cache: "no-store", signal });
      const result = await response.json() as Activity & { error?: string };
      if (!response.ok) throw Error(result.error || "Could not load activity.");
      if (!signal?.aborted) { setData(result); setError(""); }
    } catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : "Could not load activity."); }
  }, []);
  useEffect(() => { const c = new AbortController(); void load(c.signal); return () => c.abort(); }, [load]);
  useAutoRefresh(load);
  useEffect(() => { if (data) onTechIds(data.techIds); }, [data, onTechIds]);
  const uploads = useMemo(() => (data?.uploads ?? []).filter(q => (!tech || q.techId === tech) && `${q.techId} ${q.jobNumber}`.toLowerCase().includes(search.trim().toLowerCase())), [data, tech, search]);
  const counts = useMemo(() => groupActivity(uploads), [uploads]);
  const techIds = (data?.techIds ?? []).filter(id => (!tech || tech === id) && (!search.trim() || id.toLowerCase().includes(search.trim().toLowerCase()) || uploads.some(q => q.techId === id)));
  const selectedUploads = selected ? uploads.filter(q => q.techId === selected.techId && activityDay(q.uploadedAt) === selected.day) : [];
  return <div className="catalyst-activity">
    <div className="catalyst-activity-heading"><h3>Uploaded to Catalyst</h3><span>{data ? `${dayLabel(data.days[0])} – ${dayLabel(data.days.at(-1)!)} · ${uploads.length} uploads` : "Loading…"}</span></div>
    <p className="catalyst-activity-help">Numbers show QCs uploaded each day. Select a day to open its QCs. Dates use Central time.</p>
    {error && <p className="form-error" role="alert">{error} <button className="button light" onClick={()=>void load()}>Retry</button></p>}
    {data && <div className="catalyst-grid-scroll"><table className="catalyst-grid"><caption className="sr-only">Technician Catalyst uploads by day of the current fiscal month</caption><thead><tr><th>Tech ID</th>{data.days.map(day=><th key={day}><span>{dayLabel(day).split(" ")[0]}</span>{dayLabel(day).split(" ")[1]}</th>)}<th>Total</th></tr></thead><tbody>{techIds.map(id=>{const total=uploads.filter(q=>q.techId===id).length;return <tr key={id} style={{"--activity-color":techColor(id)} as CSSProperties}><th scope="row"><i aria-hidden="true"/>{id}</th>{data.days.map(day=>{const n=counts.get(`${id}:${day}`)??0;return <td key={day}><button type="button" className={`catalyst-day${n?' has-uploads':''}`} style={n?{backgroundColor:`color-mix(in srgb, var(--activity-color) ${Math.min(30+n*15,85)}%, var(--ui-panel))`}:undefined} aria-label={`Tech ${id}, ${dayLabel(day)}, ${n} Catalyst uploads`} aria-pressed={selected?.techId===id&&selected.day===day} onClick={()=>setSelected({techId:id,day})}>{n || <span aria-hidden="true">·</span>}</button></td>})}<td className="catalyst-total">{total}</td></tr>})}</tbody></table></div>}
    {data && !techIds.length && <p className="no-results">No technicians match these filters.</p>}
    {selected && <section className="catalyst-day-details" aria-live="polite"><div><h3>Tech {selected.techId} · {dayLabel(selected.day)}</h3><button className="button light" onClick={()=>setSelected(null)}>Close</button></div>{selectedUploads.length ? selectedUploads.map(q=><a key={q.id} href={`/captures?${new URLSearchParams({qc:q.id,readonly:'1',return:'/?activity=1'})}`}><strong>Job {q.jobNumber}</strong><span>Uploaded {new Date(q.uploadedAt).toLocaleTimeString('en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit'})} CT</span><span>Open QC →</span></a>) : <p>No Catalyst uploads on this day.</p>}</section>}
  </div>;
}
