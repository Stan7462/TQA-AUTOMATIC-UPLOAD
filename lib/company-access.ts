import {env} from '@/lib/local-env';
export async function companyAccess(tenantId:string) {
  const company=await env.DB.prepare("SELECT name,active,company_kind AS kind,subscription_status AS subscriptionStatus FROM tenants WHERE id=?").bind(tenantId).first<{name:string;active:number;kind:string;subscriptionStatus:string}>();
  if(!company)return {allowed:false,message:'Company not found.',kind:'customer',subscriptionStatus:'cancelled',name:''};
  const allowed=company.active===1&&!['suspended','cancelled'].includes(company.subscriptionStatus);
  return {...company,allowed,message:allowed?'':`This company’s subscription is ${company.subscriptionStatus}. You can view existing records, but new QC submissions and Catalyst uploads are paused.`};
}
export async function companySubmissionError(tenantId:string) {
  const access=await companyAccess(tenantId);
  return access.allowed?null:Response.json({error:access.message,code:'SUBSCRIPTION_PAUSED'},{status:403,headers:{'Cache-Control':'no-store'}});
}
