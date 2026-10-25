// datapack-lib.mjs — turns tarkov.dev's static JSON (https://json.tarkov.dev/regular/<name>)
// into the exact shapes the app caches under its tkm_* keys.
// api.tarkov.dev (GraphQL) was retired in Oct 2026; tarkov.dev itself now reads these JSON files,
// so this is the same data the tarkov.dev website shows. Pure function: no network, no fs.

export const SOURCES = ['items','items_en','maps','maps_en','tasks','tasks_en','traders','traders_en','barters','crafts','hideout','hideout_en'];

// app map id -> tarkov.dev normalizedName candidates (first match wins)
export const MAP_PICK = [
  ['ground-zero',['ground-zero-21','ground-zero']], ['customs',['customs']], ['factory',['factory','night-factory']],
  ['woods',['woods']], ['shoreline',['shoreline']], ['interchange',['interchange']], ['reserve',['reserve']],
  ['lighthouse',['lighthouse']], ['streets-of-tarkov',['streets-of-tarkov']], ['the-lab',['the-lab']],
  ['the-labyrinth',['the-labyrinth']], ['terminal',['terminal']], ['icebreaker',['icebreaker']]
];

// Extract -> switch chains. The JSON feed's per-extract "switches" list is broken (every extract on a map
// gets the same first switch), so the chains the old GraphQL API reported are pinned here and resolved to
// the live switch positions by name. Name-token matching covers anything not listed.
const EXTRACT_SWITCHES = {
  'customs': {'ZB-013': ['ZB-013 Power Switch'], 'ZB-1013': ['ZB-013 Power Switch']},   // bunker renamed ZB-1013 in 1.2, switch kept its old name
  'reserve': {'D-2': ['D-2 Door Switch','D-2 Power Switch'], 'Bunker Hermetic Door': ['Bunker Hermetic Door Power Switch']},
  'interchange': {'Saferoom Exfil': ['Saferoom Exfil Switch']},
  'the-lab': {
    'Medical Block Elevator': ['Med Elevator Extract Button','Med Elevator Call Button','Med Elevator Power Button'],
    'Cargo Elevator': ['Cargo Elevator Extract Button','Cargo Elevator Call Button','Cargo Elevator Power Button'],
    'Main Elevator': ['Main Elevator Extract Button','Main Elevator Call Button','Main Elevator Power Button'],
    'Sewage Conduit': ['Water Level Switch','Sewage Conduit Pump Button'],
    'Parking Gate': ['Parking Gate Switch'], 'Hangar Gate': ['Hangar Gate Switch']
  }
};

const MAT = {Aramid:'Aramid',Aluminium:'Aluminium',ArmoredSteel:'Armored steel',Ceramic:'Ceramic',Combined:'Combined materials',
  Glass:'Glass',Titan:'Titan',UHMWPE:'UHMWPE',Plastic:'Plastic',Wood:'Wood',Cloth:'Cloth',Rubber:'Rubber',Lead:'Lead',Paper:'Paper'};

