import {cookies} from 'next/headers';
import {superConfigured,superSessionFromCookies,SUPER_COOKIE} from '@/lib/super-auth';
import SuperAdminDashboard from './super-admin-dashboard';
import './super-admin.css';
export const dynamic='force-dynamic';
export default async function SuperAdminPage(){
 const jar=await cookies(),token=jar.get(SUPER_COOKIE)?.value;
 const session=await superSessionFromCookies(token?`${SUPER_COOKIE}=${token}`:null);
 return <SuperAdminDashboard signedIn={Boolean(session)} configured={superConfigured()}/>;
}
