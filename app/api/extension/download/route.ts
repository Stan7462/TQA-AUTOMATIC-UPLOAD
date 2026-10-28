import {getChatGPTUser} from '@/app/chatgpt-auth';
import {isOwner} from '@/app/access';
import {createExtensionPackage} from '@/lib/extension-package.mjs';
export const dynamic='force-dynamic';
export async function GET(){
  if(!isOwner(await getChatGPTUser()))return Response.json({error:'Supervisor sign-in required.'},{status:403,headers:{'Cache-Control':'private, no-store'}});
  try{
    const archive=createExtensionPackage();
    return new Response(new Uint8Array(archive.bytes),{headers:{
      'Content-Type':'application/zip',
      'Content-Disposition':`attachment; filename="${archive.filename}"`,
      'Content-Length':String(archive.bytes.length),
      'Cache-Control':'private, no-store',
      'X-Content-Type-Options':'nosniff',
    }});
  }catch(error){
    console.error('Extension download failed',error);
    return Response.json({error:'Could not prepare the extension download. Please try again.'},{status:503,headers:{'Cache-Control':'private, no-store'}});
  }
}
