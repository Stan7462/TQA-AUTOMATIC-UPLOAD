import {redirect} from 'next/navigation';
import {cookies} from 'next/headers';
import {superSessionFromCookies,SUPER_COOKIE} from '@/lib/super-auth';
import SuperAdminDashboard from './super-admin-dashboard';
import './super-admin.css';
export const dynamic='force-dynamic';
export default async function SuperAdminPage(){
 const jar=await cookies(),token=jar.get(SUPER_COOKIE)?.value;
 const session=await superSessionFromCookies(token?`${SUPER_COOKIE}=${token}`:null);
 if(!session)redirect('/login?return_to=%2Fsuper-admin');
 return <SuperAdminDashboard/>;
}
