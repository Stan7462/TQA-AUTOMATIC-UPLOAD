import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { collectNotifications, notificationPeriod, processNotifications } from "./push-notifications.mjs";

const now = Date.parse("2026-10-08T15:00:00Z");
const HOUR = 3600000;
const config = { sendingEnabled: true, apiKey: "test-only", appId: "test", origin: "https://example.test" };
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE tenants(id TEXT PRIMARY KEY, active INTEGER DEFAULT 1, monthly_qc_goal INTEGER DEFAULT 5);
    CREATE TABLE technicians(tenant_id TEXT,tech_id TEXT,active INTEGER DEFAULT 1,is_admin INTEGER DEFAULT 0,must_change_credentials INTEGER DEFAULT 0,monthly_qc_goal INTEGER,PRIMARY KEY(tenant_id,tech_id));
    CREATE TABLE qc_submissions(id TEXT PRIMARY KEY,tenant_id TEXT,tech_id TEXT,job_number TEXT,status TEXT DEFAULT 'pending',correction_pending INTEGER DEFAULT 0,attempt_number INTEGER DEFAULT 1,submitted_at INTEGER,reviewed_at INTEGER,review_note TEXT,correction_deadline_at INTEGER);
    INSERT INTO tenants(id) VALUES ('a'),('b');
    INSERT INTO technicians(tenant_id,tech_id,is_admin) VALUES ('a','SUP',1),('b','SUP',1),('a','1111',0),('b','1111',0),('a','2222',0);`);
  db.exec(readFileSync(new URL("../drizzle/0017_push_notifications.sql", import.meta.url), "utf8"));
  db.exec(readFileSync(new URL("../drizzle/0018_company_notification_policy.sql", import.meta.url), "utf8"));
  db.exec(readFileSync(new URL("../drizzle/0019_notification_summaries.sql", import.meta.url), "utf8"));
  return db;
}
function account(db, tenant, tech) { db.prepare("INSERT INTO push_accounts(tenant_id,tech_id,external_id,enabled,enabled_at) VALUES(?,?,?,1,?)").run(tenant, tech, `${tenant}-${tech}`, now - HOUR); }
function qc(db, id, tenant, tech, rejected = false) { db.prepare("INSERT INTO qc_submissions(id,tenant_id,tech_id,job_number,status,submitted_at,reviewed_at,correction_deadline_at) VALUES(?,?,?,'776499',?,?,?,?)").run(id, tenant, tech, rejected ? "rejected" : "pending", now, rejected ? now : null, rejected ? now + 72 * HOUR : null); }

test("company alert policy overrides technician choices and remains company scoped", async () => {
  const db = fixture(); account(db,"a","1111"); account(db,"b","1111");
  qc(db,"a1","a","1111",true); qc(db,"b1","b","1111",true);
  db.exec("UPDATE push_accounts SET rejected=0; INSERT INTO push_company_preferences(tenant_id,rejected) VALUES('a',0)");
  const sends = [];
  await processNotifications(db,{now,config,send:async event=>sends.push(event.tenant_id)});
  assert.deepEqual(sends,["b"]);
  db.exec("UPDATE push_company_preferences SET rejected=1 WHERE tenant_id='a'");
  await processNotifications(db,{now:now+15000,config,send:async event=>sends.push(event.tenant_id)});
  assert.deepEqual(sends,["b","a"]); db.close();
});

test("supervisor watches are scoped to both company and individual technician; polling does not duplicate", async () => {
  const db = fixture(); account(db, "a", "SUP"); account(db, "b", "SUP");
  db.prepare("INSERT INTO push_watches(tenant_id,supervisor_id,tech_id,enabled_at) VALUES('a','SUP','1111',?)").run(now - HOUR);
  qc(db,"a1","a","1111"); qc(db,"a2","a","2222"); qc(db,"b1","b","1111");
  const sends = [];
  const send = async (event, recipient) => sends.push([event.id, recipient.external_id, event.submission_id]);
  await processNotifications(db, { now, config, send });
  await processNotifications(db, { now: now + 15000, config, send });
  assert.equal(sends.length, 1); assert.equal(sends[0][1], "a-SUP"); assert.equal(sends[0][2], "a1"); db.close();
});

test("fixing a QC cancels a queued reminder; new rejection gets a fresh alert", async () => {
  const db=fixture(); account(db,"a","1111"); qc(db,"q1","a","1111",true);
  await collectNotifications(db,now);
  db.exec("UPDATE qc_submissions SET correction_pending=1");
  const sends=[]; const send=async event=>sends.push(event);
  await processNotifications(db,{now,config,send}); assert.equal(sends.length,0);
  db.prepare("UPDATE qc_submissions SET correction_pending=0,reviewed_at=?,correction_deadline_at=?").run(now+HOUR,now+73*HOUR);
  await processNotifications(db,{now:now+HOUR,config,send}); assert.equal(sends.length,1); db.close();
});

test("provider retries reuse the same idempotency ID and an inactive company receives nothing", async () => {
  const db=fixture(); account(db,"a","1111"); qc(db,"q1","a","1111",true);
  const ids=[];
  await processNotifications(db,{now,config,send:async event=>{ids.push(event.id);throw Error("offline");}});
  await processNotifications(db,{now:now+31000,config,send:async event=>ids.push(event.id)});
  assert.equal(ids.length,2); assert.equal(ids[0],ids[1]);
  qc(db,"q2","a","1111",true); db.exec("UPDATE tenants SET active=0 WHERE id='a'");
  await processNotifications(db,{now:now+60000,config,send:async event=>ids.push(event.id)});
  assert.equal(ids.length,2);db.close();
});


test("monthly reminders send two summaries at 8 AM and respect individual goals",async()=>{
 const db=fixture();account(db,'a','1111');account(db,'a','2222');qc(db,'approved','a','1111');db.exec("UPDATE qc_submissions SET status='approved';UPDATE technicians SET monthly_qc_goal=1 WHERE tenant_id='a' AND tech_id='1111'");
 const sends=[],send=async(e,a)=>sends.push([e.message,a.tech_id]);
 for(const date of ['2026-10-14T13:00:00Z','2026-10-15T12:59:59Z'])await processNotifications(db,{now:Date.parse(date),config,send});assert.equal(sends.length,0);
 await processNotifications(db,{now:Date.parse('2026-10-15T13:00:00Z'),config,send});assert.equal(sends.length,1);assert.equal(sends[0][1],'2222');assert.match(sends[0][0],/0 of 5 approved/);
 await processNotifications(db,{now:Date.parse('2026-10-15T13:00:15Z'),config,send});assert.equal(sends.length,1);
 await processNotifications(db,{now:Date.parse('2026-10-16T13:00:00Z'),config,send});assert.equal(sends.length,2);
 await processNotifications(db,{now:Date.parse('2026-10-19T13:00:00Z'),config,send});assert.equal(sends.length,2);db.close();
});
test("morning summary combines jobs, sorts urgency, updates hours and repeats only next morning",async()=>{
 const db=fixture();account(db,'a','1111');qc(db,'q1','a','1111',true);qc(db,'q2','a','1111',true);
 const morning=Date.parse('2026-10-09T13:00:00Z');db.prepare("UPDATE qc_submissions SET correction_deadline_at=? WHERE id='q1'").run(morning+35*HOUR);db.prepare("UPDATE qc_submissions SET correction_deadline_at=?,job_number='123456' WHERE id='q2'").run(morning+17*HOUR);
 db.exec("INSERT INTO push_company_preferences(tenant_id,rejected) VALUES('a',0)");const sends=[],send=async e=>sends.push({...e});
 await processNotifications(db,{now:morning-15000,config,send});assert.equal(sends.length,0);
 await processNotifications(db,{now:morning,config,send});assert.equal(sends.length,1);assert.match(sends[0].message,/123456—17 hours.*776499—35 hours/);
 await processNotifications(db,{now:morning+11*HOUR,config,send});assert.equal(sends.length,1);
 await processNotifications(db,{now:morning+24*HOUR,config,send});assert.equal(sends.length,2);assert.match(sends[1].message,/123456—overdue.*776499—11 hours/);
 db.exec("UPDATE qc_submissions SET correction_pending=1");await processNotifications(db,{now:morning+48*HOUR,config,send});assert.equal(sends.length,2);db.close();
});
test("rejection includes reason and job link immediately at night",async()=>{
 const db=fixture();account(db,'a','1111');qc(db,'q1','a','1111',true);db.exec("UPDATE qc_submissions SET review_note='TAP ports not visible. Please go back and fix it ASAP, within 72 hours.'");const sends=[];
 await processNotifications(db,{now,config,send:async e=>sends.push(e)});assert.match(sends[0].message,/TAP ports not visible/);assert.equal(sends[0].url,'/profile?view=rejected&qc=q1');db.close();
});
test("fixed alerts have their own switch and remain supervisor and company scoped",async()=>{
 const db=fixture();account(db,'a','SUP');account(db,'b','SUP');qc(db,'q1','a','1111',true);qc(db,'q2','b','1111',true);db.exec("UPDATE qc_submissions SET correction_pending=1,attempt_number=2");
 db.prepare("INSERT INTO push_watches(tenant_id,supervisor_id,tech_id,enabled_at,upload_enabled,fixed_enabled) VALUES('a','SUP','1111',?,0,1)").run(now-HOUR);const sends=[];
 await processNotifications(db,{now,config,send:async(e,a)=>sends.push([e,a.external_id])});assert.equal(sends.length,1);assert.equal(sends[0][1],'a-SUP');assert.equal(sends[0][0].kind,'fixed');assert.match(sends[0][0].url,/fixed=1/);db.close();
});
test("supervisor morning summary includes zero-QC techs and escalates once after another day overdue",async()=>{
 const db=fixture();account(db,'a','SUP');qc(db,'q1','a','1111',true);const morning=Date.parse('2026-10-12T13:00:00Z');db.prepare("UPDATE qc_submissions SET correction_deadline_at=?").run(morning-24*HOUR);const sends=[],send=async e=>sends.push({...e});
 await processNotifications(db,{now:morning-1000,config,send});assert.equal(sends.length,0);
 await processNotifications(db,{now:morning,config,send});assert.equal(sends.length,2);assert.match(sends.find(e=>e.kind==='supervisor_morning').message,/2 with zero approved QCs/);assert.equal(sends.filter(e=>e.kind==='escalation').length,1);
 await processNotifications(db,{now:morning+24*HOUR,config,send});assert.equal(sends.filter(e=>e.kind==='escalation').length,1);db.close();
});
test("queued summary cancels when fixes complete and retries never send outside 8 AM",async()=>{
 const db=fixture();account(db,'a','1111');qc(db,'q1','a','1111',true);const morning=Date.parse('2026-10-11T13:00:00Z');const sends=[];
 await processNotifications(db,{now:morning,config,send:async e=>{sends.push(e);throw Error('offline');}});assert.equal(sends.length,1);
 await processNotifications(db,{now:morning+HOUR,config,send:async e=>sends.push(e)});assert.equal(sends.length,1);
 db.exec("UPDATE qc_submissions SET correction_pending=1");await processNotifications(db,{now:morning+45000,config,send:async e=>sends.push(e)});assert.equal(sends.length,1);db.close();
});
test("Chicago fiscal schedule handles winter and daylight saving",()=>{
 const p=notificationPeriod(Date.parse('2026-11-15T14:00:00Z'));assert.equal(p.morning,true);assert.equal(p.daysLeft,6);assert.equal(notificationPeriod(Date.parse('2026-11-15T13:59:00Z')).morning,false);assert.equal(new Date(p.start).toISOString(),'2026-10-22T05:00:00.000Z');assert.equal(new Date(p.end).toISOString(),'2026-11-22T06:00:00.000Z');
});
