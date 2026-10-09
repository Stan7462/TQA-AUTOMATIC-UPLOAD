import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { resolve, join } from "node:path";
import { pushConfig } from "../lib/push-config.mjs";

const HOUR = 3600000;

function companyAlerts(db, account) {
  if (account && !account.is_admin) Object.assign(account, { rejected: 1, deadline: 1, overdue: 1, monthly: 1 }, db.prepare("SELECT rejected,deadline,overdue,monthly FROM push_company_preferences WHERE tenant_id=?").get(account.tenant_id));
  return account;
}

// Fiscal dates use the team's Chicago calendar, independent of the VPS timezone.
export function notificationPeriod(now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date(now)).map(p => [p.type, p.value]));
  const year = Number(parts.year), month = Number(parts.month) - 1, day = Number(parts.day);
  const endDate = new Date(Date.UTC(year, month + (day > 21 ? 1 : 0), 22));
  function midnight(date) {
    const offset = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", timeZoneName: "shortOffset" }).formatToParts(new Date(date.getTime() + 12 * HOUR)).find(p => p.type === "timeZoneName").value;
    return date.getTime() - Number(offset.replace("GMT", "")) * HOUR;
  }
  return { start: midnight(new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() - 1, 22))), end: midnight(endDate), key: endDate.toISOString().slice(0, 7), daysLeft: Math.round((endDate.getTime() - 86400000 - Date.UTC(year, month, day)) / 86400000) };
}

