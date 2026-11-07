/* Upgrade Radar — Goldfish Table UI
   Card-image table with animations (Web Animations API) and synthesized sound effects (Web Audio; generated in the
   browser, no audio files, no licensing). Settings persist per browser. Requires playtest.js (window.Goldfish). */
(function () {
'use strict';
const G = window.Goldfish;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const big = img => (img || '').replace('/small/', '/normal/');
const short = n => String(n || '').replace(/^(You|AI) · /, '');
const done = (a, ms) => Promise.race([a.finished.catch(() => {}), new Promise(r => setTimeout(r, ms + 80))]);

// ---------------- settings ----------------
const DEFAULTS = { anim: !matchMedia('(prefers-reduced-motion: reduce)').matches, sound: true, volume: 0.5, speed: 'normal', stops: 'smart', zoom: 1, sfxStyle: 'classic', music: 'off', musicVol: 0.6, fx: 'normal', combos: 'on' };
const ZOOMS = [0.75, 0.85, 1, 1.15, 1.3, 1.5, 1.75, 2];
function loadSettings() { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('pt-settings') || '{}') }; } catch (e) { return { ...DEFAULTS }; } }
function saveSettings(s) { try { localStorage.setItem('pt-settings', JSON.stringify(s)); } catch (e) {} }
// ---------------- token artwork (Scryfall token printings, cached per browser) ----------------
const TOKART = { cache: (() => { try { return JSON.parse(localStorage.getItem('pt-tokart') || '{}'); } catch (e) { return {}; } })(), queue: [], seen: new Set(), busy: false, onFound: null };
function tokKey(c) { return [c.name, c.isCreature ? (c.power ?? '') + '/' + (c.toughness ?? '') : '', (c.colors || []).join('')].join('|'); }
function tokQueries(c) {
  const nm = '!"' + c.name.replace(/"/g, '') + '"', pt = c.isCreature && c.power != null ? ` pow=${c.power} tou=${c.toughness}` : '', col = (c.colors || []).length ? ' c=' + c.colors.join('').toLowerCase() : (c.isCreature ? ' c=c' : '');
  // b13: match the printed abilities too — a plain 1/1 black Vampire was getting the lifelink printing's art and text
  const KW = ['flying', 'lifelink', 'deathtouch', 'haste', 'vigilance', 'menace', 'trample', 'first strike', 'double strike', 'hexproof', 'indestructible', 'reach'];
  const has = new Set((c.kw || []).map(k => k.toLowerCase())); const kwq = c.isCreature ? ' ' + KW.map(k => (has.has(k) ? '' : '-') + 'kw:"' + k + '"').join(' ') : '';
  const q = [`t:token ${nm}${pt}${col}${kwq}`, `t:token ${nm}${pt}${col}`, `t:token ${nm}${pt}`, `t:token ${nm}`, `t:token name:"${c.name.replace(/"/g, '')}"`];
  return [...new Set(q)];
}
async function tokLookup(c) {
  for (const q of tokQueries(c)) {
    try {
      const r = await fetch('https://api.scryfall.com/cards/search?unique=art&order=released&q=' + encodeURIComponent(q));
      if (r.status === 404) { await new Promise(res => setTimeout(res, 120)); continue; }
      if (!r.ok) return '';
      const j = await r.json(); const hit = (j.data || []).find(x => x.image_uris || (x.card_faces && x.card_faces[0].image_uris));
      if (hit) return (hit.image_uris || hit.card_faces[0].image_uris).small || '';
    } catch (e) { return ''; }
    await new Promise(res => setTimeout(res, 120));
  }
  return '';
}
/** give a bare token card its artwork: cached → immediate; otherwise queued, and `onFound` fires when it arrives */
function tokArt(c) {
  if (!c || !c.token || c.img) return; const k = tokKey(c);
  if (k in TOKART.cache) { if (TOKART.cache[k]) c.img = TOKART.cache[k]; return; }
  if (TOKART.seen.has(k)) return; TOKART.seen.add(k); TOKART.queue.push(c);
  if (TOKART.busy) return; TOKART.busy = true;
  (async () => { while (TOKART.queue.length) { const t = TOKART.queue.shift(); const url = await tokLookup(t); TOKART.cache[tokKey(t)] = url; try { localStorage.setItem('pt-tokart', JSON.stringify(TOKART.cache)); } catch (e) {} if (url && TOKART.onFound) TOKART.onFound(tokKey(t), url); await new Promise(res => setTimeout(res, 120)); } TOKART.busy = false; })();
}

// ---------------- sound (synthesized) ----------------
class Sfx {
  constructor(settings) { this.s = settings; this.ctx = null; }
  init() { if (this.ctx) return; try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination); } catch (e) { this.ctx = null; } }
  vol() { if (this.master) this.master.gain.value = this.s.volume; }
  /** sound style: changes oscillator character, pitch and layering of every effect */
  get style() { return this.s.sfxStyle || 'classic'; }
  tone(f, dur, { type = 'sine', gain = 0.3, attack = 0.005, slide = null, delay = 0, raw = false } = {}) {
    const c = this.ctx, st = raw ? 'classic' : this.style; let t = c.currentTime + delay;
    if (st === 'retro') { type = type === 'sine' ? 'square' : type === 'triangle' ? 'square' : 'sawtooth'; gain *= 0.55; dur = Math.max(0.05, Math.round(dur / 0.06) * 0.06); }
    if (st === 'cinematic') { f *= 0.5; if (slide) slide *= 0.5; dur *= 1.6; attack = Math.max(attack, 0.02); }
    if (st === 'arcane') { dur *= 1.4; attack = Math.max(attack, 0.03); }
    const mk = (freq, det, gn) => { const o = c.createOscillator(), g = c.createGain(); o.type = type; o.detune.value = det; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gn, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02); };
    mk(f, 0, gain);
    if (st === 'arcane') { mk(f, 9, gain * 0.5); mk(f, -9, gain * 0.5); mk(f * 2, 0, gain * 0.12); }
    if (st === 'cinematic') { mk(f * 0.5, 0, gain * 0.5); }
  }
  // ---- generative music: off / ambient / tavern / battle (nothing downloaded; a scheduler plays chords from a key) ----
  musicStart() {
    this.musicStop(); const mode = this.s.music; if (!mode || mode === 'off' || !this.ctx) return;
    const c = this.ctx; if (c.state === 'suspended') c.resume();
    const bus = this.musicBus = c.createGain(); bus.gain.value = this.s.musicVol ?? 0.6; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = mode === 'battle' ? 3600 : 2400; const comp = c.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4; bus.connect(lp); lp.connect(comp); comp.connect(c.destination);
    const root = [110, 123.47, 130.81, 146.83, 164.81][Math.floor(Math.random() * 5)]; const minor = mode !== 'tavern';
    const scale = minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]; const deg = i => root * Math.pow(2, scale[((i % 7) + 7) % 7] / 12) * Math.pow(2, Math.floor(i / 7));
    const prog = minor ? [0, 5, 3, 4] : [0, 3, 4, 0]; let bar = 0, step = 0; const bpm = mode === 'battle' ? 128 : mode === 'tavern' ? 96 : 50; const beat = 60 / bpm;
    const voice = (f, t, d, type, g, det = 0) => { g = Math.min(0.9, g * 4.5); const o = c.createOscillator(), e = c.createGain(); o.type = type; o.frequency.value = f; o.detune.value = det; e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(g, t + Math.min(0.4, d * 0.3)); e.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(e); e.connect(bus); o.start(t); o.stop(t + d + 0.05); };
    const perc = (t, hi) => { const n = Math.floor(c.sampleRate * 0.08), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n); const src = c.createBufferSource(), f = c.createBiquadFilter(), e = c.createGain(); src.buffer = b; f.type = hi ? 'highpass' : 'lowpass'; f.frequency.value = hi ? 5000 : 200; e.gain.value = hi ? 0.14 : 0.8; src.connect(f); f.connect(e); e.connect(bus); src.start(t); };
    let next = c.currentTime + 0.1;
    const tickFn = () => {
      while (next < c.currentTime + 0.6) {
        const chord = prog[bar % prog.length]; const t = next;
        if (mode === 'ambient') { if (step % 8 === 0) { for (const i of [0, 2, 4]) { voice(deg(chord + i) * 2, t, beat * 8, 'sine', 0.04, (Math.random() - 0.5) * 8); voice(deg(chord + i) * 2, t, beat * 8, 'triangle', 0.012, 5); } voice(deg(chord), t, beat * 8, 'triangle', 0.045); } if (step % 8 === 4 && Math.random() < 0.6) voice(deg(chord + [2, 4, 6, 7][Math.floor(Math.random() * 4)]) * 2, t, beat * 3, 'sine', 0.04); }
        else if (mode === 'tavern') { const arp = [0, 2, 4, 2, 0, 4, 2, 4]; voice(deg(chord + arp[step % 8]) * 2, t, beat * 0.9, 'triangle', 0.09); if (step % 4 === 0) voice(deg(chord) / 2, t, beat * 2, 'triangle', 0.1); if (step % 8 === 6 && Math.random() < 0.5) voice(deg(chord + 7) * 2, t, beat * 1.5, 'sine', 0.05); }
        else { voice(deg(chord) / 2, t, beat * 0.5, 'sawtooth', 0.1); if (step % 2 === 0) perc(t, false); if (step % 2 === 1) perc(t, true); if (step % 8 === 0) for (const i of [0, 2, 4]) voice(deg(chord + i), t, beat * 4, 'sawtooth', 0.025, (Math.random() - 0.5) * 12); if (step % 8 === 4 && Math.random() < 0.7) voice(deg(chord + [4, 6, 7, 9][Math.floor(Math.random() * 4)]) * 2, t, beat, 'square', 0.03); }
        step++; if (step % 8 === 0) bar++; next += mode === 'ambient' ? beat : beat / 2;
      }
    };
    this.musicTimer = setInterval(tickFn, 200); tickFn();
  }
  musicStop() { if (this.musicTimer) clearInterval(this.musicTimer); this.musicTimer = null; if (this.musicBus) { try { const b = this.musicBus, c = this.ctx; b.gain.setTargetAtTime(0.0001, c.currentTime, 0.2); setTimeout(() => { try { b.disconnect(); } catch (e) {} }, 800); } catch (e) {} this.musicBus = null; } }
  musicVol() { if (this.musicBus) this.musicBus.gain.value = this.s.musicVol ?? 0.6; }
  noise(dur, { freq = 1200, q = 0.8, gain = 0.25, type = 'bandpass', sweep = null, delay = 0 } = {}) {
    const c = this.ctx, t = c.currentTime + delay, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); src.buffer = buf; f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t); src.stop(t + dur);
  }
  play(name) {
    if (!this.s.sound || !this.ctx) return; if (this.ctx.state === 'suspended') this.ctx.resume(); this.vol();
    const T = this;
    ({
      draw: () => T.noise(0.09, { freq: 3200, q: 1.2, gain: 0.12, sweep: 5000 }),
      land: () => { T.tone(120, 0.22, { slide: 60, gain: 0.35 }); T.noise(0.12, { freq: 300, type: 'lowpass', gain: 0.2 }); },
      cast: () => { T.tone(392, 0.18, { type: 'triangle', gain: 0.18 }); T.tone(587, 0.22, { type: 'triangle', gain: 0.16, delay: 0.07 }); T.tone(784, 0.3, { gain: 0.1, delay: 0.14 }); },
      castCreature: () => { T.tone(146, 0.3, { type: 'triangle', slide: 220, gain: 0.25 }); T.noise(0.18, { freq: 400, type: 'lowpass', gain: 0.15, delay: 0.05 }); T.tone(440, 0.25, { gain: 0.1, delay: 0.18 }); },
      castInstant: () => { T.tone(900, 0.08, { type: 'triangle', slide: 1800, gain: 0.14 }); T.noise(0.12, { freq: 2500, sweep: 6000, gain: 0.1 }); },
      castSorcery: () => { T.tone(330, 0.3, { type: 'triangle', gain: 0.16 }); T.tone(494, 0.3, { type: 'triangle', gain: 0.12, delay: 0.1 }); T.tone(659, 0.4, { gain: 0.1, delay: 0.2 }); },
      castArtifact: () => { T.tone(1200, 0.06, { type: 'square', gain: 0.07 }); T.tone(1800, 0.05, { type: 'square', gain: 0.05, delay: 0.07 }); T.noise(0.15, { freq: 4000, q: 4, gain: 0.12, delay: 0.02 }); },
      castEnchantment: () => [0, 0.05, 0.1, 0.15].forEach((d, i) => T.tone([659, 830, 988, 1319][i], 0.5, { gain: 0.06, delay: d })),
      castPlaneswalker: () => { T.tone(262, 0.5, { type: 'triangle', gain: 0.14 }); T.tone(392, 0.5, { type: 'triangle', gain: 0.12, delay: 0.12 }); T.tone(523, 0.6, { gain: 0.12, delay: 0.24 }); T.tone(784, 0.7, { gain: 0.08, delay: 0.36 }); },
      bigHit: () => { T.tone(60, 0.5, { slide: 30, gain: 0.6 }); T.noise(0.4, { freq: 300, type: 'lowpass', gain: 0.35 }); T.noise(0.25, { freq: 3000, sweep: 500, gain: 0.12, delay: 0.05 }); },
      lifeLoss: () => T.tone(300, 0.15, { type: 'triangle', slide: 200, gain: 0.08 }),
      tap: () => T.noise(0.05, { freq: 2200, q: 2, gain: 0.08 }),
      equip: () => { T.noise(0.1, { freq: 5000, q: 3, gain: 0.12 }); T.tone(1500, 0.08, { type: 'square', gain: 0.05, delay: 0.04 }); },
      exile: () => { T.tone(1200, 0.5, { slide: 2400, gain: 0.08 }); T.noise(0.5, { freq: 1000, sweep: 8000, gain: 0.12 }); },
      shuffle: () => [0, 0.06, 0.12, 0.18, 0.24].forEach(d => T.noise(0.05, { freq: 2800, q: 1.5, gain: 0.07, delay: d })),
      resolve: () => { T.tone(988, 0.25, { gain: 0.14 }); T.tone(1480, 0.3, { gain: 0.06, delay: 0.02 }); },
      counterCast: () => { T.tone(740, 0.15, { type: 'sawtooth', gain: 0.08 }); T.tone(554, 0.2, { type: 'triangle', gain: 0.14, delay: 0.06 }); },
      counter: () => { T.tone(660, 0.35, { type: 'sawtooth', slide: 110, gain: 0.14 }); T.noise(0.3, { freq: 2000, sweep: 300, gain: 0.18 }); },
      attack: () => T.noise(0.32, { freq: 400, sweep: 2600, q: 0.7, gain: 0.22 }),
      block: () => { T.tone(220, 0.12, { type: 'square', gain: 0.08 }); T.noise(0.1, { freq: 1800, gain: 0.2 }); },
      hit: () => { T.tone(95, 0.25, { slide: 40, gain: 0.45 }); T.noise(0.14, { freq: 500, type: 'lowpass', gain: 0.25 }); },
      destroy: () => { T.noise(0.4, { freq: 1500, sweep: 120, type: 'lowpass', gain: 0.25 }); T.tone(220, 0.35, { type: 'sawtooth', slide: 55, gain: 0.08 }); },
      wipe: () => { T.noise(0.9, { freq: 5000, sweep: 80, type: 'lowpass', q: 0.4, gain: 0.3 }); T.tone(110, 0.9, { type: 'sawtooth', slide: 30, gain: 0.1 }); },
      gain: () => [0, 0.06, 0.12].forEach((d, i) => T.tone([880, 1175, 1568][i], 0.25, { gain: 0.08, delay: d })),
      token: () => T.tone(1046, 0.12, { type: 'triangle', gain: 0.1 }),
      turn: () => { T.tone(523, 0.6, { gain: 0.12 }); T.tone(784, 0.7, { gain: 0.08, delay: 0.05 }); },
      prompt: () => { T.tone(880, 0.1, { type: 'triangle', gain: 0.12 }); T.tone(880, 0.1, { type: 'triangle', gain: 0.12, delay: 0.14 }); },
      click: () => T.tone(1400, 0.03, { type: 'square', gain: 0.04 }),
      die: () => T.tone(196, 0.8, { type: 'triangle', slide: 98, gain: 0.15 }),
      win: () => [523, 659, 784, 1046].forEach((f, i) => T.tone(f, 0.4, { type: 'triangle', gain: 0.15, delay: i * 0.12 })),
      lose: () => [392, 311, 262].forEach((f, i) => T.tone(f, 0.5, { type: 'triangle', gain: 0.14, delay: i * 0.18 })),
      combo: () => { [523, 784, 1046, 1568].forEach((f, i) => T.tone(f, 0.5, { gain: 0.1, delay: i * 0.05 })); T.noise(0.6, { freq: 6000, sweep: 400, gain: 0.15 }); },
    }[name] || (() => {}))();
  }
}

