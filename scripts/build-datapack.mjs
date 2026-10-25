// Rebuilds datapack.json from api.tarkov.dev (server-side: no CORS limits).
// Query strings are EXTRACTED from index.html so the pack always matches what the app expects.
import {readFileSync, writeFileSync} from 'node:fs';

const html = readFileSync('index.html','utf8');
const grab = name => {
  const m = html.match(new RegExp(name + String.raw`=(?:n=>)?\x60([^\x60]+)\x60`));
  if (!m) throw new Error('query not found in index.html: ' + name);
  return m[1];
};
const MAP_Q_T   = grab('MAP_Q');       // contains ${n}
const TASKS_Q   = grab('TASKS_Q');
const AMMO_Q    = grab('AMMO_Q');
const GUNS_Q    = grab('GUNS_Q');
const GEAR_Q    = grab('GEAR_Q');
const PLATE_Q   = grab('PLATE_Q');
const HIDEOUT_Q = grab('HIDEOUT_Q');
const CRAFT_Q   = grab('CRAFT_Q');
const BARTER_Q  = grab('BARTER_Q');
const LOOT_Q    = grab('LOOT_Q');

const API='https://api.tarkov.dev/graphql';
const sleep = ms => new Promise(r=>setTimeout(r,ms));
async function gql(q){
  for (let a=0; a<3; a++){
    try{
      const r = await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:q})});
      const j = await r.json();
      if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0,160));
      return j.data;
    }catch(e){ if(a===2) throw e; await sleep(4000*(a+1)); }
  }
}

const MAPS = [
  ['ground-zero',['Ground Zero 21','Ground Zero']], ['customs',['Customs']], ['factory',['Factory']],
  ['woods',['Woods']], ['shoreline',['Shoreline']], ['interchange',['Interchange']],
  ['reserve',['Reserve']], ['lighthouse',['Lighthouse']], ['streets-of-tarkov',['Streets of Tarkov']],
  ['the-lab',['The Lab','Lab']], ['the-labyrinth',['The Labyrinth','Labyrinth']], ['terminal',['Terminal']]
];

const bestBuy = it => (it.buyFor||[]).filter(o=>o.vendor&&o.vendor.name!=='Flea Market').sort((a,b)=>a.priceRUB-b.priceRUB).slice(0,1);
const trimGear = arr => (arr||[]).map(g=>({n:g.name,sn:g.shortName,ic:g.iconLink,p:g.avg24hPrice,bf:bestBuy(g),
  cl:(g.properties&&g.properties.class)||0,du:(g.properties&&g.properties.durability)||0,cap:(g.properties&&g.properties.capacity)||0,
  mat:(g.properties&&g.properties.material&&g.properties.material.name)||'',
  gr:((g.properties&&g.properties.grids)||[]).map(x=>[x.width||1,x.height||1])}));

const ts = Date.now();
const wrap = d => JSON.stringify({ts, d});
const pack = {};
let failures = [];

async function tryStep(label, fn){
  try{ await fn(); console.log('ok:', label); }
  catch(e){ failures.push(label+': '+e.message); console.error('FAIL:', label, e.message); }
  await sleep(1200);
}

await tryStep('tasks', async()=>{ const r=await gql(TASKS_Q); if(!r.tasks?.length) throw new Error('empty'); pack.tkm_tasks3=wrap(r.tasks); });
await tryStep('ammo', async()=>{ const r=await gql(AMMO_Q); if(!r.ammo?.length) throw new Error('empty'); pack.tkm_ammo4=wrap(r.ammo); });
await tryStep('guns', async()=>{
  const r=await gql(GUNS_Q);
  const d=(r.items||[]).map(g=>({n:g.name,sn:g.shortName,ic:g.iconLink,im:g.image512pxLink||g.gridImageLink||g.iconLink,p:g.avg24hPrice,bf:bestBuy(g),
    pr:(g.properties&&g.properties.caliber)?{cal:g.properties.caliber,erg:g.properties.ergonomics,rec:g.properties.recoilVertical,rof:g.properties.fireRate}:null}));
  if(!d.length) throw new Error('empty'); pack.tkm_guns1=wrap(d);
});
await tryStep('gear', async()=>{
  const r=await gql(GEAR_Q);
  pack.tkm_gear2=wrap({armor:trimGear(r.armor),rig:trimGear(r.rig),bp:trimGear(r.bp),helm:trimGear(r.helm)});
});
await tryStep('plates', async()=>{
  const r=await gql(PLATE_Q);
  const d=(r.items||[]).map(x=>({n:x.name,sn:x.shortName,ic:x.iconLink,p:x.avg24hPrice||0,bf:bestBuy(x),
    cl:(x.properties&&x.properties.class)||0,du:(x.properties&&x.properties.durability)||0,
    mat:(x.properties&&x.properties.material&&x.properties.material.name)||''}));
  if(!d.length) throw new Error('empty'); pack.tkm_plate1=wrap(d);
});
await tryStep('hideout', async()=>{ const r=await gql(HIDEOUT_Q); if(!r.hideoutStations?.length) throw new Error('empty'); pack.tkm_hide3=wrap(r.hideoutStations); });
await tryStep('bosses', async()=>{ const r=await gql('{bosses{name imagePortraitLink}}'); if(!r.bosses?.length) throw new Error('empty'); pack.tkm_bossp=wrap(r.bosses); });
await tryStep('crafts', async()=>{ const r=await gql(CRAFT_Q); if(!r.crafts?.length) throw new Error('empty'); pack.tkm_craft1=wrap(r.crafts); });
await tryStep('barters', async()=>{ const r=await gql(BARTER_Q); if(!r.barters?.length) throw new Error('empty'); pack.tkm_bart1=wrap(r.barters); });
await tryStep('loot', async()=>{
  const r=await gql(LOOT_Q);
  const d=(r.items||[]).map(it=>{
    const tr=(it.sellFor||[]).filter(o=>o.vendor&&o.vendor.name!=='Flea Market').sort((a,b)=>b.priceRUB-a.priceRUB)[0]||null;
    return {n:it.name,sn:it.shortName,ic:it.iconLink,bp:it.basePrice||0,w:it.width||1,h:it.height||1,p:it.avg24hPrice||0,tv:tr?tr.priceRUB:0,tn:tr?tr.vendor.name:''};
  });
  if(!d.length) throw new Error('empty'); pack.tkm_loot2=wrap(d);
});
let mapsOk=0;
for (const [id, names] of MAPS){
  await tryStep('map '+id, async()=>{
    for (const n of names){
      try{
        const r=await gql(MAP_Q_T.replaceAll('${n}', n));
        if (r.maps && r.maps.length){ pack['tkm_c5_'+id]=wrap(r.maps[0]); mapsOk++; return; }
      }catch(e){ /* try next name */ }
    }
    throw new Error('no data under any name');
  });
}

// Safety: only replace the pack when the core is intact — never commit a gutted file.
if (!pack.tkm_tasks3 || !pack.tkm_ammo4 || mapsOk < 8){
  console.error('Core data incomplete (maps ok: '+mapsOk+'; failures: '+failures.join(' | ')+') — keeping existing datapack.json');
  process.exit(1);
}
writeFileSync('datapack.json', JSON.stringify(pack));
console.log('datapack.json written:', Object.keys(pack).length, 'datasets,', mapsOk, 'maps, failures:', failures.length?failures.join(' | '):'none');
