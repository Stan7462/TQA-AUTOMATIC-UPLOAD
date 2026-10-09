import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { resolve, join } from "node:path";
import { createDatabase } from "../lib/database.mjs";
import { pushConfig } from "../lib/push-config.mjs";

const HOUR = 3600000;

async function companyAlerts(db, account) {
  if (account && !account.is_admin) Object.assign(account, { rejected: 1, deadline: 1, overdue: 1, monthly: 1 }, (await db.prepare("SELECT rejected,deadline,overdue,monthly FROM push_company_preferences WHERE tenant_id=?").get(account.tenant_id)));
  return account;
}

// Fiscal dates use the team's Chicago calendar, independent of the VPS timezone.
export function notificationPeriod(now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date(now)).map(p => [p.type, p.value]));
  const year = Number(parts.year), month = Number(parts.month) - 1, day = Number(parts.day);
  const endDate = new Date(Date.UTC(year, month + (day > 21 ? 1 : 0), 22));
  function midnight(date) {
    const offset = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", timeZoneName: "shortOffset" }).formatToParts(new Date(date.getTime() + 12 * HOUR)).find(p => p.type === "timeZoneName").value;
    return date.getTime() - Number(offset.replace("GMT", "")) * HOUR;
  }
  return { start: midnight(new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() - 1, 22))), end: midnight(endDate), hour: Number(parts.hour), morning: Number(parts.hour) === 8 && Number(parts.minute) === 0, dayEnd: midnight(new Date(Date.UTC(year, month, day + 1))), key: endDate.toISOString().slice(0, 7), daysLeft: Math.round((endDate.getTime() - 86400000 - Date.UTC(year, month, day)) / 86400000) };
}

