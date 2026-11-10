import { env } from "@/lib/local-env";
import { cleanupDeletedQcPhotos } from "./qc-deletion-storage.mjs";

type DeleteActor = { tenantId: string; techId: string; isSuperAdmin?: boolean; email: string };
type Qc = { id: string; rootId: string; techId: string; jobNumber: string; screenshotId: string; photoIds: string; uploadStatus: string };
const headers = { "Cache-Control": "private, no-store" };

export async function permanentlyDeleteQc(request: Request, id: string, actor: DeleteActor) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({error:"Invalid QC."},{status:400,headers});
  const raw = await request.text();
  if (raw.length > 1024) return Response.json({error:"Invalid deletion request."},{status:400,headers});
  let confirmation: { permanent?: unknown; jobNumber?: unknown; techId?: unknown };
  try { confirmation = JSON.parse(raw); } catch { return Response.json({error:"Confirm permanent deletion."},{status:400,headers}); }
  if (!confirmation || confirmation.permanent !== true || typeof confirmation.jobNumber !== "string" || typeof confirmation.techId !== "string") return Response.json({error:"Confirm the job number and technician before deleting."},{status:400,headers});
  const tenant = actor.tenantId;
  const current = await env.DB.prepare("SELECT id,COALESCE(root_submission_id,id) AS rootId,tech_id AS techId,job_number AS jobNumber,screenshot_id AS screenshotId,photo_ids AS photoIds,trust_upload_status AS uploadStatus FROM qc_submissions WHERE tenant_id=? AND id=?").bind(tenant,id).first<Qc>();
  if (!current) {
    const deleted = await env.DB.prepare("SELECT d.root_submission_id AS rootId,d.job_number AS jobNumber,d.tech_id AS techId FROM qc_deletions d JOIN qc_deleted_ids i ON i.tenant_id=d.tenant_id AND i.root_submission_id=d.root_submission_id WHERE i.tenant_id=? AND i.submission_id=?").bind(tenant,id).first<{rootId:string;jobNumber:string;techId:string}>();
    if (!deleted) return Response.json({error:"QC not found."},{status:404,headers});
    if (deleted.jobNumber !== confirmation.jobNumber || deleted.techId !== confirmation.techId) return Response.json({error:"QC details changed. Refresh before deleting."},{status:409,headers});
    const cleanup = await cleanupDeletedQcPhotos(env.DB,env.BUCKET,tenant,deleted.rootId);
    return Response.json({deleted:true,alreadyDeleted:true,photoCleanupPending:cleanup.remaining>0},{status:cleanup.remaining?202:200,headers});
  }
  if (current.jobNumber !== confirmation.jobNumber || current.techId !== confirmation.techId) return Response.json({error:"QC details changed. Refresh before deleting."},{status:409,headers});
  const attempts = await env.DB.prepare("SELECT submission_id AS id,screenshot_id AS screenshotId,photo_ids AS photoIds,trust_upload_status AS uploadStatus FROM qc_submission_attempts WHERE tenant_id=? AND root_submission_id=?").bind(tenant,current.rootId).all<Pick<Qc,"id"|"screenshotId"|"photoIds"|"uploadStatus">>();
  if ([current,...attempts.results].some(qc=>qc.uploadStatus==='uploaded')) return Response.json({error:"This QC cannot be deleted because it or an earlier attempt has a confirmed Catalyst upload."},{status:409,headers});
  const ids = [...new Set([current.rootId,current.id,...attempts.results.map(qc=>qc.id)])];
  const photos = [...new Set([current,...attempts.results].flatMap(qc=>{
    const live: unknown = JSON.parse(qc.photoIds);
    if (!Array.isArray(live)) throw new Error("Invalid QC picture list");
    const values = [qc.screenshotId,...live];
    if (!values.every((photo): photo is string=>typeof photo==='string'&&/^\d{13}-[a-f0-9-]{36}\.jpg$/.test(photo))) throw new Error("Invalid QC picture reference");
    return values;
  }))];
  const root = current.rootId;
  const actorName = actor.isSuperAdmin ? `super_admin:${actor.email}` : `supervisor:${actor.techId}`;
  // Lock the current row and its history before checking confirmed uploads.
  // The INSERT condition is checked inside the same transaction as deletion.
  const changes = [
    env.DB.prepare("UPDATE qc_submissions SET id=id WHERE tenant_id=? AND id=?").bind(tenant,id),
    env.DB.prepare("UPDATE qc_submission_attempts SET submission_id=submission_id WHERE tenant_id=? AND root_submission_id=?").bind(tenant,root),
    env.DB.prepare("INSERT INTO qc_deletions(tenant_id,root_submission_id,current_submission_id,tech_id,job_number,deleted_by,deleted_at) SELECT tenant_id,COALESCE(root_submission_id,id),id,tech_id,job_number,?,? FROM qc_submissions WHERE tenant_id=? AND id=? AND trust_upload_status<>'uploaded' AND NOT EXISTS (SELECT 1 FROM qc_submission_attempts WHERE tenant_id=? AND root_submission_id=? AND trust_upload_status='uploaded') ON CONFLICT(tenant_id,root_submission_id) DO NOTHING").bind(actorName,Date.now(),tenant,id,tenant,root),
    ...ids.map(submissionId=>env.DB.prepare("INSERT INTO qc_deleted_ids(tenant_id,root_submission_id,submission_id) SELECT tenant_id,root_submission_id,? FROM qc_deletions WHERE tenant_id=? AND root_submission_id=? AND current_submission_id=? ON CONFLICT(tenant_id,submission_id) DO NOTHING").bind(submissionId,tenant,root,id)),
    ...photos.map(photo=>env.DB.prepare("INSERT INTO qc_deleted_photos(tenant_id,root_submission_id,photo_id) SELECT tenant_id,root_submission_id,? FROM qc_deletions WHERE tenant_id=? AND root_submission_id=? AND current_submission_id=? ON CONFLICT(tenant_id,root_submission_id,photo_id) DO NOTHING").bind(photo,tenant,root,id)),
    env.DB.prepare("DELETE FROM push_outbox WHERE tenant_id=? AND submission_id IN (SELECT submission_id FROM qc_deleted_ids WHERE tenant_id=? AND root_submission_id=?)").bind(tenant,tenant,root),
    env.DB.prepare("DELETE FROM qc_upload_photos WHERE tenant_id=? AND submission_id IN (SELECT submission_id FROM qc_deleted_ids WHERE tenant_id=? AND root_submission_id=?)").bind(tenant,tenant,root),
    env.DB.prepare("DELETE FROM qc_submission_attempts WHERE tenant_id=? AND root_submission_id=? AND EXISTS (SELECT 1 FROM qc_deletions WHERE tenant_id=? AND root_submission_id=? AND current_submission_id=?)").bind(tenant,root,tenant,root,id),
    env.DB.prepare("DELETE FROM qc_submissions WHERE tenant_id=? AND id=? AND EXISTS (SELECT 1 FROM qc_deletions WHERE tenant_id=? AND root_submission_id=? AND current_submission_id=?)").bind(tenant,id,tenant,root,id),
  ];
  const result = await env.DB.batch(changes);
  if (!result[2].meta.changes) return Response.json({error:"This QC changed or has a confirmed Catalyst upload. Refresh its details before trying again."},{status:409,headers});
  const cleanup = await cleanupDeletedQcPhotos(env.DB,env.BUCKET,tenant,root);
  return Response.json({deleted:true,photoCleanupPending:cleanup.remaining>0},{status:cleanup.remaining?202:200,headers});
}
