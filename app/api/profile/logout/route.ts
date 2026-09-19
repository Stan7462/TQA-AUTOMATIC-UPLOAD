import { env } from '@/lib/local-env';
import { clearTechCookie, getCookie, hashToken, sameOrigin, TECH_COOKIE } from '@/lib/tech-auth';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Invalid origin' }, { status: 403 });
  if (!env.DB) return Response.json({ error: 'Unavailable' }, { status: 503 });
  const token = getCookie(request, TECH_COOKIE);
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    await env.DB.prepare('DELETE FROM tech_sessions WHERE token_hash = ?').bind(await hashToken(token)).run();
  }
  const secure = (request.headers.get('origin') || new URL(request.url).origin).startsWith('https:');
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': clearTechCookie(secure), 'Cache-Control': 'no-store' } });
}
