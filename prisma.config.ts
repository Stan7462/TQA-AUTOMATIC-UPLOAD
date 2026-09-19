import { resolve } from "node:path";

import { defineConfig } from "prisma/config";

const dataDirectory = resolve(process.env.TQA_DATA_DIR || ".tqa-data");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: `file:${resolve(dataDirectory, "tqa.sqlite")}` },
});
