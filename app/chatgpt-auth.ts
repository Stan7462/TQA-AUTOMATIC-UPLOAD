import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from '@/lib/local-env';
import { getTechSessionFromCookie, TECH_COOKIE, type AuthenticatedTech } from '@/lib/tech-auth';
import { SUPER_COOKIE } from '@/lib/super-auth';

export type ChatGPTUser = { userId: string; displayName: string; email: string; fullName: string | null; tenantId: string; tenantName: string; techId: string; isSuperAdmin?: boolean };
export const OWNER_COOKIE = 'tqa_owner_session';
const OWNER_EMAIL = 'hrynivstanislav@gmail.com';

async function currentTech(): Promise<AuthenticatedTech | null> {
  const jar = await cookies();
  const header = [TECH_COOKIE,SUPER_COOKIE].map(name=>{
    const token=jar.get(name)?.value;
    return token?`${name}=${token}`:null;
  }).filter(Boolean).join('; ');
  return header ? getTechSessionFromCookie(header, env.DB) : null;
}
const owner = (tech: AuthenticatedTech): ChatGPTUser => ({ userId: 'local-owner', displayName: tech.tenantName, email: tech.superLogin || OWNER_EMAIL, fullName: null, tenantId: tech.tenantId, tenantName: tech.tenantName, techId: tech.techId, isSuperAdmin: tech.isSuperAdmin === true });
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
