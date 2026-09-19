import { env } from "@/lib/local-env";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/access";
import { fiscalMonthBounds } from "@/lib/fiscal-month";
import { zipStream, type ZipEntry } from "@/lib/zip-archive";

export const dynamic = "force-dynamic";

type ApprovedQc = {
  id: string;
  techId: string;
  jobNumber: string;
  screenshotId: string;
  photoIds: string;
  submittedAt: number;
};
type ExportQc = Omit<ApprovedQc, "photoIds"> & { photoIds: string[]; folder: string };

function safeName(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[.-]+/, "").slice(0, 64) || "unknown";
}

function exportFolder(row: ApprovedQc): string {
  const day = new Date(row.submittedAt).toISOString().slice(0, 10);
  return `TQA-approved-QCs/Job-${safeName(row.jobNumber)}__Tech-${safeName(row.techId)}__${day}__${row.id}/`;
}

async function* exportImages(rows: ExportQc[]): AsyncGenerator<ZipEntry> {
  for (const row of rows) {
    const modifiedAt = new Date(row.submittedAt);
    const job = `Job-${safeName(row.jobNumber)}`;
    const photos = [
      { id: row.screenshotId, name: `${job}__00-account-screenshot.jpg` },
      ...row.photoIds.map((id, index) => ({ id, name: `${job}__${String(index + 1).padStart(2, "0")}-live-photo.jpg` })),
    ];
    for (const photo of photos) {
      const item = await env.BUCKET.get(`captures/${photo.id}`);
      if (!item) throw new Error(`Missing photo for job ${row.jobNumber}`);
      yield { name: row.folder + photo.name, data: item.body, modifiedAt };
    }
  }
}

async function prepareExport(request: Request): Promise<{ rows: ExportQc[]; filename: string } | Response> {
  if (!isOwner(await getChatGPTUser())) return Response.json({ error: "Forbidden" }, { status: 403 });
  const period = new URL(request.url).searchParams.get("period") ?? "all";
  if (period !== "all" && !/^(20\d\d|2100)-(0[1-9]|1[0-2])$/.test(period)) return Response.json({ error: "Invalid fiscal month" }, { status: 400 });

  try {
    const bounds = period === "all" ? null : fiscalMonthBounds(period);
    const results = await env.DB.prepare(
      "SELECT id, tech_id AS techId, job_number AS jobNumber, screenshot_id AS screenshotId, photo_ids AS photoIds, submitted_at AS submittedAt FROM qc_submissions WHERE status = 'approved'" +
      (bounds ? " AND submitted_at >= ? AND submitted_at < ?" : "") +
      " ORDER BY submitted_at ASC, id ASC"
    ).bind(...(bounds ? [bounds.start, bounds.end] : [])).all<ApprovedQc>();
    if (!results.results.length) return Response.json({ error: "No approved QCs in this period." }, { status: 404 });

    const rows: ExportQc[] = results.results.map((row) => {
      const photoIds = JSON.parse(row.photoIds) as unknown;
      if (!Array.isArray(photoIds) || !photoIds.every((id) => typeof id === "string")) throw new Error("Invalid QC photo list");
      return { ...row, photoIds, folder: exportFolder(row) };
    });
    const photoCount = rows.reduce((sum, row) => sum + 1 + row.photoIds.length, 0);
    if (photoCount > 65000) return Response.json({ error: "Too many photos for one download. Choose a fiscal month." }, { status: 413 });
    // Check the archive before starting the download so a missing image cannot yield a partial ZIP.
    let totalBytes = 0;
    for (const row of rows) {
      for (const id of [row.screenshotId, ...row.photoIds]) {
        const size = await env.BUCKET.size(`captures/${id}`);
        if (size === null) return Response.json({ error: `A photo for job ${row.jobNumber} is missing. Please check this QC before exporting.` }, { status: 409 });
        totalBytes += size + 300; // ZIP headers and names.
      }
    }
    if (totalBytes > 3_500_000_000) return Response.json({ error: "This export is too large. Choose a fiscal month." }, { status: 413 });
    return { rows, filename: `TQA-approved-QCs-${period}.zip` };
  } catch (error) {
    console.error("QC export failed", error);
    return Response.json({ error: "Could not prepare the approved QC export." }, { status: 503 });
  }
}

function downloadHeaders(filename: string): HeadersInit {
  return {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

export async function HEAD(request: Request) {
  const prepared = await prepareExport(request);
  if (prepared instanceof Response) return new Response(null, { status: prepared.status, headers: { "Cache-Control": "private, no-store" } });
  return new Response(null, { headers: downloadHeaders(prepared.filename) });
}

export async function GET(request: Request) {
  const prepared = await prepareExport(request);
  if (prepared instanceof Response) return prepared;
  return new Response(zipStream(exportImages(prepared.rows)), { headers: downloadHeaders(prepared.filename) });
}
