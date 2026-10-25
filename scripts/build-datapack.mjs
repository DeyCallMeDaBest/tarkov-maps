// Rebuilds datapack.json from tarkov.dev's static JSON feed (json.tarkov.dev).
// Runs in GitHub Actions every 6 hours (see .github/workflows/refresh-datapack.yml).
// api.tarkov.dev (GraphQL) was retired in Oct 2026 — tarkov.dev itself now reads these files,
// so the pack carries exactly the data the tarkov.dev site shows (tasks, items, maps, prices).
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {SOURCES, buildPack} from './datapack-lib.mjs';

const BASE = 'https://json.tarkov.dev/regular/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(name){
  for (let a = 0; a < 3; a++){
    try{
      const r = await fetch(BASE + name, {headers: {'User-Agent': 'tarkov-maps datapack builder (fan-made, github pages)'}});
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    }catch(e){
      if (a === 2) throw new Error(name + ': ' + e.message);
      await sleep(4000 * (a + 1));
    }
  }
}

const R = {};
let failed = [];
await Promise.all(SOURCES.map(async n => { try{ R[n] = await get(n); console.log('ok:', n); }catch(e){ failed.push(e.message); console.error('FAIL:', e.message); } }));

if (failed.length){
  console.log('Source files unavailable (' + failed.join(' | ') + ') — keeping existing datapack.json, nothing committed.');
  process.exit(0);
}

const {pack, extra, stats} = buildPack(R);
console.log('stats:', JSON.stringify(stats));

// Safety: never replace a good pack with a gutted one.
if (stats.tasks < 300 || stats.ammo < 120 || stats.mapsOk < 10 || stats.items < 3000){
  console.log('Core data incomplete — keeping existing files, nothing committed.');
  process.exit(0);
}

// Only a real content change should produce a commit — ignore the build timestamps.
const strip = s => s.replace(/\\?"ts\\?":\d+/g, '');
const same = (file, text) => existsSync(file) && strip(readFileSync(file, 'utf8')) === strip(text);

const out = JSON.stringify(pack);
if (same('datapack.json', out)) console.log('datapack.json: no data changes.');
else { writeFileSync('datapack.json', out); console.log('datapack.json written:', Object.keys(pack).length, 'datasets,', (out.length / 1048576).toFixed(2), 'MB'); }

for (const [file, text] of Object.entries(extra)){
  if (same(file, text)) console.log(file + ': no data changes.');
  else { writeFileSync(file, text); console.log(file + ' written:', (text.length / 1048576).toFixed(2), 'MB'); }
}
