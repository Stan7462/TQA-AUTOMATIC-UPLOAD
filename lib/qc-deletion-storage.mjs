// A durable cleanup queue lets storage failures be retried without restoring
// deleted QCs. Never remove a file still referenced by another QC or attempt.
/**
 * @param {any} db
 * @param {any} bucket
 * @param {string|null} [tenantId]
 * @param {string|null} [rootId]
 */
export async function cleanupDeletedQcPhotos(db, bucket, tenantId = null, rootId = null) {
  const pending = await db.prepare('SELECT tenant_id,root_submission_id,photo_id FROM qc_deleted_photos WHERE (CAST(? AS text) IS NULL OR tenant_id=?) AND (CAST(? AS text) IS NULL OR root_submission_id=?) LIMIT 500').bind(tenantId,tenantId,rootId,rootId).all();
  const rows = Array.isArray(pending) ? pending : pending.results;
  let remaining = 0;
  for (const row of rows) {
    try {
      if (!/^\d{13}-[a-f0-9-]{36}\.jpg$/.test(row.photo_id)) throw new Error('Invalid deleted photo reference');
      const owner = await db.prepare('SELECT id FROM qc_submissions WHERE screenshot_id=? OR EXISTS (SELECT 1 FROM json_each(photo_ids) WHERE value=?) UNION ALL SELECT submission_id AS id FROM qc_submission_attempts WHERE screenshot_id=? OR EXISTS (SELECT 1 FROM json_each(photo_ids) WHERE value=?) LIMIT 1').bind(row.photo_id,row.photo_id,row.photo_id,row.photo_id).first();
      if (!owner) await bucket.delete(`captures/${row.photo_id}`);
      await db.prepare('DELETE FROM qc_deleted_photos WHERE tenant_id=? AND root_submission_id=? AND photo_id=?').bind(row.tenant_id,row.root_submission_id,row.photo_id).run();
    } catch (error) {
      remaining++;
      console.error('Deleted QC photo cleanup will retry', error);
    }
  }
  return { remaining };
}
