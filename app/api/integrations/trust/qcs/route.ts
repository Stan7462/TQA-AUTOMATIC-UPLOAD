import { env } from "@/lib/local-env";
import { requireTrustKey, trustError, trustNoStore, trustQc, trustQcSelect, type TrustQcRow } from "@/lib/trust-api";
import { fiscalMonthBounds, fiscalMonthKey } from "@/lib/fiscal-month";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const key = await requireTrustKey(request);
  if (key instanceof Response) return key;
  const url = new URL(request.url);
  const uploadStatus = url.searchParams.get("uploadStatus") ?? "uploadable";
  if (!["uploadable", "uploaded", "all"].includes(uploadStatus)) return trustError(400, "INVALID_FILTER", "uploadStatus must be uploadable, uploaded, or all.");
  const limitValue = url.searchParams.get("limit") ?? "50";
  if (!/^\d+$/.test(limitValue) || Number(limitValue) < 1 || Number(limitValue) > 100) return trustError(400, "INVALID_LIMIT", "limit must be between 1 and 100.");
  const limit = Number(limitValue);
  const cursor = url.searchParams.get("cursor");
  const match = cursor?.match(/^(\d{13}):([0-9a-f-]{36})$/);
  if (cursor && !match) return trustError(400, "INVALID_CURSOR", "Invalid cursor.");
  try {
    const range = fiscalMonthBounds(fiscalMonthKey());
    const conditions = ["status = 'approved'", "submitted_at >= ?", "submitted_at < ?"];
    const values: Array<string | number> = [range.start, range.end];
    if (uploadStatus === "uploadable") conditions.push("trust_upload_status IN ('ready', 'failed')");
    if (uploadStatus === "uploaded") conditions.push("trust_upload_status = 'uploaded'");
    if (match) {
      conditions.push("(COALESCE(reviewed_at, submitted_at) > ? OR (COALESCE(reviewed_at, submitted_at) = ? AND id > ?))");
      values.push(Number(match[1]), Number(match[1]), match[2]);
    }
    const where = conditions.join(" AND ");
    const rows = await env.DB.prepare(`SELECT ${trustQcSelect} FROM qc_submissions WHERE ${where} ORDER BY COALESCE(reviewed_at, submitted_at), id LIMIT ?`).bind(...values, limit + 1).all<TrustQcRow>();
    const page = rows.results.slice(0, limit);
    const last = page.at(-1);
    const countWhere = uploadStatus === "uploadable" ? "status = 'approved' AND trust_upload_status IN ('ready', 'failed')" : uploadStatus === "uploaded" ? "status = 'approved' AND trust_upload_status = 'uploaded'" : "status = 'approved'";
    const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM qc_submissions WHERE ${countWhere} AND submitted_at >= ? AND submitted_at < ?`).bind(range.start, range.end).first<{ total: number }>();
    return Response.json({ qcs: page.map((row) => trustQc(request, row)), nextCursor: rows.results.length > limit && last ? `${String(last.reviewedAt ?? last.submittedAt).padStart(13, "0")}:${last.id}` : null, total: count?.total ?? 0 }, { headers: trustNoStore });
  } catch (error) {
    console.error("Trust QC list failed", error);
    return trustError(503, "UNAVAILABLE", "Could not load approved QCs.");
  }
}
