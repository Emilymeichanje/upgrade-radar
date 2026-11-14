// Offline app: service worker caches the shell, card data and pictures are stored on the device, and a reload + playtest start work with the network off.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const { chromium } = require('playwright');
let fails = 0; const ok = (n, c, d) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? ' — ' + d : '')); if (!c) fails++; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(); const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const img = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'); let api = 0, imgs = 0;
  const card = n => ({ object: 'card', name: n, mana_cost: /Land/.test(n) ? '' : '{1}{G}', type_line: /Land/.test(n) ? 'Basic Land — Forest' : /Silverquill/.test(n) ? 'Legendary Creature — Elder Dragon' : 'Creature — Bear', oracle_text: /Land/.test(n) ? '({T}: Add {G}.)' : '', cmc: /Land/.test(n) ? 0 : 2, power: '2', toughness: '2', color_identity: ['G'], image_uris: { small: 'https://cards.scryfall.io/small/front/a/b/' + encodeURIComponent(n) + '.jpg?1', normal: 'https://cards.scryfall.io/normal/front/a/b/' + encodeURIComponent(n) + '.jpg?1', art_crop: 'https://cards.scryfall.io/art_crop/front/a/b/' + encodeURIComponent(n) + '.jpg?1' }, prices: {}, set_name: 'T', set: 't', released_at: '2020-01-01', scryfall_uri: 'https://scryfall.com/x' });
  await ctx.route(/api\.scryfall\.com\/cards\/collection/, async r => { api++; const ids = JSON.parse(r.request().postData()).identifiers; await r.fulfill({ json: { data: ids.map(i => card(i.name)), not_found: [] }, headers: { 'access-control-allow-origin': '*' } }); });
  await ctx.route(/api\.scryfall\.com\/(?!cards\/collection)/, r => r.fulfill({ status: 404, json: {}, headers: { 'access-control-allow-origin': '*' } }));
  await ctx.route(/cards\.scryfall\.io/, r => { imgs++; r.fulfill({ status: 200, body: img, headers: { 'content-type': 'image/png', 'access-control-allow-origin': '*' } }); });
  await ctx.route(/edhrec|er-api|fonts\.|api\.github/, r => r.fulfill({ status: 404, body: '' }));
  await pg.goto('http://localhost:8765/index.html'); await pg.waitForTimeout(1200);
  const list = ['Test Land', ...Array.from({ length: 12 }, (_, i) => 'Bear ' + i)];
  await pg.evaluate(l => { const d = {}; for (const s of ['silverquill-the-disputant']) d[s] = { list: [...Array(36).fill('Test Land'), ...l.slice(1), ...l.slice(1), ...l.slice(1), ...l.slice(1), ...l.slice(1)].slice(0, 99), updatedAt: new Date().toISOString() }; localStorage.setItem('decks', JSON.stringify(d)); }, list);
  await pg.evaluate(() => navigator.serviceWorker.ready); await pg.reload(); await pg.waitForTimeout(2000);
  ok('service worker is active and controls the page', await pg.evaluate(() => !!navigator.serviceWorker.controller));
  ok('first visit with decks offers the offline download once', await pg.evaluate(() => !document.getElementById('offpanel').hidden && !!document.getElementById('offgo')));
  await pg.click('#offgo'); await pg.waitForFunction(() => !MTGOffline.state().busy && /Ready|failed|Stopped/.test(MTGOffline.state().msg), null, { timeout: 30000 });
  const st = await pg.evaluate(async () => ({ s: MTGOffline.state(), imgs: (await (await caches.open('mtg-img-v1')).keys()).length, shell: (await (await caches.open((await caches.keys()).find(k => /shell/.test(k)))).keys()).map(r => r.url.split('/').pop()) }));
  ok('download finishes: every card and picture stored', st.s.done === true && st.s.cards >= 14 && st.imgs === st.s.want && st.imgs >= 28, JSON.stringify(st.s));
  ok('app shell cached, including the versioned engine scripts', ['index.html', 'manifest.webmanifest', 'combos.json', 'snapshot.json'].every(f => st.shell.includes(f)) && st.shell.some(f => /^playtest\.js\?v=\d+$/.test(f)) && st.shell.some(f => /^playtest-ui\.js\?v=\d+$/.test(f)), JSON.stringify(st.shell));
  ok('button shows ready', /ready/.test(await pg.textContent('#offbtn')), await pg.textContent('#offbtn'));
  // ---- network off ----
  await ctx.setOffline(true); const a0 = api, i0 = imgs; let reloaded = true; await pg.reload().catch(() => { reloaded = false; }); await pg.waitForTimeout(2000);
  ok('the app reloads with no network', reloaded && (await pg.title()) === 'MTG Dashboard');
  const off = await pg.evaluate(async () => { const cs = await MTGOffline.cards(['Bear 1', 'Test Land', 'Silverquill, the Disputant']); const load = u => new Promise(r => { const im = new Image(); im.onload = () => r(true); im.onerror = () => r(false); im.src = u; }); return { names: cs.map(c => c.name).sort(), small: await load(cs[0].img), big: await load(cs[0].imgN), btn: document.getElementById('offbtn').textContent, status: document.getElementById('status').textContent }; });
  ok('card data comes from the device', off.names.length === 3, JSON.stringify(off.names));
  ok('small and large pictures load from the device', off.small && off.big);
  ok('the app says it is offline', /in use/.test(off.btn) && /Offline/.test(off.status), off.btn + ' | ' + off.status.slice(0, 60));
  await pg.evaluate(() => { location.hash = '#playtest'; }); await pg.waitForFunction(() => typeof Goldfish !== 'undefined' && typeof GoldfishUI !== 'undefined', null, { timeout: 15000 }).catch(() => {});
  ok('the playtest engine loads offline', await pg.evaluate(() => typeof Goldfish !== 'undefined' && typeof GoldfishUI !== 'undefined'));
  ok('nothing reached the network while offline', api === a0 && imgs === i0, JSON.stringify([api - a0, imgs - i0]));
  await ctx.setOffline(false);
  console.log('errors', JSON.stringify(errs)); ok('no page errors', errs.length === 0, errs.join(' | '));
  await b.close(); process.exit(fails ? 1 : 0);
})();