async function enqueue(db, account, kind, key, message, url, expires, submission = null, revision = null) {
  (await db.prepare("INSERT OR IGNORE INTO push_outbox(id,event_key,tenant_id,tech_id,kind,submission_id,revision,message,url,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run(randomUUID(), `${account.tenant_id}:${account.tech_id}:${kind}:${key}`, account.tenant_id, account.tech_id, kind, submission, revision, message, url, expires));
}

async function technicianSummary(db, account, now, period) {
  const jobs = await db.prepare("SELECT id,job_number,correction_deadline_at FROM qc_submissions WHERE tenant_id=? AND tech_id=? AND status='rejected' AND correction_pending=0 AND correction_deadline_at IS NOT NULL AND submitted_at>=? AND submitted_at<? ORDER BY correction_deadline_at").all(account.tenant_id,account.tech_id,period.start,period.end);
  const warnings=jobs.filter(q=>{const hours=Math.ceil((q.correction_deadline_at-now)/HOUR);return hours<=0?account.overdue:account.deadline&&hours<=48;});
  const parts=[];
  if(warnings.length) parts.push(`${warnings.length} job${warnings.length===1?'':'s'} need fixing: `+warnings.slice(0,3).map(q=>`Job ${q.job_number}—${q.correction_deadline_at<=now?'overdue':`${Math.ceil((q.correction_deadline_at-now)/HOUR)} hours left to fix`}`).join('; ')+(warnings.length>3?`; +${warnings.length-3} more`:''));
  if(account.monthly&&[6,5].includes(period.daysLeft)) {
    const approved=(await db.prepare("SELECT COUNT(*) AS total FROM qc_submissions WHERE tenant_id=? AND tech_id=? AND status='approved' AND submitted_at>=? AND submitted_at<?").get(account.tenant_id,account.tech_id,period.start,period.end)).total;
    if(approved<account.goal) parts.push(`You have ${approved} of ${account.goal} approved QCs. Monthly deadline: the 21st.`);
  }
  return {message:parts.join(' '),url:warnings.length?'/profile?view=rejected':'/capture'};
}
async function supervisorSummary(db,account,now,period) {
  const rows=await db.prepare("SELECT status,correction_pending,correction_deadline_at FROM qc_submissions WHERE tenant_id=? AND submitted_at>=? AND submitted_at<?").all(account.tenant_id,period.start,period.end);
  const review=rows.filter(q=>q.status==='pending'||q.correction_pending).length;
  const overdue=rows.filter(q=>q.status==='rejected'&&!q.correction_pending&&q.correction_deadline_at&&q.correction_deadline_at<=now).length;
  const techs=await db.prepare("SELECT t.tech_id,COALESCE(t.monthly_qc_goal,n.monthly_qc_goal) AS goal,(SELECT COUNT(*) FROM qc_submissions q WHERE q.tenant_id=t.tenant_id AND q.tech_id=t.tech_id AND q.status='approved' AND q.submitted_at>=? AND q.submitted_at<?) AS approved FROM technicians t JOIN tenants n ON n.id=t.tenant_id WHERE t.tenant_id=? AND t.is_admin=0 AND t.active=1").all(period.start,period.end,account.tenant_id);
  const behind=techs.filter(t=>t.approved<t.goal),zero=behind.filter(t=>t.approved===0);
  if(!review&&!overdue&&!behind.length)return null;
  return `${review} QCs need review; ${overdue} corrections overdue; ${behind.length} technicians below goal${zero.length?` (${zero.length} with zero approved QCs)`:''}.`;
}
function dayKey(period){return `${period.key}:${period.daysLeft}`;}
function qcLink(q){return `/captures?qc=${encodeURIComponent(q.id)}${q.status==='pending'?'':q.correction_pending?'&fixed=1':'&readonly=1'}`;}
export async function collectNotifications(db, now = Date.now()) {
  const period=notificationPeriod(now);
  const accounts=await db.prepare("SELECT p.*,t.is_admin,COALESCE(t.monthly_qc_goal,n.monthly_qc_goal) AS goal FROM push_accounts p JOIN technicians t ON t.tenant_id=p.tenant_id AND t.tech_id=p.tech_id JOIN tenants n ON n.id=p.tenant_id WHERE p.enabled=1 AND t.active=1 AND n.active=1 AND t.must_change_credentials=0").all();
  for(const account of accounts){
    await companyAlerts(db,account);
    if(account.is_admin){
      const uploads=await db.prepare("SELECT q.*,w.upload_enabled,w.fixed_enabled FROM push_watches w JOIN technicians t ON t.tenant_id=w.tenant_id AND t.tech_id=w.tech_id JOIN qc_submissions q ON q.tenant_id=w.tenant_id AND q.tech_id=w.tech_id WHERE w.tenant_id=? AND w.supervisor_id=? AND t.active=1 AND q.submitted_at>=MAX(w.enabled_at,?,?) AND q.submitted_at<?").all(account.tenant_id,account.tech_id,account.enabled_at,Math.max(period.start,now-24*HOUR),period.end);
      for(const q of uploads){
        const fixed=Boolean(q.correction_pending);
        if(fixed?!q.fixed_enabled:!q.upload_enabled||q.status!=='pending')continue;
        await enqueue(db,account,fixed?'fixed':'upload',q.id,fixed?`Tech ${q.tech_id} resubmitted Job ${q.job_number}—attempt ${q.attempt_number} is ready for review.`:`Tech ${q.tech_id} submitted Job ${q.job_number}. Ready to review.`,qcLink(q),q.submitted_at+24*HOUR,q.id,q.submitted_at);
      }
      if(period.morning&&account.supervisor_summary){const message=await supervisorSummary(db,account,now,period);if(message)await enqueue(db,account,'supervisor_morning',dayKey(period),message,'/',period.dayEnd);}
      if(period.morning&&account.escalation){
        const jobs=await db.prepare("SELECT id,tech_id,job_number,correction_deadline_at FROM qc_submissions WHERE tenant_id=? AND status='rejected' AND correction_pending=0 AND correction_deadline_at<=? AND submitted_at>=? AND submitted_at<?").all(account.tenant_id,now-24*HOUR,period.start,period.end);
        for(const q of jobs)await enqueue(db,account,'escalation',`${q.id}:${q.correction_deadline_at}`,`Tech ${q.tech_id}: Job ${q.job_number} remains overdue for more than a day. Please follow up.`,qcLink({...q,status:'rejected'}),period.end,q.id,q.correction_deadline_at);
      }
      continue;
    }
    const rejected=await db.prepare("SELECT * FROM qc_submissions WHERE tenant_id=? AND tech_id=? AND status='rejected' AND correction_pending=0 AND correction_deadline_at IS NOT NULL AND submitted_at>=? AND submitted_at<?").all(account.tenant_id,account.tech_id,period.start,period.end);
    for(const q of rejected){const hours=Math.ceil((q.correction_deadline_at-now)/HOUR);if(account.rejected&&q.reviewed_at>=account.enabled_at&&hours>0){
      const reason=(q.review_note||'').replace(/Please go back[\s\S]*$/i,'').trim().slice(0,180);
      await enqueue(db,account,'rejected',`${q.id}:${q.correction_deadline_at}`,`Job ${q.job_number} rejected${reason?`: ${reason}`:'.'} You have ${hours} hours to fix it.`,`/profile?view=rejected&qc=${encodeURIComponent(q.id)}`,Math.min(q.reviewed_at+6*HOUR,q.correction_deadline_at),q.id,q.correction_deadline_at);
    }}
    if(period.morning){const summary=await technicianSummary(db,account,now,period);if(summary.message)await enqueue(db,account,'technician_morning',dayKey(period),summary.message,summary.url,period.dayEnd);}
  }
}
export async function notificationStillRelevant(db,event,now){
  const account=await db.prepare("SELECT p.*,t.active,t.is_admin,COALESCE(t.monthly_qc_goal,n.monthly_qc_goal) AS goal,n.active AS company_active FROM push_accounts p JOIN technicians t ON t.tenant_id=p.tenant_id AND t.tech_id=p.tech_id JOIN tenants n ON n.id=p.tenant_id WHERE p.tenant_id=? AND p.tech_id=?").get(event.tenant_id,event.tech_id);
  await companyAlerts(db,account);
  if(!account?.enabled||!account.active||!account.company_active||event.expires_at<=now)return null;
  const period=notificationPeriod(now);
  if(event.kind==='technician_morning'){
    if(account.is_admin||event.event_key!==`${event.tenant_id}:${event.tech_id}:technician_morning:${dayKey(period)}`)return null;
    const summary=await technicianSummary(db,account,now,period);if(!summary.message)return null;Object.assign(event,summary);
  }else if(event.kind==='supervisor_morning'){
    if(!account.is_admin||!account.supervisor_summary||event.event_key!==`${event.tenant_id}:${event.tech_id}:supervisor_morning:${dayKey(period)}`)return null;
    event.message=await supervisorSummary(db,account,now,period);if(!event.message)return null;
  }else if(event.submission_id){
    const q=await db.prepare("SELECT * FROM qc_submissions WHERE tenant_id=? AND id=?").get(event.tenant_id,event.submission_id);
    if(!q||q.submitted_at<period.start||q.submitted_at>=period.end)return null;
    if(['upload','fixed'].includes(event.kind)){
      const watch=await db.prepare("SELECT upload_enabled,fixed_enabled FROM push_watches WHERE tenant_id=? AND supervisor_id=? AND tech_id=?").get(q.tenant_id,account.tech_id,q.tech_id);
      if(!account.is_admin||!watch||(event.kind==='fixed'?!watch.fixed_enabled||!q.correction_pending:!watch.upload_enabled||q.correction_pending||q.status!=='pending'))return null;
      if(!await db.prepare("SELECT 1 FROM technicians WHERE tenant_id=? AND tech_id=? AND active=1").get(q.tenant_id,q.tech_id))return null;
    }else{
      if(q.status!=='rejected'||q.correction_pending||q.correction_deadline_at!==event.revision)return null;
      if(event.kind==='escalation'){if(!account.is_admin||!account.escalation||q.correction_deadline_at>now-24*HOUR)return null;}
      else if(event.kind==='rejected'){
        if(account.is_admin||!account.rejected||q.tech_id!==account.tech_id||q.correction_deadline_at<=now)return null;
        const reason=(q.review_note||'').replace(/Please go back[\s\S]*$/i,'').trim().slice(0,180);
        event.message=`Job ${q.job_number} rejected${reason?`: ${reason}`:'.'} You have ${Math.ceil((q.correction_deadline_at-now)/HOUR)} hours to fix it.`;
      }else return null; // retire old individual reminder events
    }
  }else return null;
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
  await collectNotifications(db, now);
  if (!config.sendingEnabled || !config.apiKey) return;
  const events = (await db.prepare("SELECT * FROM push_outbox WHERE sent_at IS NULL AND attempts<8 AND next_attempt_at<=? ORDER BY next_attempt_at LIMIT 40").all(now));
  for (const event of events) {
    // Hold scheduled alerts until the 8:00 AM Chicago polling window, including retries.
    if (["deadline", "overdue", "monthly", "technician_morning", "supervisor_morning", "escalation"].includes(event.kind) && !notificationPeriod(now).morning) continue;
    const account = await notificationStillRelevant(db, event, now);
    if (!account) { (await db.prepare("UPDATE push_outbox SET sent_at=-1 WHERE id=?").run(event.id)); continue; }
    // Claim a short lease before network IO so multiple workers cannot send concurrently.
    const claimed = (await db.prepare("UPDATE push_outbox SET next_attempt_at=? WHERE id=? AND sent_at IS NULL AND next_attempt_at<=?").run(now + 60000, event.id, now));
    if (!claimed.changes) continue;
    try { await send(event, account, config); (await db.prepare("UPDATE push_outbox SET sent_at=?,last_error=NULL WHERE id=?").run(now, event.id)); }
    catch { (await db.prepare("UPDATE push_outbox SET attempts=attempts+1,next_attempt_at=?,last_error=? WHERE id=?").run(now + Math.min(HOUR, 30000 * 2 ** event.attempts), "Provider delivery failed. Check configuration or subscription.", event.id)); }
  }
  (await db.prepare("DELETE FROM push_outbox WHERE expires_at<?").run(now - 7 * 86400000));
}

export function startNotificationWorker() {
  const config = pushConfig();
  if (!config.sendingEnabled || !config.apiKey) return;
  const sqlite = process.env.DATABASE_URL ? null : new DatabaseSync(join(resolve(process.env.TQA_DATA_DIR || ".tqa-data"), "tqa.sqlite"));
  sqlite?.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000");
  const db = createDatabase({sqlite});
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
