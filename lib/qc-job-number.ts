import { env } from "@/lib/local-env";

type Actor = {tenantId:string;techId:string;email:string;isSuperAdmin?:boolean};
const headers={"Cache-Control":"private, no-store"};
export async function changeQcJobNumber(request:Request,id:string,actor:Actor){
 if(!/^[0-9a-f-]{36}$/.test(id))return Response.json({error:"Invalid QC."},{status:400,headers});
 const raw=await request.text();
 if(raw.length>1024)return Response.json({error:"Invalid job number change."},{status:400,headers});
 let body:{jobNumber?:unknown;expectedJobNumber?:unknown};
 try{body=JSON.parse(raw);}catch{return Response.json({error:"Enter a valid job number."},{status:400,headers});}
 const next=typeof body?.jobNumber==='string'?body.jobNumber.trim():'';
 if(!/^\d{1,6}$/.test(next)||typeof body?.expectedJobNumber!=='string')return Response.json({error:"Enter a job number using 1 to 6 digits."},{status:400,headers});
 const tenant=actor.tenantId;
 const current=await env.DB.prepare("SELECT job_number AS jobNumber,COALESCE(root_submission_id,id) AS rootId FROM qc_submissions WHERE tenant_id=? AND id=?").bind(tenant,id).first<{jobNumber:string;rootId:string}>();
 if(!current)return Response.json({error:"QC not found."},{status:404,headers});
 if(current.jobNumber!==body.expectedJobNumber)return Response.json({error:"This job number changed. Refresh the QC before editing."},{status:409,headers});
 const guard="tenant_id=? AND id=? AND job_number=? AND trust_upload_status<>'uploaded' AND NOT EXISTS (SELECT 1 FROM qc_submission_attempts WHERE tenant_id=? AND root_submission_id=? AND trust_upload_status='uploaded')";
 const params=[tenant,id,current.jobNumber,tenant,current.rootId];
 const editable=await env.DB.prepare(`SELECT id FROM qc_submissions WHERE ${guard}`).bind(...params).first();
 if(!editable)return Response.json({error:"Job number editing is locked because this QC or an earlier attempt has a confirmed Catalyst upload."},{status:409,headers});
 if(next===current.jobNumber)return Response.json({id,jobNumber:next},{headers});
 const changeId=crypto.randomUUID(),changedAt=Date.now(),changedBy=actor.isSuperAdmin?`super_admin:${actor.email}`:`supervisor:${actor.techId}`;
 // Lock current and historical attempts, then recheck the upload state inside the transaction.
 const auditGuard="EXISTS (SELECT 1 FROM qc_job_number_changes WHERE change_id=? AND tenant_id=? AND submission_id=?)";
 const results=await env.DB.batch([
  env.DB.prepare("UPDATE qc_submissions SET id=id WHERE tenant_id=? AND id=?").bind(tenant,id),
  env.DB.prepare("UPDATE qc_submission_attempts SET submission_id=submission_id WHERE tenant_id=? AND root_submission_id=?").bind(tenant,current.rootId),
  env.DB.prepare(`INSERT INTO qc_job_number_changes(change_id,tenant_id,root_submission_id,submission_id,old_job_number,new_job_number,changed_by,changed_at) SELECT ?,tenant_id,COALESCE(root_submission_id,id),id,job_number,?,?,? FROM qc_submissions WHERE ${guard}`).bind(changeId,next,changedBy,changedAt,...params),
  env.DB.prepare(`INSERT INTO qc_job_number_changes(change_id,tenant_id,root_submission_id,submission_id,old_job_number,new_job_number,changed_by,changed_at) SELECT ?,tenant_id,root_submission_id,submission_id,job_number,?,?,? FROM qc_submission_attempts WHERE tenant_id=? AND root_submission_id=? AND ${auditGuard}`).bind(changeId,next,changedBy,changedAt,tenant,current.rootId,changeId,tenant,id),
  env.DB.prepare(`UPDATE qc_submissions SET job_number=?,trust_upload_status='ready',trust_upload_error=NULL,trust_upload_attempts=0,trust_last_attempt_at=NULL,trust_uploaded_at=NULL,trust_external_reference=NULL,trust_uploaded_by_key_id=NULL,catalyst_observation_id=NULL,catalyst_observation_type=NULL WHERE tenant_id=? AND id=? AND ${auditGuard}`).bind(next,tenant,id,changeId,tenant,id),
  env.DB.prepare(`UPDATE qc_submission_attempts SET job_number=?,trust_upload_status='ready',trust_upload_error=NULL,trust_upload_attempts=0,trust_last_attempt_at=NULL,trust_uploaded_at=NULL,trust_external_reference=NULL,trust_uploaded_by_key_id=NULL,catalyst_observation_id=NULL,catalyst_observation_type=NULL WHERE tenant_id=? AND root_submission_id=? AND ${auditGuard}`).bind(next,tenant,current.rootId,changeId,tenant,id),
 ]);
 if(!results[2].meta.changes)return Response.json({error:"This QC changed or has a confirmed Catalyst upload. Refresh before trying again."},{status:409,headers});
 return Response.json({id,jobNumber:next,changedAt},{headers});
}
