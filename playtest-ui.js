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
const DEFAULTS = { anim: !matchMedia('(prefers-reduced-motion: reduce)').matches, sound: true, volume: 0.5, speed: 'normal', stops: 'smart' };
function loadSettings() { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('pt-settings') || '{}') }; } catch (e) { return { ...DEFAULTS }; } }
function saveSettings(s) { try { localStorage.setItem('pt-settings', JSON.stringify(s)); } catch (e) {} }

// ---------------- sound (synthesized) ----------------
class Sfx {
  constructor(settings) { this.s = settings; this.ctx = null; }
  init() { if (this.ctx) return; try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination); } catch (e) { this.ctx = null; } }
  vol() { if (this.master) this.master.gain.value = this.s.volume; }
  tone(f, dur, { type = 'sine', gain = 0.3, attack = 0.005, slide = null, delay = 0 } = {}) {
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
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
.gt{--tile-o:56px;--tile-m:76px;--tile-l:44px;--hand:104px;display:grid;gap:10px;color:var(--fg)}
.gt-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:8px 10px}
.gt-bar .ph{font-family:var(--mono);font-size:.82rem;color:var(--muted);flex:1;min-width:200px}
.gt-bar .ph b{color:var(--fg)}
.gt-main{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:12px;align-items:start}
@media (max-width:980px){.gt-main{grid-template-columns:minmax(0,1fr)}.gt-side{order:2}}
.gt-board{display:grid;gap:10px;position:relative;min-width:0}
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
.gc .cnt{position:absolute;left:50%;transform:translateX(-50%);bottom:-6px;font:700 .64rem var(--mono);background:var(--panel);border:1px solid var(--line);padding:0 4px;border-radius:4px;white-space:nowrap}
.gc.lg{width:var(--tile-l)}
.gc.lg.t{transform:none;filter:grayscale(.8) brightness(.6)}
.gc.act{cursor:pointer;box-shadow:0 0 0 2px #d4a63a,0 0 10px #d4a63a;animation:gtgold 1.4s infinite}
@keyframes gtgold{50%{box-shadow:0 0 0 2px #d4a63a,0 0 18px #d4a63a}}
.steps{display:flex;gap:2px;flex-wrap:wrap}
.steps span{font:600 .7rem var(--mono);padding:3px 7px;border-radius:4px;background:var(--bg);color:var(--muted);border:1px solid var(--line)}
.steps span.on{background:var(--accent);color:var(--accent-fg);border-color:var(--accent)}
.gc.tok{display:grid;place-items:center;text-align:center;font-size:.58rem;padding:4px;background:linear-gradient(160deg,var(--soft),var(--panel));border:1px solid var(--line)}
.gt-mid{min-height:84px;display:grid;place-items:center;position:relative;background:radial-gradient(ellipse at center,color-mix(in srgb,var(--accent) 8%,transparent),transparent 70%);border-radius:10px}
.stk{display:flex;align-items:center;justify-content:center;padding-bottom:22px}
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
.hcd.can{cursor:pointer;box-shadow:0 0 0 2px var(--accent),0 0 10px color-mix(in srgb,var(--accent) 60%,transparent)}
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
.float{position:fixed;font:800 1.6rem var(--mono);pointer-events:none;z-index:50;text-shadow:0 2px 8px rgba(0,0,0,.6)}
.ghost{position:fixed;z-index:40;pointer-events:none;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.45);object-fit:cover}
.set{position:fixed;inset:0;background:rgba(0,0,0,.45);display:grid;place-items:center;z-index:60;padding:16px}
.set .box{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px;display:grid;gap:12px;width:min(420px,100%)}
.set label{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:.92rem}
.over{position:absolute;inset:0;display:grid;place-items:center;background:color-mix(in srgb,var(--bg) 70%,transparent);z-index:20;border-radius:10px}
.over .box{background:var(--panel);border:1px solid var(--accent);border-radius:12px;padding:20px;display:grid;gap:10px;text-align:center;max-width:420px}
.over h3{font:700 1.6rem var(--display);margin:0}
.flash{animation:gtflash .6s}
@keyframes gtflash{30%{background:color-mix(in srgb,var(--bad) 25%,var(--panel))}}
`;
function injectCSS() { if (document.getElementById('gt-css')) return; const s = document.createElement('style'); s.id = 'gt-css'; s.textContent = STYLE; document.head.appendChild(s); }

// ---------------- table ----------------
class Table {
  constructor(el, seats, opts = {}) {
    this.el = el; this.seatsDef = seats; this.opts = opts; this.s = loadSettings(); this.sfx = new Sfx(this.s);
    this.stackView = []; this.attacking = new Map(); this.blocking = new Map(); this.prompt = null; this.mode = null; this.ff = false; this.busy = false; this.logLines = [];
  }
  async start() {
    injectCSS(); this.sfx.init();
    this.el.innerHTML = `<div class="gt"><div class="gt-main"><div class="gt-board" id="gtb"></div><aside class="gt-side"><div class="pv" id="gtpv"><div class="ty">Hover a card to read it.</div></div><div class="gl" id="gtlog"></div></aside></div></div>`;
    this.board = this.el.querySelector('#gtb'); this.pv = this.el.querySelector('#gtpv'); this.logEl = this.el.querySelector('#gtlog');
    this.wire();
    const hooks = { emit: e => this.onEvent(e), log: l => this.addLog(l), humanTurn: (p, phase) => this.humanTurn(p, phase), humanRespond: c => this.humanRespond(c), humanBlocks: c => this.humanBlocks(c), humanDiscard: p => this.humanDiscard(p), humanPriority: c => this.humanPriority(c), humanChooseFetch: (p, card, pool, n) => this.humanChooseFetch(p, card, pool, n), humanETB: c => this.ask('etb', c), humanPayUnless: c => this.ask('unless', c), humanAltCost: c => this.ask('alt', c) };
    this.game = new G.Game(this.seatsDef.map(s => ({ ...s, ai: s.human ? null : new G.AI(s.level || 'focused') })), { hooks });
    this.me = this.game.players.find(p => p.human) || null;
    for (const p of this.game.players) if (p.ai) { let t = 0; while (!p.ai.keep(p.hand, t) && t < 3) { this.game.mulligan(p); t++; } if (t) this.game.bottomCards(p, p.ai.bottomChoice(p.hand, t)); }
    if (this.me) await this.mulligan();
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
  addLog(l) { this.logLines.push(l); if (this.logLines.length > 400) this.logLines.shift(); if (this.logEl) { this.logEl.textContent = this.logLines.slice(-200).join('\n'); this.logEl.scrollTop = this.logEl.scrollHeight; } }
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
  // ---------- events from the engine ----------
  async onEvent(e) {
    if (this.aborted) throw new Error('abort');
    const g = this.game, me = this.me, S = n => this.sfx.play(n);
    switch (e.type) {
      case 'turn': if (e.p === me) this.passUntilTurn = false; this.attacking.clear(); this.blocking.clear(); this.render(); S('turn'); await this.banner(e.p === me ? 'Your turn' : short(e.p.name) + "'s turn"); break;
      case 'draw': { this.render(); if (e.p === me) { S('draw'); const cards = [...this.board.querySelectorAll('.gt-hand .hcd')].slice(-e.n); for (const c of cards) this.anim(c, [{ transform: 'translateX(-60px)', opacity: 0 }, { transform: 'none', opacity: 1 }], 300); await this.wait(250); } break; }
      case 'land': { const from = this.srcRect(e.p, e.card); this.render(); S('land'); await this.flyTo(from, this.q(`[data-lg="${e.p.i}:${CSS.escape(e.card.name)}"]`), e.card, { dur: 360 }); await this.wait(e.p === me ? 50 : 250); break; }
      case 'cast': { const from = this.srcRect(e.p, e.card); this.stackView.push({ card: e.card, p: e.p, target: e.target }); this.render(); S(e.depth ? 'counterCast' : 'cast');
        await this.flyTo(from, this.uidEl(e.card.uid), e.card, { dur: 460 }); await this.wait(e.p === me ? 200 : 700); break; }
      case 'countered': { const el = this.uidEl(e.card.uid); S('counter'); await this.anim(el, [{ transform: 'rotate(0) scale(1)', opacity: 1, filter: 'none' }, { transform: 'rotate(-6deg) scale(1.05)', filter: 'brightness(2)', offset: .2 }, { transform: 'rotate(10deg) scale(.4)', opacity: 0, filter: 'grayscale(1)' }], 520); this.dropStack(e.card); this.render(); break; }
      case 'resolve': { const from = this.rect(this.uidEl(e.card.uid)); this.dropStack(e.card); this.render(); S('resolve'); if (e.perm) await this.flyTo(from, this.permEl(e.perm.id), e.card, { dur: 380 }); else await this.wait(150); break; }
      case 'destroy': { const el = this.permEl(e.perm.id); if (!e.quiet) S('destroy'); await this.anim(el, [{ transform: 'scale(1)', opacity: 1, filter: 'none' }, { filter: 'brightness(2) sepia(1) hue-rotate(-40deg)', offset: .3 }, { transform: 'scale(.3) rotate(12deg)', opacity: 0 }], e.quiet ? 260 : 460); break; }
      case 'wipe': { S('wipe'); this.board.querySelectorAll('.gs').forEach(s => s.classList.add('flash')); await this.wait(650); this.board.querySelectorAll('.gs').forEach(s => s.classList.remove('flash')); break; }
      case 'attack': { for (const a of e.assignments) this.attacking.set(a.attacker.id, a.defender.i); this.render(); S('attack');
        await Promise.all(e.assignments.map(a => { const el = this.permEl(a.attacker.id), d = this.seatEl(a.defender); if (!el || !d) return; const r1 = el.getBoundingClientRect(), r2 = d.getBoundingClientRect(); const dx = (r2.left + r2.width / 2 - r1.left - r1.width / 2) * .25, dy = (r2.top + r2.height / 2 - r1.top - r1.height / 2) * .25; return this.anim(el, [{ translate: '0 0' }, { translate: `${dx}px ${dy}px` }, { translate: '0 0' }], 520, 'ease-in-out'); })); break; }
      case 'block': { this.blocking.set(e.blocker.id, e.attacker.id); this.render(); S('block'); await Promise.all([this.anim(this.permEl(e.blocker.id), [{ scale: 1 }, { scale: 1.15 }, { scale: 1 }], 300), this.anim(this.permEl(e.attacker.id), [{ scale: 1 }, { scale: 1.1 }, { scale: 1 }], 300)]); break; }
      case 'hit': { S('hit'); await this.anim(this.seatEl(e.defender), [{ translate: '0 0' }, { translate: '-6px 0' }, { translate: '6px 0' }, { translate: '0 0' }], 260); break; }
      case 'life': { this.render(); if (e.delta > 0) S('gain'); await this.floatText(this.q(`[data-life="${e.p.i}"]`), (e.delta > 0 ? '+' : '') + e.delta, e.delta > 0 ? 'var(--good)' : 'var(--bad)'); break; }
      case 'step': this.render(); break;
      case 'activate': { S('cast'); await this.anim(this.q(`[data-lg="${e.p.i}:${CSS.escape(e.card.name)}"]`), [{ filter: 'none', scale: 1 }, { filter: 'brightness(1.8) sepia(.6)', scale: 1.2 }, { filter: 'none', scale: 1 }], 380); break; }
      case 'combatEnd': this.attacking.clear(); this.blocking.clear(); this.render(); break;
      case 'tokens': { this.render(); S('token'); const tiles = [...(this.seatEl(e.p)?.querySelectorAll('.gs-bf .gc') || [])].slice(-e.n); await Promise.all(tiles.map(t => this.anim(t, [{ scale: 0, opacity: 0 }, { scale: 1.15, opacity: 1 }, { scale: 1 }], 320))); break; }
      case 'dies': this.render(); S(e.p === me ? 'lose' : 'die'); await this.wait(700); if (e.p === me && !g.winner) { this.ff = true; this.mode = null; this.addLog('You are out. Fast-forwarding the rest of the game.'); if (this.endTurn) setTimeout(() => this.endTurn && this.endTurn(), 0); } break;
      case 'win': this.render(); S(e.p === me ? 'win' : (me && !me.dead ? 'lose' : 'win')); break;
      case 'combo': { S('combo'); const mid = this.q('.gt-mid'); if (mid) { const b = document.createElement('div'); b.className = 'banner'; b.style.color = 'var(--warn)'; b.textContent = e.card.name + ' goes off!'; mid.appendChild(b); await this.wait(1200); b.remove(); } break; }
      case 'paid': this.addLog(`${short(e.p.name)} pays {${e.n}}`); await this.wait(200); break;
      default: this.render();
    }
  }
  dropStack(card) { const i = this.stackView.findIndex(s => s.card === card); if (i >= 0) this.stackView.splice(i, 1); }
  // ---------- human hooks ----------
  humanTurn(p, phase) { this.myTurn = true; this.turnPhase = phase; this.ff = false; this.mode = null; this.render(); return new Promise(res => { this.endTurn = (plan = { action: 'end' }) => { this.myTurn = false; this.mode = null; this.endTurn = null; this.render(); res(plan); }; }); }
  /** should the table stop for me at this step? (only called when I have at least one legal action) */
  shouldStop(ctx) {
    const me = this.me, g = this.game;
    if (this.passUntilTurn && ctx.active !== me) return false;
    if (this.s.stops === 'minimal') return false;
    if (this.s.stops === 'all') return true;
    const hasCast = ctx.options.some(o => o.kind === 'cast'), hasFetch = ctx.options.some(o => o.kind === 'fetch');
    const inCombat = ctx.attacks && (ctx.active === me || ctx.attacks.some(a => a.defender === me));
    if (hasCast && ((ctx.step === 'end' && ctx.active !== me) || ((ctx.step === 'declareAttackers' || ctx.step === 'declareBlockers') && inCombat))) return true;
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
    return new Promise(res => { this.prompt = { kind, ...ctx, options: kind === 'alt' ? ctx.blues : [], res: v => { this.prompt = prev && prev.kind !== 'priority' ? prev : null; this.render(); res(v); } }; this.render(); });
  }
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
    return new Promise(res => { this.prompt = { kind: 'block', ...ctx, map: new Map(), sel: null, res: v => { this.prompt = null; this.render(); res(v); } }; this.render(); });
  }
  humanDiscard(p) { return new Promise(res => { this.prompt = { kind: 'discard', res: v => { this.prompt = null; this.render(); res(v); } }; this.render(); }); }
  mulligan() {
    return new Promise(res => { this.prompt = { kind: 'mull', n: 0, res: () => { this.prompt = null; res(); } }; this.render(); });
  }
  // ---------- actions ----------
  async act(fn) { if (this.busy) return; this.busy = true; this.render(); try { await fn(); } finally { this.busy = false; this.render(); } }
  needsTarget(c) { return c.roles.includes('removal') || (c.dmg && !c.roles.includes('wipe')); }
  startCast(card, zone) {
    if (this.needsTarget(card)) { this.mode = { kind: 'target', card, zone, players: !!card.dmg && !card.roles.includes('removal') }; this.render(); return; }
    this.act(() => this.game.cast(this.me, card, zone, null));
  }
  validTarget(perm, owner) {
    const m = this.mode; if (!m || m.kind !== 'target') return false;
    if (perm.card.isLand || perm.card.kw.includes('hexproof') && owner !== this.me) return false;
    if (m.restrict && !m.restrict.includes(perm)) return false;
    const o = m.card.oracle.toLowerCase();
    if (/target creature/.test(o) && !/permanent|artifact|enchantment|planeswalker/.test(o)) return perm.card.isCreature;
    return true;
  }
  // ---------- input ----------
  wire() {
    this.el.addEventListener('mouseover', e => { const t = e.target.closest('[data-uid]'); if (t) this.preview(+t.dataset.uid); });
    this.el.addEventListener('click', e => this.onClick(e));
    document.addEventListener('keydown', this.onKey = e => { if (e.key === 'Escape' && this.mode) { this.mode = null; this.render(); } });
  }
  findCard(uid) {
    const g = this.game; if (!g) return null;
    for (const p of g.players) { for (const z of [p.hand, p.command, p.graveyard, p.exile]) { const c = z.find(c => c.uid === uid); if (c) return c; } const b = p.battlefield.find(b => b.card.uid === uid); if (b) return b.card; }
    const s = this.stackView.find(s => s.card.uid === uid); return s ? s.card : (this.prompt && this.prompt.spell && this.prompt.spell.card.uid === uid ? this.prompt.spell.card : null);
  }
  preview(uid) {
    const c = this.findCard(uid); if (!c || this.pvUid === uid) return; this.pvUid = uid;
    this.pv.innerHTML = `${c.img ? `<img src="${esc(big(c.img))}" alt="${esc(c.name)}">` : ''}<div><b>${esc(c.name)}</b> <span class="ty">${esc(c.manaCost || '')}</span></div><div class="ty">${esc(c.type)}${c.isCreature ? ` · ${c.power}/${c.toughness}` : ''}</div><div class="tx">${esc(c.oracle || '')}</div>${c.roles && c.roles.length ? `<div class="rl">Engine reads it as: ${esc(c.roles.join(' · '))}${c.kw && c.kw.length ? ' · ' + esc(c.kw.join(', ')) : ''}</div>` : ''}`;
  }
  onClick(e) {
    const t = e.target; const g = this.game, me = this.me; if (!g) return;
    const u = t.closest('[data-uid]'); if (u) this.preview(+u.dataset.uid);
    const btn = t.closest('[data-act]'); if (btn) { this.sfx.play('click'); return this.action(btn.dataset.act, btn); }
    const P = this.prompt;
    // prompt option cards
    const opt = t.closest('[data-opt]'); if (opt && P) {
      const card = (P.options || []).map(o => o.card || o).find(c => c.uid === +opt.dataset.opt); if (!card) return;
      if (P.kind === 'counter') return P.res({ card });
      if (P.kind === 'fetch') return P.res(card);
      if (P.kind === 'alt') return P.res({ mode: 'free', exile: card });
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
      if (!this.myTurn || this.busy || P) return;
      if (card.isLand) return this.act(() => g.playLand(me, card));
      if (card.roles.includes('counter')) return;
      if (g.castMode(me, card, 'hand')) this.startCast(card, 'hand');
      return;
    }
    const cz = t.closest('[data-cmd]'); if (cz && me && this.myTurn && !this.busy && !P) { const card = me.command.find(c => c.uid === +cz.dataset.cmd); if (card && g.castMode(me, card, 'cmd')) this.startCast(card, 'cmd'); return; }
    // life totals as targets
    const lf = t.closest('[data-life]'); if (lf && this.mode && this.mode.kind === 'target' && this.mode.players) { const pl = g.players[+lf.dataset.life]; if (pl !== me && !pl.dead) this.finishTarget(pl); return; }
    // permanents
    const lg = t.closest('[data-lg]'); if (lg && me && +lg.dataset.lg.split(':')[0] === me.i) {
      const perm = me.battlefield.find(b => b.card.fetch && b.card.name === lg.dataset.lg.slice(lg.dataset.lg.indexOf(':') + 1) && g.canActivate(me, b));
      if (perm) { if (P && P.kind === 'priority') return P.res({ kind: 'fetch', perm }); if (this.myTurn && !this.busy && !P) return this.act(() => g.activateFetch(me, perm)); }
      return;
    }
    const pe = t.closest('[data-pid]'); if (pe) {
      const id = +pe.dataset.pid; let owner = null, perm = null; for (const p of g.players) { const b = p.battlefield.find(b => b.id === id); if (b) { owner = p; perm = b; } }
      if (!perm) return;
      if (this.mode && this.mode.kind === 'target') { if (this.validTarget(perm, owner)) { perm.owner = owner.i; this.finishTarget(perm); } return; }
      if (this.mode && this.mode.kind === 'attack' && owner === me && g.canAttackWith(me, perm)) { const m = this.mode.map; if (m.has(perm)) m.delete(perm); else m.set(perm, this.mode.def); this.render(); return; }
      if (P && P.kind === 'block') {
        if (owner === me && P.blockers.includes(perm)) { for (const [a, b] of P.map) if (b === perm) P.map.delete(a); P.sel = P.sel === perm ? null : perm; this.render(); return; }
        const atk = P.attacks.find(a => a.attacker === perm); if (atk && P.sel && g.canBlock(P.sel, perm)) { P.map.set(perm, P.sel); P.sel = null; this.render(); }
      }
    }
  }
  finishTarget(target) {
    const m = this.mode; this.mode = null;
    if (m.respond && this.prompt) return this.prompt.res(this.prompt.kind === 'priority' ? { kind: 'cast', card: m.card, target } : { card: m.card, target });
    this.act(() => this.game.cast(this.me, m.card, m.zone, target));
  }
  action(a, btn) {
    const g = this.game, me = this.me, P = this.prompt;
    if (a === 'settings') { this.showSettings = true; this.render(); return; }
    if (a === 'close-settings') { this.showSettings = false; saveSettings(this.s); this.render(); return; }
    if (a === 'ff') { this.ff = !this.ff; this.render(); return; }
    if (a === 'leave') { this.aborted = true; if (this.endTurn) this.endTurn(); if (this.prompt) this.prompt.res(null); document.removeEventListener('keydown', this.onKey); this.opts.onExit && this.opts.onExit(); return; }
    if (a === 'cancel') { this.mode = null; this.render(); return; }
    if (a === 'end' && this.myTurn && !this.busy && !P) { this.endTurn({ action: this.turnPhase === 'main1' ? 'end' : 'done' }); return; }
    if (a === 'to-main2' && this.myTurn && !this.busy && !P) { this.endTurn({ action: 'attack', assignments: [] }); return; }
    if (a === 'attack' && this.myTurn && !this.busy && (this.turnPhase === 'main1' || this.turnPhase === 'combat2')) { this.mode = { kind: 'attack', map: new Map(), def: g.opponentsOf(me)[0] }; this.render(); return; }
    if (a === 'atk-all' && this.mode && this.mode.kind === 'attack') { for (const b of me.battlefield) if (g.canAttackWith(me, b) && g.powerOf(me, b) > 0) this.mode.map.set(b, this.mode.def); this.render(); return; }
    if (a === 'def' && this.mode && this.mode.kind === 'attack') { this.mode.def = g.players[+btn.dataset.p]; for (const k of this.mode.map.keys()) this.mode.map.set(k, this.mode.def); this.render(); return; }
    if (a === 'atk-go' && this.mode && this.mode.kind === 'attack') { const asg = [...this.mode.map].map(([attacker, defender]) => ({ attacker, defender })); this.mode = null; if (this.endTurn) this.endTurn({ action: 'attack', assignments: asg }); return; }
    if (P && P.kind === 'etb' && (a === 'etb-pay' || a === 'etb-tap')) { P.res(a === 'etb-pay'); return; }
    if (P && P.kind === 'unless' && (a === 'unless-pay' || a === 'unless-no')) { P.res(a === 'unless-pay'); return; }
    if (P && P.kind === 'alt' && a === 'alt-mana') { P.res({ mode: 'mana' }); return; }
    if (P && P.kind === 'alt' && a === 'alt-cancel') { P.res(null); return; }
    if (a === 'pass-turn' && P) { this.passUntilTurn = true; P.res(null); return; }
    if (a === 'pass' && P) { P.res(null); return; }
    if (a === 'block-go' && P && P.kind === 'block') { P.res(P.map); return; }
    if (a === 'keep' && P && P.kind === 'mull') { if (P.n) { this.prompt = { kind: 'mull-bottom', n: P.n, sel: [], done: P.res, from: P }; this.render(); } else P.res(); return; }
    if (a === 'mull' && P && P.kind === 'mull') { P.confirm = true; this.render(); return; }
    if (a === 'mull-back' && P && P.kind === 'mull') { P.confirm = false; this.render(); return; }
    if (a === 'mull-yes' && P && P.kind === 'mull' && P.confirm) { P.confirm = false; g.mulligan(me); P.n++; this.render(); return; }
    if (a === 'bottom-back' && P && P.kind === 'mull-bottom') { this.prompt = P.from; this.render(); return; }
    if (a === 'bottom-go' && P && P.kind === 'mull-bottom' && P.sel.length === P.n) { g.bottomCards(me, P.sel); const done = P.done; this.prompt = null; done(); return; }
    if (a === 'rematch') { this.opts.onRematch && this.opts.onRematch(); return; }
    if (a === 'setup') { this.opts.onExit && this.opts.onExit(); return; }
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
    if (P && P.kind === 'block') { if (owner === me && P.blockers.includes(b)) { cls.push('clk'); if (P.sel === b) cls.push('sel'); if ([...P.map.values()].includes(b)) cls.push('blk'); } if (P.attacks.some(a => a.attacker === b)) { cls.push('atk'); if (P.sel) cls.push('clk'); } }
    let badge = '';
    if (this.mode && this.mode.kind === 'attack' && this.mode.map.has(b)) badge = `<span class="bd">→ ${esc(short(this.mode.map.get(b).name).slice(0, 10))}</span>`;
    else if (this.attacking.has(b.id)) badge = `<span class="bd">→ ${esc(short(g.players[this.attacking.get(b.id)].name).slice(0, 10))}</span>`;
    if (P && P.kind === 'block') { for (const [a, bl] of P.map) if (bl === b) badge = `<span class="bd" style="background:var(--accent)">blocks ${esc(a.card.name.slice(0, 10))}</span>`; }
    let pt = '';
    if (c.isCreature) { const pw = g.powerOf(owner, b), tg = g.toughOf(owner, b); pt = `<span class="pt ${pw > c.power ? 'up' : ''}">${pw}/${tg}</span>`; }
    const body = c.img ? `<img src="${esc(c.img)}" alt="${esc(c.name)}" loading="lazy">` : `<span>${esc(c.name)}</span>`;
    return `<div class="${cls.join(' ')}${c.img ? '' : ' tok'}" data-pid="${b.id}" data-uid="${c.uid}" title="${esc(c.name)}">${body}${pt}${badge}</div>`;
  }
  seat(p) {
    const g = this.game, me = this.me, isMe = p === me;
    const lands = p.battlefield.filter(b => b.card.isLand);
    const groups = new Map(); for (const b of lands) { const k = b.card.name; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(b); }
    const nonl = p.battlefield.filter(b => !b.card.isLand).sort((a, b) => (b.card.isCreature ? 1 : 0) - (a.card.isCreature ? 1 : 0));
    const threat = !isMe && me && p.ai !== undefined ? new G.AI('cutthroat').threatOf(g, me, p) : null;
    const maxT = 40;
    const tgtLife = this.mode && this.mode.kind === 'target' && this.mode.players && p !== me && !p.dead;
    const cmdDmg = me && !isMe && me.cmdDamage[p.i] ? `<span>cmdr dmg on you ${me.cmdDamage[p.i]}/21</span>` : '';
    return `<section class="gs ${isMe ? 'me' : ''} ${g.players[g.active] === p && !g.winner ? 'act' : ''} ${p.dead ? 'dead' : ''}" data-seat="${p.i}">
      <div class="gs-h"><div class="av" style="background-image:url('${esc(p.art || '')}')"></div><div class="nm"><b>${esc(short(p.name))}</b><small>${esc(p.deckName)}${p.level ? ' · ' + esc(p.level) : ''}</small></div><div class="lf ${p.life <= 10 ? 'low' : ''} ${tgtLife ? 'tgt' : ''}" data-life="${p.i}">${p.life}</div></div>
      <div class="gs-meta"><span>hand ${p.hand.length}</span><span>library ${p.library.length}</span><span>gy ${p.graveyard.length}</span>${p.command.length ? `<span>cmd zone: ${esc(p.command.map(c => c.name.split(',')[0]).join(', '))}${p.cmdTax ? ' +' + p.cmdTax : ''}</span>` : ''}${cmdDmg}</div>
      ${threat !== null ? `<div class="thr" title="Threat to you: ${threat.toFixed(0)}"><i style="width:${Math.min(100, threat / maxT * 100)}%"></i></div>` : ''}
      ${isMe ? '<div class="gs-body"><div class="gs-main">' : ''}<div class="gs-bf">${nonl.map(b => this.tile(b, p)).join('') || '<span class="gs-meta">no permanents</span>'}</div>
      <div class="gs-lands">${[...groups].map(([name, bs]) => { const un = bs.filter(b => !b.tapped).length; const c = bs[0].card; const canAct = isMe && bs.some(b => b.card.fetch && g.canActivate(p, b)) && ((this.myTurn && !this.busy && !this.prompt) || (this.prompt && this.prompt.kind === 'priority')); return `<div class="gc lg ${un === 0 ? 't' : ''} ${canAct ? 'act' : ''}" data-lg="${p.i}:${esc(name)}" data-uid="${c.uid}" title="${esc(name)}">${c.img ? `<img src="${esc(c.img)}" alt="${esc(name)}" loading="lazy">` : `<span>${esc(name)}</span>`}<span class="cnt">${c.fetch ? (canAct ? 'crack' : bs.length > 1 ? '×' + bs.length : 'fetch') : un + '/' + bs.length}</span></div>`; }).join('')}</div>
    ${isMe ? `</div>${this.cmdZone(p)}</div>` : ''}</section>`;
  }
  cmdZone(p) {
    const g = this.game, P = this.prompt;
    const cards = p.command.map(c => { const can = this.myTurn && !this.busy && !P && g.castMode(p, c, 'cmd'); const cost = g.costOf(p, c, 'cmd');
      return `<div class="czc ${can ? 'can' : ''}" data-cmd="${c.uid}" data-uid="${c.uid}" title="${esc(c.name)} — click to cast">${c.img ? `<img src="${esc(big(c.img))}" alt="${esc(c.name)}">` : `<span>${esc(c.name)}</span>`}</div><div class="cz-cost">${cost.total} mana${p.cmdTax ? ` (tax +${p.cmdTax})` : ''}</div>`; }).join('');
    return `<aside class="cz"><div class="cz-l">Command zone</div>${cards || `<div class="cz-empty">${p.battlefield.some(b => b.card.isCommander) ? 'Commander on the battlefield' : 'Empty'}</div>`}</aside>`;
  }
  phaseLabel() { const g = this.game; return { untap: 'untap', main1: 'main phase', combat: 'combat', main2: 'second main', end: 'end step', setup: 'setup' }[g.phase] || g.phase; }
  render() {
    const g = this.game, me = this.me, P = this.prompt; if (!g) return;
    const active = g.players[g.active];
    const opps = g.players.filter(p => p !== me);
    const stack = this.stackView.map(s => `<div class="sc" data-uid="${s.card.uid}">${s.card.img ? `<img src="${esc(big(s.card.img))}" alt="${esc(s.card.name)}">` : `<div class="gc tok" style="width:100%;height:100%">${esc(s.card.name)}</div>`}<div class="who">${esc(short(s.p.name))}${s.target ? ' → ' + esc(s.target.spell ? s.target.spell.card.name : s.target.card ? s.target.card.name : short(s.target.name)) : ''}</div></div>`).join('');
    let mid = stack ? `<div class="stk">${stack}</div>` : `<div class="idle">${g.winner ? '' : this.busy ? 'Resolving…' : this.myTurn ? 'Your move' : esc(short(active.name)) + ' is playing'}</div>`;
    // prompt panel
    let prm = '';
    if (P) {
      const opts = (P.options || []).map(o => o.card || o).map(c => `<div class="opt" data-opt="${c.uid}" data-uid="${c.uid}">${c.img ? `<img src="${esc(big(c.img))}" alt="${esc(c.name)}">` : esc(c.name)}</div>`).join('');
      if (P.kind === 'counter') prm = `<div class="prm"><h4>${esc(short(P.spell.caster.name))} casts ${esc(P.spell.card.name)}${P.spell.target && P.spell.target.spell ? ' targeting ' + esc(P.spell.target.spell.card.name) : ''}. Respond?</h4><div class="opts">${opts}</div><div class="gt-ctl"><button class="chip" data-act="pass">Let it resolve</button><span class="msg">Click a counterspell to cast it.</span></div></div>`;
      else if (P.kind === 'attack') prm = `<div class="prm"><h4>${esc(short(P.attacker.name))} attacks you with ${P.attacks.length} creature${P.attacks.length > 1 ? 's' : ''} (${P.attacks.reduce((s, a) => s + g.powerOf(P.attacker, a.attacker), 0)} damage). Respond before blocks?</h4><div class="opts">${opts}</div><div class="gt-ctl"><button class="chip" data-act="pass">No response</button></div></div>`;
      else if (P.kind === 'endstep') prm = `<div class="prm"><h4>End of ${esc(short(P.of.name))}'s turn. Cast anything at instant speed?</h4><div class="opts">${opts}</div><div class="gt-ctl"><button class="chip" data-act="pass">Pass</button><span class="msg">Turn this stop off in settings.</span></div></div>`;
      else if (P.kind === 'block') { const incoming = P.attacks.filter(a => !P.map.has(a.attacker) || a.attacker.card.kw.includes('trample')).reduce((s, a) => s + g.powerOf(P.attacker, a.attacker), 0);
        prm = `<div class="prm"><h4>Declare blockers — ${esc(short(P.attacker.name))} is attacking you</h4><div class="gt-ctl"><span class="msg">Click one of your untapped creatures, then the attacker it blocks. Unblocked damage: <b>${incoming}</b> (you're at ${me.life}).</span><button class="chip pri" data-act="block-go">Confirm blocks</button></div></div>`; }
      else if (P.kind === 'priority') { const stepN = { upkeep: 'upkeep', draw: 'draw step', beginCombat: 'beginning of combat', declareAttackers: 'declare attackers', declareBlockers: 'declare blockers', end: 'end step' }[P.step] || P.step; const whose = P.active === me ? 'your' : esc(short(P.active.name)) + "'s";
        prm = `<div class="prm"><h4>Priority — ${whose} ${stepN}${P.attacks ? ` (${P.attacks.length} attacker${P.attacks.length > 1 ? 's' : ''})` : ''}. Use an effect?</h4><div class="opts">${opts}</div><div class="gt-ctl"><button class="chip pri" data-act="pass">Pass</button>${P.active !== me ? `<button class="chip" data-act="pass-turn">Pass until my turn</button>` : ''}<span class="msg">Fetchlands crack here; instants and flash cards cast here.</span></div></div>`; }
      else if (P.kind === 'fetch') prm = `<div class="prm"><h4>${esc(P.card.name)}: choose a land to put onto the battlefield</h4><div class="opts">${opts}</div></div>`;
      else if (P.kind === 'etb') { const en = P.enables || []; const thumbs = en.map(c => `<div class="opt" data-uid="${c.uid}" style="cursor:default">${c.img ? `<img src="${esc(big(c.img))}" alt="${esc(c.name)}">` : esc(c.name)}</div>`).join('');
        prm = `<div class="prm"><h4>${esc(P.card.name)}: pay ${P.life} life so it enters untapped? (you're at ${me.life})</h4>${en.length ? `<div class="opts">${thumbs}</div>` : ''}<div class="gt-ctl"><button class="chip ${en.length ? 'pri' : ''}" data-act="etb-pay">Pay ${P.life} life</button><button class="chip ${en.length ? '' : 'pri'}" data-act="etb-tap">Enter tapped</button><span class="msg">${en.length ? `Untapped, it lets you cast ${en.map(c => esc(c.name)).join(', ')} this turn.` : `The extra mana doesn't make anything castable ${this.game.players[this.game.active] === me ? 'this turn' : 'right now'}; it untaps on your turn anyway.`}</span></div></div>`; }
      else if (P.kind === 'unless') prm = `<div class="prm"><h4>${esc(P.counter.name)} will counter your ${esc(P.spell.card.name)} unless you pay {${P.n}}.</h4><div class="gt-ctl"><button class="chip pri" data-act="unless-pay">Pay {${P.n}}</button><button class="chip" data-act="unless-no">Let it be countered</button><span class="msg">${g.availableMana(me)} mana open.</span></div></div>`;
      else if (P.kind === 'alt') prm = `<div class="prm"><h4>Cast ${esc(P.card.name)}: ${P.canMana ? 'pay its mana cost, or ' : ''}exile a blue card from your hand and pay 1 life (click the card to exile)</h4><div class="opts">${opts}</div><div class="gt-ctl">${P.canMana ? `<button class="chip pri" data-act="alt-mana">Pay mana</button>` : ''}<button class="chip" data-act="alt-cancel">Cancel</button></div></div>`;
      else if (P.kind === 'discard') prm = `<div class="prm"><h4>Discard down to 7: click a card in your hand.</h4></div>`;
      else if (P.kind === 'mull') { const lands = me.hand.filter(c => c.isLand).length; prm = `<div class="prm"><h4>Opening hand: ${me.hand.length} cards, ${lands} land${lands === 1 ? '' : 's'}${P.n ? ` — you'll bottom ${P.n}` : ''}</h4>${P.confirm ? `<div class="gt-ctl"><span class="msg">Shuffle this hand away and draw ${7} new cards? You'll put ${P.n + 1} on the bottom.</span><button class="chip warn" data-act="mull-yes">Yes, mulligan</button><button class="chip pri" data-act="mull-back">Back to this hand</button></div>` : `<div class="gt-ctl"><button class="chip pri" data-act="keep">Keep</button><button class="chip" data-act="mull">Mulligan</button></div>`}</div>`; }
      else if (P.kind === 'mull-bottom') prm = `<div class="prm"><h4>Choose ${P.n} card${P.n > 1 ? 's' : ''} to put on the bottom (${P.sel.length}/${P.n})</h4><div class="gt-ctl"><button class="chip pri" data-act="bottom-go" ${P.sel.length === P.n ? '' : 'disabled'}>Done</button><button class="chip" data-act="bottom-back">Back</button><span class="msg">Click a selected card again to unselect it.</span></div></div>`;
    }
    // controls
    let ctl = '';
    if (this.mode && this.mode.kind === 'target') ctl = `<div class="gt-ctl"><span class="msg">Choose a target for <b>${esc(this.mode.card.name)}</b>${this.mode.players ? ' (a permanent or an opponent\'s life total)' : ''}.</span><button class="chip" data-act="cancel">Cancel</button></div>`;
    else if (this.mode && this.mode.kind === 'attack') ctl = `<div class="gt-ctl"><span class="msg">Attack:</span>${g.opponentsOf(me).map(q => `<button class="chip" data-act="def" data-p="${q.i}" aria-pressed="${this.mode.def === q}">${esc(short(q.name))} (${q.life})</button>`).join('')}<button class="chip" data-act="atk-all">All creatures</button><button class="chip pri" data-act="atk-go" ${this.mode.map.size ? '' : 'disabled'}>Attack with ${this.mode.map.size}</button><button class="chip" data-act="cancel">Cancel</button><span class="msg">Click your creatures to toggle them.</span></div>`;
    else if (this.myTurn && !P) {
      const combatPhase = this.turnPhase === 'main1' || this.turnPhase === 'combat2';
      const canAtk = combatPhase && me.battlefield.some(b => g.canAttackWith(me, b));
      const fetchHint = me.battlefield.some(b => b.card.fetch && g.canActivate(me, b)) ? ' · click a glowing fetchland to crack it' : '';
      ctl = `<div class="gt-ctl"><span class="msg">${g.availableMana(me)} mana open · land drop ${me.landsThisTurn ? 'used' : 'available'}${fetchHint}</span>${combatPhase ? `<button class="chip" data-act="attack" ${canAtk && !this.busy ? '' : 'disabled'}>Attack</button>` : ''}${this.turnPhase === 'main1' ? `<button class="chip" data-act="to-main2" ${this.busy ? 'disabled' : ''} title="Skip combat but keep playing">Skip combat</button>` : ''}<button class="chip pri" data-act="end" ${this.busy ? 'disabled' : ''}>End turn</button></div>`; }
    // hand
    let handBar = '';
    if (me) {
      const sel = P && P.kind === 'mull-bottom' ? P.sel : [];
      const hand = me.hand.map(c => { const can = (this.myTurn && !this.busy && !P && (c.isLand ? me.landsThisTurn < 1 : !c.roles.includes('counter') && g.castMode(me, c, 'hand'))) || (P && (P.kind === 'discard' || P.kind === 'mull-bottom')); return `<div class="hcd ${can ? 'can' : ''} ${sel.includes(c) ? 'sel' : ''}" data-hand="${c.uid}" data-uid="${c.uid}">${c.img ? `<img src="${esc(big(c.img))}" alt="${esc(c.name)}">` : `<div class="gc tok" style="width:100%;height:100%">${esc(c.name)}</div>`}</div>`; }).join('');
      const cmdUnused = me.command.map(c => { const can = this.myTurn && !this.busy && !P && g.castMode(me, c, 'cmd'); return `<div class="hcd ${can ? 'can' : ''}" data-cmd="${c.uid}" data-uid="${c.uid}" title="Commander${me.cmdTax ? ' (tax ' + me.cmdTax + ')' : ''}">${c.img ? `<img src="${esc(big(c.img))}" alt="${esc(c.name)}">` : esc(c.name)}</div>`; }).join('');
      handBar = `<div class="gt-hand">${hand}</div>`;
    }
    // overlays
    let over = '';
    if (g.winner && this.ended) { const place = me ? (g.winner === me ? 'You won' : 'You lost') : ''; over = `<div class="over"><div class="box"><h3>${esc(short(g.winner.name))} wins</h3><p class="note">${esc(g.winner.deckName)} · round ${g.round}${place ? ' · ' + place : ''}</p><div class="gt-ctl" style="justify-content:center"><button class="chip pri" data-act="rematch">Rematch</button><button class="chip" data-act="setup">New setup</button></div></div></div>`; }
    const settings = this.showSettings ? `<div class="set"><div class="box"><h3 style="margin:0">Table settings</h3>
      <label>Animations <input type="checkbox" id="st-anim" ${this.s.anim ? 'checked' : ''}></label>
      <label>Animation speed <select id="st-speed"><option value="normal" ${this.s.speed === 'normal' ? 'selected' : ''}>Normal</option><option value="fast" ${this.s.speed === 'fast' ? 'selected' : ''}>Fast</option></select></label>
      <label>Sound effects <input type="checkbox" id="st-sound" ${this.s.sound ? 'checked' : ''}></label>
      <label>Volume <input type="range" id="st-vol" min="0" max="1" step="0.05" value="${this.s.volume}"></label>
      <label>Priority stops <select id="st-stop"><option value="smart" ${this.s.stops === 'smart' ? 'selected' : ''}>Smart</option><option value="all" ${this.s.stops === 'all' ? 'selected' : ''}>Full control</option><option value="minimal" ${this.s.stops === 'minimal' ? 'selected' : ''}>Minimal</option></select></label>
      <p class="note" style="margin:0">Smart stops at opponents' end steps, combats you're in, and the end step before your turn (for fetchlands). Full control stops at every step where you have a legal play. Minimal only stops for counterspells, attacks and blocks. Steps where you have nothing legal are always skipped.</p>
      <p class="note" style="margin:0">Sounds are generated in your browser; no audio files are downloaded.</p>
      <div class="gt-ctl" style="justify-content:flex-end"><button class="chip pri" data-act="close-settings">Done</button></div></div></div>` : '';
    this.board.innerHTML = `
      <div class="gt-bar"><span class="ph">Round <b>${g.round}</b> · <b>${esc(short(active.name))}</b></span><span class="steps">${[['upkeep', 'Upkeep'], ['draw', 'Draw'], ['main1', 'Main'], ['combat', 'Combat'], ['main2', 'Main 2'], ['end', 'End']].map(([k, l]) => `<span class="${(g.phase === k || (k === 'combat' && g.phase === 'combat')) ? 'on' : ''}">${l}</span>`).join('')}</span>
        <button class="chip" data-act="ff" aria-pressed="${this.ff}" title="Skip animations until your next decision">${this.ff ? 'Fast-forwarding' : 'Fast-forward'}</button>
        <button class="chip" data-act="settings">Settings</button><button class="chip" data-act="leave">Leave game</button></div>
      <div class="gt-opps">${opps.map(p => this.seat(p)).join('')}</div>
      <div class="gt-mid">${mid}</div>
      ${prm}
      ${me ? this.seat(me) : ''}
      ${ctl}
      ${handBar}
      ${over}${settings}`;
    if (this.showSettings) {
      const bind = (id, k, f = v => v) => { const el = this.board.querySelector('#' + id); el.onchange = el.oninput = () => { this.s[k] = f(el.type === 'checkbox' ? el.checked : el.value); saveSettings(this.s); if (k === 'volume') this.sfx.vol(); }; };
      bind('st-anim', 'anim'); bind('st-speed', 'speed'); bind('st-sound', 'sound'); bind('st-vol', 'volume', Number); bind('st-stop', 'stops');
    }
  }
  endScreen() { this.ended = true; this.myTurn = false; this.render(); }
}

window.GoldfishUI = { start(el, seats, opts) { const t = new Table(el, seats, opts); window.GoldfishUI.current = t; t.start(); return t; }, loadSettings, saveSettings };
})();