// ---------------- styles ----------------
const STYLE = `
.gt{--tile-o:56px;--tile-m:76px;--tile-l:44px;--hand:104px;display:grid;gap:10px;color:var(--fg);zoom:var(--z,1)}
.gt-bar .zm{display:inline-flex;align-items:center;gap:2px}.gt-bar .zm b{min-width:38px;text-align:center;font-size:.78rem;font-variant-numeric:tabular-nums}
.gt-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:8px 10px}
.gt-bar .ph{font-family:var(--mono);font-size:.82rem;color:var(--muted);flex:1;min-width:200px}
.gt-bar .ph b{color:var(--fg)}
.gt-main{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:12px;align-items:start}
@media (max-width:980px){.gt-main{grid-template-columns:minmax(0,1fr)}.gt-side{order:2}}
.gt-board{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;position:relative;min-width:0}
.gt-opps{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px}
@media (min-width:1200px){.gt-opps{grid-template-columns:repeat(3,minmax(0,1fr))}}
.gs{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px;display:grid;gap:6px;min-width:0;position:relative;transition:border-color .2s,box-shadow .2s}
.gs.act{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}
.gs.dead{opacity:.4;filter:grayscale(1)}
.gs.dead::after{content:"DEFEATED";position:absolute;inset:auto 0 40% 0;text-align:center;font:700 1.4rem var(--display);letter-spacing:.2em;color:var(--bad);transform:rotate(-8deg)}
.gs-h{display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:8px;align-items:center}
.gs .av{width:40px;height:40px;border-radius:50%;background:var(--soft) center/cover;border:2px solid var(--line)}
.gs.me .av{width:48px;height:48px}
.gs .nm{min-width:0}.gs .nm b{display:block;font-size:.92rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gs .nm small{font-size:.72rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
.gs .lf{font:700 1.6rem var(--mono);min-width:2.2em;text-align:center;padding:2px 8px;border-radius:8px;background:var(--bg);border:1px solid var(--line);position:relative}
.gs .lf.low{color:var(--bad);border-color:var(--bad)}
.gs .lf.tgt{cursor:pointer;box-shadow:0 0 0 2px var(--bad)}
.gs-meta{font-size:.72rem;color:var(--muted);display:flex;flex-wrap:wrap;gap:2px 10px;font-family:var(--mono)}
.thr{height:4px;background:var(--soft);border-radius:2px;overflow:hidden}.thr i{display:block;height:100%;background:var(--warn);transition:width .4s}
.gs-bf,.gs-lands{display:flex;flex-wrap:wrap;gap:4px;min-height:calc(var(--tile-o)*1.4);align-content:flex-start}
.gs-lands{min-height:0}
.gs.me .gs-bf{min-height:calc(var(--tile-m)*1.4)}
.gc{position:relative;width:var(--tile-o);aspect-ratio:.716;border-radius:5px;background:var(--soft);flex:none;transition:transform .25s ease,box-shadow .2s,opacity .2s;cursor:default;user-select:none}
.gs.me .gc{width:var(--tile-m)}
.gc img{width:100%;height:100%;object-fit:cover;border-radius:5px;display:block;pointer-events:none}
.gc .cd{position:absolute;left:50%;top:-9px;transform:translateX(-50%);z-index:3;white-space:nowrap;font:600 .62rem/1.3 var(--mono,monospace);padding:1px 5px;border-radius:999px;background:var(--panel);border:1px solid var(--accent);color:var(--fg);pointer-events:none}
.gc .cd.hot{border-color:#e5484d;color:#ff8c8c}
.gc.dim{opacity:.35;filter:grayscale(.6)}
.gc .ctr{position:absolute;left:2px;bottom:2px;z-index:2;font:600 .6rem/1.2 var(--mono,monospace);padding:1px 4px;border-radius:4px;background:rgba(20,22,26,.9);border:1px solid var(--line);color:var(--fg);pointer-events:none;white-space:nowrap}
.gc .ctr b{color:var(--accent)}
.gc .pt small{font-size:.6em;opacity:.85;margin-left:1px}
.gs-meta .cdm{color:var(--accent)}
.fx{position:fixed;z-index:60;pointer-events:none;transform:translate(-50%,-50%)}
.fx.burst{width:40px;height:40px;border-radius:50%;box-shadow:0 0 0 0 var(--c),0 0 30px 6px var(--c);animation:fxburst .7s ease-out forwards}
@keyframes fxburst{0%{transform:translate(-50%,-50%) scale(.3);opacity:1}100%{transform:translate(-50%,-50%) scale(5);opacity:0;box-shadow:0 0 0 2px var(--c),0 0 60px 20px transparent}}
.fx.slash{width:120px;height:4px;background:linear-gradient(90deg,transparent,#ff4040,#fff,#ff4040,transparent);transform:translate(-50%,-50%) rotate(-30deg) scaleX(0);animation:fxslash .5s ease-out forwards}
@keyframes fxslash{30%{transform:translate(-50%,-50%) rotate(-30deg) scaleX(1.2);opacity:1}100%{transform:translate(-50%,-50%) rotate(-30deg) scaleX(1.4);opacity:0}}
.fx.flash{background:rgba(255,40,40,.18);animation:fxflash .3s ease-out forwards}
@keyframes fxflash{to{opacity:0}}
body.fx-shake{animation:fxshake .45s linear}
@keyframes fxshake{10%{transform:translate(-5px,3px)}30%{transform:translate(5px,-4px)}50%{transform:translate(-4px,-2px)}70%{transform:translate(4px,3px)}90%{transform:translate(-2px,1px)}100%{transform:none}}
.fx.bolt svg{width:40px;height:120px;filter:drop-shadow(0 0 8px #9fd0ff)}.fx.bolt path{fill:#e6f3ff;stroke:#5aa9ff;stroke-width:2;animation:fxbolt .45s steps(3) forwards}
@keyframes fxbolt{0%{opacity:0}20%{opacity:1}60%{opacity:.4}80%{opacity:1}100%{opacity:0}}
.fx.shards i{position:absolute;width:8px;height:10px;background:var(--accent);opacity:.9;clip-path:polygon(50% 0,100% 60%,70% 100%,0 70%);animation:fxshard .7s ease-out forwards}
@keyframes fxshard{to{transform:translate(var(--dx),var(--dy)) rotate(var(--r));opacity:0}}
.fx.confetti{inset:0;transform:none}.fx.confetti i{position:absolute;top:-10px;width:8px;height:12px;background:var(--c);animation:fxconf var(--d) ease-in forwards}
@keyframes fxconf{to{transform:translate(var(--x),105vh) rotate(720deg)}}
.pool .pip{display:inline-block;min-width:16px;padding:0 3px;margin-left:2px;border-radius:999px;color:#111;font:700 .7rem/16px var(--mono,monospace);text-align:center}
.gc.t{transform:rotate(90deg) scale(.78)}
.gc.sick{filter:saturate(.55) brightness(.9)}
.gc.cmdr{box-shadow:0 0 0 2px #d4a63a}
.gc.atk{box-shadow:0 0 0 2px var(--bad),0 0 12px var(--bad);transform:translateY(-6px)}
.gc.atk.t{transform:rotate(90deg) scale(.78) translateX(-6px)}
.gc.blk{box-shadow:0 0 0 2px var(--accent),0 0 10px var(--accent)}
.gc.tgt{cursor:crosshair;box-shadow:0 0 0 2px var(--bad);animation:gtpulse 1s infinite}
.gc.sel{box-shadow:0 0 0 3px var(--accent)}
.gc.clk{cursor:pointer}
@keyframes gtpulse{50%{box-shadow:0 0 0 2px var(--bad),0 0 14px var(--bad)}}
.gc .pt{position:absolute;right:-3px;bottom:-3px;font:700 .68rem var(--mono);background:var(--fg);color:var(--bg);padding:1px 4px;border-radius:4px}
.gc .pt.up{background:var(--good)}
.gc .bd{position:absolute;left:-3px;top:-3px;font:700 .64rem var(--mono);background:var(--bad);color:#fff;padding:1px 4px;border-radius:4px}
.crown{font-size:.95em;filter:drop-shadow(0 0 2px rgba(0,0,0,.5))}
.sopt{position:relative}.sopt .ord{position:absolute;left:4px;top:4px;font:700 .68rem var(--mono);background:var(--acc,#2f7fd6);color:#fff;padding:1px 5px;border-radius:4px;font-style:normal}.sopt .ordbtns{position:absolute;left:0;right:0;bottom:4px;display:flex;justify-content:space-between;padding:0 4px}.obtn{font:700 .8rem var(--mono);background:rgba(0,0,0,.65);color:#fff;border:0;border-radius:4px;padding:2px 6px;cursor:pointer}
.ak0{--ak:#d6452f}.ak1{--ak:#2f7fd6}.ak2{--ak:#2fa35b}.ak3{--ak:#b453d6}
.gc.atk{outline:3px solid var(--ak,var(--bad))}.gc .bd.ak{background:var(--ak)}
.gs.inc{box-shadow:inset 0 0 0 3px var(--ak)}.gs .inc-b{display:flex;gap:6px;align-items:center;margin:4px 0;padding:3px 8px;border-radius:6px;background:var(--ak);color:#fff;font:700 .78rem var(--mono)}
.chip.akc{border-color:var(--ak);box-shadow:inset 0 -3px 0 var(--ak)}.chip.akc[aria-pressed="true"]{background:var(--ak);color:#fff}
.atk-sum{font:.78rem var(--mono);opacity:.9;margin-left:6px}.atk-sum b{color:var(--ak)}
.hbadge{position:absolute;left:4px;right:4px;bottom:4px;font:700 .58rem var(--mono);background:var(--panel);border:1px solid var(--line);border-radius:4px;text-align:center;padding:1px 2px;pointer-events:none}
.gc.neut img{filter:grayscale(.85) brightness(.8)}
.gc .cnt{position:absolute;left:50%;transform:translateX(-50%);bottom:-6px;font:700 .64rem var(--mono);background:var(--panel);border:1px solid var(--line);padding:0 4px;border-radius:4px;white-space:nowrap}
.gc.lg{width:var(--tile-l)}
.gc.lg.t{transform:rotate(90deg);filter:brightness(.72);margin:0 calc(var(--tile-l) * .22)}
.gc.lg.t .cnt{transform:translateX(-50%) rotate(-90deg);bottom:auto;top:40%;left:auto;right:-14px}
.gc.act{cursor:pointer;box-shadow:0 0 0 2px #d4a63a,0 0 10px #d4a63a;animation:gtgold 1.4s infinite}
@keyframes gtgold{50%{box-shadow:0 0 0 2px #d4a63a,0 0 18px #d4a63a}}
.steps{display:flex;gap:2px;flex-wrap:wrap}
.steps span{font:600 .7rem var(--mono);padding:3px 7px;border-radius:4px;background:var(--bg);color:var(--muted);border:1px solid var(--line)}
.steps span.on{background:var(--accent);color:var(--accent-fg);border-color:var(--accent)}
.gc.tok{display:grid;place-items:center;text-align:center;font-size:.58rem;padding:4px;background:linear-gradient(160deg,var(--soft),var(--panel));border:1px solid var(--line)}
.gt-mid{min-height:84px;display:grid;place-items:center;position:relative;background:radial-gradient(ellipse at center,color-mix(in srgb,var(--accent) 8%,transparent),transparent 70%);border-radius:10px}
.stk{display:flex;align-items:center;justify-content:center;padding-bottom:22px}
.stkp{width:min(560px,100%);display:grid;gap:4px;padding:8px;background:var(--panel);border:1px solid var(--line);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.25);margin:6px 0}
.stkh{font:700 .82rem var(--display);display:flex;gap:8px;align-items:baseline}.stkh small{font:400 .7rem var(--body);color:var(--muted)}
.si{display:grid;grid-template-columns:20px 40px minmax(0,1fr);gap:8px;align-items:center;padding:4px 6px;border-radius:8px;border:1px solid transparent;background:var(--bg);position:relative}
.si.top{border-color:var(--accent)}
.si.hit{background:color-mix(in srgb,var(--bad) 10%,var(--bg))}
.si.tgt{cursor:crosshair;box-shadow:0 0 0 2px var(--bad);animation:gtpulse 1s infinite}
.si-n{font:700 .72rem var(--mono);color:var(--muted);text-align:center}
.si-img{width:40px;aspect-ratio:.716;border-radius:4px;overflow:hidden;background:var(--soft)}.si-img img{width:100%;height:100%;object-fit:cover;display:block}
.si-t{display:grid;gap:1px;min-width:0}.si-t b{font-size:.86rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.si-t small{font-size:.74rem;color:var(--muted)}
.si-t i{font:600 .62rem var(--mono);color:var(--accent);font-style:normal;text-transform:uppercase;letter-spacing:.04em}.si-t i.unc{color:var(--warn)}
svg.arrows{position:absolute;left:0;top:0;pointer-events:none;z-index:15;overflow:visible}
kbd{font:600 .62rem var(--mono);border:1px solid var(--line);border-radius:3px;padding:0 3px;margin-left:4px;opacity:.7}
@media (hover:none){kbd{display:none}}
.stk .sc{width:128px;aspect-ratio:.716;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.4);position:relative;margin-left:-40px;background:var(--soft)}
.stk .sc:first-child{margin-left:0}
.stk .sc img{width:100%;height:100%;border-radius:8px;object-fit:cover}
.stk .sc .who{position:absolute;left:0;right:0;bottom:-20px;text-align:center;font-size:.72rem;color:var(--muted);white-space:nowrap}
.gt-mid .idle{font-size:.8rem;color:var(--muted)}
.banner{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;font:700 2rem var(--display);pointer-events:none;color:var(--fg);text-shadow:0 2px 12px var(--bg)}
.prm{background:var(--panel);border:1px solid var(--warn);border-radius:10px;padding:10px 12px;display:grid;gap:8px;box-shadow:0 8px 30px rgba(0,0,0,.25)}
.prm h4{margin:0;font:700 1rem var(--display)}
.prm .opts{display:flex;flex-wrap:wrap;gap:8px}
.prm .opt{width:96px;cursor:pointer;border-radius:6px;transition:transform .15s}.prm .opt:hover{transform:translateY(-4px)}
.prm .opt img{width:100%;border-radius:6px;display:block}
.gt-ctl{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.gt-ctl .msg{font-size:.86rem;color:var(--muted)}
.gt-hand{display:flex;align-items:flex-end;gap:0;min-height:calc(var(--hand)*1.45);padding:10px 4px 0;overflow-x:auto;overflow-y:visible}
.hcd{width:var(--hand);flex:none;margin-left:-18px;aspect-ratio:.716;border-radius:7px;position:relative;transition:transform .18s ease,box-shadow .18s;background:var(--soft);cursor:not-allowed}
.hcd:first-child{margin-left:0}
.hcd img{width:100%;height:100%;border-radius:7px;object-fit:cover;pointer-events:none}
.gc .ctr.saga{top:2px;bottom:auto;background:#4b2d6b;color:#fff;font-weight:700}.gc .ctr.saga small{opacity:.75;font-weight:400}.gc .ctr.lvl{top:2px;bottom:auto;background:#2d5b6b;color:#fff}
.gt-ctl .tgtchip{box-shadow:0 0 0 2px var(--bad);animation:gtpulse 1s infinite}.opp-pager .op.dead{opacity:.55;text-decoration:line-through}
.hcd.can,.sopt.can{cursor:pointer;box-shadow:0 0 0 2px var(--accent),0 0 10px color-mix(in srgb,var(--accent) 60%,transparent)}
.hcd:hover{transform:translateY(-22px) scale(1.18);z-index:5}
.hcd.sel{transform:translateY(-14px);box-shadow:0 0 0 3px var(--warn)}
.gs-body{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:start}
.gs-main{display:grid;gap:6px;min-width:0}
.cz{width:calc(var(--hand) * .9);display:grid;gap:4px;justify-items:center;padding:6px;border:1px dashed var(--line);border-radius:8px;background:color-mix(in srgb,var(--bg) 60%,transparent)}
.cz-l{font:600 .62rem var(--mono);text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.czc{width:100%;aspect-ratio:.716;border-radius:7px;overflow:hidden;cursor:not-allowed;transition:transform .18s,box-shadow .18s}
.czc img{width:100%;height:100%;object-fit:cover;pointer-events:none}
.czc.can{cursor:pointer;box-shadow:0 0 0 2px var(--accent),0 0 10px color-mix(in srgb,var(--accent) 60%,transparent)}
.czc:hover{transform:scale(1.06)}
.cz-cost{font:.68rem var(--mono);color:var(--muted)}
.cz-empty{font-size:.72rem;color:var(--muted);text-align:center;padding:24px 0}
.cmdz{display:flex;gap:6px;align-items:flex-end}
.rul{display:grid;gap:6px;font-size:.8rem;border-top:1px solid var(--line);padding-top:8px}
.rul ul{margin:0;padding-left:16px;display:grid;gap:6px}
.rul .rd{font-family:var(--mono);font-size:.66rem;color:var(--muted)}
.rul summary{cursor:pointer;color:var(--muted)}
.rul a{color:var(--accent);font-size:.78rem}
.pv{max-height:calc(100vh - 140px);overflow:auto}
.sheet{position:fixed;inset:0;z-index:70;background:rgba(0,0,0,.55);display:grid;align-items:end}
.sheet .box{background:var(--panel);border-radius:14px 14px 0 0;padding:12px 16px calc(16px + env(safe-area-inset-bottom,0px));max-height:85vh;overflow:auto;display:grid;gap:8px;font-size:.92rem}
.sheet .box > img{width:min(260px,70vw);border-radius:10px;justify-self:center}
.sheet .tx{white-space:pre-wrap}
.hsel{background:var(--panel);border:1px solid var(--accent);border-radius:8px;padding:6px 8px}
.hsel b{font-size:.9rem}
@media (hover:none){.hcd:hover{transform:none;z-index:auto}.hcd.sel{transform:translateY(-12px) scale(1.06);z-index:5}.prm .opt:hover{transform:none}.czc:hover{transform:none}}
@media (max-width:700px){
  .gt{--tile-o:36px;--tile-m:50px;--tile-l:30px;--hand:66px;gap:8px;touch-action:manipulation}
  .gt-bar{padding:6px 8px;gap:6px}
  .gt-bar .ph{min-width:0;flex:1;font-size:.76rem}
  .steps{order:5;flex-basis:100%;justify-content:space-between}
  .steps span{padding:2px 5px;font-size:.6rem;flex:1;text-align:center}
  .gt-bar .chip{padding:4px 10px;min-height:32px;font-size:.8rem}
  .gt-bar .zm{display:none}
  .gt-opps{grid-template-columns:minmax(0,1fr);gap:6px}
  .gs{padding:6px;gap:4px;border-radius:8px}
  .gs-h{grid-template-columns:30px minmax(0,1fr) auto;gap:6px}
  .gs .av{width:30px;height:30px}.gs.me .av{width:36px;height:36px}
  .gs .nm b{font-size:.85rem}.gs .nm small{font-size:.66rem}
  .gs .lf{font-size:1.15rem;padding:1px 6px}
  .gs-meta{font-size:.64rem;gap:1px 8px}
  .gs-bf{min-height:0;gap:3px}.gs-lands{gap:3px}.gs.me .gs-bf{min-height:calc(var(--tile-m)*1.4)}
  .gc .pt,.gc .bd,.gc .cnt{font-size:.54rem}
  .gt-mid{min-height:40px}.gt-mid .idle{font-size:.74rem;text-align:center;padding:0 8px}
  .stk .sc{width:76px;margin-left:-26px}.stk .sc .who{font-size:.62rem}
  .gt-dock{position:sticky;bottom:0;z-index:20;background:var(--bg);border-top:1px solid var(--line);margin:0 -4px;padding:6px 4px calc(6px + env(safe-area-inset-bottom,0px));display:grid;gap:6px;max-height:64vh;overflow-y:auto;box-shadow:0 -8px 24px rgba(0,0,0,.28)}
  .prm{padding:8px 10px;gap:6px;box-shadow:none}.prm h4{font-size:.9rem}
  .prm .opt{width:62px}
  .olab{font-size:.5rem}
  .sgrid{grid-template-columns:repeat(auto-fill,minmax(60px,1fr));max-height:36vh}
  .sfind{width:100%}
  .gt-ctl{gap:6px}.gt-ctl .msg{font-size:.72rem;flex-basis:100%}.gt-ctl .msg.hint{display:none}
  .gt-ctl.abil-row{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;padding-bottom:2px;-webkit-overflow-scrolling:touch}.gt-ctl.abil-row::-webkit-scrollbar{display:none}.gt-ctl.abil-row .chip{flex:none;min-height:30px;padding:3px 9px;font-size:.72rem;white-space:nowrap}
  .gt-dock{max-height:52vh}
  .hand-tog{align-self:flex-start;border:0;background:none;color:var(--muted);font:inherit;font-size:.7rem;padding:0 4px;min-height:22px}
  .gt-opps .gs{max-height:min(30vh,240px)}
  .gt-ctl .chip{min-height:36px}
  .gt-hand{min-height:calc(var(--hand)*1.25);padding:12px 2px 0}
  .hcd{margin-left:-8px}
  .gs-body{gap:6px}
  .cz{width:56px;padding:4px}.cz-l{font-size:.48rem;letter-spacing:.04em}.cz-cost{font-size:.56rem}.cz-empty{font-size:.6rem;padding:10px 0}
  .gt-side .pv{display:none}
  .gl{max-height:170px;font-size:.68rem}
  .set .box{max-width:100%}
  /* opponents: one sticky strip you page sideways, instead of three stacked boards */
  .gt-opps-wrap{position:sticky;top:calc(env(safe-area-inset-top,0px) + 60px);z-index:12;background:var(--bg);margin:0 -4px;padding:0 4px 4px;border-bottom:1px solid var(--line);min-width:0;max-width:100vw;overflow:hidden}
  .gt-opps{display:flex;gap:6px;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none}
  .gt-opps::-webkit-scrollbar{display:none}
  .gt-opps .gs{flex:0 0 86vw;min-width:0;max-width:86vw;scroll-snap-align:start;max-height:min(34vh,260px);overflow-y:auto}
  .gt-opps-wrap.collapsed .gt-opps{display:none}
  .opp-pager{display:flex;gap:4px;margin-top:4px;overflow-x:auto;scrollbar-width:none}
  .opp-pager .op{display:inline-flex;align-items:center;gap:4px;flex:none;border:1px solid var(--line);background:var(--panel);color:var(--fg);border-radius:999px;padding:2px 8px 2px 3px;font:inherit;font-size:.72rem;min-height:28px}
  .opp-pager .op .av{width:20px;height:20px;border-radius:50%;background:var(--soft) center/cover}
  .opp-pager .op b{font-family:var(--mono);font-size:.8rem}
  .opp-pager .op.act{border-color:var(--accent)}.opp-pager .op.dead{opacity:.45}
}
/* phone held sideways: opponents in a scrolling column on the left, your board on the right, hand along the bottom */
@media (max-width:1000px) and (orientation:landscape) and (max-height:540px){
  .gt{--tile-o:34px;--tile-m:44px;--tile-l:28px;--hand:58px;gap:4px}
  .gt-main{grid-template-columns:minmax(0,1fr)}.gt-side{display:none}
  .gt-board{display:grid;gap:4px;grid-template-columns:minmax(0,44%) minmax(0,1fr);grid-template-areas:"bar bar" "opps me" "mid mid" "dock dock";align-items:start}
  .gt-bar{grid-area:bar;padding:3px 6px;gap:4px}.steps{order:0;flex-basis:auto}.steps span{font-size:.55rem;padding:1px 4px}.gt-bar .chip{min-height:26px;padding:2px 8px;font-size:.72rem}.gt-bar .ph{font-size:.7rem}
  .gt-opps-wrap{grid-area:opps;position:static;margin:0;padding:0;border:0}
  .gt-opps{display:grid;grid-template-columns:minmax(0,1fr);gap:4px;max-height:calc(100vh - 150px);overflow-y:auto;scroll-snap-type:none}
  .gt-opps .gs{flex:none;max-height:none;overflow:visible}
  .opp-pager{display:none}
  .gs.me{grid-area:me;max-height:calc(100vh - 150px);overflow-y:auto}
  .gt-mid{grid-area:mid;min-height:24px}.gt-mid .idle{font-size:.68rem}
  .gt-dock{grid-area:dock;max-height:46vh}
  .gt-hand{min-height:calc(var(--hand)*1.2);padding:8px 2px 0}
  .gs{padding:4px;gap:3px}.gs-h{grid-template-columns:24px minmax(0,1fr) auto}.gs .av{width:24px;height:24px}.gs.me .av{width:28px;height:28px}.gs .lf{font-size:1rem}.gs-meta{font-size:.58rem}
  .prm{padding:6px 8px}.prm h4{font-size:.8rem}.prm .opt{width:52px}
  .cz{width:48px}
}
.popt{position:relative}
.olab{position:absolute;left:50%;bottom:4px;transform:translateX(-50%);background:var(--panel);border:1px solid var(--accent);border-radius:4px;padding:0 5px;font:600 .62rem var(--mono);white-space:nowrap;max-width:96%;overflow:hidden;text-overflow:ellipsis}
.abil-row{flex-wrap:wrap}
.chip.abil{border-color:var(--accent)}
.chip.abil small{color:var(--muted)}
.sfind{width:min(320px,100%);padding:6px 10px;border-radius:6px;border:1px solid var(--line);background:var(--bg);color:var(--fg);font:inherit;margin:4px 0}
.sgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(86px,1fr));gap:6px;max-height:340px;overflow-y:auto;padding:4px}
.sopt{aspect-ratio:.716;border-radius:6px;overflow:hidden;cursor:pointer;background:var(--soft);display:grid;place-items:center;font-size:.7rem;text-align:center;transition:transform .15s,box-shadow .15s}
.combo-row{background:color-mix(in srgb,var(--warn) 14%,var(--panel));border:1px solid var(--warn);border-radius:10px;padding:6px 10px;margin:4px 0}.pip.inf{width:auto;padding:0 4px}
.rpbar{background:var(--panel);border:1px solid var(--accent);border-radius:10px;padding:6px 10px;margin:4px 0}
.zbtn{background:none;border:0;color:inherit;font:inherit;cursor:pointer;padding:0;text-decoration:underline dotted;text-underline-offset:2px}.zbtn:hover{color:var(--accent)}
.set.zone .sgrid{max-height:60vh;overflow:auto}
.pt.alt{background:#5a3;color:#fff;font-size:.55rem}
.sopt{position:relative}.sopt .own{position:absolute;left:0;right:0;bottom:0;font-size:.55rem;font-style:normal;background:rgba(0,0,0,.65);color:#eee;text-align:center;padding:1px 2px;pointer-events:none}
.sopt img{width:100%;height:100%;object-fit:cover;pointer-events:none}
.sopt:hover{transform:scale(1.05);box-shadow:0 0 0 2px var(--accent)}
.sopt.sel{box-shadow:0 0 0 3px var(--warn)}
.gt-ctl .chip.pri{background:var(--accent);color:var(--accent-fg);border-color:var(--accent)}
.gt-ctl .chip.warn{background:var(--warn);color:#111;border-color:var(--warn)}
.gt-ctl .chip:disabled{opacity:.45;cursor:not-allowed}
.cmdz .hcd{margin-left:0}
.gt-side{display:grid;gap:10px;position:sticky;top:calc(env(safe-area-inset-top,0px) + 130px)}
.pv{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px;display:grid;gap:8px}
.pv img{width:100%;border-radius:10px;display:block;aspect-ratio:.716;background:var(--soft)}
.pv .tx{font-size:.84rem;white-space:pre-wrap;line-height:1.4}
.pv .ty{font-size:.78rem;color:var(--muted)}
.pv .rl{font-size:.72rem;color:var(--accent)}
.gl{font-family:var(--mono);font-size:.72rem;color:var(--muted);max-height:260px;overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px;white-space:pre-wrap}
.gl .ll{padding:1px 4px;border-radius:4px;white-space:pre-wrap}
.gl .ll.has{cursor:pointer;color:var(--fg)}
.gl .ll.has:hover{background:color-mix(in srgb,var(--accent) 14%,transparent)}
.gl .ll.on{background:color-mix(in srgb,var(--accent) 26%,transparent)}
.lgx{border:1px solid var(--accent);border-radius:8px;padding:8px;display:grid;gap:6px;background:color-mix(in srgb,var(--accent) 8%,transparent)}
.lgx-who{font:600 .66rem var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.lgx-m{font-size:.86rem}
.lgx-cards{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.lgx-c{display:flex;gap:6px;align-items:center;border:1px solid var(--line);background:var(--bg);color:var(--fg);border-radius:6px;padding:2px 6px 2px 2px;font-size:.72rem;cursor:pointer}
.lgx-c img{width:22px;height:30px;object-fit:cover;border-radius:3px}
.lgx-c.on{border-color:var(--accent)}
.lgx-arrow{color:var(--muted);font-size:.8rem}
.gc.ping{animation:gtping 1.2s ease-out}
@keyframes gtping{0%,60%{box-shadow:0 0 0 3px var(--warn),0 0 22px var(--warn)}100%{box-shadow:none}}
.float{position:fixed;font:800 1.6rem var(--mono);pointer-events:none;z-index:50;text-shadow:0 2px 8px rgba(0,0,0,.6)}
.ghost{position:fixed;z-index:40;pointer-events:none;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.45);object-fit:cover}
.set{position:fixed;inset:0;background:rgba(0,0,0,.45);display:grid;place-items:center;z-index:60;padding:16px;overflow:auto;zoom:calc(1 / var(--z,1))}
.set .box{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px;display:grid;gap:12px;width:min(420px,100%);max-height:calc(100vh - 32px);overflow-y:auto;overscroll-behavior:contain}
.set .box .sethead{display:flex;justify-content:space-between;align-items:center;position:sticky;top:-16px;margin:-16px -16px 0;padding:12px 16px;background:var(--panel);border-bottom:1px solid var(--line);z-index:1}
.set label{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:.92rem}
.over{position:absolute;inset:0;display:grid;place-items:center;background:color-mix(in srgb,var(--bg) 70%,transparent);z-index:20;border-radius:10px}
.over .box{background:var(--panel);border:1px solid var(--accent);border-radius:12px;padding:20px;display:grid;gap:10px;text-align:center;max-width:420px}
.over h3{font:700 1.6rem var(--display);margin:0}
.flash{animation:gtflash .6s}
@keyframes gtflash{30%{background:color-mix(in srgb,var(--bad) 25%,var(--panel))}}
`;
function injectCSS() { if (document.getElementById('gt-css')) return; const s = document.createElement('style'); s.id = 'gt-css'; s.textContent = STYLE; document.head.appendChild(s); }

