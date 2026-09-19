import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
process.chdir(root);
const originPath = join(root, '.tqa-data', 'public-origin.txt');
if (existsSync(originPath)) {
  const origin = readFileSync(originPath, 'utf8').trim();
  if (!/^https:\/\/[a-z0-9.-]+\.ts\.net$/.test(origin)) throw new Error('Invalid public origin');
  process.env.TQA_PUBLIC_ORIGIN = origin;
}
await import('./migrate.mjs');
process.argv = [process.execPath, resolve(root, 'node_modules/vinext/dist/cli.js'), 'start', '--hostname', '127.0.0.1', '--port', '3000'];
await import('../node_modules/vinext/dist/cli.js');
