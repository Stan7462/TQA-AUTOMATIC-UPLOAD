import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const temp=mkdtempSync(join(tmpdir(),'tqa-matcher-'));
await build({entryPoints:['lib/catalyst-matcher.js'],outfile:join(temp,'matcher.mjs'),bundle:true,format:'esm',platform:'node'});
await build({entryPoints:['lib/catalyst-qc.ts'],outfile:join(temp,'catalog.mjs'),bundle:true,format:'esm',platform:'node'});
const {matchCatalystFailures:match}=await import(join(temp,'matcher.mjs'));
const {normalizeCatalystFailures,catalystQcCategories,catalystFailureLabel,suggestCatalystFailures}=await import(join(temp,'catalog.mjs'));
const cases=[
 ['conectors are not properly crimped',['TQA4:5','TQA6:1','TQA7:0']],
 ['Fittings at the NID are not crimped',['TQA6:1']],
 ['House box is missing',['TQA6:5']],
 ['Loose connector at tap',['TQA4:7']],
 ['Unused ports on splitter have no caps',['TQA6:4']],
 ['Ground wire is wrong gauge',['TQA2:1']],
 ['Connectors are fine but house box is missing',['TQA6:5']],
 ['connectors are properly crimped',[]],
 ['pedestal is unlocked',['TQA4:0']],
 ['weather boots missing at tap',['TQA4:6']],
 ['nothing makes sense',[]],
 ['House box is missing. Inside fittings installed outside needs to be replaced to the outside fittings.',['TQA6:5','TQA6:1']],
 ['Bad connectors and no house box',['TQA4:5','TQA6:1','TQA7:0','TQA6:5']],
 ['Bad connectors and no house enclosure',['TQA4:5','TQA6:1','TQA7:0','TQA6:5']],
 ['House box is missing; ground wire is wrong gauge',['TQA6:5','TQA2:1']],
 ['No house box, bad connectors',['TQA6:5','TQA6:1']],
 ['Inside fittings installed outside need to be replaced.',['TQA4:5','TQA6:1']],
 ['House box is installed correctly. Fittings at the NID are not crimped.',['TQA6:1']],
 ['tech left open tap port',['TQA4:3']],
 ['tap ports left open',['TQA4:3']],
 ["connector isn't fully compressed at NID",['TQA6:1']],
 ['missing demarc box',['TQA6:5']],
 ['uncapped tap port',['TQA4:3']],
 ['connector is not loose',[]],
 ['house box is not missing',[]],
 ['bad conectors at the housebox',['TQA6:1']],
 ['bad fittings and no enclosure',['TQA4:5','TQA6:1','TQA7:0','TQA6:5']]
];
for(const [comment,expected] of cases)test(comment,()=>assert.deepEqual(match(comment).results.map(r=>r.id).sort(),[...expected].sort()));
test('clarifying a connector location retains the separate enclosure problem',()=>{
 assert.deepEqual(match('bad fittings and no enclosure',{contexts:{'0:connector':'tap'}}).results.map(r=>r.id).sort(),['TQA4:5','TQA6:5']);
});
test('confirmed examples recall only the same normalized comment',()=>{
 const reviewed=[{comment:'unknown fitting problem',location:'',ids:['TQA6:1','TQA6:5']}];
 assert.deepEqual(match('Unknown fitting problem',{reviewed}).results.map(r=>r.id),reviewed[0].ids);
 assert.equal(match('Different fitting problem',{reviewed}).reviewed,undefined);
});
test('same-category selections keep both exact Catalyst strings and reject invented reasons',()=>{
 const selections=match('House box is missing. Inside fittings installed outside need to be replaced.').results.map(({code,reason})=>({code,reason}));
 assert.equal(normalizeCatalystFailures(selections).length,2);
 assert.equal(normalizeCatalystFailures([...selections,selections[0]]).length,2);
 assert.equal(normalizeCatalystFailures([{code:'TQA6',reason:'Invented reason'}]),null);
 for(const f of selections){assert.ok(catalystQcCategories.find(c=>c.code===f.code).reasons.includes(f.reason));assert.notEqual(f.reason,catalystFailureLabel(f));}
});
test('a later problem is not suppressed by the suggestion limit',()=>{
 const found=suggestCatalystFailures('bad fittings and no enclosure',1);
 assert.equal(found.length,2);
 assert.ok(found.some(f=>f.reason.includes('Enclosure')));
});
test.after(()=>rmSync(temp,{recursive:true,force:true}));