function enqueue(db, account, kind, key, message, url, expires, submission = null, revision = null) {
  db.prepare("INSERT OR IGNORE INTO push_outbox(id,event_key,tenant_id,tech_id,kind,submission_id,revision,message,url,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run(randomUUID(), `${account.tenant_id}:${account.tech_id}:${kind}:${key}`, account.tenant_id, account.tech_id, kind, submission, revision, message, url, expires);
}

export function collectNotifications(db, now = Date.now()) {
  const period = notificationPeriod(now);
  const accounts = db.prepare("SELECT p.*, t.is_admin, COALESCE(t.monthly_qc_goal,n.monthly_qc_goal) AS goal FROM push_accounts p JOIN technicians t ON t.tenant_id=p.tenant_id AND t.tech_id=p.tech_id JOIN tenants n ON n.id=p.tenant_id WHERE p.enabled=1 AND t.active=1 AND n.active=1 AND t.must_change_credentials=0").all();
  for (const account of accounts) {
    companyAlerts(db, account);
    if (account.is_admin) {
      const uploads = db.prepare("SELECT q.* FROM push_watches w JOIN technicians t ON t.tenant_id=w.tenant_id AND t.tech_id=w.tech_id JOIN qc_submissions q ON q.tenant_id=w.tenant_id AND q.tech_id=w.tech_id WHERE w.tenant_id=? AND w.supervisor_id=? AND t.active=1 AND q.submitted_at>=MAX(w.enabled_at,?,?) AND q.submitted_at<?").all(account.tenant_id, account.tech_id, account.enabled_at, Math.max(period.start, now - 24 * HOUR), period.end);
      for (const q of uploads) enqueue(db, account, "upload", q.id, `Tech ${q.tech_id} submitted Job ${q.job_number}${q.correction_pending ? ` · Fixed attempt ${q.attempt_number}` : ""}. Ready to review.`, `/captures?qc=${q.id}${q.status === "pending" ? "" : q.correction_pending ? "&fixed=1" : "&readonly=1"}`, q.submitted_at + 24 * HOUR, q.id, q.submitted_at);
      continue;
    }
    const rejected = db.prepare("SELECT * FROM qc_submissions WHERE tenant_id=? AND tech_id=? AND status='rejected' AND correction_pending=0 AND correction_deadline_at IS NOT NULL AND submitted_at>=? AND submitted_at<?").all(account.tenant_id, account.tech_id, period.start, period.end);
    for (const q of rejected) {
      const hours = Math.ceil((q.correction_deadline_at - now) / HOUR);
      const url = "/profile?view=rejected";
      const key = `${q.id}:${q.correction_deadline_at}`;
      if (account.rejected && q.reviewed_at >= account.enabled_at && hours > 24) enqueue(db, account, "rejected", key, `Job ${q.job_number} needs fixing. You have ${hours} hours.`, url, Math.min(q.reviewed_at + 6 * HOUR, q.correction_deadline_at), q.id, q.correction_deadline_at);
      if (account.deadline && hours > 0 && hours <= 24) enqueue(db, account, "deadline", key, `Job ${q.job_number}: ${hours} hours left to fix.`, url, Math.min(q.correction_deadline_at, period.end), q.id, q.correction_deadline_at);
      if (account.overdue && hours <= 0) enqueue(db, account, "overdue", key, `Job ${q.job_number} is overdue. Fix and resubmit.`, url, period.end, q.id, q.correction_deadline_at);
    }
    if (account.monthly && period.daysLeft >= 0 && period.daysLeft <= 2) {
      const approved = db.prepare("SELECT COUNT(*) AS total FROM qc_submissions WHERE tenant_id=? AND tech_id=? AND status='approved' AND submitted_at>=? AND submitted_at<?").get(account.tenant_id, account.tech_id, period.start, period.end).total;
      if (approved < account.goal) enqueue(db, account, "monthly", period.key, `You have ${approved} of ${account.goal} approved QCs. Monthly deadline is approaching.`, "/capture", period.end);
    }
  }
}

export function notificationStillRelevant(db, event, now) {
  const account = db.prepare("SELECT p.*,t.active,t.is_admin,n.active AS company_active FROM push_accounts p JOIN technicians t ON t.tenant_id=p.tenant_id AND t.tech_id=p.tech_id JOIN tenants n ON n.id=p.tenant_id WHERE p.tenant_id=? AND p.tech_id=?").get(event.tenant_id, event.tech_id);
  companyAlerts(db, account);
  if (!account?.enabled || !account.active || !account.company_active || event.expires_at <= now) return null;
  if (["rejected", "deadline", "overdue", "monthly"].includes(event.kind) && !account[event.kind]) return null;
  const period = notificationPeriod(now);
  if (event.kind === "monthly") {
    const counts = db.prepare("SELECT COALESCE(t.monthly_qc_goal,n.monthly_qc_goal) AS goal,(SELECT COUNT(*) FROM qc_submissions q WHERE q.tenant_id=t.tenant_id AND q.tech_id=t.tech_id AND q.status='approved' AND q.submitted_at>=? AND q.submitted_at<?) AS approved FROM technicians t JOIN tenants n ON n.id=t.tenant_id WHERE t.tenant_id=? AND t.tech_id=?").get(period.start, period.end, event.tenant_id, event.tech_id);
    if (counts.approved >= counts.goal) return null;
    event.message = `You have ${counts.approved} of ${counts.goal} approved QCs. Monthly deadline is approaching.`;
  }
  if (event.submission_id) {
    const q = db.prepare("SELECT * FROM qc_submissions WHERE tenant_id=? AND id=?").get(event.tenant_id, event.submission_id);
    if (!q || q.submitted_at < period.start || q.submitted_at >= period.end) return null;
    if (event.kind === "upload") {
      if (!account.is_admin || !db.prepare("SELECT 1 FROM push_watches WHERE tenant_id=? AND supervisor_id=? AND tech_id=?").get(event.tenant_id, event.tech_id, q.tech_id)) return null;
      if (!db.prepare("SELECT 1 FROM technicians WHERE tenant_id=? AND tech_id=? AND active=1").get(q.tenant_id, q.tech_id)) return null;
    } else {
      if (q.tech_id !== event.tech_id || q.status !== "rejected" || q.correction_pending || q.correction_deadline_at !== event.revision) return null;
      const hours = Math.ceil((q.correction_deadline_at - now) / HOUR);
      if (event.kind !== "overdue" && hours <= 0) return null;
      if (event.kind === "deadline") event.message = `Job ${q.job_number}: ${hours} hours left to fix.`;
      if (event.kind === "rejected") event.message = `Job ${q.job_number} needs fixing. You have ${hours} hours.`;
    }
  }
  return account;
}

export async function sendNotification(event, account, config) {
  const response = await fetch("https://api.onesignal.com/notifications", {
    method: "POST", signal: AbortSignal.timeout(10000),
    headers: { "Content-Type": "application/json", Authorization: `Key ${config.apiKey}` },
    body: JSON.stringify({ app_id: config.appId, include_aliases: { external_id: [account.external_id] }, target_channel: "push", headings: { en: "TQA QC notifications" }, contents: { en: event.message }, url: new URL(event.url, config.origin).href, idempotency_key: event.id, ttl: Math.max(0, Math.min(86400, Math.floor((event.expires_at - Date.now()) / 1000))) }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.id) throw new Error(`OneSignal notification failed (${response.status}). Check subscription and provider settings.`);
}

export async function processNotifications(db, { now = Date.now(), config = pushConfig(), send = sendNotification } = {}) {
  collectNotifications(db, now);
  if (!config.sendingEnabled || !config.apiKey) return;
  const events = db.prepare("SELECT * FROM push_outbox WHERE sent_at IS NULL AND attempts<8 AND next_attempt_at<=? ORDER BY next_attempt_at LIMIT 40").all(now);
  for (const event of events) {
    const account = notificationStillRelevant(db, event, now);
    if (!account) { db.prepare("UPDATE push_outbox SET sent_at=-1 WHERE id=?").run(event.id); continue; }
    // Claim a short lease before network IO so multiple workers cannot send concurrently.
    const claimed = db.prepare("UPDATE push_outbox SET next_attempt_at=? WHERE id=? AND sent_at IS NULL AND next_attempt_at<=?").run(now + 60000, event.id, now);
    if (!claimed.changes) continue;
    try { await send(event, account, config); db.prepare("UPDATE push_outbox SET sent_at=?,last_error=NULL WHERE id=?").run(now, event.id); }
    catch { db.prepare("UPDATE push_outbox SET attempts=attempts+1,next_attempt_at=?,last_error=? WHERE id=?").run(now + Math.min(HOUR, 30000 * 2 ** event.attempts), "Provider delivery failed. Check configuration or subscription.", event.id); }
  }
  db.prepare("DELETE FROM push_outbox WHERE expires_at<?").run(now - 7 * 86400000);
}

export function startNotificationWorker() {
  const config = pushConfig();
  if (!config.sendingEnabled || !config.apiKey) return;
  const db = new DatabaseSync(join(resolve(process.env.TQA_DATA_DIR || ".tqa-data"), "tqa.sqlite"));
  db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000");
  let running = false;
  async function tick() {
    if (running) return;
    running = true;
    try { await processNotifications(db); } catch { console.error("Notification worker failed; will retry."); }
    finally { running = false; }
  }
  void tick();
  const timer = setInterval(() => void tick(), 15000);
  timer.unref();
}
