import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
process.chdir(root);
await import("./migrate.mjs");
if (!process.env.DATABASE_URL) await import("./bootstrap-admin.mjs");
const { startNotificationWorker } = await import("./push-notifications.mjs");
startNotificationWorker();
const { pruneExpiredQcs } = await import("./qc-retention.mjs");
try { await pruneExpiredQcs({ dataDirectory: process.env.TQA_DATA_DIR }); }
catch (error) { console.error("QC retention cleanup failed", error); }
const retentionTimer = setInterval(async () => {
  try { await pruneExpiredQcs({ dataDirectory: process.env.TQA_DATA_DIR }); }
  catch (error) { console.error("QC retention cleanup failed", error); }
}, 6 * 60 * 60 * 1000);
retentionTimer.unref();

process.argv = [
  process.execPath,
  resolve(root, "node_modules/vinext/dist/cli.js"),
  "start",
  "--hostname", process.env.HOST || "0.0.0.0",
  "--port", process.env.PORT || "3000",
];
await import("../node_modules/vinext/dist/cli.js");
