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
  // ---- online, but Scryfall never answers (blocked network / VPN / rate limit) ----
  await ctx.unroute(/api\.scryfall\.com\/cards\/collection/); let hung = 0; await ctx.route(/api\.scryfall\.com\/cards\/collection/, r => { hung++; /* never fulfil */ });
  await pg.reload(); await pg.waitForTimeout(1500);
  const t0 = Date.now(); const stored = await pg.evaluate(() => MTGOffline.cards(['Bear 1', 'Bear 2', 'Test Land']).then(cs => cs.length)); const dt = Date.now() - t0;
  ok('cards already on the device load instantly even when Scryfall hangs (no request made)', stored === 3 && dt < 1500, stored + ' cards in ' + dt + ' ms, requests ' + hung);
  const t1 = Date.now(); const miss = await pg.evaluate(() => MTGOffline.cards(['Never Seen Card', 'Bear 3']).then(cs => cs.map(c => c.name))); const dt1 = Date.now() - t1;
  ok('an unknown card gives up after the timeout instead of hanging, and what is stored still comes back', miss.length === 1 && miss[0] === 'Bear 3' && dt1 < 14000 && dt1 > 5000, JSON.stringify(miss) + ' in ' + dt1 + ' ms');
  const fb = await pg.evaluate(() => MTGOffline.cards(['Sol Ring', 'Avacyn, Angel of Hope']).then(cs => cs.map(c => [c.name, c.type, !!c.oracle, !!c.fallback]))); ok('a card that was never stored still loads from the card text shipped with the app', fb.length === 2 && fb.every(x => x[2] && x[3]) && /Artifact/.test((fb.find(x => x[0] === 'Sol Ring') || [])[1] || ''), JSON.stringify(fb));
  const t2 = Date.now(); await pg.evaluate(() => MTGOffline.cards(['Another Unknown'])); ok('…and the next lookup does not wait again (30 s back-off)', Date.now() - t2 < 1500, (Date.now() - t2) + ' ms');
  // ---- Scryfall still silent, but another device published the card pack to Sync ----
  let patched = null; const pack = { at: 'x', cards: [{ name: 'Pack Card', mana: '{2}', type: 'Artifact', oracle: 'Pack text.', cmc: 2, img: 'https://cards.scryfall.io/small/front/p/k/pack.jpg?1', imgN: 'https://cards.scryfall.io/normal/front/p/k/pack.jpg?1' }, { name: 'Sol Ring', mana: '{1}', type: 'Artifact', oracle: '{T}: Add {C}{C}.', cmc: 1, img: 'https://cards.scryfall.io/small/front/s/r/sol.jpg?1', imgN: 'https://cards.scryfall.io/normal/front/s/r/sol.jpg?1' }] };
  await ctx.route(/api\.github\.com\/gists/, r => { const q = r.request(); if (q.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,PATCH,POST', 'access-control-allow-headers': '*' } }); if (q.method() === 'PATCH') { const j = JSON.parse(q.postData()); if (j.files && j.files['mtg-cards.json']) patched = j; return r.fulfill({ json: { id: 'g1', files: {} }, headers: { 'access-control-allow-origin': '*' } }); } const gist = { id: 'g1', files: { 'upgrade-radar.json': { content: '{}' }, 'mtg-cards.json': { content: JSON.stringify(pack) } } }; r.fulfill({ json: /gists\/g1/.test(q.url()) ? gist : [gist], headers: { 'access-control-allow-origin': '*' } }); });
  await pg.evaluate(() => { localStorage.setItem('sync-token', 'test-token'); localStorage.setItem('sync-gist', 'g1'); }); await pg.reload(); await pg.waitForTimeout(1500);
  const pk = await pg.evaluate(async () => { const cs = await MTGOffline.cards(['Pack Card', 'Sol Ring']); const load = u => new Promise(r => { const im = new Image(); im.onload = () => r(true); im.onerror = () => r(false); im.src = u; }); return { cs: cs.map(c => [c.name, !!c.img, !!c.fallback]), pic: cs[0] && cs[0].img ? await load(cs[0].img) : false }; });
  ok('Scryfall silent: card data and picture addresses come from the Sync card pack, replacing the picture-less fallback', pk.cs.length === 2 && pk.cs.every(x => x[1] && !x[2]) && pk.pic, JSON.stringify(pk));
  await ctx.unroute(/api\.scryfall\.com\/cards\/collection/); await ctx.route(/api\.scryfall\.com\/cards\/collection/, async r => { const ids = JSON.parse(r.request().postData()).identifiers; await r.fulfill({ json: { data: ids.map(i => card(i.name)), not_found: [] }, headers: { 'access-control-allow-origin': '*' } }); });
  await pg.reload(); await pg.waitForTimeout(1500); await pg.evaluate(() => MTGOffline.download(true)); await pg.waitForFunction(() => !MTGOffline.state().busy, null, { timeout: 30000 });
  const pf = patched && patched.files && patched.files['mtg-cards.json'] && JSON.parse(patched.files['mtg-cards.json'].content);
  ok('a device that reaches Scryfall publishes the card pack to Sync', !!pf && pf.cards.length >= 13 && pf.cards.every(c => c.img && c.oracle !== undefined), pf ? pf.cards.length + ' cards' : 'no PATCH');
  console.log('errors', JSON.stringify(errs)); ok('no page errors', errs.length === 0, errs.join(' | '));
  await b.close(); process.exit(fails ? 1 : 0);
})();
