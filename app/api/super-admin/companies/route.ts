import {superSameOrigin} from '@/lib/super-auth';
import {env} from '@/lib/local-env';
import {getSuperSession,superHeaders} from '@/lib/super-auth';
import {companyInput,newCompanyId,companySetup,demoCompanyData} from '@/lib/super-companies';
import {fiscalMonthBounds,fiscalMonthKey} from '@/lib/fiscal-month';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const session=await getSuperSession(request);if(!session)return Response.json({error:'Super admin sign-in required.'},{status:401,headers:superHeaders});
 const {start,end}=fiscalMonthBounds(fiscalMonthKey());
 const companies=await env.DB.prepare(`SELECT t.id,t.name,t.active,t.company_kind AS kind,t.subscription_status AS status,t.plan_name AS plan,t.renewal_at AS renewalAt,t.contact_email AS contactEmail,t.subscription_notes AS notes,t.created_at AS createdAt,
 (SELECT COUNT(*) FROM technicians WHERE tenant_id=t.id AND is_admin=0 AND active=1) AS technicians,
 (SELECT COUNT(*) FROM technicians WHERE tenant_id=t.id AND is_admin=1) AS supervisors,
 (SELECT COUNT(*) FROM qc_submissions WHERE tenant_id=t.id) AS totalQcs,
 (SELECT COUNT(*) FROM qc_submissions WHERE tenant_id=t.id AND submitted_at>=? AND submitted_at<?) AS monthlyQcs,
 (SELECT COUNT(*) FROM qc_submissions WHERE tenant_id=t.id AND (status='pending' OR correction_pending=1)) AS pending,
 (SELECT COUNT(*) FROM qc_submissions WHERE tenant_id=t.id AND status='rejected') AS rejected,
 (SELECT COUNT(*) FROM qc_submissions WHERE tenant_id=t.id AND status='approved' AND trust_upload_status='uploaded') AS uploaded,
 (SELECT MAX(submitted_at) FROM qc_submissions WHERE tenant_id=t.id) AS lastSubmissionAt,
 (SELECT MAX(created_at) FROM tech_sessions WHERE tenant_id=t.id) AS lastLoginAt,
 (SELECT tech_id FROM technicians WHERE tenant_id=t.id AND is_admin=1 ORDER BY created_at LIMIT 1) AS adminId,
 (SELECT must_change_credentials FROM technicians WHERE tenant_id=t.id AND is_admin=1 ORDER BY created_at LIMIT 1) AS setupPending
 FROM tenants t ORDER BY t.created_at DESC,t.name`).bind(start,end).all();
 const audit=await env.DB.prepare('SELECT a.id,a.actor,a.action,a.tenant_id AS tenantId,t.name AS companyName,a.details,a.created_at AS createdAt FROM super_admin_audit a LEFT JOIN tenants t ON t.id=a.tenant_id ORDER BY a.created_at DESC LIMIT 50').all();
 return Response.json({login:session.login,companies:companies.results,audit:audit.results,month:fiscalMonthKey(),selectedTenantId:session.selectedTenantId},{headers:superHeaders});
}
export async function POST(request:Request){
 if(!superSameOrigin(request))return Response.json({error:'Invalid origin.'},{status:403});
 const session=await getSuperSession(request);if(!session)return Response.json({error:'Super admin sign-in required.'},{status:401,headers:superHeaders});
 const body=await request.json().catch(()=>null);if(!body||typeof body!=='object'||Array.isArray(body))return Response.json({error:'Enter company details.'},{status:400});
 let input;try{input=companyInput(body as Record<string,unknown>,true);}catch(e){return Response.json({error:(e as Error).message},{status:400});}
 const id=await newCompanyId(input.name!),setup=await companySetup(id),demo=input.kind==='demo'?await demoCompanyData(id):null;
 try{
 await env.DB.batch([
 env.DB.prepare('INSERT INTO tenants(id,name,active,created_at,company_kind,subscription_status,plan_name,renewal_at,contact_email,subscription_notes) VALUES(?,?,1,?,?,?,?,?,?,?)').bind(id,input.name!,Date.now(),input.kind!,input.status!,input.plan!,input.renewalAt??null,input.contactEmail??null,input.notes??null),
 setup.statement,...(demo?.statements??[]),
 env.DB.prepare('INSERT INTO super_admin_audit(id,actor,action,tenant_id,details,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),session.login,'company.create',id,JSON.stringify({kind:input.kind,status:input.status,name:input.name}),Date.now()),
 ]);
 return Response.json({company:{id,name:input.name},setup:{adminId:setup.techId,pin:setup.pin},demoTechnicians:demo?.technicians??[]},{status:201,headers:superHeaders});
 }catch(e){if(demo)await env.BUCKET.delete(demo.pictures.map(id=>`captures/${id}`));console.error('Company creation failed',e);return Response.json({error:'Could not create this company. Please try again.'},{status:503,headers:superHeaders});}
}
