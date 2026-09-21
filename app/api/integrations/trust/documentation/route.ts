import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/access";
import { trustError, trustNoStore } from "@/lib/trust-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isOwner(await getChatGPTUser())) return trustError(403, "FORBIDDEN", "Admin sign-in required.");
  try {
    const origin = (process.env.TQA_PUBLIC_ORIGIN || new URL(request.url).origin).replace(/\/$/, "");
    const documentation = readFileSync(join(process.cwd(), "docs", "trust-extension-api.md"), "utf8")
      .replaceAll("{{TQA_BASE_URL}}", origin);
    return new Response(documentation, { headers: { ...trustNoStore, "Content-Type": "text/plain; charset=utf-8" } });
  } catch (error) {
    console.error("Trust API documentation failed", error);
    return trustError(503, "UNAVAILABLE", "Could not load API documentation.");
  }
}
