import type { ChatGPTUser } from './chatgpt-auth';
export function isOwner(user: ChatGPTUser | null): boolean { return user?.userId === 'local-owner'; }
