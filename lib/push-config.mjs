import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export function pushConfig() {
  const path = join(resolve(process.env.TQA_DATA_DIR || ".tqa-data"), "onesignal.json");
  const saved = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  return {
    appId: process.env.ONESIGNAL_APP_ID || saved.appId || "3555ea89-3706-4440-9a2a-d9ebe65fc338",
    apiKey: process.env.ONESIGNAL_API_KEY || saved.apiKey || "",
    origin: process.env.TQA_PUBLIC_URL || "https://qc.leadtechx.com",
    sendingEnabled: process.env.TQA_PUSH_ENABLED === "1",
  };
}
