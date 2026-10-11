import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const source = readFileSync(new URL('../app/api/qc-stats/route.ts', import.meta.url), 'utf8');
const query = source.match(/prepare\(`(SELECT tech_id AS techId, COUNT\(DISTINCT[\s\S]*?)`\)/)[1];
test('snapshot counts confirmed first failures after corrections, once per job and within company/month', () => {
  const db = new DatabaseSync(':memory:');
  const cols = 'tenant_id TEXT, root_submission_id TEXT, attempt_number INTEGER, tech_id TEXT, status TEXT, trust_upload_status TEXT, submitted_at INTEGER';
  db.exec(`CREATE TABLE qc_submissions (id TEXT, ${cols}); CREATE TABLE qc_submission_attempts (submission_id TEXT, ${cols})`);
  const current = db.prepare('INSERT INTO qc_submissions VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const history = db.prepare('INSERT INTO qc_submission_attempts VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  current.run('a', 'company', 'a', 1, 'TECH', 'rejected', 'uploaded', 100);
  // A historical Fail still counts after its final correction is approved/uploaded.
  history.run('b', 'company', 'b', 1, 'TECH', 'rejected', 'uploaded', 100);
  current.run('b-fixed', 'company', 'b', 3, 'TECH', 'approved', 'uploaded', 150);
  history.run('b-mid', 'company', 'b', 2, 'TECH', 'rejected', 'uploaded', 130);
  // A duplicate archived copy must not inflate the count.
  history.run('a', 'company', 'a', 1, 'TECH', 'rejected', 'uploaded', 100);
  current.run('c', 'company', 'c', 1, 'TECH', 'rejected', 'ready', 100);
  current.run('d', 'company', 'd', 1, 'TECH', 'rejected', 'failed', 100);
  current.run('e', 'other', 'e', 1, 'TECH', 'rejected', 'uploaded', 100);
  history.run('f', 'company', 'f', 1, 'TECH', 'rejected', 'uploaded', 10);
  assert.deepEqual(db.prepare(query).all('company', 50, 200).map(row => ({...row})), [{ techId: 'TECH', failedUploaded: 2 }]);
  db.close();
});
