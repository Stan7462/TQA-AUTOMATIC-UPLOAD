import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, chmodSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
const root = fileURLToPath(new URL('..', import.meta.url));
const data = join(root,'.tqa-data');
const node = join(data,'node');
const source = '/Users/stanislavhryniv/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node';
copyFileSync(source,node);
chmodSync(node,0o700);
mkdirSync(join(data,'logs'),{recursive:true,mode:0o700});
const dest = join(homedir(),'Library','LaunchAgents','com.tqa.automatic-upload.plist');
mkdirSync(join(homedir(),'Library','LaunchAgents'),{recursive:true});
const xml = value => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>com.tqa.automatic-upload</string>
<key>ProgramArguments</key><array><string>${xml(node)}</string><string>${xml(join(root,'scripts','start-laptop.mjs'))}</string></array>
<key>WorkingDirectory</key><string>${xml(root)}</string>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>StandardOutPath</key><string>${xml(join(data,'logs','app.out.log'))}</string>
<key>StandardErrorPath</key><string>${xml(join(data,'logs','app.err.log'))}</string>
</dict></plist>`;
writeFileSync(dest,plist,{mode:0o600});
console.log(dest);
