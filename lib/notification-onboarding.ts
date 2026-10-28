// Per account and browser: reopening a QC or signing in again must not repeat
// the welcome prompt. Explicit notification settings remain available anytime.
const handled = new Set<string>();
const key = (tenantId: string, techId: string) => `tqa.notification-setup.v1:${encodeURIComponent(tenantId)}:${encodeURIComponent(techId)}`;
export function notificationSetupHandled(tenantId: string, techId: string): boolean {
  const name = key(tenantId, techId);
  if (handled.has(name)) return true;
  try { return localStorage.getItem(name) === "handled"; }
  catch { return false; }
}
export function rememberNotificationSetup(tenantId: string, techId: string): void {
  const name = key(tenantId, techId);
  handled.add(name);
  try { localStorage.setItem(name, "handled"); }
  catch { /* Keep this session usable even when browser storage is unavailable. */ }
}
