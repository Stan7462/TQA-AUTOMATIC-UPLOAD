import {env} from '@/lib/local-env';
import {getTechSessionContext} from '@/lib/tech-auth';
import {companyAccess} from '@/lib/company-access';
export async function GET(request:Request){
 const session=await getTechSessionContext(request,env.DB);if(!session)return Response.json({error:'Sign in first.'},{status:401});
 return Response.json({...await companyAccess(session.tenantId),isSuperAdmin:session.isSuperAdmin===true},{headers:{'Cache-Control':'private, no-store'}});
}
