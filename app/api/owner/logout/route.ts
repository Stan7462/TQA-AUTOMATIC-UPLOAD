import { getSuperSession, auditSuper } from "@/lib/super-auth";
import { OWNER_COOKIE } from '@/app/chatgpt-auth';
import { env } from '@/lib/local-env';
import { clearTechCookie, getCookie, hashToken, TECH_COOKIE } from '@/lib/tech-auth';
export async function GET(request: Request) {
  const secure = (request.headers.get('x-forwarded-proto') || new URL(request.url).protocol.replace(':', '')) === 'https';
  const superSession = await getSuperSession(request);
  if (superSession?.selectedTenantId) {
    await auditSuper(superSession.login,'company.leave',superSession.selectedTenantId);
    await env.DB.prepare('UPDATE super_admin_sessions SET selected_tenant_id=NULL,context_expires_at=NULL WHERE token_hash=?').bind(superSession.tokenHash).run();
    return new Response(null,{status:302,headers:{Location:'/super-admin','Cache-Control':'no-store'}});
  }
  const techToken = getCookie(request, TECH_COOKIE);
  if (techToken && /^[a-f0-9]{64}$/.test(techToken)) {
    await env.DB.prepare('DELETE FROM tech_sessions WHERE token_hash = ?').bind(await hashToken(techToken)).run();
  }
  const headers = new Headers({ Location: '/login', 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', `${OWNER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`);
  headers.append('Set-Cookie', clearTechCookie(secure));
  return new Response(null, { status: 302, headers });
}
