import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
process.chdir(root);
await import("./migrate.mjs");
await import("./bootstrap-admin.mjs");

process.argv = [
  process.execPath,
  resolve(root, "node_modules/vinext/dist/cli.js"),
  "start",
  "--hostname", process.env.HOST || "0.0.0.0",
  "--port", process.env.PORT || "3000",
];
await import("../node_modules/vinext/dist/cli.js");