// ---------------- table ----------------
// ==== replay recording (b10) ====
// A recording = seed + uid base + the exact card lists + every human decision, encoded by reference (card uid / perm id / seat / stack index).
const REC_SKIP = new Set(['emit', 'log', 'save']);
/** answers that are elements of the hook's own argument arrays (modes, alts, pools) are matched by identity in the engine — record them as references */
function recArgRef(v, ax) { if (!ax || v == null || typeof v !== 'object') return null; for (let ai = 0; ai < ax.length; ai++) { const A = ax[ai]; if (Array.isArray(A)) { const i = A.indexOf(v); if (i >= 0) return { $ai: ai, i }; } else if (A && typeof A === 'object') for (const k of Object.keys(A)) { const L = A[k]; if (!Array.isArray(L)) continue; const i = L.indexOf(v); if (i >= 0) return { $ai: ai, k, i }; const j = L.findIndex(x => x && x.card === v); if (j >= 0) return { $ai: ai, k, i: j, f: 'card' }; } } return null; }
function recArgGet(r, ax) { const A = ax && ax[r.$ai]; const L = r.k != null ? A && A[r.k] : A; const x = Array.isArray(L) ? L[r.i] : null; return r.f ? x && x[r.f] : x; }
function recEnc(v, g, seen = new WeakSet(), ax = null) {
  if (v == null || typeof v !== 'object') return typeof v === 'function' ? undefined : v;
  { const r = recArgRef(v, ax); if (r) return r; }
  if (seen.has(v)) return { $x: 1 }; seen.add(v);
  if (Array.isArray(v)) return v.map(x => recEnc(x, g, seen, ax));
  if (v instanceof Map) return { $map: [...v].map(([k, x]) => [recEnc(k, g, seen, ax), recEnc(x, g, seen, ax)]) };
  if (v instanceof Set) return { $set: [...v].map(x => recEnc(x, g, seen, ax)) };
  if (g) {
    const pi = g.players.indexOf(v); if (pi >= 0) return { $pl: pi };
    const si = g.stack.indexOf(v); if (si >= 0) return { $s: si };
    if (v.card && v.id != null && !v.kind) return v.owner != null ? { $p: v.id, $c: v.card.uid, $o: v.owner } : { $p: v.id, $c: v.card.uid };
    if (v.uid != null && v.name != null && v.type != null) return { $c: v.uid };
    if (Array.isArray(v.ops) && v.cost && v.zone) return { $ab: 1, ops: v.ops.map(o => o.op), label: v.label || '' };
  }
  const o = {}; for (const k of Object.keys(v)) { const e = recEnc(v[k], g, seen, ax); if (e !== undefined) o[k] = e; } return o;
}
function recFindCard(g, uid) { for (const p of g.players) { for (const z of [p.hand, p.command, p.graveyard, p.exile, p.library]) { const c = z.find(c => c.uid === uid); if (c) return c; } for (const b of p.battlefield) { if (b.card.uid === uid) return b.card; for (const h of b.held || []) if (h.uid === uid) return h; } } for (const o of g.stack) if (o.card && o.card.uid === uid) return o.card; return null; }
function recFindPerm(g, id) { for (const p of g.players) { const b = p.battlefield.find(b => b.id === id); if (b) return b; } return null; }
function recDec(v, g, parentCard = null, ax = null) {
  if (v == null || typeof v !== 'object') return v;
  if (v.$ai != null) return recArgGet(v, ax);
  if (Array.isArray(v)) return v.map(x => recDec(x, g, parentCard, ax));
  if (v.$map) return new Map(v.$map.map(([k, x]) => [recDec(k, g, null, ax), recDec(x, g, null, ax)]));
  if (v.$set) return new Set(v.$set.map(x => recDec(x, g, null, ax)));
  if (v.$pl != null) return g.players[v.$pl];
  if (v.$s != null) return g.stack[v.$s] || null;
  if (v.$p != null) { const b = recFindPerm(g, v.$p) || null; if (b && v.$o != null) b.owner = v.$o; return b; } // the table stamps .owner on a clicked target; replay re-applies it
  if (v.$c != null) return recFindCard(g, v.$c);
  if (v.$ab) { const c = parentCard; const abs = (c && c.abilities) || []; return abs.find(a => (a.label || '') === v.label && a.ops.map(o => o.op).join() === v.ops.join()) || abs.find(a => a.ops.map(o => o.op).join() === v.ops.join()) || null; }
  const card = v.card && v.card.$c != null ? recFindCard(g, v.card.$c) : parentCard;
  const o = {}; for (const k of Object.keys(v)) o[k] = recDec(v[k], g, card, ax); return o;
}
const Replays = {
  CAP: 200, _db: null,
  open() { if (this._db) return Promise.resolve(this._db); return new Promise((res, rej) => { try { const r = indexedDB.open('pt-replays', 1); r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains('games')) db.createObjectStore('games', { keyPath: 'id' }); }; r.onsuccess = () => { this._db = r.result; res(this._db); }; r.onerror = () => rej(r.error); } catch (e) { rej(e); } }); },
  tx(mode, fn) { return this.open().then(db => new Promise((res, rej) => { const t = db.transaction('games', mode); const st = t.objectStore('games'); const req = fn(st); t.oncomplete = () => res(req && req.result !== undefined ? req.result : req); t.onerror = () => rej(t.error); })); },
  async list() { const all = await this.tx('readonly', st => st.getAll()); return (all || []).map(({ rec, ...m }) => m).sort((a, b) => b.id - a.id); },
  get(id) { return this.tx('readonly', st => st.get(id)); },
  del(id) { return this.tx('readwrite', st => st.delete(id)); },
  async put(entry) { await this.tx('readwrite', st => st.put(entry)); const all = await this.list(); for (const m of all.slice(this.CAP)) await this.del(m.id); return entry.id; },
};
// ---- end replay recording
class Table {
  diagPush(m) { (this.diag = this.diag || []).push(new Date().toISOString().slice(11, 19) + ' ' + String(m).slice(0, 600)); if (this.diag.length > 30) this.diag.shift(); }
  constructor(el, seats, opts = {}) {
    if (!GoldfishUI._diagWired) { GoldfishUI._diagWired = true; addEventListener('error', e => GoldfishUI.current && GoldfishUI.current.diagPush('error: ' + (e.message || '') + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno)); addEventListener('unhandledrejection', e => GoldfishUI.current && GoldfishUI.current.diagPush('rejection: ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason))); }
    this.el = el; this.seatsDef = seats; this.opts = opts; this.s = loadSettings(); this.sfx = new Sfx(this.s);
    this.stackView = []; this.attacking = new Map(); this.blocking = new Map(); this.prompt = null; this.mode = null; this.ff = false; this.busy = false; this.logLines = [];
  }
  async start() {
    injectCSS(); this.sfx.init(); if (this.s.music && this.s.music !== 'off') { const kick = () => { this.sfx.musicStart(); document.removeEventListener('pointerdown', kick); }; document.addEventListener('pointerdown', kick); }
    this.el.innerHTML = `<div class="gt"><div class="gt-main"><div class="gt-board" id="gtb"></div><aside class="gt-side"><div class="pv" id="gtpv"><div class="ty">Hover a card to read it.</div></div><div class="gl" id="gtlog"></div></aside></div></div>`;
    this.board = this.el.querySelector('#gtb'); this.pv = this.el.querySelector('#gtpv'); this.logEl = this.el.querySelector('#gtlog');
    this.applyZoom();
    TOKART.onFound = (k, url) => { if (!this.game) return; let n = 0; for (const p of this.game.players) for (const b of p.battlefield) { const c = b.card; if (c.token && !c.img && tokKey(c) === k) { c.img = url; n++; } } if (n) this.render(); };
    this.wire(); if (this.oppsCollapsed == null) this.oppsCollapsed = this.mobile && innerHeight < 760;
    const hooks = { emit: e => this.onEvent(e), log: l => this.addLog(l), humanTurn: (p, phase) => this.humanTurn(p, phase), humanRespond: c => this.humanRespond(c), humanBlocks: c => this.humanBlocks(c), humanDiscard: p => this.humanDiscard(p), humanPriority: c => this.humanPriority(c), humanChooseFetch: (p, card, pool, n) => this.humanChooseFetch(p, card, pool, n), humanETB: c => this.ask('etb', c), humanPayUnless: c => this.ask('unless', c), humanAltCost: c => this.ask('alt', c), humanSearch: c => this.ask('search', { ...c, sel: [] }), humanChoosePlayer: c => this.ask('player', c), humanMay: c => this.ask('may', c), humanRetarget: c => this.ask('retarget', c), humanModes: c => this.ask('modes', { ...c, sel: [] }), humanPayOpt: c => this.ask('payopt', c), humanNumber: c => this.ask('num', c), humanChoice: c => this.ask('choice', c), humanChooseType: c => this.ask('choice', c) };
    hooks.save = g => this.saveGame(g);
    if (this.opts.saved) { const sr = this.opts.saved.rec; if (sr && sr.combos && G.setCombos) G.setCombos(sr.combos); if (sr && sr.moves) { this.rec = sr; for (const k of Object.keys(hooks)) if (!REC_SKIP.has(k)) { const orig = hooks[k]; hooks[k] = async (...a) => { const v = await orig(...a); if (this.rec) this.rec.moves.push({ h: k, v: recEnc(v, this.game, new WeakSet(), a) }); return v; }; } }
      this.game = G.Game.fromSaved(this.opts.saved.state, { hooks }); this.buildCardIndex(); this.me = this.game.players.find(p => p.human) || null; this.logLines = []; for (const l of this.game.log.slice(-200)) this.addLog(l.m); this.game.say(`— game resumed (turn ${this.game.turn})`); this.render(); this.guardBack();
      try { await this.game.run(); } catch (e) { if (e.message !== 'abort') { console.error(e); this.addLog('Engine error: ' + e.message); } return; }
      this.endScreen(); return; }
    const rp = this.opts.replay; const seed = rp ? rp.seed : ((Math.random() * 2147483647) | 0);
    if (rp) { this.replay = rp; this.rpPos = 0; this.rp = { mode: 'play', delay: 700, wake: null, skipOne: false }; for (const k of Object.keys(hooks)) if (!REC_SKIP.has(k)) hooks[k] = (...a) => this.rpNext(k, a); hooks.save = () => {}; const RP_PACE = new Set(['turn', 'land', 'cast', 'activate', 'attack', 'block', 'hit', 'resolve', 'destroy', 'wipe', 'tokens', 'dies', 'reanimate', 'win']); const em = hooks.emit; hooks.emit = async (e, ...r) => { if (RP_PACE.has(e && e.type)) await this.gate(); return em(e, ...r); }; }
    else if (this.opts.rawSeats) { this.rec = { v: 1, engine: (m => m ? 'v' + m[1] : 'dev')((((document.querySelector('script[src*="playtest.js"]') || {}).src) || '').match(/v=(\d+)/)), at: new Date().toISOString(), seed, uidBase: this.opts.uidBase, pop: this.opts.pop || {}, seats: this.opts.rawSeats, combos: this.opts.combos || [], moves: [] }; for (const k of Object.keys(hooks)) if (!REC_SKIP.has(k)) { const orig = hooks[k]; hooks[k] = async (...a) => { const v = await orig(...a); if (this.rec) this.rec.moves.push({ h: k, v: recEnc(v, this.game, new WeakSet(), a) }); return v; }; } }
    this.game = new G.Game(this.seatsDef.map(s => ({ ...s, ai: s.human ? null : new G.AI(s.level || 'focused') })), { hooks, seed });
    this.buildCardIndex();
    this.me = this.game.players.find(p => p.human) || null; if (!this.replay) this.guardBack();
    for (const p of this.game.players) { const g = this.game; const all = [...p.library, ...p.hand]; const L = all.filter(c => c.isLand).length; g.say(`— deck: ${all.length + p.command.length} cards, ${L} lands${L < 30 ? ' ⚠ low land count — check the saved list for names that did not resolve' : ''}`, p); }
    for (const p of this.game.players) if (p.ai) { let t = 0; const lands = () => p.hand.filter(c => c.isLand).length; while ((!p.ai.keep(p.hand, t) || (lands() === 0 && t < 5)) && t < 5) { this.game.mulligan(p); t++; } if (t) this.game.bottomCards(p, p.ai.bottomChoice(p.hand, t)); this.game.say(`— keeps ${p.hand.length} (${lands()} land${lands() === 1 ? '' : 's'}${t ? ', after ' + t + ' mulligan' + (t > 1 ? 's' : '') : ''})`, p); }
    if (this.me) { if (this.replay) await this.rpNext('mull', []); else { await this.mulligan(); if (this.rec) this.rec.moves.push({ h: 'mull', v: null }); } }
    this.render();
    try { await this.game.run(); } catch (e) { if (e.message !== 'abort') { console.error(e); this.addLog('Engine error: ' + e.message); } return; }
    this.endScreen();
  }
  // ---------- helpers ----------
  dur(ms) { return (!this.s.anim || this.ff) ? 0 : Math.round(ms * (this.s.speed === 'fast' ? 0.45 : 1)); }
  wait(ms) { const d = this.dur(ms); return d ? new Promise(r => setTimeout(r, d)) : Promise.resolve(); }
  q(sel) { return this.board.querySelector(sel); }
  seatEl(p) { return this.q(`[data-seat="${p.i}"]`); }
  permEl(id) { return this.q(`[data-pid="${id}"]`); }
  uidEl(uid) { return this.q(`[data-uid="${uid}"]`); }
  rect(el) { return el ? el.getBoundingClientRect() : null; }
  srcRect(p, card) { const h = p === this.me && this.uidEl(card.uid); return this.rect(h || (this.seatEl(p) && this.seatEl(p).querySelector('.av'))); }
  addLog(l) {
    this.logLines.push(l); if (this.logLines.length > 400) this.logLines.shift();
    if (!this.logEl) return;
    const atBottom = this.logEl.scrollTop + this.logEl.clientHeight >= this.logEl.scrollHeight - 30;
    const start = Math.max(0, this.logLines.length - 200);
    this.logEl.innerHTML = this.logLines.slice(start).map((x, i) => `<div class="ll ${this.lineHas(x) ? 'has' : ''} ${this.logSel === start + i ? 'on' : ''}" data-log="${start + i}">${esc(x)}</div>`).join('');
    if (atBottom) this.logEl.scrollTop = this.logEl.scrollHeight;
  }
  lineHas(x) { this.lhCache = this.lhCache || new Map(); if (!this.lhCache.has(x)) { if (this.lhCache.size > 2000) this.lhCache.clear(); this.lhCache.set(x, this.cardsInLine(x).length > 0); } return this.lhCache.get(x); }
  buildCardIndex() {
    this.cardIndex = new Map(); this.cardByUid = new Map();
    for (const p of this.game.players) for (const z of [p.library, p.hand, p.command]) for (const c of z) if (!this.cardIndex.has(c.name)) { this.cardIndex.set(c.name, c); this.cardByUid.set(c.uid, c); }
    this.cardNames = [...this.cardIndex.keys()].filter(n => n.length > 2).sort((a, b) => b.length - a.length);
  }
  /** cards named in a log line, in the order they appear (the acting player's name is skipped) */
  cardsInLine(line) {
    if (!this.cardNames) return [];
    const k = line.indexOf(': '); let rest = k >= 0 ? line.slice(k + 2) : line;
    const found = [];
    for (const n of this.cardNames) { let i = rest.indexOf(n); while (i >= 0) { found.push({ i, c: this.cardIndex.get(n) }); rest = rest.slice(0, i) + '\u0000'.repeat(n.length) + rest.slice(i + n.length); i = rest.indexOf(n); } }
    const seen = new Set(); return found.sort((a, b) => a.i - b.i).map(f => f.c).filter(c => !seen.has(c.name) && seen.add(c.name));
  }
  showLogLine(idx) {
    const line = this.logLines[idx]; if (line == null) return;
    this.logSel = idx; for (const el of this.logEl.querySelectorAll('.ll.on')) el.classList.remove('on'); const row = this.logEl.querySelector(`[data-log="${idx}"]`); if (row) row.classList.add('on');
    const cards = this.cardsInLine(line);
    const k = line.indexOf(': '); const who = k >= 0 ? line.slice(0, k) : '';
    const ctx = `<div class="lgx"><div class="lgx-who">${esc(who || 'Table')}</div><div class="lgx-m">${esc(k >= 0 ? line.slice(k + 2) : line)}</div>${cards.length > 1 ? `<div class="lgx-cards">${cards.map((c, i) => `<button class="lgx-c ${i === 0 ? 'on' : ''}" data-lgc="${c.uid}" data-uid="${c.uid}">${c.img ? `<img src="${esc(c.img)}" alt="">` : ''}<span>${esc(c.name)}</span></button>`).join('<span class="lgx-arrow">→</span>')}</div>` : ''}</div>`;
    this.pinnedCtx = ctx; this.pvUid = null;
    if (cards.length) this.preview(cards[0].uid, true); else this.pv.innerHTML = ctx;
    // point at the cards on the table if they're still there
    for (const c of cards) for (const el of this.board.querySelectorAll(`.gc[title="${CSS.escape(c.name)}"], .gc[title="${CSS.escape(c.name)} (tapped)"]`)) { el.classList.remove('ping'); void el.offsetWidth; el.classList.add('ping'); }
  }
  async flyTo(from, toEl, card, { dur = 420, scaleFrom = 1 } = {}) {
    if (!from || !toEl || !this.dur(dur) || !card.img) return;
    const to = toEl.getBoundingClientRect(); const g = document.createElement('img'); g.className = 'ghost'; g.src = big(card.img);
    Object.assign(g.style, { left: from.left + 'px', top: from.top + 'px', width: from.width + 'px', height: from.height + 'px' }); document.body.appendChild(g);
    toEl.style.opacity = '0';
    const a = g.animate([{ transform: `scale(${scaleFrom})`, left: from.left + 'px', top: from.top + 'px', width: from.width + 'px', height: from.height + 'px' }, { left: to.left + 'px', top: to.top + 'px', width: to.width + 'px', height: to.height + 'px', transform: 'scale(1)' }], { duration: this.dur(dur), easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
    await done(a, this.dur(dur)); g.remove(); toEl.style.opacity = '';
  }
  async floatText(el, text, color) {
    if (!el) return; const r = el.getBoundingClientRect(); const f = document.createElement('div'); f.className = 'float'; f.textContent = text; f.style.color = color;
    f.style.left = (r.left + r.width / 2 - 20) + 'px'; f.style.top = (r.top - 4) + 'px'; document.body.appendChild(f);
    const d = this.dur(900) || 1; await done(f.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-40px)', opacity: 0 }], { duration: d, easing: 'ease-out' }), d); f.remove();
  }
  async anim(el, frames, ms, easing = 'ease') { if (!el || !this.dur(ms)) return; await done(el.animate(frames, { duration: this.dur(ms), easing }), this.dur(ms)); }
  async banner(text) {
    const mid = this.q('.gt-mid'); if (!mid || !this.dur(800)) return; const b = document.createElement('div'); b.className = 'banner'; b.textContent = text; mid.appendChild(b);
    await done(b.animate([{ opacity: 0, transform: 'translate(-60px,-50%)' }, { opacity: 1, transform: 'translate(0,-50%)', offset: .25 }, { opacity: 1, transform: 'translate(0,-50%)', offset: .75 }, { opacity: 0, transform: 'translate(60px,-50%)' }], { duration: this.dur(1000) }), this.dur(1000)); b.remove();
  }
  castSound(c) { if (!c) return 'cast'; if (c.isCreature) return 'castCreature'; if (c.isPlaneswalker) return 'castPlaneswalker'; if (c.isInstant) return 'castInstant'; if (c.isSorcery) return 'castSorcery'; if (c.isArtifact) return 'castArtifact'; if (c.isEnchantment) return 'castEnchantment'; return 'cast'; }
  // ---------- visual effects (fx setting: off / normal / arena) ----------
  get arena() { return this.s.fx === 'arena' && this.s.anim && !this.ff; }
  fxEl(cls, rect, ms, html = '') { if (!rect) return; const d = document.createElement('div'); d.className = 'fx ' + cls; d.innerHTML = html; d.style.left = rect.left + rect.width / 2 + 'px'; d.style.top = rect.top + rect.height / 2 + 'px'; document.body.appendChild(d); setTimeout(() => d.remove(), ms); return d; }
  fxCast(card, from) { if (!this.arena || !from) return; const col = { W: '#f3e9c4', U: '#6fa8ff', B: '#a78bd0', R: '#ff6b57', G: '#5ccc6a' }[(card.colors || [])[0]] || '#d9d9d9'; const d = this.fxEl('burst', from, 700); if (d) d.style.setProperty('--c', col); }
  fxHit(defender, dmg) { if (!this.arena) return; const el = this.q(`[data-life="${defender.i}"]`); const r = el && el.getBoundingClientRect(); this.fxEl('slash', r, 500); if (dmg >= 8) { document.body.classList.add('fx-shake'); setTimeout(() => document.body.classList.remove('fx-shake'), 450); this.fxEl('flash', { left: 0, top: 0, width: innerWidth * 2, height: innerHeight * 2 }, 300); } }
  fxLightning(el) { if (!this.arena || !el) return; const r = el.getBoundingClientRect(); this.fxEl('bolt', r, 450, '<svg viewBox="0 0 40 120"><path d="M22 0 L8 52 L20 52 L12 120 L34 44 L21 44 Z"/></svg>'); }
  fxShatter(el) { if (!this.arena || !el) return; const r = el.getBoundingClientRect(); const bits = [...Array(10)].map(() => `<i style="--dx:${(Math.random() - 0.5) * 140}px;--dy:${(Math.random() - 0.2) * 140}px;--r:${Math.random() * 360}deg"></i>`).join(''); this.fxEl('shards', r, 700, bits); }
  fxConfetti() { if (!this.arena) return; const bits = [...Array(60)].map(() => `<i style="left:${Math.random() * 100}vw;--d:${1.5 + Math.random() * 1.5}s;--c:hsl(${Math.random() * 360},90%,60%);--x:${(Math.random() - 0.5) * 200}px"></i>`).join(''); const d = document.createElement('div'); d.className = 'fx confetti'; d.innerHTML = bits; document.body.appendChild(d); setTimeout(() => d.remove(), 3500); }
  // ---------- events from the engine ----------
  async onEvent(e) {
    if (this.aborted) throw new Error('abort');
    const g = this.game, me = this.me, S = n => this.sfx.play(n);
    switch (e.type) {
      case 'turn': if (e.p === me) this.passUntilTurn = false; this.attacking.clear(); this.blocking.clear(); this.render(); S('turn'); await this.banner(e.p === me ? 'Your turn' : short(e.p.name) + "'s turn"); break;
      case 'draw': { this.render(); if (e.p === me) { S('draw'); const cards = [...this.board.querySelectorAll('.gt-hand .hcd')].slice(-e.n); for (const c of cards) this.anim(c, [{ transform: 'translateX(-60px)', opacity: 0 }, { transform: 'none', opacity: 1 }], 300); await this.wait(250); } break; }
      case 'land': { const from = this.srcRect(e.p, e.card); this.render(); S('land'); await this.flyTo(from, this.q(`[data-lg="${e.p.i}:${CSS.escape(e.card.name)}"]`), e.card, { dur: 360 }); await this.wait(e.p === me ? 50 : 250); break; }
      case 'cast': { const from = this.srcRect(e.p, e.card); this.render(); S(e.depth ? 'counterCast' : this.castSound(e.card)); this.fxCast(e.card, from);
        await this.flyTo(from, this.q(`[data-sid="${e.obj ? e.obj.id : ''}"] .si-img`) || this.uidEl(e.card.uid), e.card, { dur: 460 }); await this.wait(e.p === me ? 200 : 700); break; }
      case 'resolving': { const row = this.q(`[data-sid="${e.obj.id}"]`); this.lastResolveRect = this.rect(row && row.querySelector('.si-img')); if (row) await this.anim(row, [{ boxShadow: '0 0 0 0 var(--accent)' }, { boxShadow: '0 0 0 3px var(--accent)' }], 260); break; }
      case 'fizzle': { const row = this.q(`[data-sid="${e.obj.id}"]`); S('counter'); if (row) await this.anim(row, [{ opacity: 1 }, { opacity: .25, filter: 'grayscale(1)' }], 380); this.render(); break; }
      case 'retarget': { this.render(); S('counterCast'); await this.wait(e.p === me ? 200 : 600); break; }
      case 'countered': { const el = (e.obj && this.q(`[data-sid="${e.obj.id}"]`)) || this.uidEl(e.card.uid); S('counter'); this.fxLightning(el); await this.anim(el, [{ transform: 'rotate(0) scale(1)', opacity: 1, filter: 'none' }, { transform: 'rotate(-6deg) scale(1.05)', filter: 'brightness(2)', offset: .2 }, { transform: 'rotate(10deg) scale(.4)', opacity: 0, filter: 'grayscale(1)' }], 520); this.render(); break; }
      case 'resolve': { const from = this.lastResolveRect || this.rect(this.uidEl(e.card.uid)); this.lastResolveRect = null; this.render(); S('resolve'); if (e.perm) await this.flyTo(from, this.permEl(e.perm.id), e.card, { dur: 380 }); else await this.wait(150); break; }
      case 'destroy': { const el = this.permEl(e.perm.id); if (!e.quiet) { S('destroy'); this.fxShatter(el); } await this.anim(el, [{ transform: 'scale(1)', opacity: 1, filter: 'none' }, { filter: 'brightness(2) sepia(1) hue-rotate(-40deg)', offset: .3 }, { transform: 'scale(.3) rotate(12deg)', opacity: 0 }], e.quiet ? 260 : 460); break; }
      case 'wipe': { S('wipe'); this.board.querySelectorAll('.gs').forEach(s => s.classList.add('flash')); await this.wait(650); this.board.querySelectorAll('.gs').forEach(s => s.classList.remove('flash')); break; }
      case 'attack': { for (const a of e.assignments) this.attacking.set(a.attacker.id, a.defender.i); this.render(); S('attack');
        await Promise.all(e.assignments.map(a => { const el = this.permEl(a.attacker.id), d = this.seatEl(a.defender); if (!el || !d) return; const r1 = el.getBoundingClientRect(), r2 = d.getBoundingClientRect(); const dx = (r2.left + r2.width / 2 - r1.left - r1.width / 2) * .25, dy = (r2.top + r2.height / 2 - r1.top - r1.height / 2) * .25; return this.anim(el, [{ translate: '0 0' }, { translate: `${dx}px ${dy}px` }, { translate: '0 0' }], 520, 'ease-in-out'); })); break; }
      case 'block': { this.blocking.set(e.blocker.id, e.attacker.id); this.render(); S('block'); await Promise.all([this.anim(this.permEl(e.blocker.id), [{ scale: 1 }, { scale: 1.15 }, { scale: 1 }], 300), this.anim(this.permEl(e.attacker.id), [{ scale: 1 }, { scale: 1.1 }, { scale: 1 }], 300)]); break; }
      case 'hit': { S(e.dmg >= 8 ? 'bigHit' : 'hit'); this.fxHit(e.defender, e.dmg); await this.anim(this.seatEl(e.defender), [{ translate: '0 0' }, { translate: '-6px 0' }, { translate: '6px 0' }, { translate: '0 0' }], 260); break; }
      case 'life': { this.render(); if (e.delta > 0) S('gain'); else if (e.delta < 0 && !e.combat) S('lifeLoss'); await this.floatText(this.q(`[data-life="${e.p.i}"]`), (e.delta > 0 ? '+' : '') + e.delta, e.delta > 0 ? 'var(--good)' : 'var(--bad)'); break; }
      case 'step': this.render(); break;
      case 'trigger': { this.render(); S('cast'); const el = e.perm ? this.permEl(e.perm.id) : null; if (el) { el.classList.remove('ping'); void el.offsetWidth; el.classList.add('ping'); } await this.wait(e.p === me ? 250 : 350); break; }
      case 'mill': this.render(); S('draw'); await this.wait(200); break;
      case 'tutor': this.render(); S('draw'); await this.wait(e.p === me ? 80 : 300); break;
      case 'reanimate': { this.render(); S('cast'); const el = this.q(`[data-uid="${e.card.uid}"]`); await this.anim(el, [{ opacity: 0, filter: 'brightness(3)', scale: 1.3 }, { opacity: 1, filter: 'none', scale: 1 }], 500); break; }
      case 'gyhate': this.render(); S('destroy'); await this.wait(250); break;
      case 'activate': { S('cast'); await this.anim(this.q(`[data-lg="${e.p.i}:${CSS.escape(e.card.name)}"]`), [{ filter: 'none', scale: 1 }, { filter: 'brightness(1.8) sepia(.6)', scale: 1.2 }, { filter: 'none', scale: 1 }], 380); break; }
      case 'combatEnd': this.attacking.clear(); this.blocking.clear(); this.render(); break;
      case 'tokens': { this.render(); S('token'); const tiles = [...(this.seatEl(e.p)?.querySelectorAll('.gs-bf .gc') || [])].slice(-e.n); await Promise.all(tiles.map(t => this.anim(t, [{ scale: 0, opacity: 0 }, { scale: 1.15, opacity: 1 }, { scale: 1 }], 320))); break; }
      case 'dies': this.render(); S(e.p === me ? 'lose' : 'die'); await this.wait(700); if (e.p === me && !g.winner) { this.ff = true; this.mode = null; this.addLog('You are out. Fast-forwarding the rest of the game.'); if (this.endTurn) setTimeout(() => this.endTurn && this.endTurn(), 0); } break;
      case 'win': this.render(); S(e.p === me ? 'win' : (me && !me.dead ? 'lose' : 'win')); if (e.p === me) this.fxConfetti(); this.sfx.musicStop(); break;
      case 'combo': { S('combo'); const mid = this.q('.gt-mid'); if (mid) { const b = document.createElement('div'); b.className = 'banner'; b.style.color = 'var(--warn)'; b.textContent = e.combo ? '∞ ' + e.combo.pieces.join(' + ') + (e.combo.kind === 'win' ? ' — combo win!' : ' — ' + e.combo.label) : e.card.name + ' goes off!'; mid.appendChild(b); await this.wait(1200); b.remove(); } break; }
      case 'paid': this.addLog(`${short(e.p.name)} pays {${e.n}}`); await this.wait(200); break;
      default: this.render();
    }
  }
  dropStack(card) { const i = this.stackView.findIndex(s => s.card === card); if (i >= 0) this.stackView.splice(i, 1); }
  // ---------- human hooks ----------
  humanTurn(p, phase) { this.undoStack = []; this.myTurn = true; this.turnPhase = phase; this.ff = false; this.mode = null; this.render(); return new Promise(res => { this.endTurn = (plan = { action: 'end' }) => { this.undoStack = []; this.myTurn = false; this.mode = null; this.endTurn = null; this.render(); res(plan); }; }); }
  /** should the table stop for me at this step? (only called when I have at least one legal action) */
  /** does this stack object involve me (aimed at me, my permanents or my spells)? */
  aimedAtMe(obj) { const me = this.me, t = obj.target; if (!t) return false; return t === me || (t.card && this.game.ownerOf(t) === me) || (t.spell && t.spell.caster === me); }
  shouldStop(ctx) {
    const me = this.me, g = this.game;
    if (ctx.step === 'stack') {
      const top0 = ctx.stack[ctx.stack.length - 1];
      if (this.passOwnTrigTurn === g.turn && ctx.stack.every(o => o.caster === me && o.trig)) return false; // b13: "Pass my triggers this turn" applies even with Stops: all / nothing to respond with
      // a triggered ability on top (yours or theirs): stop if you can do something real in response — crack a fetch, copy it, counter it, kill the source
      if (top0 && top0.trig && this.s.stops !== 'minimal' && !(this.passUntilTurn && ctx.active !== me) && ctx.options.some(o => !(o.ab && o.ab.mana))) {
        if (top0.caster !== me || this.s.stops === 'all') return true;
        // your own trigger with nothing of theirs on the stack: ask once per source per turn (Shared Animosity fires per attacker), never after "pass my triggers"
        if (ctx.stack.some(o => o.caster !== me)) return true;
        if (this.passOwnTrigTurn === g.turn) return false;
        const key = g.turn + ':' + (top0.card && top0.card.name); this.ownTrigSeen = this.ownTrigSeen || new Set(); if (this.ownTrigSeen.has(key)) return false; this.ownTrigSeen.add(key); return true;
      }
      const theirs = ctx.stack.filter(o => o.caster !== me); if (!theirs.length) return this.s.stops === 'all';
      if (ctx.stack[ctx.stack.length - 1].caster === me && this.s.stops !== 'all') return false; // you just acted: keep going unless someone answers
      const aimed = theirs.some(o => this.aimedAtMe(o) || g.threatTo(me, o).length);
      const answers = ctx.options.some(o => o.kind === 'cast' && (o.card.roles.includes('counter') || o.card.redirect || o.card.roles.includes('protect')));
      if (this.passUntilTurn && ctx.active !== me) return aimed && answers; // even when skipping, stop if something is aimed at you and you can answer it
      if (this.s.stops === 'all') return true;
      if (this.s.stops === 'minimal') return answers && (aimed || ctx.options.some(o => o.kind === 'cast' && o.card.roles.includes('counter')));
      return answers || aimed;
    }
    if (this.passUntilTurn && ctx.active !== me) return false;
    if (this.s.stops === 'minimal') return false;
    if (this.s.stops === 'all') return true;
    const hasCast = ctx.options.some(o => o.kind === 'cast'), hasFetch = ctx.options.some(o => o.kind === 'fetch' || o.kind === 'ability');
    const inCombat = ctx.attacks && (ctx.active === me || ctx.attacks.some(a => a.defender === me));
    const hasCombatAbility = ctx.options.some(o => o.kind === 'ability' && !(o.ab && o.ab.mana) && !(o.ab && o.ab.label === 'equip'));
    if ((hasCast || (hasCombatAbility && inCombat)) && ((ctx.step === 'end' && ctx.active !== me) || ((ctx.step === 'declareAttackers' || ctx.step === 'declareBlockers') && inCombat))) return true;
    if (hasFetch && ((ctx.step === 'end' && g.after(ctx.active)[0] === me) || (ctx.active === me && ctx.step === 'upkeep'))) return true;
    return false;
  }
  humanPriority(ctx) {
    if (!this.shouldStop(ctx)) return Promise.resolve(null);
    this.ff = false; this.sfx.play('prompt');
    return new Promise(res => { this.prompt = { kind: 'priority', ...ctx, res: v => { this.prompt = null; this.mode = null; this.render(); res(v); } }; this.render(); });
  }
  /** a yes/no style choice nested inside whatever is resolving; restores any outer prompt afterwards */
  ask(kind, ctx) {
    this.ff = false; this.sfx.play('prompt');
    const prev = this.prompt;
    return new Promise(res => { this.prompt = { kind, ...ctx, options: kind === 'alt' ? ctx.blues : kind === 'search' ? ctx.pool : kind === 'choice' ? (ctx.options || []) : [], res: v => { this.prompt = prev && prev.kind !== 'priority' ? prev : null; this.render(); res(v); } }; this.render(); });
  }
  engineNotes(c) {
    const bits = [];
    for (const t of c.triggers || []) bits.push((({ upkeep: 'upkeep', end: 'end step', landfall: 'landfall', dies: 'death', combatStart: 'beginning of combat', combatDamage: 'combat damage', attack: 'attack', main1: 'first main phase', eachEnd: 'each end step', creatureEnters: 'creature enters', targeted: 'becomes targeted' })[t.when] || t.when) + ' trigger' + (t.zone === 'graveyard' ? ' (from graveyard)' : '') + ': ' + t.ops.map(o => o.op).join(', '));
    if (c.etbOps) bits.push('enters: ' + c.etbOps.map(o => o.op).join(', '));
    for (const a of c.abilities || []) bits.push((a.zone === 'battlefield' ? 'ability' : a.zone + ' ability') + ': ' + this.optLabel({ kind: 'ability', ab: a }));
    if (c.gyCast) bits.push('castable from graveyard: ' + c.gyCast.kind);
    if (c.doublesDeath) bits.push('doubles death triggers');
    for (const an of c.anthems || []) bits.push(`${an.other ? 'other ' : ''}${an.filter || 'creatures'} you control ${an.pump[0] || an.pump[1] ? `+${an.pump[0]}/+${an.pump[1]}` : ''}${an.kws.length ? ' ' + an.kws.join(', ') : ''}`);
    if (c.equip) bits.push(`equipped creature ${c.equip.pump[0] || c.equip.pump[1] ? `+${c.equip.pump[0]}/+${c.equip.pump[1]}` : ''}${c.equip.kws.length ? ' ' + c.equip.kws.join(', ') : ''}`);
    if (c.extraLands) bits.push(`+${c.extraLands} land drop${c.extraLands > 1 ? 's' : ''}`);
    for (const r of c.reducers || []) bits.push(`${r.filter || 'spells'} cost {${r.n}} less`);
    if (c.pop) bits.push(`EDHREC staple score ${Math.round(c.pop * 100)}%`);
    return bits.length ? `<div class="rl">Engine also runs: ${esc(bits.join(' · '))}</div>` : '';
  }
  /** official rulings (Wizards of the Coast, the same ones Gatherer shows), fetched on demand from Scryfall */
  rulingsHtml(c) {
    if (!c || c.token || !c.name) return '';
    const r = (window.__rulings || {})[c.name];
    if (!r) return `<div class="rul"><button class="chip" data-act="rulings" data-rname="${esc(c.name)}" data-ruid="${c.uid}">Official rulings</button></div>`;
    if (r === 'loading') return `<div class="rul note">Loading rulings…</div>`;
    if (r.error) return `<div class="rul note">${esc(r.error)} <button class="chip" data-act="rulings" data-rname="${esc(c.name)}" data-ruid="${c.uid}">Retry</button></div>`;
    const wotc = r.list.filter(x => x.source === 'wotc'), other = r.list.filter(x => x.source !== 'wotc');
    const li = x => `<li><span class="rd">${esc(x.published_at)}</span> ${esc(x.comment)}</li>`;
    return `<div class="rul"><div class="rl">Official rulings${wotc.length ? ` (${wotc.length})` : ''}</div>${wotc.length ? `<ul>${wotc.map(li).join('')}</ul>` : '<div class="note">No official rulings for this card.</div>'}${other.length ? `<details><summary>Scryfall notes (${other.length})</summary><ul>${other.map(li).join('')}</ul></details>` : ''}${r.gatherer ? `<a href="${esc(r.gatherer)}" target="_blank" rel="noopener">Open on Gatherer ↗</a>` : ''}</div>`;
  }
  async loadRulings(name, uid) {
    const store = window.__rulings = window.__rulings || {};
    store[name] = 'loading'; this.refreshPreview(uid);
    try {
      const card = await fetch('https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(name)).then(r => { if (!r.ok) throw new Error('Scryfall ' + r.status); return r.json(); });
      const rul = await fetch(card.rulings_uri).then(r => r.json());
      store[name] = { list: (rul.data || []).sort((a, b) => a.published_at.localeCompare(b.published_at)), gatherer: card.related_uris && card.related_uris.gatherer };
    } catch (e) { store[name] = { error: "Couldn't reach Scryfall for rulings." }; }
    this.refreshPreview(uid);
  }
  refreshPreview(uid) {
    if (this.sheetHtml && this.sheetUid === uid) { const c = this.findCard(uid); if (c) this.sheetHtml = this.previewHtml(c); this.render(); }
    if (this.pvUid === uid) { this.pvUid = null; this.preview(uid, true); }
  }
  costStr(c) { if (!c) return ''; let s = c.generic ? `{${c.generic}}` : ''; for (const k of 'WUBRG') s += `{${k}}`.repeat(c.pips[k] || 0); return s || '{0}'; }
  optLabel(o) {
    if (o.kind === 'fetch') return 'crack';
    if (o.kind === 'cast' && o.zone === 'top') return (this.game && this.me && this.game.topPerm(this.me, o.card)) === 'citadel' ? `cast from top · ${o.card.cmc} life` : 'cast from top of library';
    if (o.kind === 'cast') return o.zone === 'gy' ? (gr => gr ? (gr.kind || 'cast') + ' ' + this.costStr(gr.cost || o.card.mana) : 'cast from graveyard')(o.card.gyCast || (this.game && this.me ? this.game.gyGrant(this.me, o.card) : null)) : 'cast';
    if (o.kind === 'ability') { const ab = o.ab; const what = ab.label || ({ gyToHand: 'return a card to hand', draw: 'draw', landToHand: 'find a land', selfToBf: 'return to battlefield', selfToHand: 'return to hand', tokens: 'make tokens', gain: 'gain life', drain: 'drain', damage: 'deal damage', counters: '+1/+1 counters', destroy: 'destroy', gyToBf: 'reanimate', mill: 'mill', scry: 'scry', surveil: 'surveil', tokenCopy: 'token copy', attach: 'equip', edict: 'edict', bounceAllOpp: 'overload' }[ab.ops[0].op] || 'activate'); return `${what} ${this.costStr(ab.cost)}${ab.tap ? ' {T}' : ''}`; }
    return '';
  }
  filterSearch(v) { const s = v.trim().toLowerCase(); for (const el of this.board.querySelectorAll('.sgrid .sopt')) el.style.display = !s || el.dataset.name.includes(s) ? '' : 'none'; }
  humanChooseFetch(p, card, pool, n) {
    const uniq = []; const seen = new Set(); for (const c of pool) if (!seen.has(c.name)) { seen.add(c.name); uniq.push(c); }
    if (uniq.length === 1) return Promise.resolve(uniq[0]);
    this.ff = false;
    const prev = this.prompt;
    return new Promise(res => { this.prompt = { kind: 'fetch', card, options: uniq, res: v => { this.prompt = prev && prev.kind !== 'priority' ? prev : null; this.render(); res(v); } }; this.render(); });
  }
  humanRespond(ctx) {
    if (ctx.kind === 'endstep' && !this.s.stopEndStep) return Promise.resolve(null);
    this.ff = false; this.sfx.play('prompt');
    return new Promise(res => { this.prompt = { ...ctx, res: v => { this.prompt = null; this.mode = null; this.render(); res(v); } }; this.render(); });
  }
  humanBlocks(ctx) {
    this.ff = false; this.sfx.play('prompt');
    return new Promise(res => { this.prompt = { kind: 'block', ...ctx, map: new Map(), sel: [], res: v => { this.prompt = null; this.render(); res(v); } }; this.render(); });
  }
  humanDiscard(p) { return new Promise(res => { this.prompt = { kind: 'discard', res: v => { this.prompt = null; this.render(); res(v); } }; this.render(); }); }
  mulligan() {
    return new Promise(res => { this.prompt = { kind: 'mull', n: 0, res: () => { this.prompt = null; res(); } }; this.render(); });
  }
  // ---------- actions ----------
  // ---------- replay ----------
  /** replay: wait for the transport, run any recorded direct actions, then hand back the recorded answer for hook `name` */
  async rpNext(name, args) {
    const g = this.game;
    for (;;) {
      if (this.aborted) throw new Error('abort');
      await this.gate();
      const mv = this.replay.moves[this.rpPos];
      if (!mv) { this.rpFinish('End of recording'); return new Promise(() => {}); }
      if (mv.m) { this.rpPos++; this.rpLast = mv; await this.rpExec(mv); continue; }
      if (mv.h !== name) { this.rpFinish(`Replay desynchronised at decision ${this.rpPos + 1}: the game asked for "${name}" but the recording has "${mv.h}". The engine has changed since this game was recorded (${this.replay.engine || '?'}).`); return new Promise(() => {}); }
      this.rpPos++; this.rpLast = mv; const v = recDec(mv.v, g, null, args); this.render(); return v;
    }
  }
  async rpExec(mv) { const g = this.game; const args = recDec(mv.a, g); const bad = args.findIndex((a, i) => a == null && mv.a[i] != null); if (bad >= 0) { this.rpFinish(`Replay desynchronised at decision ${this.rpPos}: a ${mv.m} argument could not be found in the game state.`); return new Promise(() => {}); } this.busy = true; this.render(); try { await g[mv.m](...args); } catch (e) { this.diagPush('replay ' + mv.m + ': ' + (e && e.stack || e)); } this.busy = false; this.render(); }
  /** replay pacing: wait the current delay, then re-check — a Pause pressed mid-wait holds this step too; Step releases exactly one */
  gate() { const rp = this.rp; if (!rp) return Promise.resolve(); if (rp.skipOne) { rp.skipOne = false; return Promise.resolve(); }
    return new Promise(r => { const hold = () => { rp.wake = () => { rp.wake = null; r(); }; }; if (rp.mode === 'pause') return hold(); setTimeout(() => { if (this.aborted) return r(); if (rp.mode === 'pause') { if (rp.skipOne) { rp.skipOne = false; return r(); } return hold(); } r(); }, rp.delay); }); }
  rpClick(a, btn) { const rp = this.rp; if (!rp) return;
    if (a === 'rp-play') { rp.mode = rp.mode === 'play' ? 'pause' : 'play'; if (rp.mode === 'play' && rp.wake) rp.wake(); }
    else if (a === 'rp-step') { rp.mode = 'pause'; if (rp.wake) rp.wake(); else rp.skipOne = true; }
    else if (a === 'rp-speed') { rp.delay = +btn.dataset.ms || 700; this.ff = rp.delay < 200; }
    this.render(); }
  rpFinish(msg) { this.rpDone = msg; this.rp.mode = 'pause'; this.render(); }
  rpBar() { if (!this.replay) return ''; const rp = this.rp, n = this.replay.moves.length; return `<div class="gt-ctl rpbar"><span class="msg"><b>Replay</b> · turn ${this.game ? this.game.turn : 0}${n ? ` · your decision ${Math.min(this.rpPos, n)} / ${n}` : ' · AI-only game'}${this.rpDone ? ` · ${esc(this.rpDone)}` : ''}</span><button class="chip pri" data-act="rp-play">${rp.mode === 'play' ? 'Pause' : 'Play'}</button><button class="chip" data-act="rp-step">Step</button>${[['Slow', 1500], ['Normal', 700], ['Fast', 150]].map(([l, ms]) => `<button class="chip" data-act="rp-speed" data-ms="${ms}" aria-pressed="${rp.delay === ms}">${l}</button>`).join('')}<button class="chip" data-act="leave">Exit replay</button></div>`; }
  recordingJson() { if (!this.rec) return null; const g = this.game; return JSON.stringify({ ...this.rec, result: g.winner ? short(g.winner.name) + ' wins' : 'in progress', turns: g.turn, log: g.log.map(l => l.m) }); }
  async storeRecording(status) { if (!this.rec || this.replay || this.recStored) return; const g = this.game; if (!g || g.turn < 2) return; this.recStored = true; const id = Date.now(); const entry = { id, at: this.rec.at, engine: this.rec.engine, name: g.players.map(p => short(p.deckName || p.name).split(',')[0]).join(' · '), seats: g.players.map(p => ({ name: p.name, deckName: p.deckName })), result: g.winner ? short(g.winner.name) + ' wins' : status || 'unfinished', turns: g.turn, moves: this.rec.moves.length, rec: this.rec }; try { await Replays.put(entry); } catch (e) { this.diagPush('store recording: ' + e.message); } }
  exportRecording() { const txt = this.recordingJson(); if (!txt) return; const g = this.game; this.downloadText(txt, `playtest-rec-${(g.players[0].deckName || 'game').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${this.stamp()}.json`); }
  stamp() { const d = new Date(), z = n => String(n).padStart(2, '0'); const game = (this.rec && this.rec.seed != null ? 'g' + String(this.rec.seed).slice(-4) : 't' + this.game.turn); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}-${z(d.getMinutes())}-${z(d.getSeconds())}_${game}`; } // b13: local time with seconds + a game tag, so two exports never collide
  comboBar() { const g = this.game, me = this.me; if (!g || !me || this.replay || this.s.combos === 'off') return ''; const cs = g.availableCombos(me); if (!cs.length) return '';
    return `<div class="gt-ctl combo-row">${cs.map(c => `<span class="msg"><b>∞ ${esc(c.pieces.join(' + '))}</b> — ${esc(c.label)}${c.source ? ` <small>(${esc(c.source)})</small>` : ''}</span>${c.ready ? `<button class="chip pri" data-act="combo-go" data-id="${esc(c.id)}">${c.kind === 'win' ? 'Win with combo' : c.kind === 'mana' ? 'Go infinite' : 'Declare'}</button>` : '<span class="msg"><i>not ready yet</i></span>'}`).join('')}</div>`; }
  /** every direct UI→engine call goes through here so a recording can replay it */
  exec(m, ...args) { if (this.rec) this.rec.moves.push({ m, a: recEnc(args, this.game) }); return this.game[m](...args); }
  async act(fn) { if (this.busy) return; this.busy = true;
    const g = this.game, undoable = this.myTurn && !this.prompt && g && g.snapshot; let pre = null;
    try { this.render(); } catch (e) { this.diagPush('render before action: ' + (e && e.stack || e)); }
    if (undoable) { try { if (!g._rngWrapped) { const r = g.rng; g.rng = () => { g._rngN = (g._rngN || 0) + 1; return r(); }; g.rng.st = r.st; g._rngWrapped = true; } pre = { snap: g.snapshot(), libs: this.undoSig(g, true), opp: this.undoSig(g, false), rn: g._rngN || 0, logN: g.log.length, phase: this.turnPhase, recN: this.rec ? this.rec.moves.length : 0 }; } catch (e) { console.warn('undo snapshot', e); } }
    try { await fn(); if (g && g.winner && !this.ended && this.endTurn) this.endTurn({ action: 'end' }); /* b12: won mid-turn (poison, burn): let the game loop finish */ } catch (e) { this.diagPush('action failed: ' + (e && e.stack || e)); try { g && g.log.push({ t: g.turn, m: `⚠ engine error: ${e && e.message || e}` }); } catch (_) {} console.error(e); } finally {
      if (pre && this.myTurn && this.game === g) {
        const added = g.log.slice(pre.logN).map(l => l.m).filter(Boolean);
        if (added.length || this.undoSig(g, false) !== pre.opp || this.undoSig(g, true) !== pre.libs) {
          const oppActed = added.some(m => g.players.some(q => q !== this.me && m.startsWith(q.name + ': ') && /^(casts|activates|cracks|plays)\b/.test(m.slice(q.name.length + 2))));
          const why = this.undoSig(g, true) !== pre.libs ? 'it drew, searched, revealed or shuffled cards' : (oppActed || this.undoSig(g, false) !== pre.opp) ? 'an opponent responded' : (g._rngN || 0) !== pre.rn ? 'it involved a random result' : null;
          const mine = added.map(m => m.startsWith(this.me.name + ': ') ? m.slice(this.me.name.length + 2) : m); const label = (mine.find(m => !/^—/.test(m)) || mine[0] || 'last action').slice(0, 60);
          (this.undoStack = this.undoStack || []).push({ snap: pre.snap, why, label, phase: pre.phase, uiLog: this.logLines.length, recN: pre.recN }); if (this.undoStack.length > 15) this.undoStack.shift();
        }
      }
      this.busy = false; this.render(); } }
  /** what an undo must not erase: every library's order (hidden info) or, with libs=false, the opponents' hands (they responded) */
  undoSig(g, libs) { return g.players.map(p => libs ? p.library.map(c => c.uid).join(',') : (p === this.me ? '' : p.hand.map(c => c.uid).join(','))).join('|'); }
  undo() { const g = this.game, u = (this.undoStack || []).pop(); if (!u || u.why) { if (u) this.undoStack.push(u); return; }
    g.restore(u.snap); if (this.rec && u.recN != null) this.rec.moves.length = u.recN; this.mode = null; this.handSel = null; this.sheetHtml = null; this.addLog(`↶ Undid: ${u.label}`); this.sfx && this.sfx.play && this.sfx.play('click'); this.render(); }
  needsTarget(c) { if (c.modes && c.modes.length && (c.isInstant || c.isSorcery) && !c.roles.includes('counter') && !c.redirect) return false; /* b13: modal spells pick the mode first; each mode asks for its own targets when it resolves (Brokers Charm with no creature was stuck asking for one) */ if (!(c.isInstant || c.isSorcery) && !(c.etbOps && c.etbOps.length) && !(c.spellOps && c.spellOps.length) && !c.redirect && !/when(?:ever)? [^.]*enters[^.]*target/i.test(c.oracle || '')) return false; /* a permanent whose removal lives in a later trigger (Surly Badgersaur) targets nothing on cast */ return c.roles.includes('removal') || c.roles.includes('counter') || !!c.redirect || (c.dmg && !c.roles.includes('wipe')); }
  targetsSpells(c) { return c.roles.includes('counter') || !!c.redirect; }
  /** can the card in targeting mode target this stack object? */
  validSpellTarget(obj) {
    const m = this.mode; if (!m || m.kind !== 'target' || !this.targetsSpells(m.card)) return false;
    if (m.card.redirect) return !!obj.target;
    return obj.caster !== this.me && G.counterHits(m.card, obj.card) && !this.game.isUncounterable(obj);
  }
  startCast(card, zone) {
    if (this.mode && this.mode.kind === 'mana') this.mode = null; // b13: a half-finished 'tap X for' colour pick must not sit under the payment prompt
    if (this.needsTarget(card)) { this.mode = { kind: 'target', card, zone, players: !!card.dmg && !card.roles.includes('removal'), spells: this.targetsSpells(card) }; this.render(); return; }
    this.act(() => this.exec('cast', this.me, card, zone, null));
  }
  validTarget(perm, owner) {
    const m = this.mode; if (!m || m.kind !== 'target') return false;
    if (m.restrict && !m.restrict.includes(perm)) return false;
    if (this.game.targetOk && !m.spells) return this.game.targetOk(m.card, perm, this.me) && (!perm.card.isLand || /\bland\b|target permanent|nonland/.test(m.card.oracle.toLowerCase()) && !/nonland/.test(m.card.oracle.toLowerCase()));
    const o = m.card.oracle.toLowerCase();
    if (/target creature/.test(o) && !/permanent|artifact|enchantment|planeswalker/.test(o)) return perm.card.isCreature;
    return true;
  }
  // ---------- input ----------
  wire() {
    this._onOver = e => { if (window.GoldfishUI.current !== this) return; const t = e.target.closest('[data-uid]'); if (t) this.preview(+t.dataset.uid, !!t.closest('.lgx')); };
    this._onClick = e => { if (window.GoldfishUI.current !== this) return; this.onClick(e); }; // b13: a previous game's table on the same element used to keep handling clicks (double downloads after a rematch)
    this.el.addEventListener('mouseover', this._onOver);
    this.el.addEventListener('click', this._onClick);
    // phones: compact layout; touch: long-press any card to read it
    const mq = window.matchMedia('(max-width:700px), (max-height:540px) and (orientation:landscape)'); this.mobile = mq.matches;
    (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(e => { this.mobile = e.matches; this.render(); });
    this.touch = window.matchMedia('(hover: none)').matches;
    this.el.addEventListener('contextmenu', e => { const t = e.target.closest('[data-uid]'); if (!t || !this.touch) return; e.preventDefault(); this.openSheet(+t.dataset.uid); });
    let lp = null;
    this.el.addEventListener('touchstart', e => { const t = e.target.closest('[data-uid]'); if (!t) return; clearTimeout(lp); lp = setTimeout(() => { this.lpFired = true; this.openSheet(+t.dataset.uid); }, 520); }, { passive: true });
    for (const ev of ['touchend', 'touchmove', 'touchcancel']) this.el.addEventListener(ev, () => clearTimeout(lp), { passive: true });
    document.addEventListener('keydown', this.onKey = e => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.key === 'Escape' && this.mode) { this.mode = null; this.render(); return; }
      if (!e.ctrlKey && !e.metaKey && !e.altKey) { if (e.key === '+' || e.key === '=') { e.preventDefault(); this.stepZoom(1); return; } if (e.key === '-' || e.key === '_') { e.preventDefault(); this.stepZoom(-1); return; } if (e.key === '0') { e.preventDefault(); this.setZoom(1); return; } }
      if ((e.key === 'z' || e.key === 'Z') && !e.altKey && this.myTurn && !this.busy && !this.prompt && !this.mode) { e.preventDefault(); this.undo(); return; }
      const P = this.prompt; if (!P || this.mode) return;
      if ((e.key === ' ' || e.key === 'Enter' || e.key === '1') && ['priority', 'counter', 'endstep', 'attack'].includes(P.kind)) { e.preventDefault(); P.res(null); }
      else if ((e.key === '6' || e.key === 'F6') && P.kind === 'priority' && P.active !== this.me) { e.preventDefault(); this.passUntilTurn = true; P.res(null); }
    });
  }
  findCard(uid) {
    const g = this.game; if (!g) return null;
    for (const p of g.players) { for (const z of [p.hand, p.command, p.graveyard, p.exile]) { const c = z.find(c => c.uid === uid); if (c) return c; } const b = p.battlefield.find(b => b.card.uid === uid); if (b) return b.card; }
    const s = (g.stack || []).find(s => s.card.uid === uid); if (s) return s.card;
    if (this.prompt && this.prompt.spell && this.prompt.spell.card.uid === uid) return this.prompt.spell.card;
    for (const p of g.players) { const c = p.library.find(c => c.uid === uid); if (c) return c; }
    return this.cardByUid ? this.cardByUid.get(uid) || null : null;
  }
  previewHtml(c) { return this.previewBody(c) + this.rulingsHtml(c); }
  previewBody(c) { return `${c.img ? `<img src="${esc(big(c.img))}" alt="${esc(c.name)}">` : ''}<div><b>${esc(c.name)}</b> <span class="ty">${esc(c.manaCost || '')}</span></div><div class="ty">${esc(c.type)}${c.isCreature ? ` · ${c.power}/${c.toughness}` : ''}</div><div class="tx">${esc(c.oracle || '')}</div>${c.roles && c.roles.length ? `<div class="rl">Engine reads it as: ${esc(c.roles.join(' · '))}${c.kw && c.kw.length ? ' · ' + esc(c.kw.join(', ')) : ''}</div>` : ''}${this.engineNotes(c)}`; }
  preview(uid, keepCtx = false) {
    const c = this.findCard(uid); if (!c || this.pvUid === uid) return; this.pvUid = uid;
    if (!keepCtx) this.pinnedCtx = null;
    this.pv.innerHTML = (this.pinnedCtx || '') + this.previewHtml(c);
  }
  handAct(card) {
    const g = this.game, me = this.me; this.handSel = null;
    if (card.isLand) { if (me.landsThisTurn < g.landLimit(me)) return this.act(() => this.exec('playLand', me, card)); this.render(); return; }
    if (card.backLand && me.landsThisTurn < g.landLimit(me)) {
      const canCast = !card.roles.includes('counter') && g.castMode(me, card, 'hand');
      if (!canCast) return this.act(() => this.exec('playLand', me, card));
      return this.ask('may', { p: me, card, question: `play the back face (${card.backLand.name}) as your land? No = cast ${card.name.split(' // ')[0]}.` }).then(asLand => asLand ? this.act(() => this.exec('playLand', me, card)) : this.startCast(card, 'hand'));
    }
    if (card.roles.includes('counter')) { this.render(); return; }
    if (g.castMode(me, card, 'hand')) this.startCast(card, 'hand'); else this.render();
  }
  openSheet(uid, html) {
    const c = uid != null ? this.findCard(uid) : null; if (!c && !html) return;
    this.sheetUid = html ? null : uid; this.sheetHtml = html || this.previewHtml(c); this.render();
  }
  onClick(e) {
    const t = e.target; const g = this.game, me = this.me; if (!g) return;
    if (this.lpFired) { this.lpFired = false; e.preventDefault(); return; } // the tap that ended a long-press
    if (this.sheetHtml && (t.closest('[data-act="sheet-x"]') || t.classList.contains('sheet'))) { this.sheetHtml = null; this.render(); return; }
    const ll = t.closest('[data-log]'); if (ll) { this.showLogLine(+ll.dataset.log); if (this.mobile) this.openSheet(null, this.pv.innerHTML); return; }
    if (this.replay) { const ab = t.closest('[data-act]'); const ra = ab ? ab.dataset.act : null; if (ra && /^rp-/.test(ra)) return this.rpClick(ra, ab); if (!ra || !/^(zone|close-zone|export-log|settings|close-settings|leave|goseat|collapse-opps|zoom-in|zoom-out|sheet-x|ff|setup)$/.test(ra)) return; }
    const lc = t.closest('[data-lgc]'); if (lc) { for (const b of this.pv.querySelectorAll('.lgx-c')) b.classList.toggle('on', b === lc); this.pinnedCtx = this.pv.querySelector('.lgx').outerHTML; this.pvUid = null; this.preview(+lc.dataset.lgc, true); if (this.sheetHtml) this.openSheet(null, this.pv.innerHTML); return; }
    const u = t.closest('[data-uid]'); if (u) this.preview(+u.dataset.uid);
    const btn = t.closest('[data-act]'); if (btn) { this.sfx.play('click'); return this.action(btn.dataset.act, btn); }
    const P = this.prompt;
    // prompt option cards
    const sr = t.closest('[data-sid]'); if (sr && this.mode && this.mode.spells) { const obj = g.stack.find(o => o.id === +sr.dataset.sid); if (obj && this.validSpellTarget(obj)) return this.finishTarget({ spell: obj }); return; }
    const rt = t.closest('[data-rt]'); if (rt && P && P.kind === 'retarget') return P.res(P.candidates[+rt.dataset.rt]);
    const po = t.closest('[data-popt]'); if (po && P && P.kind === 'priority') {
      const o = P.options[+po.dataset.popt]; if (!o) return;
      if (o.kind === 'cast' && this.needsTarget(o.card)) { this.mode = { kind: 'target', card: o.card, zone: o.zone || 'hand', respond: true, players: !!o.card.dmg && !o.card.roles.includes('removal'), spells: this.targetsSpells(o.card) }; this.render(); return; }
      return P.res(o);
    }
    const opt = t.closest('[data-opt]'); if (opt && P) {
      const card = (P.options || []).map(o => o.card || o).find(c => c.uid === +opt.dataset.opt); if (!card) return;
      if (P.kind === 'counter') return P.res({ card });
      if (P.kind === 'fetch') return P.res(card);
      if (P.kind === 'alt') return P.res({ mode: 'free', exile: card });
      if (P.kind === 'search') { if (P.n === 1 && P.dest !== 'scry' && P.dest !== 'surveil') { if (!this.touch) return P.res([card]); P.sel = [card]; this.render(); return; } /* b13: on touch, a single pick is tap-then-confirm — a mis-tap after a layout shift picked the neighbouring card */ /* b13: scry/surveil 1 toggles, so you can keep it on top */ const i = P.sel.indexOf(card); if (i >= 0) P.sel.splice(i, 1); else if (P.sel.length < P.n) P.sel.push(card); this.render(); return; }
      if (P.kind === 'etb' || P.kind === 'unless') return;
      if (P.kind === 'priority') { const o = P.options.find(o => o.card.uid === card.uid); if (o.kind === 'fetch') return P.res(o); if (this.needsTarget(card)) { this.mode = { kind: 'target', card, zone: 'hand', respond: true, players: !!card.dmg && !card.roles.includes('removal') }; this.render(); return; } return P.res(o); }
      if (this.needsTarget(card)) { this.mode = { kind: 'target', card, zone: 'hand', respond: true, restrict: P.kind === 'attack' ? P.targets : null, players: !!card.dmg && !card.roles.includes('removal') }; this.render(); return; }
      return P.res({ card });
    }
    // hand
    const hc = t.closest('[data-hand]'); if (hc && me) {
      const card = me.hand.find(c => c.uid === +hc.dataset.hand); if (!card) return;
      if (P && P.kind === 'discard') return P.res(card);
      if (P && P.kind === 'mull-bottom') { const i = P.sel.indexOf(card); if (i >= 0) P.sel.splice(i, 1); else if (P.sel.length < P.n) P.sel.push(card); this.render(); return; }
      if (!this.myTurn || this.busy || P) { if (this.touch) this.openSheet(card.uid); return; }
      if (this.touch && this.handSel !== card.uid) { this.handSel = card.uid; this.render(); return; } // first tap selects, second tap plays
      return this.handAct(card);
    }
    const cz = t.closest('[data-cmd]'); if (cz && me && this.myTurn && !this.busy && !P) { const card = me.command.find(c => c.uid === +cz.dataset.cmd); if (card && g.castMode(me, card, 'cmd')) this.startCast(card, 'cmd'); return; }
    // life totals as targets
    const lf = t.closest('[data-life]'); if (lf && this.mode && this.mode.kind === 'target' && this.mode.players) { const pl = g.players[+lf.dataset.life]; if (pl !== me && !pl.dead) this.finishTarget(pl); return; }
    // permanents
    const lg = t.closest('[data-lg]'); if (lg && me && +lg.dataset.lg.split(':')[0] === me.i) {
      const perm = me.battlefield.find(b => b.card.fetch && b.card.name === lg.dataset.lg.slice(lg.dataset.lg.indexOf(':') + 1) && g.canActivate(me, b));
      if (perm) { if (P && P.kind === 'priority') return P.res({ kind: 'fetch', perm }); if (this.myTurn && !this.busy && !P) return this.act(() => this.exec('activateFetch', me, perm)); }
      { const nm = lg.dataset.lg.slice(lg.dataset.lg.indexOf(':') + 1); const land = me.battlefield.find(b => b.card.name === nm && !b.tapped); if (land) this.tapClick(land); }
      return;
    }
    const pe = t.closest('[data-pid]'); if (pe) {
      const id = +pe.dataset.pid; let owner = null, perm = null; for (const p of g.players) { const b = p.battlefield.find(b => b.id === id); if (b) { owner = p; perm = b; } }
      if (!perm) return;
      if (this.mode && this.mode.kind === 'target') { if (this.validTarget(perm, owner)) { perm.owner = owner.i; this.finishTarget(perm); } return; }
      if (this.mode && this.mode.kind === 'attack' && owner === me && g.canAttackWith(me, perm)) { const m = this.mode.map; if (m.has(perm) && m.get(perm) === this.mode.def) m.delete(perm); else m.set(perm, this.mode.def); this.render(); return; }
      if (owner === me && !this.mode && (!P || P.kind === 'priority') && !perm.card.isLand && !perm.tapped && this.tapClick(perm)) return;
      if (owner === me && !this.mode && (!P || P.kind === 'priority') && this.abilClick(perm)) return;
      if (P && P.kind === 'block') {
        if (owner === me && P.blockers.includes(perm)) { for (const [a, bs] of P.map) { const i = bs.indexOf(perm); if (i >= 0) { bs.splice(i, 1); if (!bs.length) P.map.delete(a); } } P.warn = null;
          if (P.atkSel) { if (g.canBlock(perm, P.atkSel)) { P.map.set(P.atkSel, [...(P.map.get(P.atkSel) || []), perm]); } else P.warn = `${perm.card.name} can't block ${P.atkSel.card.name}.`; this.render(); return; }
          const si = P.sel.indexOf(perm); if (si >= 0) P.sel.splice(si, 1); else P.sel.push(perm); this.render(); return; }
        const atk = P.attacks.find(a => a.attacker === perm);
        if (atk && !P.sel.length) { P.atkSel = P.atkSel === perm ? null : perm; P.warn = null; this.render(); return; }
        if (atk && P.sel.length) { const can = P.sel.filter(b => g.canBlock(b, perm)), cant = P.sel.filter(b => !g.canBlock(b, perm)); if (can.length) P.map.set(perm, [...(P.map.get(perm) || []), ...can]); P.sel = []; P.warn = cant.length ? `${cant.map(b => b.card.name).join(', ')} can't block ${perm.card.name}.` : null; this.render(); }
      }
    }
  }
  /** full game log as text: header (engine version, seats, result) then every engine line grouped by turn — for sharing a game to review */
  logText() {
    const g = this.game; if (!g) return '';
    const ver = ((document.querySelector('script[src*="playtest.js"]') || {}).src || '').match(/v=(\d+)/); const lines = [];
    lines.push(`MTG Dashboard playtest log · engine ${ver ? 'v' + ver[1] : '?'} · ${new Date().toISOString()}`);
    try { lines.push(`client: ${innerWidth}×${innerHeight} css px @${devicePixelRatio}x · ${matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait'} · ${this.mobile ? 'phone layout' : 'desktop layout'} · zoom ${Math.round((this.s.zoom || 1) * 100)}% · ${navigator.userAgent}`); } catch (e) {}
    for (const p of g.players) lines.push(`seat ${p.i + 1}: ${p.name} — ${p.deckName}${p.level ? ' · ' + p.level : ''}${p.dead ? ' · defeated' : ' · life ' + p.life}`);
    lines.push(`result: ${g.winner ? short(g.winner.name) + ' wins' : 'in progress'} · round ${g.round} · turn ${g.turn}`);
    try { lines.push(`state: phase ${g.phase} · active ${short(g.players[g.active].name)} · ui ${this.busy ? 'busy' : 'idle'} · prompt ${this.prompt ? this.prompt.kind : 'none'} · mode ${this.mode ? this.mode.kind : 'none'} · stack [${g.stack.map(o => (o.card ? o.card.name : o.kind || '?') + ' (' + short(o.caster ? o.caster.name : '?') + ')').join(', ')}]`); if (this.diag && this.diag.length) { lines.push('errors:'); for (const d of this.diag) lines.push('  ' + d); } } catch (e) { lines.push('state: (unavailable: ' + e.message + ')'); }
    lines.push('');
    let t = null; for (const l of g.log) { if (l.t !== t) { t = l.t; lines.push(`== turn ${t} ==`); } lines.push(l.m); }
    return lines.join('\n');
  }
  downloadText(txt, name) { try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); } catch (e) {} }
  exportLog() {
    const txt = this.logText(); if (!txt) return; const g = this.game;
    const name = `playtest-${(g.players[0].deckName || 'game').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${this.stamp()}.txt`;
    const file = (() => { try { return new File([txt], name, { type: 'text/plain' }); } catch (e) { return null; } })();
    // phones ignore the download name on blob links; the share sheet keeps it (Save to Files / send it on)
    if (file && (this.mobile || this.touch) && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: name }).catch(() => this.downloadText(txt, name)); return; }
    this.downloadText(txt, name);
    try { if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(() => {}); } catch (e) {}
    this.banner && this.banner('Log saved (and copied)');
  }
  /** click on one of my permanents: activate its ability (one → straight away; several → pick) */
  abilClick(perm) {
    const g = this.game, me = this.me, P = this.prompt; const c = perm.card;
    const opts = P && P.kind === 'priority' ? P.options.filter(o => o.kind === 'ability' && (o.perm === perm || o.card === c || o.card === c.orig)) : (this.myTurn && !this.busy && !P ? (this.mainOpts || []).filter(o => o.kind === 'ability' && (o.perm === perm || o.card === c || o.card === c.orig)) : []);
    if (!opts.length) return false;
    const run = o => { if (P && P.kind === 'priority') return P.res(o); if (o.kind === 'cast' && this.needsTarget(o.card)) return this.startCast(o.card, o.zone); return this.act(() => this.exec('doAction', me, { ...o, instant: false })); };
    if (opts.length === 1) { run(opts[0]); return true; }
    this.mode = { kind: 'abil', perm, opts, run }; this.render(); return true;
  }
  /** can I float mana right now? (my main phase with nothing pending, or while holding priority) */
  canTapMana() { const P = this.prompt; return !!this.me && !this.busy && ((this.myTurn && !P) || (P && P.kind === 'priority')); }
  /** click on one of my untapped mana permanents: tap it (single colour) or ask which colour */
  tapClick(perm) {
    if (!this.canTapMana()) return false; const g = this.game, me = this.me; const s = g.manualSrcs(me).find(x => x.b === perm); if (!s) return false;
    const cols = [...new Set(s.colors)]; if (cols.length === 1) { this.doTap(perm, cols[0]); return true; }
    this.mode = { kind: 'mana', perm, colors: cols }; this.render(); return true;
  }
  doTap(perm, col) { const g = this.game, me = this.me; this.mode = null; if (this.prompt && this.prompt.kind === 'priority') { this.exec('tapForMana', me, perm, col).then(() => this.render()); return; } this.act(() => this.exec('tapForMana', me, perm, col)); }
  poolHtml() { const me = this.me; const pool = (me && me.pool) || []; const g = this.game; const inf = me && me.infMana && g && me.infMana.turn === g.turn ? me.infMana.colors : null; if (!pool.length && !inf) return ''; const PIP = { W: '#f3e9c4', U: '#9ec5ff', B: '#b9a7c7', R: '#ff9a8a', G: '#9fd79a', C: '#cfcfcf', A: '#ffd27a' }; return `<span class="pool" title="floating mana (empties when the step ends)${inf ? '; ∞ = infinite mana from a combo, until end of turn' : ''}">pool ${inf ? inf.map(c => `<i class="pip inf" style="background:${PIP[c] || PIP.C}">∞${c}</i>`).join('') : ''}${pool.map(m => `<i class="pip" style="background:${PIP[m.c] || PIP.C}">${m.c === 'A' ? '★' : m.c}</i>`).join('')}</span>`; }
  finishTarget(target) {
    const m = this.mode; this.mode = null;
    if (m.respond && this.prompt) return this.prompt.res(this.prompt.kind === 'priority' ? { kind: 'cast', card: m.card, target, zone: m.zone } : { card: m.card, target });
    this.act(() => this.exec('cast', this.me, m.card, m.zone, target));
  }
  action(a, btn) {
    const g = this.game, me = this.me, P = this.prompt;
    if (a === 'goseat') { { const q = g.players[+btn.dataset.seat]; if (q && q.dead && this.mobile) { this.peekDead = this.peekDead || new Set(); if (this.peekDead.has(q.i)) this.peekDead.delete(q.i); else this.peekDead.add(q.i); this.render(); } } const el = this.board.querySelector(`.gt-opps .gs[data-seat="${btn.dataset.seat}"]`); if (el) { this.oppsCollapsed = false; this.board.querySelector('.gt-opps-wrap').classList.remove('collapsed'); el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' }); } return; }
    if (a === 'collapse-opps') { this.oppsCollapsed = !this.oppsCollapsed; this.render(); return; }
    if (a === 'hand-tog') { this.handHidden = !this.handHidden; this.render(); return; }
    if (a === 'cast-cmd' && this.myTurn && !this.busy && !P) { const card = me.command.find(c => c.uid === +btn.dataset.cmd); if (card && g.castMode(me, card, 'cmd')) this.startCast(card, 'cmd'); return; }
    if (a === 'zoom-in') { this.stepZoom(1); return; }
    if (a === 'zoom-out') { this.stepZoom(-1); return; }
    if (a === 'settings') { this.showSettings = true; this.render(); return; }
    if (a === 'close-settings') { this.showSettings = false; saveSettings(this.s); this.render(); return; }
    if (a === 'zone') { const p = g.players[+btn.dataset.p]; this.zoneView = this.zoneView && this.zoneView.p === p && this.zoneView.z === btn.dataset.z ? null : { p, z: btn.dataset.z }; this.render(); return; }
    if (a === 'close-zone') { this.zoneView = null; this.render(); return; }
    if (a === 'ff') { this.ff = !this.ff; this.render(); return; }
    if (a === 'leave') { this.aborted = true; this.sfx.musicStop(); if (!this.replay) { this.clearSave(); this.storeRecording('abandoned'); } window.removeEventListener('popstate', this.onPop); window.removeEventListener('beforeunload', this.onUnload); if (location.hash === '#playtest/game') history.replaceState(null, '', '#playtest'); if (this.endTurn) this.endTurn(); if (this.prompt) this.prompt.res(null); document.removeEventListener('keydown', this.onKey); this.opts.onExit && this.opts.onExit(); return; }
    if (a === 'cancel') { this.mode = null; this.render(); return; }
    if (a === 'tap-col' && this.mode && this.mode.kind === 'mana') { this.doTap(this.mode.perm, btn.dataset.c); return; }
    if (a === 'abil-pick' && this.mode && this.mode.kind === 'abil') { const m = this.mode; this.mode = null; const o = m.opts[+btn.dataset.i]; if (o) m.run(o); return; }
    if (a === 'undo' && this.myTurn && !this.busy && !P) { this.undo(); return; }
    if (a === 'end' && this.myTurn && !this.busy && !P) { this.endTurn({ action: this.turnPhase === 'main1' ? 'end' : 'done' }); return; }
    if (a === 'to-main2' && this.myTurn && !this.busy && !P) { this.endTurn({ action: 'attack', assignments: [] }); return; }
    if (a === 'attack' && this.myTurn && !this.busy && (this.turnPhase === 'main1' || this.turnPhase === 'combat2')) { if (g.winner || !g.opponentsOf(me).length) { if (g.winner && !this.ended && this.endTurn) this.endTurn({ action: 'end' }); return; } this.mode = { kind: 'attack', map: new Map(), def: g.opponentsOf(me)[0] }; this.render(); return; }
    if (a === 'atk-all' && this.mode && this.mode.kind === 'attack') { for (const b of me.battlefield) if (g.canAttackWith(me, b) && g.powerOf(me, b) > 0) this.mode.map.set(b, this.mode.def); this.render(); return; }
    if (a === 'def' && this.mode && this.mode.kind === 'attack') { this.mode.def = g.players[+btn.dataset.p]; this.render(); return; }
    if (a === 'defpw' && this.mode && this.mode.kind === 'attack') { const id = +btn.dataset.pid; for (const q of g.opponentsOf(me)) { const pw = q.battlefield.find(b => b.id === id); if (pw) { this.mode.def = { q, pw }; } } this.render(); return; }
    if (a === 'atk-go' && this.mode && this.mode.kind === 'attack') { const asg = [...this.mode.map].map(([attacker, d]) => d && d.pw ? { attacker, defender: d.q, pw: d.pw } : { attacker, defender: d }); this.mode = null; if (this.endTurn) this.endTurn({ action: 'attack', assignments: asg }); return; }
    if (P && P.kind === 'etb' && (a === 'etb-pay' || a === 'etb-tap')) { P.res(a === 'etb-pay'); return; }
    if (P && P.kind === 'unless' && (a === 'unless-pay' || a === 'unless-no')) { P.res(a === 'unless-pay'); return; }
    if (a === 'rulings') { this.loadRulings(btn.dataset.rname, +btn.dataset.ruid); return; }
    if (a === 'hand-go') { const c = me && me.hand.find(c => c.uid === this.handSel); if (c && this.myTurn && !this.busy && !P) return this.handAct(c); this.handSel = null; this.render(); return; }
    if (a === 'hand-x') { this.handSel = null; this.render(); return; }
    if (a === 'hand-info') { if (this.handSel != null) this.openSheet(this.handSel); return; }
    if (P && P.kind === 'retarget' && a === 'rt-keep') { P.res(null); return; }
    if (P && P.kind === 'may' && (a === 'may-yes' || a === 'may-no')) { P.res(a === 'may-yes'); return; }
    if (P && P.kind === 'payopt' && a === 'pay-normal') { P.res(null); return; }
    if (P && P.kind === 'payopt' && a === 'pay-alt') { P.res(P.alts[+btn.dataset.i]); return; }
    if (P && P.kind === 'payopt' && a === 'pay-cancel') { P.res(undefined); return; }
    if (P && P.kind === 'num' && a === 'num-pick') { P.res(+btn.dataset.n); return; }
    if (P && P.kind === 'num' && a === 'num-cancel') { P.res(null); return; }
    if (P && P.kind === 'modes' && a === 'mode-tog') { const m = P.modes[+btn.dataset.i]; if (!m) return; const i = P.sel.indexOf(m.card); if (i >= 0) P.sel.splice(i, 1); else if (P.sel.length < P.max) P.sel.push(m.card); else if (P.max === 1) P.sel = [m.card]; this.render(); return; }
    if (P && P.kind === 'modes' && a === 'modes-go') { if (P.sel.length >= P.min) P.res(P.sel.slice()); return; }
    if (a === 'xcast' && this.myTurn && !this.busy && !P) { const z = btn.dataset.zone, c = this.findCard(+btn.dataset.uid) || (z === 'top' ? me.library[me.library.length - 1] : null); if (!c) return; this.zoneView = null; if (c.isLand) return this.act(() => g.playLand(me, c)); if (g.castMode(me, c, z)) this.startCast(c, z); else this.render(); return; }
    if (a === 'abil' && this.myTurn && !this.busy && !P) { const o = (this.mainOpts || [])[+btn.dataset.i]; if (!o) return; if (o.kind === 'cast' && this.needsTarget(o.card)) return this.startCast(o.card, o.zone); return this.act(() => this.exec('doAction', me, { ...o, instant: false })); }
    if (P && P.kind === 'search' && a === 'search-go') { const out = P.sel.slice(); if (P.dest === 'sylvan') out.keepOrder = P.sel.slice(); else if (P.order) out.keepOrder = P.order.filter(c => !P.sel.includes(c)); P.res(out); return; }
    if (P && P.kind === 'search' && (a === 'ord-up' || a === 'ord-down')) { const uid = +btn.dataset.uid; P.order = P.order || P.pool.slice(); if (P.dest === 'sylvan') { const i = P.sel.findIndex(c => c.uid === uid); const j = a === 'ord-up' ? i - 1 : i + 1; if (i >= 0 && j >= 0 && j < P.sel.length) { [P.sel[i], P.sel[j]] = [P.sel[j], P.sel[i]]; this.render(); } return; } const kept = P.order.filter(c => !P.sel.includes(c)); const i = kept.findIndex(c => c.uid === uid); const j = a === 'ord-up' ? i - 1 : i + 1; if (i >= 0 && j >= 0 && j < kept.length) { [kept[i], kept[j]] = [kept[j], kept[i]]; P.order = kept.concat(P.order.filter(c => P.sel.includes(c))); this.render(); } return; } // b13: reorder the cards that stay on top
    if (P && P.kind === 'search' && a === 'search-none') { P.res([]); return; }
    if (P && P.kind === 'player' && a === 'pick-player') { P.res(g.players[+btn.dataset.p]); return; }
    if (P && P.kind === 'choice' && a === 'pick-choice') { P.res(P.options[+btn.dataset.i]); return; }
    if (P && P.kind === 'choice' && a === 'choice-go') { const v = (document.getElementById('choice-free') || {}).value || ''; if (v.trim()) P.res(v.trim()); return; }
    if (P && P.kind === 'alt' && a === 'alt-mana') { P.res({ mode: 'mana' }); return; }
    if (P && P.kind === 'alt' && a === 'alt-cancel') { P.res(null); return; }
    if (a === 'pass-turn' && P) { this.passUntilTurn = true; P.res(null); return; }
    if (a === 'pass-own' && P) { this.passOwnTrigTurn = this.game.turn; P.res(null); return; }
    if (a === 'pass' && P) { P.res(null); return; }
    if (a === 'block-go' && P && P.kind === 'block') { const bad = [...P.map].find(([at, bs]) => at.card.kw.includes('menace') && bs.length < 2); if (bad) { P.warn = `${bad[0].card.name} has menace — block it with two or more creatures, or not at all.`; this.render(); return; } P.res(P.map); return; }
    if (a === 'keep' && P && P.kind === 'mull') { if (P.n) { this.prompt = { kind: 'mull-bottom', n: P.n, sel: [], done: P.res, from: P }; this.render(); } else P.res(); return; }
    if (a === 'mull' && P && P.kind === 'mull') { P.confirm = true; this.render(); return; }
    if (a === 'mull-back' && P && P.kind === 'mull') { P.confirm = false; this.render(); return; }
    if (a === 'mull-yes' && P && P.kind === 'mull' && P.confirm) { P.confirm = false; this.exec('mulligan', me); P.n++; this.render(); return; }
    if (a === 'bottom-back' && P && P.kind === 'mull-bottom') { this.prompt = P.from; this.render(); return; }
    if (a === 'bottom-go' && P && P.kind === 'mull-bottom' && P.sel.length === P.n) { this.exec('bottomCards', me, P.sel); const done = P.done; this.prompt = null; done(); return; }
    if (a === 'rematch') { this.sfx.musicStop(); this.clearSave(); window.removeEventListener('popstate', this.onPop); window.removeEventListener('beforeunload', this.onUnload); this.opts.onRematch && this.opts.onRematch(); return; }
    if (a === 'export-log') { this.exportLog(); return; }
    if (a === 'export-rec') { this.exportRecording(); return; }
    if (a === 'combo-go' && this.myTurn && !this.busy && !P) { const id = btn.dataset.id; return this.act(() => this.exec('declareCombo', me, id)); }
    if (a === 'setup') { this.sfx.musicStop(); this.clearSave(); window.removeEventListener('popstate', this.onPop); window.removeEventListener('beforeunload', this.onUnload); if (location.hash === '#playtest/game') history.replaceState(null, '', '#playtest'); this.opts.onExit && this.opts.onExit(); return; }
  }
  // ---------- rendering ----------
  tile(b, owner, opts = {}) {
    const g = this.game, c = b.card, me = this.me;
    const cls = ['gc'];
    if (b.tapped) cls.push('t'); if (b.summoning && c.isCreature && !c.kw.includes('haste')) cls.push('sick'); if (c.isCommander) cls.push('cmdr');
    if (this.attacking.has(b.id)) cls.push('atk'); if ([...this.blocking.keys()].includes(b.id)) cls.push('blk');
    if (this.mode && this.mode.kind === 'target' && this.validTarget(b, owner)) cls.push('tgt');
    if (this.mode && this.mode.kind === 'attack' && owner === me && g.canAttackWith(me, b)) { cls.push('clk'); if (this.mode.map.has(b)) cls.push('atk'); }
    const P = this.prompt;
    if (P && P.kind === 'block') { if (owner === me && P.blockers.includes(b)) { cls.push('clk'); if (P.sel.includes(b)) cls.push('sel'); if ([...P.map.values()].some(bs => bs.includes(b))) cls.push('blk'); } if (P.attacks.some(a => a.attacker === b)) { cls.push('atk'); cls.push('clk'); if (P.atkSel === b) cls.push('sel'); } if (owner === me && P.atkSel && P.blockers.includes(b) && !g.canBlock(b, P.atkSel)) cls.push('dim'); }
    let badge = '';
    if (this.mode && this.mode.kind === 'attack' && this.mode.map.get(b)) { const d = this.mode.map.get(b); badge = `<span class="bd ak">→ ${esc(short(d.pw ? d.pw.card.name : d.name).slice(0, 10))}</span>`; cls.push('ak' + this.akIdx(d)); }
    else if (this.attacking.has(b.id)) badge = `<span class="bd">→ ${esc(short(g.players[this.attacking.get(b.id)].name).slice(0, 10))}</span>`;
    if (P && P.kind === 'block') { for (const [a, bl] of P.map) if (bl.includes(b)) badge = `<span class="bd" style="background:var(--accent)">blocks ${esc(a.card.name.slice(0, 10))}</span>`; }
    let pt = '';
    if (c.isCreature) { const pw = g.powerOf(owner, b), tg = g.toughOf(owner, b); pt = `<span class="pt ${pw > c.power ? 'up' : ''}" title="${(b.counters || 0) > 0 ? b.counters + ' +1/+1 counter' + (b.counters === 1 ? '' : 's') : ''}">${pw}/${tg}${(b.counters || 0) > 0 ? `<small>+${b.counters}</small>` : ''}</span>`; }
    if (c.isPlaneswalker) pt = `<span class="pt">◆${b.loyalty || 0}</span>`;
    if (c.altered) pt += `<span class="pt alt" title="Token copy with changed characteristics">${esc(c.altered)}</span>`;
    if (c.saga) { const R = ['', 'I', 'II', 'III', 'IV', 'V', 'VI']; const cur = b.lore || 0, last = c.saga.last || 3; pt += `<span class="ctr saga" title="Saga: chapter ${cur} of ${last}${cur >= last ? ' — sacrificed after this chapter resolves' : ' — next chapter after your draw step'}">${R[cur] || cur}<small>/${R[last] || last}</small></span>`; } // b13: saga chapter badge
    if (b.level) pt += `<span class="ctr lvl" title="Class level ${b.level}">lvl ${b.level}</span>`; // b13: Class level badge
    { const kinds = g.counterKinds(b); delete kinds.loyalty; delete kinds.lore; if (c.isCreature) delete kinds['+1/+1']; const ks = Object.entries(kinds); if (ks.length) { const ICON = { '+1/+1': '+1', '-1/-1': '−1', quest: 'Q', lore: 'ch', charge: '⚡', oil: 'oil', stun: 'stun', shield: '🛡', time: 't', age: 'age', hatchling: 'egg', indestructible: '∞', flying: 'fly', suspect: '?' }; pt += `<span class="ctr" title="${esc(ks.map(([k, v]) => v + ' ' + k + ' counter' + (v === 1 ? '' : 's')).join(', '))}">${ks.slice(0, 3).map(([k, v]) => `<b>${v}</b>${esc(ICON[k] || k.slice(0, 4))}`).join(' ')}</span>`; } }
    const att = g.players.flatMap(q => q.battlefield).filter(x => x.attachedTo === b.id);
    if (b.neutral || b.pacified) { cls.push('neut'); badge = badge || `<span class="bd">${b.neutral ? 'neutralised' : "can't attack/block"}</span>`; }
    else if (att.length && !badge) badge = `<span class="bd" title="${esc(att.map(x => x.card.name).join(', '))}">+${esc(att.length === 1 ? att[0].card.name.split(/[ ,]/)[0].slice(0, 10) : att.length + ' attached')}</span>`;
    if (!c.img && c.token) tokArt(c);
    let cd = '';
    if ((c.orig || c).isCommander) { const cn = (c.orig || c).name;
      if (owner !== me && me && me.cmdDmgBy && me.cmdDmgBy[cn]) cd = `<span class="cd ${me.cmdDmgBy[cn] >= 14 ? 'hot' : ''}" title="commander damage ${cn} has dealt you">⚔ ${me.cmdDmgBy[cn]}/21 on you</span>`;
      else { const parts = g.players.filter(q => q !== owner && q.cmdDmgBy && q.cmdDmgBy[cn]).map(q => `${esc(short(q.name).replace(/^(You|AI) · /, '').slice(0, 8))} ${q.cmdDmgBy[cn]}`); if (parts.length) cd = `<span class="cd" title="commander damage ${cn} has dealt">⚔ ${parts.join(' · ')}</span>`; } }
    const body = c.img ? `<img src="${esc(c.img)}" alt="${esc(c.name)}" loading="lazy">` : `<span>${esc(c.name)}</span>`;
    return `<div class="${cls.join(' ')}${c.img ? '' : ' tok'}" data-pid="${b.id}" data-uid="${c.uid}" title="${esc(c.name)}">${cd}${body}${pt}${badge}</div>`;
  }
  akIdx(d) { const g = this.game, me = this.me; if (!d) return -1; const q = d.pw ? d.q : d; return g.opponentsOf(me).indexOf(q); } // which colour an attack target gets (by opponent order)
  akSummary() { const g = this.game, me = this.me, m = this.mode.map; const by = new Map(); for (const [b, d] of m) { if (!d) continue; const q = d.pw ? d.q : d; const k = d.pw ? d.pw.card.name : q.name; if (!by.has(k)) by.set(k, { q, n: 0, pw: 0, i: this.akIdx(d) }); const e = by.get(k); e.n++; e.pw += Math.max(0, g.powerOf(me, b)); } return [...by.entries()]; }
  seat(p) {
    const g = this.game, me = this.me, isMe = p === me;
    const lands = p.battlefield.filter(b => b.card.isLand);
    const groups = new Map(); for (const b of lands) { const k = b.card.name + (b.tapped ? '\u0001t' : ''); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(b); }
    const nonl = p.battlefield.filter(b => !b.card.isLand).sort((a, b) => (b.card.isCreature ? 1 : 0) - (a.card.isCreature ? 1 : 0));
    const threat = !isMe && me && p.ai !== undefined ? new G.AI('cutthroat').threatOf(g, me, p) : null;
    const maxT = 40;
    const tgtLife = this.mode && this.mode.kind === 'target' && this.mode.players && p !== me && !p.dead;
    const cmdDmg = me && !isMe && p.cmdDmgBy && Object.keys(p.cmdDmgBy).length ? `<span class="cdm" title="commander damage this player has taken">taken: ${Object.entries(p.cmdDmgBy).map(([n, v]) => esc(n.split(',')[0]) + ' ' + v + '/21').join(' · ')}</span>` : '';
    const cmdDmgOnMe = me && !isMe && me.cmdDamage[p.i] ? `<span class="cdm">cmdr dmg on you ${me.cmdDamage[p.i]}/21</span>` : '';
    const inc = !isMe && this.mode && this.mode.kind === 'attack' ? this.akSummary().filter(([, e]) => e.q === p) : [];
    const akI = !isMe && this.mode && this.mode.kind === 'attack' ? g.opponentsOf(me).indexOf(p) : -1;
    return `<section class="gs ${isMe ? 'me' : ''} ${g.players[g.active] === p && !g.winner ? 'act' : ''} ${p.dead ? 'dead' : ''} ${akI >= 0 ? 'ak' + akI : ''} ${inc.length ? 'inc' : ''}" data-seat="${p.i}">
      ${inc.map(([k, e]) => `<div class="inc-b">⚔ ${e.n} attacker${e.n === 1 ? '' : 's'} → ${esc(short(k))} · ${e.pw} power</div>`).join('')}
      <div class="gs-h"><div class="av" style="background-image:url('${esc(p.art || '')}')"></div><div class="nm"><b>${esc(short(p.name))}${g.monarch === p ? ' <span class="crown" title="The monarch: draws a card at end step; combat damage steals the crown">👑</span>' : ''}${g.initiative === p ? ` <span class="crown" title="Has the initiative: ventures into Undercity each upkeep${p.undercityRoom ? ' — room: ' + esc(p.undercityRoom) : ''}; combat damage takes it">🏰</span>` : ''}</b><small>${esc(p.deckName)}${p.level ? ' · ' + esc(p.level) : ''}</small></div><div class="lf ${p.life <= 10 ? 'low' : ''} ${tgtLife ? 'tgt' : ''}" data-life="${p.i}">${p.life}</div></div>
      <div class="gs-meta"><span>hand ${p.hand.length}</span><span>library ${p.library.length}</span><button class="zbtn" data-act="zone" data-p="${p.i}" data-z="graveyard" title="Show graveyard">gy ${p.graveyard.length}</button><button class="zbtn" data-act="zone" data-p="${p.i}" data-z="exile" title="Show exiled cards">exile ${p.exile.length}</button>${p.command.length ? `<span>cmd zone: ${esc(p.command.map(c => c.name.split(',')[0]).join(', '))}${p.cmdTax ? ' +' + p.cmdTax : ''}</span>` : ''}${cmdDmgOnMe}${cmdDmg}</div>
      ${threat !== null ? `<div class="thr" title="Threat to you: ${threat.toFixed(0)}"><i style="width:${Math.min(100, threat / maxT * 100)}%"></i></div>` : ''}
      ${isMe ? '<div class="gs-body"><div class="gs-main">' : ''}<div class="gs-bf">${nonl.map(b => this.tile(b, p)).join('') || (this.mobile && lands.length ? '' : '<span class="gs-meta">no permanents</span>')}</div>
      <div class="gs-lands">${[...groups].map(([key, bs]) => { const name = bs[0].card.name, tapped = bs[0].tapped; const c = bs[0].card; const canAct = isMe && bs.some(b => b.card.fetch && g.canActivate(p, b)) && ((this.myTurn && !this.busy && !this.prompt) || (this.prompt && this.prompt.kind === 'priority')); return `<div class="gc lg ${tapped ? 't' : ''} ${canAct ? 'act' : ''}" data-lg="${p.i}:${esc(name)}" data-uid="${c.uid}" title="${esc(name)}${tapped ? ' (tapped)' : ''}">${c.img ? `<img src="${esc(c.img)}" alt="${esc(name)}" loading="lazy">` : `<span>${esc(name)}</span>`}${canAct ? '<span class="cnt">crack</span>' : bs.length > 1 ? `<span class="cnt">×${bs.length}</span>` : ''}</div>`; }).join('')}</div>
    ${isMe ? `</div>${this.cmdZone(p)}</div>` : ''}</section>`;
  }
  cmdZone(p) {
    const g = this.game, P = this.prompt;
    const cards = p.command.map(c => { const can = this.myTurn && !this.busy && !P && g.castMode(p, c, 'cmd'); const cost = g.costOf(p, c, 'cmd');
      return `<div class="czc ${can ? 'can' : ''}" data-cmd="${c.uid}" data-uid="${c.uid}" title="${esc(c.name)} — click to cast">${c.img ? `<img src="${esc(big(c.img))}" alt="${esc(c.name)}">` : `<span>${esc(c.name)}</span>`}</div><div class="cz-cost">${cost.total} mana${p.cmdTax ? ` (tax +${p.cmdTax})` : ''}</div>`; }).join('');
    return `<aside class="cz"><div class="cz-l">Command zone</div>${cards || `<div class="cz-empty">${p.battlefield.some(b => b.card.isCommander) ? 'Commander on the battlefield' : 'Empty'}</div>`}</aside>`;
  }
  /** what a stack object will do, in plain words */
  stackVerb(o) {
    const c = o.card, t = o.target;
    if (o.kind === 'ability') return `${o.trig ? 'resolve a triggered ability' : 'resolve an activated ability'}${o.copy ? ' (copy)' : ''}${o.ab && o.ab.ops && this.game.describeOps ? ': ' + this.game.describeOps(o.ab.ops) : ''}`;
    if (c.roles.includes('counter') && t && t.spell) return `counter ${t.spell.card.name}${c.counter && c.counter.unless ? ` unless ${short(t.spell.caster.name)} pays {${c.counter.unless}}` : ''}`;
    if (c.redirect && t && t.spell) return `change the target of ${t.spell.card.name}`;
    if (t && t.card) return `${c.roles.includes('removal') ? 'remove' : 'target'} ${t.card.name} (${short((this.game.ownerOf(t) || {}).name || '')})`;
    if (t && t.life !== undefined) return `${c.dmg ? c.dmg + ' damage to ' : 'target '}${short(t.name)}`;
    if (c.roles.includes('wipe')) return 'destroy all creatures';
    return c.isCreature || c.isArtifact || c.isEnchantment || c.isPlaneswalker ? 'enter the battlefield' : 'resolve';
  }
  stackPanel() {
    const g = this.game, st = g.stack || []; if (!st.length) return '';
    const rows = [...st].reverse().map((o, i) => {
      const can = this.mode && this.mode.spells && this.validSpellTarget(o);
      const targeted = st.some(x => x.target && x.target.spell === o);
      return `<div class="si ${i === 0 ? 'top' : ''} ${can ? 'tgt' : ''} ${targeted ? 'hit' : ''}" data-sid="${o.id}" data-uid="${o.card.uid}">
        <div class="si-n">${st.length - i}</div>
        <div class="si-img">${o.card.img ? `<img src="${esc(o.card.img)}" alt="">` : ''}</div>
        <div class="si-t"><b>${esc(o.card.name)}</b><small>${esc(short(o.caster.name))} · ${esc(this.stackVerb(o))}</small>${i === 0 ? '<i>resolves next</i>' : ''}${g.isUncounterable(o) ? '<i class="unc">can\'t be countered</i>' : ''}</div></div>`;
    }).join('');
    return `<div class="stkp"><div class="stkh">Stack <small>${st.length} item${st.length > 1 ? 's' : ''} · top resolves first</small></div>${rows}</div>`;
  }
  /** arrows from each stack item to what it targets (drawn after every render) */
  drawArrows() {
    const g = this.game; const old = this.board.querySelector('svg.arrows'); if (old) old.remove();
    if (!g || !g.stack || !g.stack.length) return;
    const host = this.board.getBoundingClientRect(); const lines = [];
    for (const o of g.stack) {
      const t = o.target; if (!t) continue;
      const from = this.board.querySelector(`[data-sid="${o.id}"]`); if (!from) continue;
      const to = t.spell ? this.board.querySelector(`[data-sid="${t.spell.id}"]`) : t.card ? this.board.querySelector(`[data-pid="${t.id}"]`) : this.board.querySelector(`[data-life="${t.i}"]`);
      if (!to) continue;
      const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
      const x1 = a.left - host.left + (t.spell ? 6 : a.width / 2), y1 = a.top - host.top + a.height / 2, x2 = b.left - host.left + (t.spell ? 6 : b.width / 2), y2 = b.top - host.top + b.height / 2;
      const bend = t.spell ? -40 : 0, mx = (x1 + x2) / 2 + bend, my = (y1 + y2) / 2 - (t.spell ? 0 : 30);
      const color = o.card.roles.includes('counter') ? 'var(--accent)' : o.card.redirect ? 'var(--warn)' : 'var(--bad)';
      lines.push(`<path d="M${x1},${y1} Q${mx},${my} ${x2},${y2}" stroke="${color}" fill="none" stroke-width="2.5" stroke-dasharray="6 4" marker-end="url(#ah-${color.replace(/\W/g, '')})"/>`);
    }
    if (!lines.length) return;
    const mk = c => `<marker id="ah-${c.replace(/\W/g, '')}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${c}"/></marker>`;
    this.board.insertAdjacentHTML('beforeend', `<svg class="arrows" width="${host.width}" height="${this.board.scrollHeight}"><defs>${mk('var(--accent)')}${mk('var(--warn)')}${mk('var(--bad)')}</defs>${lines.join('')}</svg>`);
  }
  phaseLabel() { const g = this.game; return { untap: 'untap', main1: 'main phase', combat: 'combat', main2: 'second main', end: 'end step', setup: 'setup' }[g.phase] || g.phase; }
  /** board zoom: CSS zoom on the whole table, so layout reflows like browser zoom (persisted) */
  applyZoom() { const gt = this.el.querySelector('.gt'); if (gt) gt.style.setProperty('--z', String(this.s.zoom || 1)); const b = this.el.querySelector('.gt-bar .zm b'); if (b) b.textContent = Math.round((this.s.zoom || 1) * 100) + '%'; }
  setZoom(z) { z = Math.max(ZOOMS[0], Math.min(ZOOMS[ZOOMS.length - 1], Math.round(z * 100) / 100)); if (z === this.s.zoom) return; this.s.zoom = z; saveSettings(this.s); this.applyZoom(); }
  stepZoom(d) { const i = ZOOMS.findIndex(z => z >= (this.s.zoom || 1) - 0.001); const j = Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? ZOOMS.indexOf(1) : i) + d)); this.setZoom(ZOOMS[j]); }
  render() { try { this._render(); } catch (e) { this.diagPush('render: ' + (e && e.stack || e)); console.error(e); try { if (this.board && !this.board.querySelector('.render-err')) this.board.insertAdjacentHTML('afterbegin', `<div class="render-err" style="background:#5a2020;color:#fff;padding:6px 10px;border-radius:8px;margin:6px">Display error: ${esc(String(e && e.message || e))} — the game continues; please Export log and report it. <button class="chip" data-act="export-log">Export log</button></div>`); } catch (_) {} } }
  _render() {
    const g = this.game, me = this.me, P = this.prompt; if (!g) return;
    const active = g.players[g.active];
    const opps = g.players.filter(p => p !== me);
    const stack = this.stackPanel();
    let mid = stack ? stack : `<div class="idle">${g.winner ? '' : this.busy ? 'Resolving…' : this.myTurn ? (this.touch ? 'Your move · long-press a card to read it' : 'Your move') : esc(short(active.name)) + ' is playing'}</div>`;
    // prompt panel
    let prm = '';
    if (P) {
      const opts = (P.options || []).map(o => o.card || o).map(c => `<div class="opt" data-opt="${c.uid}" data-uid="${c.uid}">${c.img ? `<img src="${esc(big(c.img))}" alt="${esc(c.name)}">` : esc(c.name)}</div>`).join('');
      if (P.kind === 'counter') prm = `<div class="prm"><h4>${esc(short(P.spell.caster.name))} casts ${esc(P.spell.card.name)}${P.spell.target && P.spell.target.spell ? ' targeting ' + esc(P.spell.target.spell.card.name) : ''}. Respond?</h4><div class="opts">${opts}</div><div class="gt-ctl"><button class="chip" data-act="pass">Let it resolve</button><span class="msg">${P.threatened && P.threatened.length ? `It hits ${P.threatened.length} of your permanent${P.threatened.length > 1 ? "s" : ""}. ` : ""}Click a card to respond with it.</span></div></div>`;
      else if (P.kind === 'attack') prm = `<div class="prm"><h4>${esc(short(P.attacker.name))} attacks you with ${P.attacks.length} creature${P.attacks.length > 1 ? 's' : ''} (${P.attacks.reduce((s, a) => s + g.powerOf(P.attacker, a.attacker), 0)} damage). Respond before blocks?</h4><div class="opts">${opts}</div><div class="gt-ctl"><button class="chip" data-act="pass">No response</button></div></div>`;
      else if (P.kind === 'endstep') prm = `<div class="prm"><h4>End of ${esc(short(P.of.name))}'s turn. Cast anything at instant speed?</h4><div class="opts">${opts}</div><div class="gt-ctl"><button class="chip" data-act="pass">Pass</button><span class="msg">Turn this stop off in settings.</span></div></div>`;
      else if (P.kind === 'block') { const incoming = P.attacks.filter(a => !P.map.has(a.attacker) || a.attacker.card.kw.includes('trample')).reduce((s, a) => s + g.powerOf(P.attacker, a.attacker), 0);
        prm = `<div class="prm"><h4>Declare blockers — ${esc(short(P.attacker.name))} is attacking you</h4><div class="gt-ctl"><span class="msg">Click an attacker, then the creatures that block it — or pick your blockers first and then the attacker. Several creatures may block one attacker (menace needs two); click a blocker again to unassign it.${P.atkSel ? ` <b>Blocking ${esc(P.atkSel.card.name)}</b> — click your creatures (greyed ones can't block it).` : ''} Unblocked damage: <b>${incoming}</b> (you're at ${me.life}).${P.warn ? ` <span class="warn">${esc(P.warn)}</span>` : ''}</span><button class="chip pri" data-act="block-go">Confirm blocks</button></div></div>`; }
      else if (P.kind === 'priority' && P.step === 'stack') { const top = P.stack[P.stack.length - 1];
        prm = `<div class="prm"><h4>Respond? Top of the stack: ${esc((top.shownCard && top.caster !== this.me ? top.shownCard : top.card).name)} — ${esc(short(top.caster.name))} wants to ${esc(this.stackVerb(top))}</h4><div class="opts">${P.options.map((o, i) => `<div class="opt popt" data-popt="${i}" data-uid="${o.card.uid}">${o.card.img ? `<img src="${esc(big(o.card.img))}" alt="${esc(o.card.name)}">` : esc(o.card.name)}<span class="olab">${esc(this.optLabel(o))}</span></div>`).join('')}</div><div class="gt-ctl"><button class="chip pri" data-act="pass">Pass <kbd>Space</kbd></button>${P.active !== me ? `<button class="chip" data-act="pass-turn">Pass until my turn <kbd>6</kbd></button>` : top.caster === me && top.trig ? `<button class="chip" data-act="pass-own" title="Don't ask again about my own triggers this turn">Pass my triggers this turn</button>` : ''}<span class="msg hint">Counterspells can target anything on the stack, not just the top: pick one, then click its row.</span></div></div>`; }
      else if (P.kind === 'retarget') prm = `<div class="prm"><h4>${esc(P.card.name)}: choose a new target for ${esc(P.obj.card.name)} (now: ${esc(this.game.targetName(P.obj.target))})</h4><div class="opts">${P.candidates.map((t, i) => t.spell ? `<button class="chip" data-rt="${i}">${esc(t.spell.card.name)} (on the stack)</button>` : t.card ? `<div class="opt" data-rt="${i}" data-uid="${t.card.uid}">${t.card.img ? `<img src="${esc(big(t.card.img))}" alt="${esc(t.card.name)}">` : esc(t.card.name)}<span class="olab">${esc(short((this.game.ownerOf(t) || {}).name || ''))}</span></div>` : `<button class="chip" data-rt="${i}">${esc(short(t.name))} (${t.life} life)</button>`).join('')}</div><div class="gt-ctl"><button class="chip" data-act="rt-keep">Keep the current target</button></div></div>`;
      else if (P.kind === 'priority') { const stepN = { upkeep: 'upkeep', draw: 'draw step', beginCombat: 'beginning of combat', declareAttackers: 'declare attackers', declareBlockers: 'declare blockers', end: 'end step' }[P.step] || P.step; const whose = P.active === me ? 'your' : esc(short(P.active.name)) + "'s";
        let head = `${whose} ${stepN}${P.attacks ? ` (${P.attacks.length} attacker${P.attacks.length > 1 ? 's' : ''})` : ''}`;
        if (P.step === 'declareBlockers') { const bl = P.blocks ? [...P.blocks.entries()] : []; const mine = P.active === me; head = `blockers declared — ${mine ? 'your attack' : esc(short(P.active.name)) + "'s attack"}, ${P.attacks ? P.attacks.length : 0} attacker${P.attacks && P.attacks.length === 1 ? '' : 's'}, ${bl.length ? bl.map(([a, b]) => esc(a.card.name.split(',')[0]) + ' blocked by ' + esc(b.card.name.split(',')[0])).join('; ') : 'none blocked'}. ${mine ? 'Pump or protect before damage?' : 'Respond before damage?'}`; }
        else if (P.step === 'declareAttackers') head = `attackers declared — ${head}. Respond before blocks?`;
        else head += '. Use an effect?';
        prm = `<div class="prm"><h4>Priority — ${head}</h4><div class="opts">${P.options.map((o, i) => `<div class="opt popt" data-popt="${i}" data-uid="${o.card.uid}">${o.card.img ? `<img src="${esc(big(o.card.img))}" alt="${esc(o.card.name)}">` : esc(o.card.name)}<span class="olab">${esc(this.optLabel(o))}</span></div>`).join('')}</div><div class="gt-ctl"><button class="chip pri" data-act="pass">Pass</button>${P.active !== me ? `<button class="chip" data-act="pass-turn">Pass until my turn</button>` : ''}<span class="msg hint">Fetchlands, instants, flash cards, abilities and graveyard spells are used here. Tap a land first to float specific mana.${this.poolHtml() ? ' · ' + this.poolHtml() : ''}</span></div></div>`; }
      else if (P.kind === 'fetch') prm = `<div class="prm"><h4>${esc(P.card.name)}: choose a land to put onto the battlefield</h4><div class="opts">${opts}</div></div>`;
      else if (P.kind === 'etb') { const en = P.enables || []; const thumbs = en.map(c => `<div class="opt" data-uid="${c.uid}" style="cursor:default">${c.img ? `<img src="${esc(big(c.img))}" alt="${esc(c.name)}">` : esc(c.name)}</div>`).join('');
        prm = `<div class="prm"><h4>${esc(P.card.name)}: pay ${P.life} life so it enters untapped? (you're at ${me.life})</h4>${en.length ? `<div class="opts">${thumbs}</div>` : ''}<div class="gt-ctl"><button class="chip ${en.length ? 'pri' : ''}" data-act="etb-pay">Pay ${P.life} life</button><button class="chip ${en.length ? '' : 'pri'}" data-act="etb-tap">Enter tapped</button><span class="msg">${en.length ? `Untapped, it lets you cast ${en.map(c => esc(c.name)).join(', ')} this turn.` : `The extra mana doesn't make anything castable ${this.game.players[this.game.active] === me ? 'this turn' : 'right now'}; it untaps on your turn anyway.`}</span></div></div>`; }
      else if (P.kind === 'unless' && P.tax) prm = `<div class="prm"><h4>${esc(P.why)}</h4><div class="gt-ctl"><button class="chip pri" data-act="unless-pay">Pay {${P.n}}</button><button class="chip" data-act="unless-no">Don't pay</button><span class="msg">${g.availableMana(me)} mana open.</span></div></div>`;
      else if (P.kind === 'payopt') { const nm = { evoke: 'Evoke', dash: 'Dash', bestow: 'Bestow', life: 'Pay life instead', cheap: 'Alternative cost', sacCreature: 'Sacrifice a creature instead', pitch: 'Exile a card instead', faceDown: P.card.morph && P.card.morph.kind === 'disguise' ? 'Cast face down (disguise, ward 2)' : 'Cast face down as a 2/2', blitz: 'Blitz', adventure: P.card.adventure ? (P.card.adventure.kind === 'omen' ? 'Omen: ' : 'Adventure: ') + P.card.adventure.spell.name : 'Adventure', mdfc: P.card.mdfcBack ? 'Cast the back face: ' + P.card.mdfcBack.name + ' ' + (P.card.mdfcBack.manaCost || '') : 'Back face', webSling: 'Web-slinging (return a tapped creature)', freerun: 'Freerunning', mutate: 'Mutate', awaken: 'Awaken', warp: 'Warp' }; prm = `<div class="prm"><h4>${esc(P.card.name)}: how do you want to pay?</h4><div class="gt-ctl">${P.normal ? `<button class="chip pri" data-act="pay-normal">Normal cost ${esc(P.card.manaCost || '')}</button>` : ''}${P.alts.map((a, i) => `<button class="chip" data-act="pay-alt" data-i="${i}">${a.kind === 'phy' ? 'Pay ' + a.life + ' life for ' + a.phyPaid.map(c => '{' + c + '/P}').join('') + (a.cost.total ? ' + {' + a.cost.total + '} mana' : '') : esc(nm[a.kind] || a.kind) + (a.cost && a.cost.total ? ' {' + a.cost.total + '}' : '') + (a.life ? ' (' + a.life + ' life)' : '')}</button>`).join('')}<button class="chip" data-act="pay-cancel">Cancel</button></div></div>`; }
      else if (P.kind === 'num') prm = `<div class="prm"><h4>${esc(P.card.name)}: ${esc(P.question)}</h4><div class="gt-ctl">${Array.from({ length: P.max - P.min + 1 }, (_, i) => P.min + i).map(n => `<button class="chip ${n === P.max ? 'pri' : ''}" data-act="num-pick" data-n="${n}">${n}</button>`).join('')}${P.cancel ? '<button class="chip" data-act="num-cancel">Cancel</button>' : ''}</div></div>`;
      else if (P.kind === 'modes') prm = `<div class="prm"><h4>${esc(P.card.name)}: choose ${P.min === P.max ? P.max : P.min + '–' + P.max} mode${P.max > 1 ? 's' : ''}${P.modes.some(m => m.cost) ? ' (each adds its cost)' : ''}</h4><div class="opts">${P.modes.map((m, i) => `<button class="chip ${P.sel.includes(m.card) ? 'pri' : ''}" data-act="mode-tog" data-i="${i}" style="text-align:left;white-space:normal">${P.sel.includes(m.card) ? '✓ ' : ''}${m.cost && m.cost.total ? '{' + m.cost.total + '} ' : ''}${esc(m.text.charAt(0).toUpperCase() + m.text.slice(1))}</button>`).join('')}</div><div class="gt-ctl"><button class="chip pri" data-act="modes-go" ${P.sel.length >= P.min ? '' : 'disabled'}>Done (${P.sel.length}/${P.max})</button></div></div>`;
      else if (P.kind === 'unless') prm = `<div class="prm"><h4>${esc(P.counter.name)} will counter your ${esc(P.spell.card.name)} unless you pay {${P.n}}.</h4><div class="gt-ctl"><button class="chip pri" data-act="unless-pay">Pay {${P.n}}</button><button class="chip" data-act="unless-no">Let it be countered</button><span class="msg">${g.availableMana(me)} mana open.</span></div></div>`;
      else if (P.kind === 'alt') prm = `<div class="prm"><h4>Cast ${esc(P.card.name)}: ${P.canMana ? 'pay its mana cost, or ' : ''}exile a blue card from your hand and pay 1 life (click the card to exile)</h4><div class="opts">${opts}</div><div class="gt-ctl">${P.canMana ? `<button class="chip pri" data-act="alt-mana">Pay mana</button>` : ''}<button class="chip" data-act="alt-cancel">Cancel</button></div></div>`;
      else if (P.kind === 'search') {
        const dest = { hand: 'put into your hand', graveyard: 'put into your graveyard', top: 'put on top of your library', battlefield: 'put onto the battlefield', reanimate: 'return to the battlefield', gyhand: 'return from your graveyard to your hand', land: 'put into your hand', scry: 'put on the bottom (the rest stay on top)', surveil: 'put into your graveyard (the rest stay on top)', damage: 'deal damage to', destroy: 'destroy', counters: 'get the counters', dig: 'put into your hand (the rest go to your graveyard)', handtop: 'put on top of your library', sylvan: 'put back on top of your library (you pay 4 life for each of the two you don’t put back; first chosen goes on top)', handbottom: 'put on the bottom of your library', proliferate: 'give another counter of each kind (any number — yours or opponents’)', sacrifice: 'sacrifice', equip: 'equip', copy: 'copy', freecast: 'cast for free', imprint: 'exile (imprint)', keep: 'keep', tap: 'tap', bottom: 'put on the bottom', unblockable: "make unblockable", bounce: 'return to hand', exile: 'exile', target: 'target', modes: 'choose', enchant: 'enchant', flicker: 'exile and return', bounceLand: 'return to your hand', top: 'put on top of your library' }[P.dest] || P.dest;
        const fromLib = ['hand', 'graveyard', 'top', 'battlefield', 'land'].includes(P.dest), peek = P.dest === 'scry' || P.dest === 'surveil';
        const list = [...P.pool].sort((a, b) => a.name.localeCompare(b.name));
        const ordSel = P.dest === 'sylvan'; // sylvan: the SELECTED cards go back on top, in the chosen order
        if ((peek || ordSel) && !P.order) P.order = P.pool.slice();
        const keptOrd = peek ? P.order.filter(c => !P.sel.includes(c)) : ordSel ? P.sel.slice() : []; // sylvan: selection order = order on top
        const seen = new Set(); const uniq = (peek ? keptOrd.concat(P.order.filter(c => P.sel.includes(c))) : ordSel ? keptOrd.concat(P.pool.filter(c => !P.sel.includes(c))) : list).filter(c => P.n > 1 || !fromLib || (!seen.has(c.name) && seen.add(c.name)));
        const grid = uniq.map(c => { const ki = peek || ordSel ? keptOrd.indexOf(c) : -1; return `<div class="sopt ${P.sel.includes(c) ? 'sel' : ''}" data-opt="${c.uid}" data-uid="${c.uid}" data-name="${esc(c.name.toLowerCase())}">${c.img ? `<img src="${esc(c.img)}" alt="${esc(c.name)}" loading="lazy">` : `<span>${esc(c.name)}</span>`}${P.owner && P.owner.get(c) ? `<i class="own">${esc(short(P.owner.get(c).name).split(',')[0].slice(0, 10))}</i>` : ''}${ki >= 0 ? `<i class="ord" title="Position from the top after this resolves">${ki === 0 ? 'TOP' : (ki + 1) + (['st', 'nd', 'rd'][ki] || 'th')}</i>${keptOrd.length > 1 ? `<span class="ordbtns">${ki > 0 ? `<button class="obtn" data-act="ord-up" data-uid="${c.uid}" title="Move up (closer to the top)">◀</button>` : ''}${ki < keptOrd.length - 1 ? `<button class="obtn" data-act="ord-down" data-uid="${c.uid}" title="Move down">▶</button>` : ''}</span>` : ''}` : ''}</div>`; }).join(''); // b13: scry/surveil — kept cards show their order from the top and can be rearranged
        prm = `<div class="prm"><h4>${esc(P.card.name)}: choose ${P.n > 1 ? 'up to ' + P.n + ' cards' : 'a card'} to ${dest}${fromLib ? ` (${P.pool.length} match${P.pool.length === 1 ? '' : 'es'} in your library)` : ''}</h4>
          <input class="sfind" placeholder="Filter by name…" oninput="GoldfishUI.current.filterSearch(this.value)" autocomplete="off">
          <div class="sgrid">${grid}</div>
          <div class="gt-ctl">${P.dest === 'sylvan' ? `<button class="chip pri" data-act="search-go">${P.sel.length >= P.n ? `Put ${P.sel.length} back — pay 0 life` : `Put ${P.sel.length} back — pay ${4 * (P.n - P.sel.length)} life`}</button>` : ''}${!peek && P.n === 1 && this.touch ? `<button class="chip pri" data-act="search-go" ${P.sel.length ? '' : 'disabled'}>${P.sel.length ? 'Choose ' + esc(short(P.sel[0].name)) : 'Tap a card, then confirm'}</button>` : ''}${peek ? `<button class="chip pri" data-act="search-go">${P.sel.length ? `Done — ${P.sel.length} to the ${P.dest === 'scry' ? 'bottom' : 'graveyard'}, rest stay on top` : `Keep ${P.pool.length === 1 ? 'it' : 'all'} on top`}</button>` : P.n > 1 && P.dest !== 'sylvan' ? `<button class="chip pri" data-act="search-go">Done (${P.sel.length}/${P.n})</button>` : ''}${fromLib ? `<button class="chip" data-act="search-none">Find nothing</button>` : peek || P.must ? '' : `<button class="chip" data-act="search-none">Skip</button>`}<span class="msg">Hover a card to read it${P.n > 1 || peek ? '; click to select or unselect' : '; click to choose'}.</span></div></div>`; }
      else if (P.kind === 'may') prm = `<div class="prm"><h4>${esc(P.card.name)}: ${esc(P.question || 'use this optional trigger?')}</h4><div class="gt-ctl"><button class="chip pri" data-act="may-yes">Yes</button><button class="chip" data-act="may-no">No</button></div></div>`;
      else if (P.kind === 'choice') prm = `<div class="prm"><h4>${esc(P.question || (P.card ? P.card.name + ': choose' : 'Choose'))}</h4><div class="gt-ctl">${(P.options || []).map((o, i) => `<button class="chip pri" data-act="pick-choice" data-i="${i}">${esc(String(o))}</button>`).join('')}${P.list ? `<input class="sfind" id="choice-free" list="choice-list" placeholder="Search every type in your deck…" autocomplete="off" onkeydown="if(event.key==='Enter'&&this.value.trim())GoldfishUI.current.prompt.res(this.value.trim())"><datalist id="choice-list">${P.list.map(o => `<option value="${esc(String(o))}">`).join('')}</datalist><button class="chip" data-act="choice-go">Choose</button>` : P.free ? `<input class="sfind" id="choice-free" placeholder="Other…" autocomplete="off" onkeydown="if(event.key==='Enter'&&this.value.trim())GoldfishUI.current.prompt.res(this.value.trim())">` : ''}</div>${P.list ? `<div class="note">Tap a common type, or type/search any of the ${P.list.length} creature types in this deck (any other name works too).</div>` : ''}</div>`;
      else if (P.kind === 'player') prm = `<div class="prm"><h4>${esc(P.why)}</h4><div class="gt-ctl">${P.players.map(q => `<button class="chip ${q === me ? '' : 'pri'}" data-act="pick-player" data-p="${q.i}">${esc(short(q.name))} (${q.graveyard.length} card${q.graveyard.length === 1 ? '' : 's'}${q.graveyard.filter(c => c.isCreature).length ? ', ' + q.graveyard.filter(c => c.isCreature).length + ' creatures' : ''})</button>`).join('')}</div></div>`;
      else if (P.kind === 'discard') prm = `<div class="prm"><h4>Discard down to 7: click a card in your hand.</h4></div>`;
      else if (P.kind === 'mull') { const lands = me.hand.filter(c => c.isLand).length; prm = `<div class="prm"><h4>Opening hand: ${me.hand.length} cards, ${lands} land${lands === 1 ? '' : 's'}${P.n ? ` — you'll bottom ${P.n}` : ''}</h4>${P.confirm ? `<div class="gt-ctl"><span class="msg">Shuffle this hand away and draw ${7} new cards? You'll put ${P.n + 1} on the bottom.</span><button class="chip warn" data-act="mull-yes">Yes, mulligan</button><button class="chip pri" data-act="mull-back">Back to this hand</button></div>` : `<div class="gt-ctl"><button class="chip pri" data-act="keep">Keep</button><button class="chip" data-act="mull">Mulligan</button></div>`}</div>`; }
      else if (P.kind === 'mull-bottom') prm = `<div class="prm"><h4>Choose ${P.n} card${P.n > 1 ? 's' : ''} to put on the bottom (${P.sel.length}/${P.n})</h4><div class="gt-ctl"><button class="chip pri" data-act="bottom-go" ${P.sel.length === P.n ? '' : 'disabled'}>Done</button><button class="chip" data-act="bottom-back">Back</button><span class="msg">Click a selected card again to unselect it.</span></div></div>`;
    }
    // controls
    let ctl = '';
    if (this.mode && this.mode.kind === 'abil') ctl = `<div class="gt-ctl"><span class="msg"><b>${esc(this.mode.perm.card.name)}</b>:</span>${this.mode.opts.map((o, i) => `<button class="chip" data-act="abil-pick" data-i="${i}">${esc(this.optLabel(o))}</button>`).join('')}<button class="chip" data-act="cancel">Cancel</button></div>`;
    else if (this.mode && this.mode.kind === 'mana') ctl = `<div class="gt-ctl"><span class="msg">Tap <b>${esc(this.mode.perm.card.name)}</b> for:</span>${this.mode.colors.map(c => `<button class="chip" data-act="tap-col" data-c="${c}">{${c}}</button>`).join('')}<button class="chip" data-act="cancel">Cancel</button></div>`;
    else if (this.mode && this.mode.kind === 'target') ctl = `<div class="gt-ctl"><span class="msg">Choose a target for <b>${esc(this.mode.card.name)}</b>${this.mode.spells ? ' — tap a spell:' : this.mode.players ? ' (a permanent or an opponent\'s life total)' : ' — click a highlighted creature (opponents\' are in the seats above)'}.</span>${this.mode.spells ? (g.stack || []).filter(o => this.validSpellTarget(o)).map(o => `<button class="chip tgtchip" data-sid="${o.id}" data-uid="${o.card.uid}">${esc(o.card.name)} <small>· ${esc(short(o.caster.name))}</small></button>`).join('') : ''}<button class="chip" data-act="cancel">Cancel</button></div>`; // b13: targetable spells are offered as chips next to the prompt (the stack panel can be off-screen on phones)
    else if (this.mode && this.mode.kind === 'attack') ctl = `<div class="gt-ctl"><span class="msg">Attack:</span>${g.opponentsOf(me).map((q, qi) => `<button class="chip akc ak${qi}" data-act="def" data-p="${q.i}" aria-pressed="${this.mode.def === q}">${esc(short(q.name))} (${q.life})</button>` + q.battlefield.filter(b => b.card.isPlaneswalker).map(b => `<button class="chip akc ak${qi}" data-act="defpw" data-pid="${b.id}" aria-pressed="${!!(this.mode.def && this.mode.def.pw === b)}">${esc(short(b.card.name))} (${b.loyalty})</button>`).join('')).join('')}${this.akSummary().length ? `<span class="atk-sum">${this.akSummary().map(([k, e]) => `<span class="ak${e.i}"><b>${e.n}</b>→${esc(short(k).slice(0, 8))}</span>`).join(' · ')}</span>` : ''}<button class="chip" data-act="atk-all" title="Send every creature that can attack at the selected target">All creatures → ${esc(short(this.mode.def && this.mode.def.pw ? this.mode.def.pw.card.name : (this.mode.def || {}).name || '').split(',')[0])}</button><button class="chip pri" data-act="atk-go" ${this.mode.map.size ? '' : 'disabled'}>Attack with ${this.mode.map.size}</button><button class="chip" data-act="cancel">Cancel</button><span class="msg">${new Set([...this.mode.map.values()].map(d => d && d.pw ? d.pw : d)).size > 1 ? 'Split attack: pick a target, then click the creatures that should go there (click again to move one).' : 'Click your creatures to toggle them. To split your attack: pick another target, then click the creatures that should go there.'}</span></div>`;
    else if (this.myTurn && !P) {
      const combatPhase = this.turnPhase === 'main1' || this.turnPhase === 'combat2';
      const canAtk = combatPhase && me.battlefield.some(b => g.canAttackWith(me, b));
      const fetchHint = me.battlefield.some(b => b.card.fetch && g.canActivate(me, b)) ? (this.touch ? ' · tap a glowing fetchland to crack it' : ' · click a glowing fetchland to crack it') : '';
      this.mainOpts = this.busy ? [] : [...g.gyCastOptions(me), ...g.abilityOptions(me)];
      const abil = this.mainOpts.length ? `<div class="gt-ctl abil-row">${this.mobile ? '' : '<span class="msg">Abilities:</span>'}${this.mainOpts.map((o, i) => `<button class="chip abil" data-act="abil" data-i="${i}" data-uid="${o.card.uid}">${esc(short(o.card.name))} · ${esc(this.optLabel(o))}${o.card.abilities && o.ab && o.ab.zone !== 'battlefield' ? ` <small>(${o.ab.zone})</small>` : o.zone === 'gy' ? ' <small>(graveyard)</small>' : ''}</button>`).join('')}</div>` : '';
      const cmdChips = me.command.filter(c => g.castMode(me, c, 'cmd')).map(c => `<button class="chip pri" data-act="cast-cmd" data-cmd="${c.uid}" ${this.busy ? 'disabled' : ''} title="cast your commander from the command zone${me.cmdTax ? ' (tax ' + me.cmdTax + ')' : ''}">Cast ${esc(short(c.name).split(',')[0].slice(0, 14))}${me.cmdTax ? ' +' + me.cmdTax : ''}</button>`).join('');
      ctl = this.comboBar() + abil + `<div class="gt-ctl"><span class="msg">${me.infMana && me.infMana.turn === g.turn ? '∞' : g.availableMana(me)} mana${this.mobile ? '' : ' open'}${this.poolHtml() ? ' · ' + this.poolHtml() : ''} · land drop ${me.landsThisTurn ? 'used' : 'available'}${fetchHint}${this.mobile ? '' : ' · <span class="note">tap a land to float mana</span>'}</span>${cmdChips}${combatPhase ? `<button class="chip" data-act="attack" ${canAtk && !this.busy ? '' : 'disabled'}>Attack</button>` : ''}${this.turnPhase === 'main1' ? `<button class="chip" data-act="to-main2" ${this.busy ? 'disabled' : ''} title="Skip combat but keep playing">Skip combat</button>` : ''}${(() => { const u = (this.undoStack || [])[this.undoStack.length - 1]; return u ? `<button class="chip" data-act="undo" ${this.busy || u.why ? 'disabled' : ''} title="${esc(u.why ? "Can't undo: " + u.why : 'Undo: ' + u.label + ' (Z)')}">↶ Undo</button>` : ''; })()}<button class="chip pri" data-act="end" ${this.busy ? 'disabled' : ''}>End turn</button></div>${(() => { const u = (this.undoStack || [])[this.undoStack.length - 1]; return u && u.why ? `<div class="note" style="margin-top:4px">Can't undo ${esc(u.label)}: ${esc(u.why)}.</div>` : ''; })()}`; }
    // hand
    let handBar = '';
    if (me) {
      const sel = P && P.kind === 'mull-bottom' ? P.sel : [];
      const hand = me.hand.map(c => { const can = (this.myTurn && !this.busy && !P && (c.isLand ? me.landsThisTurn < g.landLimit(me) : (!c.roles.includes('counter') && g.castMode(me, c, 'hand')) || (c.backLand && me.landsThisTurn < g.landLimit(me)))) || (P && (P.kind === 'discard' || P.kind === 'mull-bottom')); return `<div class="hcd ${can ? 'can' : ''} ${sel.includes(c) || this.handSel === c.uid ? 'sel' : ''}" data-hand="${c.uid}" data-uid="${c.uid}" style="position:relative">${c.img ? `<img src="${esc(big(c.img))}" alt="${esc(c.name)}">` : `<div class="gc tok" style="width:100%;height:100%">${esc(c.name)}</div>`}${c.impulse ? '<span class="hbadge">exiled · play it</span>' : c.backLand ? '<span class="hbadge">spell / land</span>' : ''}</div>`; }).join('');
      const extra = []; const topC = me.library[me.library.length - 1];
      if (topC && g.topPerm(me, topC)) extra.push([topC, 'top', 'top of library']);
      for (const e of me.exileCast || []) extra.push([e.card, 'exile', e.free ? 'exile · free' : 'exile']);
      if (me.battlefield.some(b => b.card.statics && b.card.statics.landsFromGy)) for (const c of me.graveyard.filter(c => c.isLand)) extra.push([c, 'gy', 'graveyard land']);
      const extraHtml = extra.map(([c, z, lbl]) => { const can = this.myTurn && !this.busy && !P && (c.isLand ? me.landsThisTurn < g.landLimit(me) : !!g.castMode(me, c, z)); return `<div class="hcd ${can ? 'can' : ''}" style="position:relative;opacity:.92" data-act="xcast" data-zone="${z}" data-uid="${c.uid}">${c.img ? `<img src="${esc(big(c.img))}" alt="${esc(c.name)}">` : `<div class="gc tok" style="width:100%;height:100%">${esc(c.name)}</div>`}<span class="hbadge">${esc(lbl)}</span></div>`; }).join('');
      const cmdUnused = me.command.map(c => { const can = this.myTurn && !this.busy && !P && g.castMode(me, c, 'cmd'); return `<div class="hcd ${can ? 'can' : ''}" data-cmd="${c.uid}" data-uid="${c.uid}" title="Commander${me.cmdTax ? ' (tax ' + me.cmdTax + ')' : ''}">${c.img ? `<img src="${esc(big(c.img))}" alt="${esc(c.name)}">` : esc(c.name)}</div>`; }).join('');
      handBar = `${this.mobile ? `<button class="hand-tog" data-act="hand-tog">Hand · ${me.hand.length} ${this.handHidden ? '▴ show' : '▾ hide'}</button>` : ''}${this.mobile && this.handHidden ? '' : `<div class="gt-hand">${hand}${extraHtml}</div>`}`;
      const hs = this.handSel != null && me.hand.find(c => c.uid === this.handSel);
      if (hs && this.myTurn && !P) { const ok = hs.isLand ? me.landsThisTurn < 1 : !hs.roles.includes('counter') && g.castMode(me, hs, 'hand');
        handBar = `<div class="gt-ctl hsel"><b>${esc(hs.name)}</b><button class="chip pri" data-act="hand-go" ${ok && !this.busy ? '' : 'disabled'}>${hs.isLand ? 'Play land' : 'Cast'}</button><button class="chip" data-act="hand-info">Details</button><button class="chip" data-act="hand-x">Cancel</button>${ok ? '' : `<span class="msg">${hs.isLand ? 'Land drop used' : hs.roles.includes('counter') ? 'Counterspells are cast in response' : 'Not enough mana'}</span>`}</div>` + handBar; }
      else if (!hs) this.handSel = null;
    }
    // overlays
    let over = '';
    if (g.winner && this.ended) { const place = me ? (g.winner === me ? 'You won' : 'You lost') : ''; over = `<div class="over"><div class="box"><h3>${esc(short(g.winner.name))} wins</h3><p class="note">${esc(g.winner.deckName)} · round ${g.round}${place ? ' · ' + place : ''}${this.replay ? ' · end of replay' : ''}</p><div class="gt-ctl" style="justify-content:center">${this.replay ? '<button class="chip pri" data-act="leave">Back to replays</button>' : '<button class="chip pri" data-act="rematch">Rematch</button><button class="chip" data-act="setup">New setup</button>'}<button class="chip" data-act="export-log" title="Download the full game log as a text file (also copied to the clipboard)">Export log</button>${this.rec ? '<button class="chip" data-act="export-rec" title="Download this game as a replayable recording (.json)">Download recording</button>' : ''}</div>${this.replay ? '' : '<p class="note">This game was saved to Replays.</p>'}</div></div>`; }
    const zoneBox = this.zoneView && g.players.includes(this.zoneView.p) ? (() => { const zp = this.zoneView.p, zn = this.zoneView.z, cards = zp[zn] || []; const held = zn === 'exile' ? new Map(g.players.flatMap(q => q.battlefield).flatMap(b => (b.held || []).map(c => [c, b.card.name]))) : null;
      return `<div class="set zone"><div class="box"><div class="sethead"><h3 style="margin:0">${esc(short(zp.name))} — ${zn === 'exile' ? 'exile' : 'graveyard'} (${cards.length})</h3><div class="gt-ctl"><button class="chip" data-act="zone" data-p="${zp.i}" data-z="${zn === 'exile' ? 'graveyard' : 'exile'}">Show ${zn === 'exile' ? 'graveyard' : 'exile'}</button><button class="chip pri" data-act="close-zone">Done</button></div></div>${cards.length ? `<div class="sgrid">${[...cards].reverse().map(c => { const xc = zn === 'exile' && me && (me.exileCast || []).find(e => e.card === c); const can = !!(xc && this.myTurn && !this.busy && !P && (c.isLand ? me.landsThisTurn < g.landLimit(me) : g.castMode(me, c, 'exile'))); return `<div class="sopt ${can ? 'can' : ''}" data-uid="${c.uid}" ${can ? `data-act="xcast" data-zone="exile"` : ''} title="${esc(c.name)}${xc ? (can ? ' — click to cast' : ' — you may cast this (not right now)') : ''}">${c.img ? `<img src="${esc(c.img)}" alt="${esc(c.name)}" loading="lazy">` : `<span>${esc(c.name)}</span>`}${held && held.get(c) ? `<i class="own">${esc(held.get(c).split(',')[0].slice(0, 12))}</i>` : xc ? `<i class="own">${can ? 'cast' + (xc.free ? ' · free' : '') : 'yours to cast'}</i>` : ''}</div>`; }).join('')}</div><p class="msg">Newest first. Hover or long-press a card to read it.${zn === 'exile' && me && (me.exileCast || []).some(e => cards.includes(e.card)) ? ' Cards you may cast are marked — click one here or in your hand row.' : ''}</p>` : `<p class="msg">Nothing here.</p>`}</div></div>`; })() : '';
    const settings = this.showSettings ? `<div class="set"><div class="box"><div class="sethead"><h3 style="margin:0">Table settings</h3><button class="chip pri" data-act="close-settings">Done</button></div>
      <label>Animations <input type="checkbox" id="st-anim" ${this.s.anim ? 'checked' : ''}></label>
      <label>Animation speed <select id="st-speed"><option value="normal" ${this.s.speed === 'normal' ? 'selected' : ''}>Normal</option><option value="fast" ${this.s.speed === 'fast' ? 'selected' : ''}>Fast</option></select></label>
      <label>Sound effects <input type="checkbox" id="st-sound" ${this.s.sound ? 'checked' : ''}></label>
      <label>Volume <input type="range" id="st-vol" min="0" max="1" step="0.05" value="${this.s.volume}"></label>
      <label>Sound style <select id="st-sfx">${[['classic', 'Classic'], ['arcane', 'Arcane (soft, layered)'], ['retro', 'Retro 8-bit'], ['cinematic', 'Cinematic (deep)']].map(([k, l]) => `<option value="${k}" ${(this.s.sfxStyle || 'classic') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Music <select id="st-music">${[['off', 'Off'], ['ambient', 'Ambient (slow pads)'], ['tavern', 'Tavern (plucked)'], ['battle', 'Battle (driving)']].map(([k, l]) => `<option value="${k}" ${(this.s.music || 'off') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Music volume <input type="range" id="st-mvol" min="0" max="1" step="0.05" value="${this.s.musicVol ?? 0.6}"></label>
      <label>Infinite combos <select id="st-combos">${[['on', 'Offer "Go infinite" / "Win with combo" when assembled'], ['off', 'Off (play every loop by hand)']].map(([k, l]) => `<option value="${k}" ${(this.s.combos || 'on') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Visual effects <select id="st-fx">${[['normal', 'Normal'], ['arena', 'Arena (bursts, shards, lightning, confetti)']].map(([k, l]) => `<option value="${k}" ${(this.s.fx || 'normal') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Board zoom <input type="range" id="st-zoom" min="0.75" max="2" step="0.05" value="${this.s.zoom || 1}"> <b id="st-zoom-v">${Math.round((this.s.zoom || 1) * 100)}%</b></label>
      <label>Priority stops <select id="st-stop"><option value="smart" ${this.s.stops === 'smart' ? 'selected' : ''}>Smart</option><option value="all" ${this.s.stops === 'all' ? 'selected' : ''}>Full control</option><option value="minimal" ${this.s.stops === 'minimal' ? 'selected' : ''}>Minimal</option></select></label>
      <p class="note" style="margin:0">Smart stops at opponents' end steps, combats you're in, and the end step before your turn (for fetchlands). Full control stops at every step where you have a legal play. Minimal only stops for counterspells, attacks and blocks. Steps where you have nothing legal are always skipped.</p>
      <p class="note" style="margin:0">Sounds and music are generated in your browser with the Web Audio API — nothing is downloaded and nothing needs a licence. Music is procedural: a key and progression are picked each game.</p>
      <div class="gt-ctl" style="justify-content:space-between"><button class="chip" data-act="export-log">Export log</button>${this.rec ? '<button class="chip" data-act="export-rec">Download recording</button>' : ''}<button class="chip pri" data-act="close-settings">Done</button></div></div></div>` : '';
    this.board.innerHTML = `
      <div class="gt-bar"><span class="ph">Round <b>${g.round}</b> · <b>${esc(short(active.name))}</b></span><span class="steps">${[['upkeep', 'Upkeep'], ['draw', 'Draw'], ['main1', 'Main'], ['combat', 'Combat'], ['main2', 'Main 2'], ['end', 'End']].map(([k, l]) => `<span class="${(g.phase === k || (k === 'combat' && g.phase === 'combat')) ? 'on' : ''}">${l}</span>`).join('')}</span>
        <button class="chip" data-act="ff" aria-pressed="${this.ff}" title="Skip animations until your next decision">${this.mobile ? (this.ff ? 'Skipping…' : 'Skip ▸▸') : this.ff ? 'Fast-forwarding' : 'Fast-forward'}</button>
        <span class="zm" title="Board zoom (keys: - / + / 0)"><button class="chip" data-act="zoom-out" aria-label="Zoom out">−</button><b>${Math.round((this.s.zoom || 1) * 100)}%</b><button class="chip" data-act="zoom-in" aria-label="Zoom in">+</button></span>
        <button class="chip" data-act="export-log" title="Download the full game log so far">Export log</button><button class="chip" data-act="settings">Settings</button><button class="chip" data-act="leave">${this.mobile ? 'Leave' : 'Leave game'}</button></div>
      ${this.rpBar()}
      <div class="gt-opps-wrap ${this.oppsCollapsed ? 'collapsed' : ''}"><div class="gt-opps" id="gtopps">${opps.filter(p => !(this.mobile && p.dead && !(this.peekDead && this.peekDead.has(p.i)))).map(p => this.seat(p)).join('')}</div>${this.mobile ? `<div class="opp-pager">${opps.map(p => `<button class="op ${p.dead ? 'dead' : ''} ${g.players[g.active] === p ? 'act' : ''}" data-act="goseat" data-seat="${p.i}" title="${p.dead ? 'defeated — tap to show or hide their board' : ''}"><span class="av" style="background-image:url('${esc(p.art || '')}')"></span>${esc(short(p.name).split(',')[0].slice(0, 9))} <b>${p.dead ? '✕' : p.life}</b></button>`).join('')}<button class="op" data-act="collapse-opps" title="show / hide opponents' boards">${this.oppsCollapsed ? '▾ boards' : '▴ hide'}</button></div>` : ''}</div>
      <div class="gt-mid">${mid}</div>
      ${this.mobile ? '' : prm}
      ${me ? this.seat(me) : ''}
      ${this.mobile ? `<div class="gt-dock">${prm}${ctl}${handBar}</div>` : ctl + handBar}
      ${over}${zoneBox}${settings}${this.sheetHtml ? `<div class="sheet"><div class="box"><button class="chip" data-act="sheet-x" style="justify-self:end">Close</button>${this.sheetHtml}</div></div>` : ''}`;
    requestAnimationFrame(() => this.drawArrows());
    if (this.showSettings) {
      const bind = (id, k, f = v => v) => { const el = this.board.querySelector('#' + id); el.onchange = el.oninput = () => { this.s[k] = f(el.type === 'checkbox' ? el.checked : el.value); saveSettings(this.s); if (k === 'volume') this.sfx.vol(); }; };
      bind('st-anim', 'anim'); bind('st-speed', 'speed'); bind('st-sound', 'sound'); bind('st-vol', 'volume', Number); bind('st-stop', 'stops'); bind('st-fx', 'fx'); bind('st-combos', 'combos');
      { const el = this.board.querySelector('#st-sfx'); el.onchange = () => { this.s.sfxStyle = el.value; saveSettings(this.s); this.sfx.play('cast'); }; const mu = this.board.querySelector('#st-music'); mu.onchange = () => { this.s.music = mu.value; saveSettings(this.s); this.sfx.musicStart(); }; const mv = this.board.querySelector('#st-mvol'); mv.oninput = () => { this.s.musicVol = Number(mv.value); this.sfx.musicVol(); }; mv.onchange = () => saveSettings(this.s); }
      { const z = this.board.querySelector('#st-zoom'); z.oninput = () => { this.s.zoom = Number(z.value); this.applyZoom(); const v = this.board.querySelector('#st-zoom-v'); if (v) v.textContent = Math.round(this.s.zoom * 100) + '%'; }; z.onchange = () => saveSettings(this.s); }
    }
  }
  endScreen() { this.ended = true; this.myTurn = false; this.storeRecording(); this.render(); this.clearSave(); window.removeEventListener('beforeunload', this.onUnload); }
  // ---------- saved game (resume after an accidental exit) ----------
  saveGame(g) { if (!g || g.winner || !g.players.some(p => p.human)) return; try { localStorage.setItem('pt-save', JSON.stringify({ at: Date.now(), turn: g.turn + 1, round: g.round, cfg: this.opts.cfg || (this.opts.saved && this.opts.saved.cfg) || null, seats: g.players.map(p => ({ name: p.name, deckName: p.deckName, dead: p.dead, life: p.life })), state: g.serializeState(), rec: this.rec || null })); } catch (e) { console.warn('save failed', e); } }
  clearSave() { try { localStorage.removeItem('pt-save'); } catch (e) {} }
  /** a back swipe or back button asks before leaving a live game */
  guardBack() {
    if (this._guard) return; this._guard = true;
    try { if (location.hash !== '#playtest/game') history.pushState({ ptGame: 1 }, '', '#playtest/game'); } catch (e) {}
    this.onPop = () => { if (!this.game || this.game.winner || this.aborted) return; if (location.hash !== '#playtest/game') { const ok = confirm('Leave the game? What you did this turn is lost; the rest is saved and you can resume it from the Playtest tab.'); if (!ok) { history.pushState({ ptGame: 1 }, '', '#playtest/game'); } else { this.aborted = true; this.sfx.musicStop(); window.removeEventListener('popstate', this.onPop); if (this.opts.onExit) this.opts.onExit(); } } };
    window.addEventListener('popstate', this.onPop);
    window.addEventListener('beforeunload', this.onUnload = e => { if (this.game && !this.game.winner && !this.aborted) { e.preventDefault(); e.returnValue = ''; } });
  }
}

window.GoldfishUI = { start(el, seats, opts) { window.GoldfishUI.retire(); const t = new Table(el, seats, opts); window.GoldfishUI.current = t; t.start(); return t; },
  retire() { const c = window.GoldfishUI.current; if (c && c.el) { try { c.el.removeEventListener('click', c._onClick); c.el.removeEventListener('mouseover', c._onOver); } catch (e) {} } window.GoldfishUI.current = null; },
  /** play back a recording made by this table (rec = parsed .json) */
  replay(el, rec, opts = {}) { const G = window.Goldfish; if (!rec || !rec.moves || !rec.seats) throw new Error('not a recording'); G.uid.set(rec.uidBase); if (G.setPopularity) G.setPopularity(rec.pop || {}); if (G.setCombos) G.setCombos(rec.combos || []); const seats = rec.seats.map(s => ({ name: s.name, deckName: s.deckName, human: s.human, level: s.level, art: s.art, deck: G.buildDeck(s.cards, s.cmd) })); window.GoldfishUI.retire(); const t = new Table(el, seats, { ...opts, replay: rec }); window.GoldfishUI.current = t; t.start(); return t; }, replays: Replays, recEnc, recDec, resume(el, saved, opts) { window.GoldfishUI.retire(); const t = new Table(el, [], { ...opts, saved }); window.GoldfishUI.current = t; t.start(); return t; }, savedGame() { try { const s = JSON.parse(localStorage.getItem('pt-save') || 'null'); return s && s.state ? s : null; } catch (e) { return null; } }, clearSaved() { try { localStorage.removeItem('pt-save'); } catch (e) {} }, loadSettings, saveSettings };
})();
