import { OWNER_COOKIE } from '@/app/chatgpt-auth';
import { env } from '@/lib/local-env';
import { clearTechCookie, getCookie, hashToken, TECH_COOKIE } from '@/lib/tech-auth';
export async function GET(request: Request) {
  const secure = (process.env.TQA_PUBLIC_ORIGIN || new URL(request.url).origin).startsWith('https:');
  const techToken = getCookie(request, TECH_COOKIE);
  if (techToken && /^[a-f0-9]{64}$/.test(techToken)) {
    await env.DB.prepare('DELETE FROM tech_sessions WHERE token_hash = ?').bind(await hashToken(techToken)).run();
  }
  const headers = new Headers({ Location: '/login', 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', `${OWNER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`);
  headers.append('Set-Cookie', clearTechCookie(secure));
  return new Response(null, { status: 302, headers });
}
