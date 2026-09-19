export function fiscalMonthKey(today = new Date()): string {
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + (today.getDate() > 21 ? 1 : 0), 21);
  return `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, "0")}`;
}

export function fiscalMonthBounds(key: string): { start: number; end: number } {
  const [year, month] = key.split("-").map(Number);
  return { start: new Date(year, month - 2, 22).getTime(), end: new Date(year, month - 1, 22).getTime() };
}

export function fiscalDeadline(today = new Date()): { date: Date; daysLeft: number } {
  const date = new Date(today.getFullYear(), today.getMonth() + (today.getDate() > 21 ? 1 : 0), 21);
  const startDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const endDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return { date, daysLeft: Math.round((endDay - startDay) / 86_400_000) };
}
