import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const source = join(root, "chrome-extension");
const manifest = JSON.parse(readFileSync(join(source, "manifest.json"), "utf8"));
const release = join(root, "release");
const archive = join(release, `tqa-catalyst-uploader-${manifest.version}.zip`);
const stagingRoot = mkdtempSync(join(tmpdir(), "tqa-extension-"));
const staging = join(stagingRoot, "package");

mkdirSync(staging, { recursive: true });
for (const name of ["manifest.json", "background.js", "content.js", "core.js", "popup.css", "popup.html", "popup.js", "icons"]) {
  cpSync(join(source, name), join(staging, name), { recursive: true });
}
mkdirSync(release, { recursive: true });
rmSync(archive, { force: true });
const result = spawnSync("/usr/bin/zip", ["-qr", archive, "."], { cwd: staging, stdio: "inherit" });
rmSync(stagingRoot, { recursive: true, force: true });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Created ${basename(archive)}`);
