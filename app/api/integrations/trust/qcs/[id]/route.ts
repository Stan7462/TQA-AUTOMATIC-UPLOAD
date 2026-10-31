import { env } from "@/lib/local-env";
import {requireCurrentExtension} from '@/lib/extension-version';
import { qcIdPattern, requireTrustKey, trustError, trustNoStore, trustQc, trustQcSelect, trustQcSource, trustQcQueueVisible, catalystIncludesScreenshot, type TrustQcRow } from "@/lib/trust-api";
import { fiscalMonthBounds, fiscalMonthKey } from "@/lib/fiscal-month";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const key = await requireTrustKey(request);
  if (key instanceof Response) return key;
  const updateRequired=requireCurrentExtension(request);if(updateRequired)return updateRequired;
  const { id } = await context.params;
  if (!qcIdPattern.test(id)) return trustError(404, "NOT_FOUND", "Approved QC not found.");
  try {
    const includeScreenshot = await catalystIncludesScreenshot(key.tenantId);
    const range = fiscalMonthBounds(fiscalMonthKey());
    const row = await env.DB.prepare(`SELECT ${trustQcSelect} FROM ${trustQcSource} WHERE tenant_id = ? AND id = ? AND ${trustQcQueueVisible} AND submitted_at >= ? AND submitted_at < ?`).bind(key.tenantId, id, range.start, range.end).first<TrustQcRow>();
    if (!row) return trustError(404, "NOT_FOUND", "Approved QC not found.");
    return Response.json({ qc: trustQc(request, row, includeScreenshot) }, { headers: trustNoStore });
  } catch (error) {
    console.error("Trust QC detail failed", error);
    return trustError(503, "UNAVAILABLE", "Could not load approved QC.");
  }
}
