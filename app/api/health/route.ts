import { accessSync, constants } from "node:fs";
import { join } from "node:path";

import { DATA_DIR, env } from "@/lib/local-env";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const result = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    accessSync(join(DATA_DIR, "captures"), constants.R_OK | constants.W_OK);

    if (result?.ok !== 1) throw new Error("Database check failed");

    return Response.json({ status: "ok" }, { headers });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers });
  }
}
