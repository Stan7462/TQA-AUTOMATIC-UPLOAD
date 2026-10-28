import {superSameOrigin} from '@/lib/super-auth';
import {env} from '@/lib/local-env';
import {getSuperSession,superHeaders} from '@/lib/super-auth';
import {companyInput} from '@/lib/super-companies';
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){
 if(!superSameOrigin(request))return Response.json({error:'Invalid origin.'},{status:403});
 const session=await getSuperSession(request);if(!session)return Response.json({error:'Super admin sign-in required.'},{status:401});
 const {id}=await context.params;
 const current=await env.DB.prepare('SELECT id FROM tenants WHERE id=?').bind(id).first();if(!current)return Response.json({error:'Company not found.'},{status:404});
 const body=await request.json().catch(()=>null);if(!body||typeof body!=='object'||Array.isArray(body))return Response.json({error:'Enter company details.'},{status:400});
 let input;try{input=companyInput(body as Record<string,unknown>);}catch(e){return Response.json({error:(e as Error).message},{status:400});}
 const fields:{[key:string]:string}={name:'name',status:'subscription_status',plan:'plan_name',renewalAt:'renewal_at',contactEmail:'contact_email',notes:'subscription_notes'};
 const entries=Object.entries(input).filter(([key])=>key in fields);
 const sql=entries.map(([key])=>`${fields[key]}=?`).join(',')+('status' in input?',active=1':'');
 await env.DB.batch([
  env.DB.prepare(`UPDATE tenants SET ${sql} WHERE id=?`).bind(...entries.map(([,value])=>value??null),id),
  env.DB.prepare('INSERT INTO super_admin_audit(id,actor,action,tenant_id,details,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),session.login,'company.update',id,JSON.stringify(input),Date.now()),
 ]);
 return Response.json({ok:true},{headers:superHeaders});
}
