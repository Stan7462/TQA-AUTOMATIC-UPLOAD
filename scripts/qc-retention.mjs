import { DatabaseSync } from "node:sqlite";
import { existsSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";

const RETAINED_MONTHS = 3;
const PHOTO_ID = /^\d{13}-[a-f0-9-]{36}\.jpg$/;

export function qcRetentionCutoff(today = new Date()) {
  const cutoff = new Date(today);
  const originalDay = cutoff.getDate();
  cutoff.setDate(1);
  cutoff.setMonth(cutoff.getMonth() - RETAINED_MONTHS);
  const lastDay = new Date(cutoff.getFullYear(), cutoff.getMonth() + 1, 0).getDate();
  cutoff.setDate(Math.min(originalDay, lastDay));
  return cutoff.getTime();
}

function photoIds(row) {
  let livePhotos;
  try { livePhotos = JSON.parse(row.photo_ids); }
  catch { return null; }
  const ids = [row.screenshot_id, ...(Array.isArray(livePhotos) ? livePhotos : [])];
  return ids.every((id) => typeof id === "string" && PHOTO_ID.test(id)) ? ids : null;
}

export function pruneExpiredQcs({ dataDirectory, now = new Date(), logger = console } = {}) {
  const directory = resolve(dataDirectory || process.env.TQA_DATA_DIR || ".tqa-data");
  const databasePath = join(directory, "tqa.sqlite");
  if (!existsSync(databasePath)) return { deletedQcs: 0, deletedPhotos: 0, cutoff: qcRetentionCutoff(now) };

  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000");
  const cutoff = qcRetentionCutoff(now);
  let deletedQcs = 0;
  let deletedPhotos = 0;

  try {
    const hasQcs = database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'qc_submissions'").get();
    if (!hasQcs) return { deletedQcs, deletedPhotos, cutoff };

    while (true) {
      const rows = database.prepare("SELECT id, screenshot_id, photo_ids FROM qc_submissions WHERE submitted_at < ? ORDER BY submitted_at LIMIT 100").all(cutoff);
      if (!rows.length) break;

      const removable = [];
      for (const row of rows) {
        const ids = photoIds(row);
        if (!ids) {
          logger.error(`Retention skipped QC ${row.id}: invalid photo references.`);
          continue;
        }
        try {
          for (const id of ids) {
            const path = join(directory, "captures", id);
            try { unlinkSync(path); deletedPhotos += 1; }
            catch (error) {
              if (error?.code !== "ENOENT") throw error;
            }
          }
          removable.push(row.id);
        } catch (error) {
          logger.error(`Retention could not remove pictures for QC ${row.id}.`, error);
        }
      }

      if (!removable.length) break;
      const placeholders = removable.map(() => "?").join(",");
      const result = database.prepare(`DELETE FROM qc_submissions WHERE submitted_at < ? AND id IN (${placeholders})`).run(cutoff, ...removable);
      deletedQcs += Number(result.changes);
    }
  } finally {
    database.close();
  }

  if (deletedQcs) logger.log(`QC retention removed ${deletedQcs} expired QCs and ${deletedPhotos} pictures.`);
  return { deletedQcs, deletedPhotos, cutoff };
}
