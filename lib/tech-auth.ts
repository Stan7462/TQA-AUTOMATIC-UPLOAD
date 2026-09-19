export const TECH_COOKIE = "tqa_tech_session";
export const ADMIN_TECH_ID = "1111";
export const SESSION_LIFETIME_SECONDS = 60 * 60 * 12;
// workerd rejects PBKDF2 calls above 100,000 iterations.
const PIN_HASH_ITERATIONS = 100_000;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function randomHex(length: number): string {
  return hex(crypto.getRandomValues(new Uint8Array(length)));
}

export function newPin(): string {
  const limit = Math.floor(0x1_0000_0000 / 100_000) * 100_000;
  let value: number;
  do { value = crypto.getRandomValues(new Uint32Array(1))[0]; } while (value >= limit);
  return (value % 100_000).toString().padStart(5, "0");
}

export function normalizeTechId(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim().toUpperCase();
  return /^[A-Z0-9_-]{3,32}$/.test(value) ? value : null;
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2", salt: Uint8Array.from(salt.match(/.{2}/g) ?? [], (pair) => parseInt(pair, 16)),
    iterations: PIN_HASH_ITERATIONS, hash: "SHA-256",
  }, key, 256);
  return hex(new Uint8Array(bits));
}

export function equalHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

export async function hashToken(token: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))));
}

export function getCookie(request: Request, name: string): string | null {
  const entry = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(name + "="));
  return entry ? entry.slice(name.length + 1) : null;
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  if (origin === process.env.TQA_PUBLIC_ORIGIN) return true;
  const url = new URL(request.url);
  return origin === url.origin && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
}

export async function getTechSession(request: Request, db: typeof import("./local-env").DB): Promise<string | null> {
  return getTechSessionFromCookie(request.headers.get("cookie"), db);
}

export async function getTechSessionFromCookie(cookieHeader: string | null, db: typeof import("./local-env").DB): Promise<string | null> {
  const entry = cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(TECH_COOKIE + "="));
  const token = entry ? entry.slice(TECH_COOKIE.length + 1) : null;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const result = await db.prepare(
    "SELECT s.tech_id AS tech_id FROM tech_sessions s JOIN technicians t ON t.tech_id = s.tech_id WHERE s.token_hash = ? AND s.expires_at > ? AND t.active = 1"
  ).bind(await hashToken(token), Date.now()).first<{ tech_id: string }>();
  return result?.tech_id ?? null;
}

export function techCookie(token: string, secure: boolean): string {
  return TECH_COOKIE + "=" + token + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + SESSION_LIFETIME_SECONDS + (secure ? "; Secure" : "");
}

export function clearTechCookie(secure: boolean): string {
  return TECH_COOKIE + "=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" + (secure ? "; Secure" : "");
}
