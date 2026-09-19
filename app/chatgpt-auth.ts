import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from '@/lib/local-env';
import { ADMIN_TECH_ID, getTechSessionFromCookie, TECH_COOKIE } from '@/lib/tech-auth';

export type ChatGPTUser = { userId: string; displayName: string; email: string; fullName: string | null };
export const OWNER_COOKIE = 'tqa_owner_session';
const OWNER_EMAIL = 'hrynivstanislav@gmail.com';

async function currentTechId(): Promise<string | null> {
  const jar = await cookies();
  const techToken = jar.get(TECH_COOKIE)?.value;
  return techToken ? getTechSessionFromCookie(`${TECH_COOKIE}=${techToken}`, env.DB) : null;
}
const owner = (): ChatGPTUser => ({ userId: 'local-owner', displayName: 'Owner', email: OWNER_EMAIL, fullName: null });
export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  return (await currentTechId()) === ADMIN_TECH_ID ? owner() : null;
}
export async function requireChatGPTUser(returnTo: string): Promise<ChatGPTUser> {
  const techId = await currentTechId();
  if (techId === ADMIN_TECH_ID) return owner();
  if (techId) redirect('/capture');
  redirect('/login?return_to=' + encodeURIComponent(returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/'));
}
export function chatGPTSignOutPath(): string { return '/api/owner/logout'; }