export function buildPack(R, now = Date.now()){
  const IT = R.items.data.items, IE = R.items_en.data;
  const MP = R.maps.data, ME = R.maps_en.data;
  const TK = R.tasks.data, TE = R.tasks_en.data;
  const TR = R.traders.data, TRE = R.traders_en.data;
  const HD = R.hideout.data, HE = R.hideout_en.data;
  const BR = Object.values(R.barters.data || {}), CR = Object.values(R.crafts.data || {});

  const ph = /^[0-9a-f]{24} \w+$/i;                       // untranslated placeholder like "5447a9… Name"
  const tx = (d,k) => (k != null && d && d[k] != null && d[k] !== '') ? d[k] : k;
  const clean = (s,fb) => (typeof s === 'string' && ph.test(s)) ? (fb == null ? '' : fb) : s;
  const pretty = nn => (nn || '').replace(/-/g,' ');
  const item = id => (id && IT[id]) || null;
  const iname = id => { const i = item(id); return i ? clean(tx(IE,i.name), pretty(i.normalizedName)) : ''; };
  const isname = id => { const i = item(id); return i ? clean(tx(IE,i.shortName), iname(id)) : ''; };
  const icon = id => (item(id) || {}).iconLink || null;
  const price = id => { const i = item(id); return i ? (i.avg24hPrice || 0) : 0; };
  const tname = id => { const t = TR[id]; return t ? clean(tx(TRE,t.name), pretty(t.normalizedName)) : ''; };
  const mapNN = id => ((MP.maps || {})[id] || {}).normalizedName || null;
  const P2 = p => ({x:Math.round(p.x*100)/100, z:Math.round(p.z*100)/100});
  const P1 = p => ({x:Math.round(p.x*10)/10, z:Math.round(p.z*10)/10});
  const has = (i,t) => (i.types || []).includes(t);
  const mat = m => m ? (MAT[m] || pretty(String(m))) : '';
  const buyFor = (i, withLL) => {
    const a = (i.buyFromTrader || []).filter(o => o.priceRUB).map(o => {
      const v = {name: tname(o.trader)}; if (withLL) v.minTraderLevel = o.minTraderLevel || 1;
      return {priceRUB:o.priceRUB, vendor:v};
    });
    if (i.lastLowPrice && !has(i,'noFlea')) a.push({priceRUB:i.lastLowPrice, vendor:{name:'Flea Market'}});
    return a;
  };
  const bestBuy = (i,withLL) => buyFor(i,withLL).filter(o => o.vendor.name !== 'Flea Market').sort((a,b) => a.priceRUB-b.priceRUB).slice(0,1);
  const items = Object.values(IT);
  const wrap = d => JSON.stringify({ts: now, d});
  const pack = {}, stats = {};

  /* ---------- tasks (tkm_tasks3) ---------- */
  const QI = TK.questItems || {};
  const tasks = Object.values(TK.tasks || {}).map(t => {
    const objectives = (t.objectives || []).map(ob => {
      const r = {description: clean(tx(TE,ob.description),''), type: ob.type,
        maps: (ob.maps || []).map(mapNN).filter(Boolean).map(n => ({normalizedName:n}))};
      if (ob.optional) r.optional = true;
      if (ob.zones && ob.zones.length) r.zones = ob.zones.filter(z => z.position).map(z => ({map:{normalizedName:mapNN(z.map)}, position:P2(z.position)}));
      if (ob.count != null) r.count = ob.count;
      if (ob.foundInRaid != null) r.foundInRaid = !!ob.foundInRaid;
      const ids = (ob.items && ob.items.length) ? ob.items : (ob.item ? [ob.item] : []);
      if (ids.length){ r.item = {name:iname(ids[0]), iconLink:icon(ids[0])}; if (ids.length > 1) r.alts = ids.length; }
      if (ob.questItem){ const q = QI[ob.questItem]; if (q) r.qitem = {name:clean(tx(TE,q.name), pretty(q.normalizedName)), iconLink:q.iconLink || null}; }
      if (ob.possibleLocations && ob.possibleLocations.length)
        r.possibleLocations = ob.possibleLocations.map(p => ({map:{normalizedName:mapNN(p.map)}, positions:(p.positions || []).map(P2)}));
      if (ob.type === 'shoot'){
        if (ob.targetNames && ob.targetNames.length) r.targets = ob.targetNames.map(n => clean(tx(TE,n),n));
        if (ob.distance && ob.distance.value) r.dist = (ob.distance.compareMethod || '>=') + ob.distance.value + 'm';
        if (ob.usingWeapon && ob.usingWeapon.length) r.weapons = ob.usingWeapon.slice(0,6).map(isname).filter(Boolean);
      }
      return r;
    });
    const req = (t.taskRequirements || []).map(x => { const tt = (TK.tasks || {})[x.task]; return tt ? clean(tx(TE,tt.name), pretty(tt.normalizedName)) : null; }).filter(Boolean);
    const ll = (((t.traderRequirements || []).find(x => x.requirementType === 'level') || {}).value) || 0;
    const keys = [].concat(...(t.neededKeys || []).map(k => (k.keys || []).map(iname))).filter(Boolean);
    const out = {name: clean(tx(TE,t.name), pretty(t.normalizedName)), minPlayerLevel: t.minPlayerLevel || 0, trader:{name:tname(t.trader)}, objectives};
    if (req.length) out.req = req;
    if (ll > 1) out.ll = ll;
    if (t.kappaRequired) out.kappa = true;
    if (t.lightkeeperRequired) out.lk = true;
    if (t.experience) out.xp = t.experience;
    if (t.wikiLink) out.wiki = t.wikiLink;
    if (keys.length) out.keys = [...new Set(keys)];
    if (t.factionName && t.factionName !== 'Any') out.faction = t.factionName;
    if (t.map){ const n = mapNN(t.map); if (n) out.map = n; }
    return out;
  }).filter(t => t.name);
  pack.tkm_tasks3 = wrap(tasks); stats.tasks = tasks.length;

  /* ---------- ammo (tkm_ammo4) ---------- */
  const ammo = items.filter(i => i.properties && i.properties.propertiesType === 'ItemPropertiesAmmo').map(i => ({
    caliber: i.properties.caliber, penetrationPower: i.properties.penetrationPower, damage: i.properties.damage,
    initialSpeed: i.properties.initialSpeed, projectileCount: i.properties.projectileCount || 1,
    item: {name: iname(i.id), iconLink: i.iconLink, avg24hPrice: i.avg24hPrice || null, buyFor: buyFor(i, true)}
  })).filter(a => a.item.name);
  pack.tkm_ammo4 = wrap(ammo); stats.ammo = ammo.length;

  /* ---------- guns (tkm_guns1) ---------- */
  const guns = items.filter(i => has(i,'gun') && !has(i,'preset')).map(g => {
    const p = g.properties || {};
    return {n: iname(g.id), sn: isname(g.id), ic: g.iconLink, im: g.image512pxLink || g.gridImageLink || g.iconLink, p: g.avg24hPrice || null, bf: bestBuy(g),
      pr: p.caliber ? {cal: p.caliber, erg: p.ergonomics, rec: p.recoilVertical, rof: p.fireRate} : null};
  }).filter(g => g.n);
  pack.tkm_guns1 = wrap(guns); stats.guns = guns.length;

  /* ---------- gear (tkm_gear2) ---------- */
  const trimGear = arr => arr.map(g => { const p = g.properties || {}; return {n: iname(g.id), sn: isname(g.id), ic: g.iconLink, p: g.avg24hPrice || null, bf: bestBuy(g),
    cl: p.class || 0, du: p.durability || 0, cap: p.capacity || 0, mat: mat(p.material),
    gr: (p.grids || []).map(x => [x.width || 1, x.height || 1])}; }).filter(g => g.n);
  const gear = {armor: trimGear(items.filter(i => has(i,'armor'))), rig: trimGear(items.filter(i => has(i,'rig'))),
    bp: trimGear(items.filter(i => has(i,'backpack'))), helm: trimGear(items.filter(i => has(i,'helmet')))};
  pack.tkm_gear2 = wrap(gear); stats.gear = gear.armor.length + '/' + gear.rig.length + '/' + gear.bp.length + '/' + gear.helm.length;

  /* ---------- plates (tkm_plate1) ---------- */
  const plates = items.filter(i => has(i,'armorPlate')).map(x => { const p = x.properties || {}; return {n: iname(x.id), sn: isname(x.id), ic: x.iconLink, p: x.avg24hPrice || 0,
    bf: bestBuy(x, true), cl: p.class || 0, du: p.durability || 0, mat: mat(p.material)}; }).filter(x => x.n);
  pack.tkm_plate1 = wrap(plates); stats.plates = plates.length;

  /* ---------- plate compatibility (tkm_slots1): which plates fit which armor/rig — for the Plate Finder ---------- */
  const slots = {};
  items.filter(i => (has(i,'armor') || has(i,'rig')) && i.properties && (i.properties.armorSlots || []).some(s => s.allowedPlates && s.allowedPlates.length)).forEach(i => {
    slots[iname(i.id)] = i.properties.armorSlots.filter(s => s.allowedPlates && s.allowedPlates.length)
      .map(s => ({nameId: s.nameId, allowedPlates: s.allowedPlates.map(id => ({name: iname(id)})).filter(p => p.name)}));
  });
  pack.tkm_slots1 = wrap(slots); stats.slots = Object.keys(slots).length;

  /* ---------- hideout (tkm_hide3) ---------- */
  const stations = Object.values(HD || {});
  const stName = id => { const s = stations.find(x => x.id === id); return s ? clean(tx(HE,s.name), pretty(s.normalizedName)) : ''; };
  const hide = stations.map(s => ({name: clean(tx(HE,s.name), pretty(s.normalizedName)),
    levels: (s.levels || []).map(l => ({level: l.level, itemRequirements: (l.itemRequirements || []).map(r => ({count: r.count, item: {name: iname(r.item), avg24hPrice: price(r.item) || null, iconLink: icon(r.item)}}))}))}));
  pack.tkm_hide3 = wrap(hide); stats.hideout = hide.length;

  /* ---------- boss portraits (tkm_bossp) ---------- */
  const bossp = Object.values(MP.mobs || {}).map(m => ({name: clean(tx(ME,m.name), pretty(m.normalizedName)), imagePortraitLink: m.imagePortraitLink || null})).filter(b => b.name);
  pack.tkm_bossp = wrap(bossp); stats.bosses = bossp.length;

  /* ---------- crafts (tkm_craft1) ---------- */
  const crafts = CR.filter(c => c.productItem).map(c => ({duration: c.duration, level: c.level, station: {name: stName(c.station)},
    requiredItems: (c.requiredItems || []).map(r => ({count: r.count, item: {name: iname(r.item), avg24hPrice: price(r.item) || null}})),
    rewardItems: [{count: c.productItem.count || 1, item: {name: iname(c.productItem.item), shortName: isname(c.productItem.item), avg24hPrice: price(c.productItem.item) || null, iconLink: icon(c.productItem.item)}}]}));
  pack.tkm_craft1 = wrap(crafts); stats.crafts = crafts.length;

  /* ---------- barters (tkm_bart1) ---------- */
  const barters = BR.filter(b => b.offeredItem).map(b => ({level: b.minTraderLevel || 1, trader: {name: tname(b.trader)},
    requiredItems: (b.requiredItems || []).map(r => ({count: r.count, item: {name: iname(r.item), avg24hPrice: price(r.item) || null}})),
    rewardItems: [{count: b.offeredItem.count || 1, item: {name: iname(b.offeredItem.item), shortName: isname(b.offeredItem.item), avg24hPrice: price(b.offeredItem.item) || null, iconLink: icon(b.offeredItem.item)}}]}));
  pack.tkm_bart1 = wrap(barters); stats.barters = barters.length;

  /* ---------- barter/junk items (tkm_loot2) ---------- */
  const loot = items.filter(i => has(i,'barter')).map(it => {
    const tr = (it.sellToTrader || []).filter(o => o.priceRUB).sort((a,b) => b.priceRUB-a.priceRUB)[0] || null;
    return {n: iname(it.id), sn: isname(it.id), ic: it.iconLink, bp: it.basePrice || 0, w: it.width || 1, h: it.height || 1, p: it.avg24hPrice || 0, tv: tr ? tr.priceRUB : 0, tn: tr ? tname(tr.trader) : ''};
  }).filter(x => x.n);
  pack.tkm_loot2 = wrap(loot); stats.loot = loot.length;

  /* ---------- compact item index (items.json, loaded on demand) — powers the in-app item lookup now that live search is gone.
     icon = https://assets.tarkov.dev/<id>-icon.webp, wiki = fandom /wiki/<name with underscores> (both rebuilt client-side) ---------- */
  const CAT = R.items.data.itemCategories || {};
  const itemsIdx = items.filter(i => !has(i,'preset')).map(i => {
    const d = clean(tx(IE,i.description),'') || '';
    const c = (i.categories || []).map(cid => CAT[cid]).find(Boolean);
    const o = {n: iname(i.id), sn: isname(i.id), id: i.id, p: i.avg24hPrice || 0, bf: bestBuy(i, true),
      c: c ? clean(tx(IE,c.name), pretty(c.normalizedName)) : '', t: (i.types || []).filter(t => t !== 'noFlea' && t !== 'wearable').slice(0,3)};
    if (!has(i,'mods') && d) o.d = d.length > 220 ? d.slice(0,220) + '…' : d;
    if (has(i,'noFlea')) o.nf = 1;
    if (i.width > 1 || i.height > 1) o.sz = [i.width, i.height];
    return o;
  }).filter(x => x.n);
  const extra = {'items.json': wrap(itemsIdx)}; stats.items = itemsIdx.length;

  /* ---------- trader loyalty → player level (tkm_trd1) ---------- */
  const trd = {};
  Object.values(TR).forEach(t => { const n = tname(t.id); const lv = (t.levels || []).filter(l => l.level >= 1).sort((a,b) => a.level-b.level).map(l => Math.max(1, l.requiredPlayerLevel || 1));
    if (n && lv.length >= 4) trd[n] = lv.slice(0,4); });
  pack.tkm_trd1 = wrap(trd); stats.traders = Object.keys(trd).length;

  /* ---------- maps (tkm_c5_<id>) ---------- */
  const SW = MP.stationaryWeapons || {}, LC = MP.lootContainers || {}, MOB = MP.mobs || {};
  const mobName = id => { const m = MOB[id]; return m ? clean(tx(ME,m.name), pretty(m.normalizedName)) : clean(tx(ME,id), id); };
  const byNN = {}; Object.values(MP.maps || {}).forEach(m => byNN[m.normalizedName] = m);
  let mapsOk = 0; stats.maps = [];
  const toks = s => String(s || '').toLowerCase().replace(/\(.*?\)/g,' ').split(/[^a-z0-9]+/).filter(w => w && !['block','shaft','the','to','exfil','extract'].includes(w));
  const tokHit = (a,b) => a === b || (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a)));
  for (const [id, names] of MAP_PICK){
    const cands = names.map(n => byNN[n]).filter(Boolean); if (!cands.length) continue;
    const m = cands[0];
    const switchesNamed = (m.switches || []).filter(s => s.position).map(s => ({name: clean(tx(ME,s.name), s.name), position: P2(s.position)}));
    const swById = {}; (m.switches || []).forEach(s => swById[s.id] = s);
    const firstSet = JSON.stringify(((m.extracts || [])[0] || {}).switches || []);
    const jsonBroken = (m.extracts || []).length > 1 && (m.extracts || []).every(e => JSON.stringify(e.switches || []) === firstSet) && firstSet !== '[]';
    const chain = (exName, e) => {
      const pin = (EXTRACT_SWITCHES[id] || {})[exName];
      if (pin) return pin.map(n => switchesNamed.find(s => s.name === n)).filter(Boolean);
      if (!jsonBroken && e.switches && e.switches.length)
        return e.switches.map(sid => swById[sid]).filter(s => s && s.position).map(s => ({name: clean(tx(ME,s.name), s.name), position: P2(s.position)}));
      const et = toks(exName); if (!et.length) return [];
      return switchesNamed.filter(s => { const st = toks(s.name); return et.every(t => st.some(w => tokHit(w,t))); });
    };
    // faction fallback / extra extracts from sibling map versions (Ground Zero 21+ lacks faction tags and the 1-20 extracts)
    const sib = cands.slice(1).flatMap(c => c.extracts || []).map(e => ({name: clean(tx(ME,e.name), e.name), faction: e.faction, position: e.position}));
    const bossMax = {};
    (m.bosses || []).forEach(b => { const n = mobName(b.mob); if (!n) return; bossMax[n] = Math.max(bossMax[n] || 0, b.spawnChance || 0); });
    const extracts = (m.extracts || []).filter(e => e.position).map(e => {
      const name = clean(tx(ME,e.name), e.name);
      const s = sib.find(x => x.name === name);
      return {name, faction: e.faction || (s && s.faction) || 'shared', position: P2(e.position), switches: chain(name, e)};
    });
    if (id === 'ground-zero') sib.filter(s => s.position && !extracts.some(x => x.name === s.name)).forEach(s => {
      if (!extracts.some(x => x.name === s.name + ' (lvl 1-20 raids only)'))
        extracts.push({name: s.name + ' (lvl 1-20 raids only)', faction: s.faction || 'shared', position: P2(s.position), switches: []});
    });
    const d = {
      normalizedName: m.normalizedName, raidDuration: m.raidDuration, players: m.players,
      description: clean(tx(ME,m.description),''), enemies: [...new Set((m.enemies || []).map(e => clean(tx(ME,e), e)))],
      extracts,
      transits: (m.transits || []).filter(t => t.position).map(t => ({description: clean(tx(ME,t.description), t.description), position: P2(t.position), to: mapNN(t.map)})),
      locks: (m.locks || []).filter(l => l.position).map(l => ({lockType: l.lockType, needsPower: !!l.needsPower, key: {name: iname(l.key), avg24hPrice: price(l.key) || null, iconLink: icon(l.key)}, position: P2(l.position)})),
      hazards: (m.hazards || []).filter(h => h.position).map(h => ({name: clean(tx(ME,h.name), h.hazardType || h.name), position: P2(h.position)})),
      stationaryWeapons: (m.stationaryWeapons || []).filter(s => s.position).map(s => { const w = SW[s.stationaryWeapon]; return {stationaryWeapon: {name: w ? clean(tx(ME,w.name), pretty(w.normalizedName)) : 'Stationary weapon'}, position: P2(s.position)}; }),
      switches: (m.switches || []).filter(s => s.position).map(s => ({name: clean(tx(ME,s.name), s.name), position: P2(s.position)})),
      bosses: Object.entries(bossMax).map(([n,c]) => ({boss: {name: n}, spawnChance: c})),
      spawns: (m.spawns || []).filter(s => s.position).map(s => ({sides: s.sides || [], categories: s.categories || [], position: P1(s.position)})),
      lootContainers: (m.lootContainers || []).filter(l => l.position).map(l => { const c = LC[l.lootContainer]; return {lootContainer: {name: c ? clean(tx(ME,c.name), pretty(c.normalizedName)) : 'Container'}, position: P1(l.position)}; }),
      accessKeys: (m.accessKeys || []).map(iname).filter(Boolean), minPlayerLevel: m.minPlayerLevel || 0
    };
    pack['tkm_c5_' + id] = wrap(d); mapsOk++;
    stats.maps.push(id + ':' + d.extracts.length + 'ex/' + d.locks.length + 'lk/' + d.spawns.length + 'sp');
  }
  stats.mapsOk = mapsOk;

  /* ---------- meta (tkm_meta) ---------- */
  pack.tkm_meta = wrap({built: now, source: 'json.tarkov.dev', tasks: tasks.length, items: items.length, maps: mapsOk});
  return {pack, extra, stats};
}
