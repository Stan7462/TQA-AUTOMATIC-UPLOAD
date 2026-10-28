import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createExtensionPackage} from '../lib/extension-package.mjs';
const root=resolve(import.meta.dirname,'..'),release=join(root,'release');
const archive=createExtensionPackage(root);
mkdirSync(release,{recursive:true});
writeFileSync(join(release,archive.filename),archive.bytes);
console.log(`Created ${archive.filename}`);
