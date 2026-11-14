/* MTG Dashboard service worker — makes the whole app work offline.
   - app shell: network-first (so an online visit always gets the newest version), cached copy when offline
   - versioned scripts (playtest.js?v=N): cache-first; the versions the cached index.html asks for are fetched at install/update
   - card images (cards.scryfall.io): cache-first, in their own cache that app updates never clear
   - Scryfall / EDHREC / exchange-rate GETs: network-first, last good answer when offline
   Bump SW_VERSION only when this file's logic changes; app updates do not need it. */
const SW_VERSION = 'v2';
const SHELL = 'mtg-shell-' + SW_VERSION, API = 'mtg-api-' + SW_VERSION, IMG = 'mtg-img-v1', FONT = 'mtg-font-v1';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'data/combos.json', 'data/snapshot.json', 'data/cards.json'];
const scriptsOf = html => [...new Set([...html.matchAll(/['"]((?:playtest(?:-ui)?\.js)\?v=\d+)['"]/g)].map(m => m[1]))]; // index.html loads them with loadScript('playtest.js?v=N')
async function cacheShell() {
  const c = await caches.open(SHELL);
  await Promise.all(CORE.map(u => fetch(u, { cache: 'no-cache' }).then(r => r.ok && c.put(u, r.clone())).catch(() => {})));
  const idx = await c.match('index.html'); if (!idx) return;
  const html = await idx.text(); await c.put('./', new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
  await Promise.all(scriptsOf(html).map(async u => { if (await c.match(u)) return; const r = await fetch(u).catch(() => null); if (r && r.ok) await c.put(u, r.clone()); }));
  /* drop scripts from older versions */ const keep = new Set(scriptsOf(html)); for (const k of await c.keys()) { const u = new URL(k.url); const rel = u.pathname.split('/').pop() + u.search; if (/^playtest(?:-ui)?\.js\?v=\d+$/.test(rel) && !keep.has(rel)) await c.delete(k); }
}
self.addEventListener('install', e => { e.waitUntil(cacheShell().then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil((async () => { for (const k of await caches.keys()) if (/^mtg-(shell|api)-/.test(k) && k !== SHELL && k !== API) await caches.delete(k); await self.clients.claim(); })()); });
self.addEventListener('message', e => { if (e.data === 'refresh-shell') e.waitUntil(cacheShell()); });
const timeout = (p, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then(v => { clearTimeout(t); res(v); }, x => { clearTimeout(t); rej(x); }); });
async function shellFirstNetwork(req, key) {
  const c = await caches.open(SHELL);
  try { const r = await timeout(fetch(req, { cache: 'no-cache' }), 4000); if (r.ok) { await c.put(key, r.clone()); if (key === 'index.html') { const html = await r.clone().text(); c.put('./', new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })); Promise.all(scriptsOf(html).map(async u => { if (!(await c.match(u))) { const s = await fetch(u).catch(() => null); if (s && s.ok) await c.put(u, s.clone()); } })); } } return r; }
  catch (e) { return (await c.match(key)) || (await c.match('index.html')) || Response.error(); }
}
async function cacheFirst(req, cacheName, opts) { const c = await caches.open(cacheName); const hit = await c.match(req, opts); if (hit) return hit; const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r; }
async function networkFirst(req, cacheName, ms) { const c = await caches.open(cacheName); try { const r = await (ms ? timeout(fetch(req), ms) : fetch(req)); if (r.ok) { c.put(req, r.clone()); return r; } if (r.status === 429 || r.status >= 500) { const hit = await c.match(req); if (hit) return hit; } return r; } catch (e) { const hit = await c.match(req); if (hit) return hit; throw e; } }
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return; const u = new URL(req.url);
  if (u.origin === location.origin) {
    const rel = u.pathname.slice(new URL(self.registration.scope).pathname.length);
    if (req.mode === 'navigate' || rel === '' || rel === 'index.html') return e.respondWith(shellFirstNetwork(req, 'index.html'));
    if (/^playtest(?:-ui)?\.js$/.test(rel) && u.search) return e.respondWith(cacheFirst(req, SHELL));
    if (rel === 'sw.js') return;
    if (/^data\//.test(rel)) return e.respondWith((async () => { const c = await caches.open(SHELL); try { const r = await fetch(req); if (r.ok) c.put(rel, r.clone()); return r; } catch (x) { return (await c.match(rel)) || Response.error(); } })());
    return e.respondWith(networkFirst(req, SHELL).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || Response.error())));
  }
  if (u.hostname === 'cards.scryfall.io') return e.respondWith((async () => { const c = await caches.open(IMG); const hit = await c.match(u.origin + u.pathname); if (hit) return hit; try { const r = await fetch(u.href, { mode: 'cors', credentials: 'omit' }); if (r.ok) c.put(u.origin + u.pathname, r.clone()); return r; } catch (x) { /* no CORS answer: take it the way the page asked and keep that copy instead */ const r = await fetch(req); if (r.ok || r.type === 'opaque') c.put(u.origin + u.pathname, r.clone()); return r; } })());
  if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) return e.respondWith(cacheFirst(req, FONT).catch(() => Response.error()));
  if (u.hostname === 'api.scryfall.com' || u.hostname === 'json.edhrec.com' || u.hostname === 'open.er-api.com') return e.respondWith(networkFirst(req, API, 9000)); /* a request that hangs or is rate-limited falls back to the last good answer */
});
