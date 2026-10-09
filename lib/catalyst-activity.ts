export const ACTIVITY_TIMEZONE = "America/Chicago";
export type CatalystUpload = { id: string; techId: string; jobNumber: string; uploadedAt: number };
export function activityDay(timestamp: number): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: ACTIVITY_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(timestamp);
  const part = (type: string) => p.find(v => v.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function midnight(day: string): number {
  const target = Date.parse(`${day}T00:00:00Z`);
  let estimate = target;
  for (let i = 0; i < 3; i++) {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: ACTIVITY_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(estimate);
    const n = (type: string) => Number(p.find(v => v.type === type)!.value);
    const displayed = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"));
    estimate += target - displayed;
  }
  return estimate;
}
export function activityMonth(now = Date.now()) {
  const [year, month, date] = activityDay(now).split("-").map(Number);
  const endDate = new Date(Date.UTC(year, month - 1 + (date > 21 ? 1 : 0), 22));
  const startDate = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() - 1, 22));
  const days: string[] = [];
  for (let t = startDate.getTime(); t < endDate.getTime(); t += 86400000) days.push(new Date(t).toISOString().slice(0, 10));
  return { days, start: midnight(days[0]), end: midnight(endDate.toISOString().slice(0, 10)) };
}
export function groupActivity(uploads: CatalystUpload[]) {
  const counts = new Map<string, number>();
  for (const q of uploads) {
    const key = `${q.techId}:${activityDay(q.uploadedAt)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
