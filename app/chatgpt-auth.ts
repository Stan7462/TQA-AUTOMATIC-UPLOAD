import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from '@/lib/local-env';
import { getTechSessionFromCookie, TECH_COOKIE, type AuthenticatedTech } from '@/lib/tech-auth';

export type ChatGPTUser = { userId: string; displayName: string; email: string; fullName: string | null; tenantId: string; tenantName: string; techId: string };
export const OWNER_COOKIE = 'tqa_owner_session';
const OWNER_EMAIL = 'hrynivstanislav@gmail.com';

async function currentTech(): Promise<AuthenticatedTech | null> {
  const jar = await cookies();
  const techToken = jar.get(TECH_COOKIE)?.value;
  if (!techToken) return null;
  return getTechSessionFromCookie(`${TECH_COOKIE}=${techToken}`, env.DB);
}
const owner = (tech: AuthenticatedTech): ChatGPTUser => ({ userId: 'local-owner', displayName: tech.tenantName, email: OWNER_EMAIL, fullName: null, tenantId: tech.tenantId, tenantName: tech.tenantName, techId: tech.techId });
export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const tech = await currentTech();
  return tech?.isAdmin && !tech.mustSetup ? owner(tech) : null;
}
export async function requireChatGPTUser(returnTo: string): Promise<ChatGPTUser> {
  const tech = await currentTech();
  if (tech?.isAdmin && tech.mustSetup) redirect('/admin-setup');
  if (tech?.isAdmin) return owner(tech);
  if (tech) redirect('/capture');
  redirect('/login?return_to=' + encodeURIComponent(returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/'));
}
export function chatGPTSignOutPath(): string { return '/api/owner/logout'; }
