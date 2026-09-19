import { env } from "@/lib/local-env";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/access";
import { sameOrigin } from "@/lib/tech-auth";
import { qcIdPattern, trustError, trustNoStore } from "@/lib/trust-api";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return trustError(403, "INVALID_ORIGIN", "Invalid request origin.");
  if (!isOwner(await getChatGPTUser())) return trustError(403, "FORBIDDEN", "Admin sign-in required.");
  const { id } = await context.params;
  if (!qcIdPattern.test(id)) return trustError(400, "INVALID_ID", "Invalid API key ID.");
  try {
    const result = await env.DB.prepare("UPDATE trust_api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").bind(Date.now(), id).run();
    if (!result.meta.changes) return trustError(404, "NOT_FOUND", "Active API key not found.");
    return Response.json({ id, revoked: true }, { headers: trustNoStore });
  } catch (error) {
    console.error("Trust API key revocation failed", error);
    return trustError(503, "UNAVAILABLE", "Could not revoke Trust API key.");
  }
}
