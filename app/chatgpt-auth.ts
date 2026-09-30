import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from '@/lib/local-env';
import { getTechSessionFromCookie, TECH_COOKIE, type AuthenticatedTech } from '@/lib/tech-auth';
import { getRequestTenant } from '@/lib/tenant';

export type ChatGPTUser = { userId: string; displayName: string; email: string; fullName: string | null; tenantId: string; tenantName: string; techId: string };
export const OWNER_COOKIE = 'tqa_owner_session';
const OWNER_EMAIL = 'hrynivstanislav@gmail.com';

async function currentTech(): Promise<AuthenticatedTech | null> {
  const jar = await cookies();
  const requestHeaders = await headers();
  const techToken = jar.get(TECH_COOKIE)?.value;
  if (!techToken) return null;
  const protocol = requestHeaders.get('x-forwarded-proto') || 'https';
  const host = (requestHeaders.get('x-forwarded-host') || requestHeaders.get('host') || 'localhost').split(',')[0].trim();
  const request = new Request(`${protocol}://${host}/`);
  const tenant = await getRequestTenant(request, env.DB);
  return tenant ? getTechSessionFromCookie(`${TECH_COOKIE}=${techToken}`, env.DB, tenant.id) : null;
}
const owner = (tech: AuthenticatedTech): ChatGPTUser => ({ userId: 'local-owner', displayName: tech.tenantName, email: OWNER_EMAIL, fullName: null, tenantId: tech.tenantId, tenantName: tech.tenantName, techId: tech.techId });
export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const tech = await currentTech();
  return tech?.isAdmin ? owner(tech) : null;
}
export async function requireChatGPTUser(returnTo: string): Promise<ChatGPTUser> {
  const tech = await currentTech();
  if (tech?.isAdmin) return owner(tech);
  if (tech) redirect('/capture');
  redirect('/login?return_to=' + encodeURIComponent(returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/'));
}
export function chatGPTSignOutPath(): string { return '/api/owner/logout'; }
