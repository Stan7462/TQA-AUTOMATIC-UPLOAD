// Server-only: credentials are read at runtime, never returned to a browser.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/local-env";
type Database = typeof env.DB;
export const SUPER_COOKIE = "tqa_super_session";
export const SUPER_LIFETIME = 8 * 60 * 60;
export const SUPER_CONTEXT_LIFETIME = 30 * 60 * 1000;
export const superHeaders = { "Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff" };
export type SuperSession = { tokenHash:string; login:string; selectedTenantId:string|null; contextExpiresAt:number|null; expiresAt:number };
export const superDigest = (value:string) => createHash("sha256").update(value).digest("hex");
const credentialVersion = () => superDigest(JSON.stringify([process.env.SUPER_LOGIN, process.env.SUPER_PASSWORD]));
export function superConfigured():boolean { return Boolean(process.env.SUPER_LOGIN?.trim() && (process.env.SUPER_PASSWORD?.length ?? 0) >= 12); }
export function superCredentialsMatch(login:string,password:string):boolean {
  if (!superConfigured()) return false;
  return timingSafeEqual(Buffer.from(superDigest(login.trim().toLowerCase())), Buffer.from(superDigest(process.env.SUPER_LOGIN!.trim().toLowerCase()))) && timingSafeEqual(Buffer.from(superDigest(password)),Buffer.from(superDigest(process.env.SUPER_PASSWORD!)));
}
function tokenFromCookies(header:string|null):string|null {
  const token=header?.split(';').map(v=>v.trim()).find(v=>v.startsWith(SUPER_COOKIE+'='))?.slice(SUPER_COOKIE.length+1);
  return token && /^[a-f0-9]{64}$/.test(token)?token:null;
}
export async function superSessionFromCookies(header:string|null, db:Database = env.DB):Promise<SuperSession|null> {
  if (!superConfigured()) return null;
  const token=tokenFromCookies(header);if (!token)return null;
  const row=await db.prepare("SELECT token_hash AS tokenHash, credential_version AS version, expires_at AS expiresAt, selected_tenant_id AS selectedTenantId, context_expires_at AS contextExpiresAt FROM super_admin_sessions WHERE token_hash=? AND expires_at>?").bind(superDigest(token),Date.now()).first<SuperSession & {version:string}>();
  return row && row.version===credentialVersion()?{...row,login:process.env.SUPER_LOGIN!.trim()}:null;
}
export const getSuperSession = (request:Request) => superSessionFromCookies(request.headers.get('cookie'));
export function superCookie(request:Request,token:string,clear=false):string {
  const secure=(request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || new URL(request.url).protocol.replace(':',''))==='https';
  return `${SUPER_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear?0:SUPER_LIFETIME}${secure?'; Secure':''}`;
}
export async function auditSuper(actor:string,action:string,tenantId:string|null,details:Record<string,unknown>={},db:Database=env.DB) {
  await db.prepare("INSERT INTO super_admin_audit(id,actor,action,tenant_id,details,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actor,action,tenantId,JSON.stringify(details),Date.now()).run();
}
export async function createSuperSession(db:Database=env.DB) {
  const token=randomBytes(32).toString('hex'),now=Date.now();
  await db.batch([
    db.prepare("DELETE FROM super_admin_sessions WHERE expires_at<=?").bind(now),
    db.prepare("INSERT INTO super_admin_sessions(token_hash,credential_version,expires_at,created_at) VALUES(?,?,?,?)").bind(superDigest(token),credentialVersion(),now+SUPER_LIFETIME*1000,now),
  ]);
  return token;
}
export async function superCompanyContext(header:string|null, db:Database=env.DB) {
  const session=await superSessionFromCookies(header,db);
  if (!session?.selectedTenantId || !session.contextExpiresAt || session.contextExpiresAt<=Date.now())return null;
  const company=await db.prepare("SELECT id,name FROM tenants WHERE id=?").bind(session.selectedTenantId).first<{id:string;name:string}>();
  if (!company)return null;
  return {tenantId:company.id,tenantName:company.name,techId:'SUPER_ADMIN',isAdmin:true,mustSetup:false,expiresAt:Math.min(session.expiresAt,session.contextExpiresAt),isSuperAdmin:true,superLogin:session.login};
}

export function superSameOrigin(request:Request):boolean {
  const origin=request.headers.get('origin');if(!origin)return false;
  try {
    const url=new URL(request.url);
    const host=request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || request.headers.get('host') || url.host;
    const protocol=request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || url.protocol.replace(':','');
    return new URL(origin).origin===`${protocol}://${host}`;
  }catch{return false;}
}
