import { env } from "@/lib/local-env";
import { requireTrustKey, trustError, trustNoStore, trustQcSource } from "@/lib/trust-api";
import { fiscalMonthBounds, fiscalMonthKey } from "@/lib/fiscal-month";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const key = await requireTrustKey(request);
  if (key instanceof Response) return key;
  const month = fiscalMonthKey();
  const { start, end } = fiscalMonthBounds(month);
  try {
    // Count confirmed initial observations by upload date. A corrected follow-up
    // updates the same Catalyst observation, so it must not count a second time.
    const rows = await env.DB.prepare(`SELECT tech_id AS techId,
      SUM(CASE WHEN catalyst_observation_type = 'Ride Along' THEN 1 ELSE 0 END) AS rideAlong,
      SUM(CASE WHEN catalyst_observation_type = 'After the Fact' OR (catalyst_observation_type IS NULL AND status = 'rejected') THEN 1 ELSE 0 END) AS afterTheFact,
      SUM(CASE WHEN catalyst_observation_type IS NULL AND status <> 'rejected' THEN 1 ELSE 0 END) AS unknown
      FROM ${trustQcSource} WHERE tenant_id = ? AND trust_upload_status = 'uploaded' AND trust_upload_kind = 'observation' AND trust_uploaded_at >= ? AND trust_uploaded_at < ? GROUP BY tech_id`).bind(key.tenantId, start, end).all<{techId:string;rideAlong:number;afterTheFact:number;unknown:number}>();
    return Response.json({ month, start, end, technicians: rows.results }, {headers: trustNoStore});
  } catch (error) {
    console.error("Monthly observation totals failed", error);
    return trustError(503, "UNAVAILABLE", "Could not load monthly Catalyst observation totals.");
  }
}
