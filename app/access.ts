import type { ChatGPTUser } from './chatgpt-auth';
export function isOwner(user: ChatGPTUser | null): boolean { return user?.userId === 'local-owner'; }
export function isPlatformOwner(user: ChatGPTUser | null): boolean { return isOwner(user) && user?.tenantId === (process.env.TQA_PLATFORM_TENANT_ID || 'default'); }
