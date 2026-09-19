import { env } from "@/lib/local-env";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/access";
import { hashToken, randomHex, sameOrigin } from "@/lib/tech-auth";
import { trustError, trustNoStore } from "@/lib/trust-api";

export const dynamic = "force-dynamic";

type KeyRow = { id: string; label: string; tokenHint: string; createdAt: number; lastUsedAt: number | null };

export async function GET() {
  if (!isOwner(await getChatGPTUser())) return trustError(403, "FORBIDDEN", "Admin sign-in required.");
  try {
    const result = await env.DB.prepare("SELECT id, label, token_hint AS tokenHint, created_at AS createdAt, last_used_at AS lastUsedAt FROM trust_api_keys WHERE revoked_at IS NULL ORDER BY created_at DESC").all<KeyRow>();
    return Response.json({ keys: result.results }, { headers: trustNoStore });
  } catch (error) {
    console.error("Trust API key list failed", error);
    return trustError(503, "UNAVAILABLE", "Could not load Trust API keys.");
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return trustError(403, "INVALID_ORIGIN", "Invalid request origin.");
  if (!isOwner(await getChatGPTUser())) return trustError(403, "FORBIDDEN", "Admin sign-in required.");
  if (!request.headers.get("content-type")?.startsWith("application/json")) return trustError(415, "UNSUPPORTED_MEDIA_TYPE", "Send JSON.");
  const body = await request.json().catch(() => null) as { label?: unknown } | null;
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (!label || label.length > 80) return trustError(400, "INVALID_LABEL", "Label must contain 1 to 80 characters.");
  try {
    const id = crypto.randomUUID();
    const token = `tqa_trust_${randomHex(32)}`;
    const tokenHash = await hashToken(token);
    const tokenHint = `…${token.slice(-6)}`;
    const createdAt = Date.now();
    await env.DB.prepare("INSERT INTO trust_api_keys (id, label, token_hash, token_hint, created_at) VALUES (?, ?, ?, ?, ?)").bind(id, label, tokenHash, tokenHint, createdAt).run();
    return Response.json({ key: { id, label, tokenHint, createdAt, lastUsedAt: null }, token }, { status: 201, headers: trustNoStore });
  } catch (error) {
    console.error("Trust API key creation failed", error);
    return trustError(503, "UNAVAILABLE", "Could not create Trust API key.");
  }
}
