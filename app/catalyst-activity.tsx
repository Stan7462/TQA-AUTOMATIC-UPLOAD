"use client";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { groupActivity, type CatalystUpload } from "@/lib/catalyst-activity";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
function techColor(id: string) {
  let hash = 0;
  for (const letter of id) hash = (Math.imul(hash, 31) + letter.charCodeAt(0)) >>> 0;
  return `hsl(${(hash * 137.508) % 360} 65% 72%)`;
}
type Activity = { days: string[]; techIds: string[]; uploads: CatalystUpload[] };
function dayLabel(day: string) { return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" }); }
export type ActivitySelection = { techId: string; day: string };
export default function CatalystActivity({ selected, onSelect, onTechIds }: { selected: ActivitySelection | null; onSelect: (selection: ActivitySelection) => void; onTechIds: (ids: string[]) => void }) {
  const [data, setData] = useState<Activity | null>(null);
  const [hoveredDay, setHoveredDay] = useState("");
  const [error, setError] = useState("");
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
  const uploads = data?.uploads ?? [];
  const counts = useMemo(() => groupActivity(data?.uploads ?? []), [data]);
  const techIds = data?.techIds ?? [];
  return <div className="catalyst-activity">
    <div className="catalyst-activity-heading"><h3>Uploaded to Catalyst</h3><span>{data ? `${dayLabel(data.days[0])} – ${dayLabel(data.days.at(-1)!)} · ${uploads.length} uploads` : "Loading…"}</span></div>
    <p className="catalyst-activity-help">Numbers show QCs uploaded each day. Click a date, Tech ID, or cell to filter submitted QCs in the list below. Dates use Central time.</p>
    {error && <p className="form-error" role="alert">{error} <button className="button light" onClick={()=>void load()}>Retry</button></p>}
    {data && <div className="catalyst-grid-scroll"><table className="catalyst-grid"><caption className="sr-only">Technician Catalyst uploads by day of the current fiscal month</caption><thead><tr><th>Tech ID</th>{data.days.map(day=><th key={day} className={hoveredDay===day ? "activity-column-hover" : undefined} onMouseEnter={()=>setHoveredDay(day)} onMouseLeave={()=>setHoveredDay("")}><button type="button" className="catalyst-filter-heading" aria-label={`Show QCs submitted on ${dayLabel(day)}`} aria-pressed={selected?.day===day && !selected.techId} onClick={()=>onSelect({techId:"",day})}><span>{dayLabel(day).split(" ")[0]}</span>{dayLabel(day).split(" ")[1]}</button></th>)}<th>Total</th></tr></thead><tbody>{techIds.map(id=>{const total=uploads.filter(q=>q.techId===id).length;return <tr key={id} style={{"--activity-color":techColor(id)} as CSSProperties}><th scope="row"><button type="button" className="catalyst-filter-heading" aria-label={`Show QCs submitted by Tech ${id}`} aria-pressed={selected?.techId===id && !selected.day} onClick={()=>onSelect({techId:id,day:""})}><i aria-hidden="true"/>{id}</button></th>{data.days.map(day=>{const n=counts.get(`${id}:${day}`)??0;return <td key={day} className={hoveredDay===day ? "activity-column-hover" : undefined}><button type="button" className={`catalyst-day${n?' has-uploads':''}`} style={n?{backgroundColor:`color-mix(in srgb, var(--activity-color) ${Math.min(30+n*15,85)}%, var(--ui-panel))`}:undefined} aria-label={`Tech ${id}, ${dayLabel(day)}, ${n} Catalyst uploads`} aria-pressed={selected?.techId===id&&selected.day===day} onClick={()=>onSelect({techId:id,day})}>{n || <span aria-hidden="true">·</span>}</button></td>})}<td className="catalyst-total">{total}</td></tr>})}</tbody></table></div>}
    {data && !techIds.length && <p className="no-results">No technicians match these filters.</p>}

  </div>;
}
