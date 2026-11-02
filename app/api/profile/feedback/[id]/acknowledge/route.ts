import {env} from '@/lib/local-env';
import {getTechSessionContext,sameOrigin} from '@/lib/tech-auth';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 if(!sameOrigin(request))return Response.json({error:'Invalid request origin.'},{status:403,headers});
 if(!env.DB)return Response.json({error:'Acknowledgment is unavailable.'},{status:503,headers});
 const session=await getTechSessionContext(request,env.DB);
 if(!session)return Response.json({error:'Sign in to acknowledge this note.'},{status:401,headers});
 if(session.isAdmin||session.mustSetup)return Response.json({error:'Only the technician can acknowledge their note.'},{status:403,headers});
 const {id}=await context.params;
 if(!/^[0-9a-f-]{36}$/.test(id))return Response.json({error:'Note not found.'},{status:404,headers});
 let body:{reviewedAt?:unknown;reviewNote?:unknown};
 try{const raw=await request.text();if(raw.length>8192)throw Error();body=JSON.parse(raw);if(!body||!Number.isSafeInteger(body.reviewedAt)||typeof body.reviewNote!=='string'||!body.reviewNote.trim()||body.reviewNote.length>1000)throw Error();}
 catch{return Response.json({error:'Refresh the note and try again.'},{status:400,headers});}
 try{
  const updated=await env.DB.prepare("UPDATE qc_submissions SET feedback_acknowledged_at = COALESCE(feedback_acknowledged_at, ?) WHERE tenant_id = ? AND tech_id = ? AND id = ? AND status = 'approved' AND reviewed_at = ? AND review_note = ?").bind(Date.now(),session.tenantId,session.techId,id,body.reviewedAt as number,body.reviewNote as string).run();
  if(!updated.meta.changes)return Response.json({error:'This note changed or is no longer available. Read the latest version before acknowledging it.'},{status:409,headers});
  const note=await env.DB.prepare("SELECT feedback_acknowledged_at AS feedbackAcknowledgedAt FROM qc_submissions WHERE tenant_id = ? AND tech_id = ? AND id = ? AND status = 'approved' AND reviewed_at = ? AND review_note = ?").bind(session.tenantId,session.techId,id,body.reviewedAt as number,body.reviewNote as string).first<{feedbackAcknowledgedAt:number|null}>();
  if(!note?.feedbackAcknowledgedAt)return Response.json({error:'This note changed. Refresh and read it again.'},{status:409,headers});
  return Response.json({id,feedbackAcknowledgedAt:Number(note.feedbackAcknowledgedAt)},{headers});
 }catch(error){console.error('QC feedback acknowledgment failed',error);return Response.json({error:'Could not save your acknowledgment. Please try again.'},{status:503,headers});}
}
