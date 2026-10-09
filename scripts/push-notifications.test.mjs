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
    CREATE TABLE qc_submissions(id TEXT PRIMARY KEY,tenant_id TEXT,tech_id TEXT,job_number TEXT,status TEXT DEFAULT 'pending',correction_pending INTEGER DEFAULT 0,attempt_number INTEGER DEFAULT 1,submitted_at INTEGER,reviewed_at INTEGER,correction_deadline_at INTEGER);
    INSERT INTO tenants(id) VALUES ('a'),('b');
    INSERT INTO technicians(tenant_id,tech_id,is_admin) VALUES ('a','SUP',1),('b','SUP',1),('a','1111',0),('b','1111',0),('a','2222',0);`);
  db.exec(readFileSync(new URL("../drizzle/0017_push_notifications.sql", import.meta.url), "utf8"));
  db.exec(readFileSync(new URL("../drizzle/0018_company_notification_policy.sql", import.meta.url), "utf8"));
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
  db.prepare("INSERT INTO push_watches VALUES('a','SUP','1111',?)").run(now - HOUR);
  qc(db,"a1","a","1111"); qc(db,"a2","a","2222"); qc(db,"b1","b","1111");
  const sends = [];
  const send = async (event, recipient) => sends.push([event.id, recipient.external_id, event.submission_id]);
  await processNotifications(db, { now, config, send });
  await processNotifications(db, { now: now + 15000, config, send });
  assert.equal(sends.length, 1); assert.equal(sends[0][1], "a-SUP"); assert.equal(sends[0][2], "a1"); db.close();
});

test("72-hour rejection, 24-hour reminder and overdue alert fire once each", async () => {
  const db = fixture(); account(db,"a","1111"); qc(db,"q1","a","1111",true);
  const sends = []; const send = async event => sends.push({ ...event });
  await processNotifications(db,{now,config,send});
  await processNotifications(db,{now:now+48*HOUR,config,send});
  await processNotifications(db,{now:now+72*HOUR,config,send});
  await processNotifications(db,{now:now+73*HOUR,config,send});
  assert.deepEqual(sends.map(e=>e.kind),["rejected","deadline","overdue"]);
  assert.match(sends[0].message,/72 hours/); assert.match(sends[1].message,/24 hours/); db.close();
});

test("fixing a QC cancels a queued reminder; new rejection gets a fresh alert", async () => {
  const db=fixture(); account(db,"a","1111"); qc(db,"q1","a","1111",true);
  collectNotifications(db,now);
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

test("monthly reminders respect individual goals and stop at goal completion", async () => {
  const db=fixture(); account(db,"a","1111"); account(db,"a","2222");
  db.exec("UPDATE technicians SET monthly_qc_goal=1 WHERE tenant_id='a' AND tech_id='1111'");
  qc(db,"approved","a","1111");db.exec("UPDATE qc_submissions SET status='approved'");
  const later=Date.parse("2026-10-19T15:00:00Z"), sends=[];
  await processNotifications(db,{now:later,config,send:async (e,a)=>sends.push([e.message,a.tech_id])});
  assert.deepEqual(sends,[["You have 0 of 5 approved QCs. Monthly deadline is approaching.","2222"]]);
  await processNotifications(db,{now:later+HOUR,config,send:async e=>sends.push(e)});assert.equal(sends.length,1);db.close();
});

test("fiscal period uses Chicago midnight across daylight saving time", () => {
  const p=notificationPeriod(Date.parse("2026-11-08T15:00:00Z"));
  assert.equal(new Date(p.start).toISOString(),"2026-10-22T05:00:00.000Z");
  assert.equal(new Date(p.end).toISOString(),"2026-11-22T06:00:00.000Z");
});
