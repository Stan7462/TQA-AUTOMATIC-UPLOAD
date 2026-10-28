import {extensionVersionInfo} from '@/lib/extension-version';
export const dynamic='force-dynamic';
export async function GET(){return Response.json(extensionVersionInfo(),{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
