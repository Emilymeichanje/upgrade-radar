/* Upgrade Radar — Goldfish Table engine (v3)
   Rules-lite 4-seat Commander simulator with instant-speed interaction.
   Knows: card types, costs and colours, P/T, keywords, and tagged roles (ramp, draw, removal, wipe, pump,
   tokens, counterspell incl. restrictions / "unless pays" / free pitch & commander counters, flash).
   Does NOT resolve oracle text: engines and unique abilities don't run. Treat results as curve, speed and
   interaction feedback, not a verdict on specific card interactions.
   Every state change is announced through `hooks.emit(event)` (awaited), so a UI can animate it; headless
   runs pass no hooks. Exposed as window.Goldfish. */
(function (root) {
'use strict';

const KW = ['flying','trample','menace','haste','lifelink','deathtouch','first strike','double strike','vigilance','hexproof','indestructible','flash','reach','ward','unblockable','skulk','shadow','fear','intimidate','horsemanship','defender'];
const EVASIVE = ['flying','unblockable','menace','shadow','trample','fear','intimidate','horsemanship','skulk'];
let UID = 1;

function manaInfo(cost) {
  const pips = { W: 0, U: 0, B: 0, R: 0, G: 0 }; let generic = 0, x = false;
  for (const m of (cost || '').match(/\{[^}]+\}/g) || []) {
    const s = m.slice(1, -1);
    if (/^\d+$/.test(s)) generic += +s;
    else if (s === 'X') x = true;
    else if (/^[WUBRG]$/.test(s)) pips[s]++;
    else if (/\//.test(s)) { const c = s.split('/').find(p => /^[WUBRG]$/.test(p)); if (c) pips[c]++; else generic++; }
    else generic++;
  }
  return { generic, pips, total: generic + Object.values(pips).reduce((a, b) => a + b, 0), x };
}
const NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, x: 3 };

function tagCard(c) {
  const t = c.type || '', o = (c.oracle || '').toLowerCase();
  const front = t.split(' // ')[0];
  const isLand = /\bLand\b/.test(front);
  const card = {
    uid: UID++, name: c.name, type: front, oracle: c.oracle || '', cmc: isLand ? 0 : (c.cmc || 0), manaCost: c.mana || '', mana: manaInfo(c.mana),
    img: c.img || '', isLand, isCreature: /\bCreature\b/.test(front), isInstant: /\bInstant\b/.test(front), isSorcery: /\bSorcery\b/.test(front),
    isArtifact: /\bArtifact\b/.test(front), isEnchantment: /\bEnchantment\b/.test(front), isPlaneswalker: /\bPlaneswalker\b/.test(front),
    isLegendary: /\bLegendary\b/.test(front),
    power: parseInt(c.power) || (c.power === '*' ? 2 : 0), toughness: parseInt(c.toughness) || (c.toughness === '*' ? 2 : 0),
    kw: [...new Set(KW.filter(k => new RegExp('\\b' + k + '\\b').test(o)).concat((c.keywords || []).map(k => k.toLowerCase()).filter(k => KW.includes(k))))],
    roles: [], produces: [],
  };
  card.colors = Object.entries(card.mana.pips).filter(([, n]) => n > 0).map(([k]) => k);
  card.flash = card.isInstant || card.kw.includes('flash');
  if (isLand) {
    // fetchlands: "{T}, Pay 1 life, Sacrifice: Search your library for a Plains or Swamp card, put it onto the battlefield"
    const fm = /sacrifice/.test(o) && o.match(/search your library for (a|an|up to two) ([a-z ,]+?) cards?/);
    if (fm) {
      const q = fm[2];
      card.fetch = {
        types: ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'].filter(t => q.includes(t.toLowerCase())),
        basic: /basic land/.test(q), count: fm[1] === 'up to two' ? 2 : 1,
        life: +((o.match(/pay (\d+) life/) || [])[1] || 0), generic: +((o.match(/\{(\d+)\}, \{t\}, sacrifice/) || [])[1] || 0),
        tapped: /onto the battlefield tapped/.test(o), untapIf4: /four or more lands, untap/.test(o),
      };
      card.produces = []; card.etbTapped = /enters (the battlefield )?tapped/.test(o) && !/search your library/.test(o.split('enters')[0] || '');
      return card;
    }
    for (const col of 'WUBRG') if (new RegExp('add \\{' + col + '\\}|\\{t\\}: add \\{[^}]*' + col, 'i').test(o) || new RegExp('\\b' + { W: 'plains', U: 'island', B: 'swamp', R: 'mountain', G: 'forest' }[col] + '\\b', 'i').test(front)) card.produces.push(col);
    if (/add one mana of any color|mana of any (one )?color|any type/i.test(o) || /command tower|mana confluence|city of brass|exotic orchard|reflecting pool|forbidden orchard|gemstone caverns|path of ancestry/i.test(c.name)) card.produces = ['W', 'U', 'B', 'R', 'G'];
    if (!card.produces.length) card.produces = ['C'];
    card.shock = /you may pay 2 life\. if you don't, it enters tapped/i.test(o);
    card.etbTapped = !card.shock && /enters (the battlefield )?tapped/i.test(o) && !/unless/i.test(o);
    return card;
  }
  const r = card.roles;
  if (/add \{|add (one|two|three) mana|search your library for (up to \w+ )?(a )?basic land|lands? onto the battlefield|treasure token/.test(o)) r.push('ramp');
  if (/draw (a|two|three|x|\d+) cards?|draw cards|investigate|clue token/.test(o)) r.push('draw');
  if (/destroy all|exile all|each creature|all creatures|deals? \d+ damage to each/.test(o)) r.push('wipe');
  else if (/destroy target|exile target (creature|permanent|nonland|artifact|enchantment)|deals? \d+ damage to (any target|target creature)|fight|-\d\/-\d|return target (creature|nonland permanent) to its owner/.test(o)) r.push('removal');
  // counterspells: "counter target ... spell" (not abilities-only like Stifle)
  const cm = o.match(/counter target ([a-z, ]*?)spell/);
  if (cm) {
    r.push('counter');
    const q = cm[1];
    card.counter = {
      hits: /noncreature/.test(q) ? 'noncreature' : /creature/.test(q) ? 'creature' : /instant or sorcery/.test(q) ? 'instantsorcery' : /enchantment, instant, or sorcery/.test(q) ? 'eis' : /with mana value 1/.test(o) ? 'mv1' : 'any',
      unless: (o.match(/unless its controller pays \{(\d+)\}/) || [])[1] ? +o.match(/unless its controller pays \{(\d+)\}/)[1] : /unless its controller pays \{x\}/.test(o) ? 3 : 0,
      free: /exile a blue card from your hand rather than pay/.test(o) ? (/not your turn/.test(o) ? 'pitchNotTurn' : 'pitch') : /if you control a commander, you may cast this spell without paying/.test(o) ? 'commander' : null,
    };
  }
  if (/creatures you control get \+|each creature you control gets \+/.test(o)) r.push('pump');
  if (/create (a|an|two|three|x|\d+) .* tokens?/.test(o)) r.push('tokens');
  if (/extra combat|additional combat/.test(o)) r.push('extracombat');
  if (/hexproof|indestructible|protection|phase out/.test(o) && (card.isInstant || card.isEnchantment || card.isArtifact)) r.push('protect');
  if (/gain \w+ life|lifelink/.test(o)) r.push('lifegain');
  if (/you win the game|loses the game|infinite/.test(o)) r.push('wincon');
  if (card.isCreature && /whenever|at the beginning/.test(o)) r.push('engine');
  if (!card.isCreature && (card.isArtifact || card.isEnchantment) && /whenever|at the beginning/.test(o) && !r.includes('ramp')) r.push('engine');
  const tokN = o.match(/create (a|an|two|three|four|\d+)/); card.tokenCount = tokN ? (NUM[tokN[1]] || parseInt(tokN[1]) || 1) : 0;
  const tokPT = o.match(/(\d+)\/(\d+) [a-z ]*creature token/); card.tokenPT = tokPT ? [+tokPT[1], +tokPT[2]] : [1, 1];
  const dmg = o.match(/deals? (\d+) damage/); card.dmg = dmg ? +dmg[1] : 0;
  const drawN = o.match(/draw (a|two|three|four|\d+) cards?/); card.drawN = drawN ? (NUM[drawN[1]] || parseInt(drawN[1]) || 1) : 0;
  const pump = o.match(/get \+(\d+)\/\+(\d+)/); card.pumpN = pump ? +pump[1] : 0;
  const gain = o.match(/gain (\d+) life/); card.gainN = gain ? +gain[1] : 0;
  return card;
}
function counterHits(counterCard, spell) {
  const h = counterCard.counter && counterCard.counter.hits;
  if (!h) return false;
  if (h === 'any') return true;
  if (h === 'creature') return spell.isCreature;
  if (h === 'noncreature') return !spell.isCreature;
  if (h === 'instantsorcery') return spell.isInstant || spell.isSorcery;
  if (h === 'eis') return spell.isEnchantment || spell.isInstant || spell.isSorcery;
  if (h === 'mv1') return spell.cmc === 1;
  return false;
}

function buildDeck(cards, commanderNames) {
  const cmd = new Set(commanderNames.map(n => n.toLowerCase()));
  const library = [], commanders = [];
  for (const c of cards) (cmd.has(c.name.toLowerCase()) ? commanders : library).push(tagCard(c));
  return { library, commanders };
}
function shuffle(a, rng) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function mulberry(seed) { return function () { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const clone = c => ({ ...c, uid: UID++ });

// ============================== GAME ==============================
class Game {
  constructor(seats, opts = {}) {
    this.rng = mulberry(opts.seed || (Date.now() & 0xffffffff));
    this.hooks = opts.hooks || {};
    this.log = []; this.turn = 0; this.round = 0; this.active = 0; this.winner = null; this.stack = []; this.phase = 'setup';
    this.players = seats.map((s, i) => ({
      i, name: s.name, deckName: s.deckName || s.name, human: !!s.human, ai: s.ai || null, level: s.level || null, life: 40, dead: false,
      library: shuffle(s.deck.library.map(clone), this.rng), hand: [], battlefield: [], graveyard: [], exile: [],
      command: s.deck.commanders.map(c => ({ ...clone(c), isCommander: true })), cmdTax: 0, landsThisTurn: 0, cmdDamage: {}, mulligans: 0,
      art: s.art || '',
    }));
    for (const p of this.players) this.drawSilent(p, 7);
  }
  // ---------- plumbing ----------
  async emit(e) { if (this.hooks.emit) await this.hooks.emit(e, this); }
  say(msg, p) { const line = (p ? p.name + ': ' : '') + msg; this.log.push({ t: this.turn, m: line }); if (this.hooks.log) this.hooks.log(line); }
  alive() { return this.players.filter(p => !p.dead); }
  opponentsOf(p) { return this.alive().filter(q => q !== p); }
  /** players in turn order starting after `p` */
  after(p) { const out = []; const n = this.players.length; for (let k = 1; k < n; k++) { const q = this.players[(p.i + k) % n]; if (!q.dead) out.push(q); } return out; }
  drawSilent(p, n) { for (let k = 0; k < n; k++) { if (!p.library.length) { p.deckedOut = true; return; } p.hand.push(p.library.pop()); } }
  async draw(p, n = 1) { for (let k = 0; k < n; k++) { if (!p.library.length) { await this.kill(p, 'drew from an empty library'); return; } p.hand.push(p.library.pop()); } await this.emit({ type: 'draw', p, n }); }
  mulligan(p) { p.library.push(...p.hand); p.hand = []; shuffle(p.library, this.rng); this.drawSilent(p, 7); p.mulligans++; }
  bottomCards(p, cards) { for (const c of cards) { const i = p.hand.indexOf(c); if (i >= 0) { p.hand.splice(i, 1); p.library.unshift(c); } } }
  async kill(p, why) {
    if (p.dead) return; p.dead = true; this.say(`is out (${why})`, p);
    // their permanents leave the game (multiplayer rule)
    p.battlefield = [];
    await this.emit({ type: 'dies', p, why });
    const a = this.alive(); if (a.length === 1 && !this.winner) { this.winner = a[0]; this.say(`${a[0].name} wins on turn ${this.turn}`); await this.emit({ type: 'win', p: a[0] }); }
  }
  async changeLife(p, delta, source) {
    if (!delta || p.dead) return; p.life += delta; await this.emit({ type: 'life', p, delta, source });
    if (p.life <= 0) await this.kill(p, 'ran out of life');
  }
  // ---------- mana ----------
  manaSources(p) { return p.battlefield.filter(b => !b.tapped && !b.summoning && (b.card.isLand ? b.card.produces.length > 0 : (b.card.roles.includes('ramp') && (b.card.isArtifact || b.card.isCreature)))); }
  availableMana(p) { return this.manaSources(p).length; }
  costOf(p, card, zone) { if (zone === 'cmd') return { ...card.mana, total: card.mana.total + p.cmdTax, generic: card.mana.generic + p.cmdTax }; return card.mana; }
  canPayCost(p, cost, reserve = 0) {
    const srcs = this.manaSources(p); if (srcs.length < cost.total + reserve) return false;
    const pool = srcs.map(s => s.card.isLand ? s.card.produces : ['W', 'U', 'B', 'R', 'G']);
    const need = { ...cost.pips }; const used = new Set();
    for (const col of 'WUBRG') while (need[col] > 0) { const i = pool.findIndex((pr, idx) => !used.has(idx) && pr.includes(col)); if (i < 0) return false; used.add(i); need[col]--; }
    return pool.length - used.size >= cost.generic + reserve;
  }
  payCost(p, cost) {
    const srcs = this.manaSources(p); let n = cost.total; const need = { ...cost.pips };
    // colour pips first, preferring sources that produce the fewest colours
    const ordered = [...srcs].sort((a, b) => (a.card.isLand ? a.card.produces.length : 5) - (b.card.isLand ? b.card.produces.length : 5));
    for (const s of ordered) { if (n <= 0) break; const pr = s.card.isLand ? s.card.produces : ['W', 'U', 'B', 'R', 'G']; const col = 'WUBRG'.split('').find(c => need[c] > 0 && pr.includes(c)); if (col) { need[col]--; s.tapped = true; n--; } }
    for (const s of ordered) { if (n <= 0) break; if (!s.tapped) { s.tapped = true; n--; } }
  }
  /** can `p` cast `card` right now? returns 'mana' | 'free' | null. `instant` = outside own main phase */
  castMode(p, card, zone = 'hand', { instant = false } = {}) {
    if (card.isLand) return null;
    if (instant && !card.flash) return null;
    if (!instant && this.stack.length) return null;
    if (this.canPayCost(p, this.costOf(p, card, zone))) return 'mana';
    const f = card.counter && card.counter.free;
    if (f === 'pitch' || (f === 'pitchNotTurn' && this.players[this.active] !== p)) { if (p.hand.some(c => c !== card && c.colors.includes('U'))) return 'free'; }
    if (f === 'commander' && p.battlefield.some(b => b.card.isCommander)) return 'free';
    return null;
  }
  // ---------- casting with priority ----------
  async playLand(p, card) {
    const i = p.hand.indexOf(card); if (i < 0 || p.landsThisTurn >= 1 || !card.isLand) return false;
    p.hand.splice(i, 1); const perm = { id: UID++, card, tapped: !!card.etbTapped, summoning: false, counters: 0 }; p.battlefield.push(perm); p.landsThisTurn++;
    if (card.shock) { if (p.life > 6) { p.life -= 2; this.say(`pays 2 life for ${card.name}`, p); } else perm.tapped = true; }
    this.say(`plays ${card.name}`, p); await this.emit({ type: 'land', p, card, perm }); return true;
  }
  /** cast a spell; returns true if it resolved. target: perm (with .owner) or player */
  async cast(p, card, zone = 'hand', target = null, { instant = false, depth = 0 } = {}) {
    const mode = this.castMode(p, card, zone, { instant }); if (!mode) return false;
    const src = zone === 'cmd' ? p.command : p.hand; const i = src.indexOf(card); if (i < 0) return false;
    src.splice(i, 1);
    if (mode === 'mana') this.payCost(p, this.costOf(p, card, zone));
    else if (card.counter.free.startsWith('pitch')) { // exile the least valuable other blue card, pay 1 life
      const blues = p.hand.filter(c => c.colors.includes('U')).sort((a, b) => a.cmc - b.cmc); const ex = blues[0]; p.hand.splice(p.hand.indexOf(ex), 1); p.exile.push(ex); p.life -= 1;
      this.say(`exiles ${ex.name} to cast ${card.name} for free`, p);
    }
    if (zone === 'cmd') p.cmdTax += 2;
    const spell = { card, caster: p, target, zone }; this.stack.push(spell);
    this.say(`casts ${card.name}${target ? ' → ' + (target.spell ? target.spell.card.name : target.card ? target.card.name : target.name) : ''}`, p);
    await this.emit({ type: 'cast', p, card, target, depth });
    // priority: everyone else in turn order may respond with a counterspell
    let countered = false;
    if (depth < 4) for (const q of this.after(p)) {
      if (countered || this.winner) break;
      const resp = await this.askCounter(q, spell, depth);
      if (resp) { const ok = await this.cast(q, resp.card, 'hand', { spell }, { instant: true, depth: depth + 1 }); if (ok && spell.countered) countered = true; }
    }
    this.stack.splice(this.stack.indexOf(spell), 1);
    if (spell.countered) {
      await this.emit({ type: 'countered', p, card });
      if (card.isCommander) { p.command.push(card); this.say(`— ${card.name} returns to the command zone`, p); } else p.graveyard.push(card);
      return false;
    }
    await this.resolve(spell);
    return true;
  }
  async askCounter(q, spell, depth) {
    const options = q.hand.filter(c => c.roles.includes('counter') && counterHits(c, spell.card) && this.castMode(q, c, 'hand', { instant: true }));
    if (!options.length) return null;
    if (q.human) return this.hooks.humanRespond ? await this.hooks.humanRespond({ kind: 'counter', spell, options, depth }) : null;
    if (q.ai) { const c = q.ai.chooseCounter(this, q, spell, options, depth); return c ? { card: c } : null; }
    return null;
  }
  async resolve(spell) {
    const { card, caster: p, target } = spell;
    // counterspell resolving against a spell on the stack
    if (card.roles.includes('counter') && target && target.spell) {
      const victim = target.spell;
      if (card.counter.unless && victim.caster && this.canPayCost(victim.caster, { generic: card.counter.unless, pips: { W: 0, U: 0, B: 0, R: 0, G: 0 }, total: card.counter.unless })) {
        this.payCost(victim.caster, { generic: card.counter.unless, pips: { W: 0, U: 0, B: 0, R: 0, G: 0 }, total: card.counter.unless });
        this.say(`pays {${card.counter.unless}} for ${card.name}`, victim.caster); await this.emit({ type: 'paid', p: victim.caster, n: card.counter.unless });
      } else victim.countered = true;
      p.graveyard.push(card); await this.emit({ type: 'resolve', p, card }); return;
    }
    const perm = card.isCreature || card.isArtifact || card.isEnchantment || card.isPlaneswalker;
    if (card.roles.includes('wipe')) {
      await this.emit({ type: 'wipe', p, card });
      for (const q of this.alive()) for (const b of q.battlefield.filter(b => b.card.isCreature && !b.card.kw.includes('indestructible'))) await this.destroy(q, b, true);
      this.say(`— board wiped`, p);
    } else if (card.roles.includes('removal') && target && target.card) {
      const owner = this.players[target.owner];
      if (!owner.battlefield.includes(target)) this.say(`— target is gone`, p);
      else if (target.card.kw.includes('indestructible') && !/exile|return/.test(card.oracle.toLowerCase())) this.say(`— ${target.card.name} is indestructible`, p);
      else await this.destroy(owner, target);
    }
    if (card.dmg && target && !target.card && !target.spell) { this.say(`— ${target.name} takes ${card.dmg}`, p); await this.changeLife(target, -card.dmg, card); }
    if (card.drawN) await this.draw(p, card.drawN);
    if (card.gainN) await this.changeLife(p, card.gainN, card);
    if (card.roles.includes('ramp') && (card.isSorcery || card.isInstant)) {
      const land = p.library.find(c => c.isLand && c.produces.length);
      if (land) { p.library.splice(p.library.indexOf(land), 1); const pm = { id: UID++, card: land, tapped: true, summoning: false, counters: 0 }; p.battlefield.push(pm); this.say(`— fetches ${land.name}`, p); await this.emit({ type: 'land', p, card: land, perm: pm }); }
    }
    if (card.tokenCount && card.roles.includes('tokens')) {
      const n = Math.min(card.tokenCount, 8);
      for (let k = 0; k < n; k++) p.battlefield.push({ id: UID++, card: { uid: UID++, name: card.name + ' token', type: 'Token Creature', isCreature: true, power: card.tokenPT[0], toughness: card.tokenPT[1], kw: card.oracle.toLowerCase().includes('token with flying') ? ['flying'] : [], roles: [], mana: { total: 0, pips: {}, generic: 0 }, cmc: 0, token: true, colors: [], oracle: `${card.tokenPT[0]}/${card.tokenPT[1]} token created by ${card.name}` }, tapped: false, summoning: true, counters: 0 });
      await this.emit({ type: 'tokens', p, n, card });
    }
    if (card.roles.includes('pump')) p.pumpUntilEOT = (p.pumpUntilEOT || 0) + (card.pumpN || 1);
    if (card.roles.includes('extracombat')) p.extraCombat = true;
    let pm = null;
    if (perm) { pm = { id: UID++, card, tapped: false, summoning: card.isCreature, counters: 0, loyalty: card.isPlaneswalker ? 4 : 0 }; p.battlefield.push(pm); }
    else p.graveyard.push(card);
    await this.emit({ type: 'resolve', p, card, perm: pm });
    if (card.roles.includes('wincon') && this.rng() < 0.15 && this.round >= 6) {
      this.say(`— ${card.name} goes off!`, p); await this.emit({ type: 'combo', p, card });
      for (const q of this.opponentsOf(p)) await this.kill(q, `${p.name}'s ${card.name}`);
    }
  }
  async destroy(owner, perm, quiet) {
    if (!owner.battlefield.includes(perm)) return;
    await this.emit({ type: 'destroy', owner, perm, quiet });
    const i = owner.battlefield.indexOf(perm); if (i < 0) return; owner.battlefield.splice(i, 1);
    if (perm.card.isCommander) { owner.command.push(perm.card); this.say(`— ${perm.card.name} returns to the command zone`, owner); }
    else if (!perm.card.token) owner.graveyard.push(perm.card);
  }
  // ---------- activated abilities: fetchlands ----------
  fetchTargets(p, perm) {
    const f = perm.card.fetch; if (!f) return [];
    return p.library.filter(c => c.isLand && (f.basic ? /\bBasic\b/.test(c.type) && (!f.types.length || f.types.some(t => c.type.includes(t))) : f.types.some(t => c.type.includes(t))));
  }
  canActivate(p, perm) {
    const f = perm.card.fetch; if (!f || perm.tapped || !p.battlefield.includes(perm) || p.life <= f.life) return false;
    if (f.generic && !this.canPayCost(p, { generic: f.generic, pips: { W: 0, U: 0, B: 0, R: 0, G: 0 }, total: f.generic })) return false;
    return true;
  }
  async activateFetch(p, perm, choice) {
    if (!this.canActivate(p, perm)) return false;
    const f = perm.card.fetch; perm.tapped = true;
    if (f.generic) this.payCost(p, { generic: f.generic, pips: { W: 0, U: 0, B: 0, R: 0, G: 0 }, total: f.generic });
    await this.emit({ type: 'activate', p, perm, card: perm.card });
    await this.sacrifice(p, perm);
    if (f.life) await this.changeLife(p, -f.life, perm.card);
    if (p.dead) return true;
    const pool = this.fetchTargets(p, perm);
    let picks = choice ? [].concat(choice) : p.ai ? p.ai.chooseFetch(this, p, pool, f.count) : (this.hooks.humanChooseFetch && pool.length ? [].concat(await this.hooks.humanChooseFetch(p, perm.card, pool, f.count) || []) : []);
    const landsNow = p.battlefield.filter(b => b.card.isLand).length;
    for (const land of picks.slice(0, f.count)) {
      const i = p.library.indexOf(land); if (i < 0) continue; p.library.splice(i, 1);
      const pm = { id: UID++, card: land, tapped: (f.tapped && !(f.untapIf4 && landsNow + 1 >= 4)) || !!land.etbTapped, summoning: false, counters: 0 };
      p.battlefield.push(pm);
      if (land.shock && !pm.tapped) { if (p.life > 6) { p.life -= 2; this.say(`pays 2 life for ${land.name}`, p); } else pm.tapped = true; }
      this.say(`cracks ${perm.card.name} → ${land.name}${pm.tapped ? ' (tapped)' : ''}`, p);
      await this.emit({ type: 'land', p, card: land, perm: pm, fetched: true });
    }
    if (!picks.length) this.say(`cracks ${perm.card.name} and finds nothing`, p);
    shuffle(p.library, this.rng);
    return true;
  }
  async sacrifice(owner, perm) {
    await this.emit({ type: 'destroy', owner, perm, quiet: true });
    const i = owner.battlefield.indexOf(perm); if (i >= 0) owner.battlefield.splice(i, 1);
    if (!perm.card.token) owner.graveyard.push(perm.card);
  }
  // ---------- priority ----------
  /** everything `q` could legally do right now outside their own main phase */
  legalActions(q) {
    if (q.dead) return [];
    const out = [];
    for (const c of q.hand) if (c.flash && !c.roles.includes('counter') && this.castMode(q, c, 'hand', { instant: true })) out.push({ kind: 'cast', card: c });
    for (const b of q.battlefield) if (b.card.fetch && this.canActivate(q, b)) out.push({ kind: 'fetch', perm: b, card: b.card });
    return out;
  }
  /** one priority pass for a step: active player first, then turn order; ends when everyone passes in a row */
  async priorityRound(step, active, ctx = {}) {
    this.step = step; await this.emit({ type: 'step', step, p: active });
    const order = [active, ...this.after(active)];
    let passes = 0, idx = 0, guard = 24;
    while (passes < order.length && guard-- > 0 && !this.winner) {
      const q = order[idx % order.length]; idx++;
      if (q.dead) { passes++; continue; }
      const options = this.legalActions(q);
      let act = null;
      if (options.length) {
        if (q.human) act = this.hooks.humanPriority ? await this.hooks.humanPriority({ step, active, options, ...ctx }) : null;
        else if (q.ai) act = q.ai.priorityAction(this, q, step, active, options, ctx);
      }
      if (act) { const ok = await this.doAction(q, act); passes = ok ? 0 : passes + 1; } else passes++;
    }
  }
  async doAction(q, act) {
    if (act.kind === 'fetch') return this.activateFetch(q, act.perm, act.choice);
    if (act.kind === 'cast') return this.cast(q, act.card, 'hand', act.target || null, { instant: true });
    return false;
  }
  // ---------- combat ----------
  canBlock(b, a) {
    const k = a.card.kw;
    if (k.includes('unblockable') || k.includes('shadow') || k.includes('horsemanship')) return false;
    if (k.includes('flying') && !(b.card.kw.includes('flying') || b.card.kw.includes('reach'))) return false;
    if (k.includes('fear') || k.includes('intimidate') || k.includes('skulk')) return b.card.kw.includes('flying') && false;
    return true;
  }
  powerOf(p, b) { return b.card.power + (b.counters || 0) + (b.card.isCreature ? (p.pumpUntilEOT || 0) : 0); }
  toughOf(p, b) { return b.card.toughness + (b.counters || 0) + (b.card.isCreature ? (p.pumpUntilEOT || 0) : 0); }
  canAttackWith(p, b) { return b.card.isCreature && !b.tapped && (!b.summoning || b.card.kw.includes('haste')) && !b.card.kw.includes('defender'); }
  /** assignments: [{attacker: perm, defender: player}] */
  async declareAttack(p, assignments) { return this.combatPhase(p, assignments); }
  async combatPhase(p, assignments) {
    if (!(assignments || []).length) return;
    this.phase = 'combat';
    await this.priorityRound('beginCombat', p);
    const atk = assignments.filter(a => p.battlefield.includes(a.attacker) && this.canAttackWith(p, a.attacker) && !a.defender.dead);
    if (!atk.length) { this.phase = 'main2'; return; }
    for (const a of atk) if (!a.attacker.card.kw.includes('vigilance')) a.attacker.tapped = true;
    await this.emit({ type: 'attack', p, assignments: atk });
    this.say(`attacks: ${atk.map(a => `${a.attacker.card.name} → ${a.defender.name}`).join(', ')}`, p);
    await this.priorityRound('declareAttackers', p, { attacks: atk });
    const defenders = [...new Set(atk.map(a => a.defender))];
    // blocks
    const live = atk.filter(a => p.battlefield.includes(a.attacker) && !a.defender.dead);
    const blocks = new Map(); // attacker perm -> blocker perm
    for (const d of defenders) {
      if (d.dead) continue;
      const onMe = live.filter(a => a.defender === d);
      if (!onMe.length) continue;
      const myBlockers = d.battlefield.filter(b => b.card.isCreature && !b.tapped);
      if (!myBlockers.length) continue;
      let chosen = new Map();
      if (d.human && this.hooks.humanBlocks) chosen = await this.hooks.humanBlocks({ defender: d, attacker: p, attacks: onMe, blockers: myBlockers, game: this }) || new Map();
      else if (d.ai) chosen = d.ai.chooseBlocks(this, d, p, onMe, myBlockers);
      for (const [a, b] of chosen) if (b && this.canBlock(b, a) && myBlockers.includes(b)) blocks.set(a, b);
    }
    if (blocks.size || live.length) await this.priorityRound('declareBlockers', p, { attacks: live, blocks });
    // damage
    const pending = []; const killQ = [];
    for (const { attacker, defender } of live) {
      if (!p.battlefield.includes(attacker)) continue;
      const pw = this.powerOf(p, attacker); const blocker = blocks.get(attacker);
      if (blocker && defender.battlefield.includes(blocker)) {
        const bp = this.powerOf(defender, blocker), bt = this.toughOf(defender, blocker), at = this.toughOf(p, attacker);
        const fs = attacker.card.kw.includes('first strike') || attacker.card.kw.includes('double strike');
        const bDies = (pw >= bt || attacker.card.kw.includes('deathtouch')) && !blocker.card.kw.includes('indestructible');
        const aDies = !(fs && bDies) && (bp >= at || blocker.card.kw.includes('deathtouch')) && !attacker.card.kw.includes('indestructible');
        await this.emit({ type: 'block', p, attacker, blocker, defender });
        this.say(`${blocker.card.name} blocks ${attacker.card.name}${bDies ? ' and dies' : ''}${aDies ? '; ' + attacker.card.name + ' dies' : ''}`, defender);
        if (bDies) await this.destroy(defender, blocker);
        if (aDies) await this.destroy(p, attacker);
        if (attacker.card.kw.includes('trample') && bDies) { const over = Math.max(0, pw - bt); if (over) pending.push({ defender, dmg: over, attacker }); }
        if (attacker.card.kw.includes('lifelink') && !aDies) await this.changeLife(p, Math.min(pw, bt), attacker.card);
      } else {
        const dmg = attacker.card.kw.includes('double strike') ? pw * 2 : pw;
        if (dmg > 0) pending.push({ defender, dmg, attacker });
      }
    }
    for (const h of pending) {
      if (h.defender.dead) continue;
      await this.emit({ type: 'hit', p, attacker: h.attacker, defender: h.defender, dmg: h.dmg });
      this.say(`${h.attacker.card.name} hits ${h.defender.name} for ${h.dmg}`, p);
      if (h.attacker.card.kw.includes('lifelink')) await this.changeLife(p, h.dmg, h.attacker.card);
      if (h.attacker.card.isCommander) { h.defender.cmdDamage[p.i] = (h.defender.cmdDamage[p.i] || 0) + h.dmg; if (h.defender.cmdDamage[p.i] >= 21) killQ.push([h.defender, `21 commander damage from ${h.attacker.card.name}`]); }
      await this.changeLife(h.defender, -h.dmg, h.attacker.card);
    }
    for (const [q, why] of killQ) await this.kill(q, why);
    this.phase = 'main2';
    await this.emit({ type: 'combatEnd', p });
  }
  // ---------- turn structure ----------
  async beginTurn(p) {
    this.turn++; if (p === this.alive()[0] || this.round === 0) this.round++;
    p.landsThisTurn = 0; p.pumpUntilEOT = 0; p.extraCombat = false; this.phase = 'untap'; this.step = 'untap';
    for (const b of p.battlefield) { b.tapped = false; b.summoning = false; }
    this.say(`— turn ${this.turn} —`, p);
    await this.emit({ type: 'turn', p });
  }
  async takeTurn(p) {
    await this.beginTurn(p); if (p.dead || this.winner) return;
    this.phase = 'upkeep'; await this.priorityRound('upkeep', p); if (p.dead || this.winner) return;
    this.phase = 'draw'; if (this.turn > 1) await this.draw(p, 1); if (p.dead || this.winner) return;
    await this.priorityRound('draw', p); if (p.dead || this.winner) return;
    this.phase = 'main1'; this.step = 'main1'; await this.emit({ type: 'step', step: 'main1', p });
    let plan;
    if (p.human && this.hooks.humanTurn) plan = await this.hooks.humanTurn(p, 'main1', this);
    else { await p.ai.mainPhase(this, p, false); plan = { action: 'attack', assignments: p.ai.chooseAttacks(this, p) }; }
    let attacked = false;
    for (let n = 0; n < 2 && plan && plan.action === 'attack' && !this.winner && !p.dead; n++) {
      if (plan.assignments && plan.assignments.length) { await this.combatPhase(p, plan.assignments); attacked = true; }
      if (!p.extraCombat || n > 0 || this.winner || p.dead) break;
      p.extraCombat = false; for (const b of p.battlefield) if (b.card.isCreature) b.tapped = false;
      plan = p.human ? await this.hooks.humanTurn(p, 'combat2', this) : { action: 'attack', assignments: p.ai.chooseAttacks(this, p) };
    }
    if (this.winner || p.dead) return;
    this.phase = 'main2'; this.step = 'main2'; await this.emit({ type: 'step', step: 'main2', p });
    if (p.human && this.hooks.humanTurn) { if (plan && plan.action !== 'end') await this.hooks.humanTurn(p, 'main2', this); }
    else await p.ai.mainPhase(this, p, true);
    if (this.winner || p.dead) return;
    this.phase = 'end'; await this.priorityRound('end', p);
  }
  async cleanup(p) {
    while (p.hand.length > 7) { const c = p.ai ? p.ai.chooseDiscard(this, p) : (this.hooks.humanDiscard ? await this.hooks.humanDiscard(p) : p.hand[0]); p.hand.splice(p.hand.indexOf(c), 1); p.graveyard.push(c); this.say(`discards ${c.name}`, p); }
    p.pumpUntilEOT = 0;
  }
  nextPlayer() { let n = this.active; do { n = (n + 1) % this.players.length; } while (this.players[n].dead && this.alive().length > 1); this.active = n; return this.players[n]; }
  /** full game loop. Human turns are driven by hooks (humanTurn / humanPriority / humanBlocks / humanChooseFetch). */
  async run() {
    let safety = 0;
    while (!this.winner && safety++ < 600) {
      const p = this.players[this.active];
      if (!p.dead) { await this.takeTurn(p); if (!p.dead && !this.winner) await this.cleanup(p); }
      if (this.alive().length <= 1) { if (!this.winner && this.alive().length) { this.winner = this.alive()[0]; await this.emit({ type: 'win', p: this.winner }); } break; }
      this.nextPlayer();
    }
    return this.winner;
  }
}

// ============================== AI ==============================
// difficulty: 'casual' | 'focused' | 'cutthroat'
class AI {
  constructor(level = 'focused', rng = Math.random) { this.level = level; this.rng = rng; }
  W() { return { casual: { power: 1, evasive: 0.3, engines: 0.5, mana: 0, cmd: 0.5, lethal: 1, life: 0, cmddmg: 0.3 },
                 focused: { power: 1, evasive: 0.8, engines: 1.5, mana: 0.3, cmd: 1, lethal: 2, life: 0.5, cmddmg: 0.6 },
                 cutthroat: { power: 1, evasive: 1.2, engines: 2.5, mana: 0.6, cmd: 1.5, lethal: 3, life: 1, cmddmg: 1 } }[this.level]; }
  boardPower(game, q) { return q.battlefield.filter(b => b.card.isCreature).reduce((s, b) => s + game.powerOf(q, b), 0); }
  boardValue(game, q) { return q.battlefield.filter(b => !b.card.isLand).reduce((s, b) => s + this.permBase(b), 0); }
  /** how dangerous is opponent q right now, from my seat */
  threatOf(game, me, q) {
    const board = q.battlefield, creatures = board.filter(b => b.card.isCreature);
    const power = creatures.reduce((s, b) => s + game.powerOf(q, b), 0);
    const evasive = creatures.filter(b => b.card.kw.some(k => EVASIVE.includes(k))).reduce((s, b) => s + game.powerOf(q, b), 0);
    const engines = board.filter(b => b.card.roles.includes('engine') || b.card.roles.includes('draw') || b.card.isPlaneswalker).length;
    const mana = board.filter(b => b.card.isLand || b.card.roles.includes('ramp')).length;
    const cmdOut = board.some(b => b.card.isCommander) ? 1 : 0;
    const cmdDmgOnMe = me.cmdDamage[q.i] || 0;
    const lethalSoon = power >= me.life ? 3 : power >= me.life / 2 ? 1.5 : 0;
    const lifeLead = (q.life - 40) / 20;
    const handSize = q.hand.length;
    const w = this.W();
    return power * w.power + evasive * w.evasive + engines * 4 * w.engines + mana * w.mana + cmdOut * 3 * w.cmd + lethalSoon * 4 * w.lethal + lifeLead * 2 * w.life + cmdDmgOnMe / 3 * w.cmddmg + (this.level === 'cutthroat' ? handSize * 0.4 : 0);
  }
  permBase(b) {
    const c = b.card; let v = 0;
    if (c.isCreature) v += c.power * 1.2 + c.toughness * 0.3 + c.kw.length * 1.5 + (c.kw.some(k => EVASIVE.includes(k)) ? 2 : 0);
    if (c.roles.includes('engine')) v += 5;
    if (c.isPlaneswalker) v += 7;
    if (c.roles.includes('draw')) v += 3;
    if (c.roles.includes('ramp') && !c.isLand) v += 1.5;
    if (c.isCommander) v += 4;
    if (c.roles.includes('wincon')) v += 8;
    return v;
  }
  permValue(b, owner, game, me) {
    const c = b.card; let v = this.permBase(b);
    if (this.level === 'casual') v = c.isCreature ? c.power * 1.5 + 1 : 2;      // casual just sees big bodies
    if (this.level === 'cutthroat' && (c.roles.includes('engine') || c.roles.includes('draw'))) v += 4;
    if (this.level === 'cutthroat' && c.isCommander) v += 3;
    return v * (1 + this.threatOf(game, me, owner) / 40);
  }
  bestTarget(game, me, filter = () => true) {
    let best = null, bv = -1;
    for (const q of game.opponentsOf(me)) for (const b of q.battlefield) {
      if (b.card.isLand || !filter(b)) continue;
      if (b.card.kw.includes('hexproof')) continue;
      const v = this.permValue(b, q, game, me); if (v > bv) { bv = v; best = b; best.owner = q.i; }
    }
    return best ? { perm: best, value: bv } : null;
  }

  // ---------- counterspell judgement ----------
  /** how bad is it for me if `spell` resolves? positive = counter-worthy */
  spellThreat(game, me, spell) {
    const c = spell.card, caster = spell.caster, t = spell.target;
    const casterThreat = this.threatOf(game, me, caster);
    let v = c.cmc * 0.6;
    if (c.isCreature) v += game.powerOf(caster, { card: c, counters: 0 }) * 0.8 + c.kw.length * 0.8 + (c.kw.some(k => EVASIVE.includes(k)) ? 2 : 0);
    if (c.roles.includes('engine')) v += this.level === 'casual' ? 2 : 6;
    if (c.roles.includes('draw') && !c.isInstant && !c.isSorcery) v += this.level === 'casual' ? 1 : 4;
    if (c.isPlaneswalker) v += 7;
    if (c.isCommander) v += this.level === 'casual' ? 2 : 3 + caster.cmdTax * 0.75; // re-casts get pricier, so countering a commander costs them more
    if (c.roles.includes('wincon')) v += 25;
    if (c.roles.includes('extracombat')) v += this.boardPower(game, caster) >= me.life / 2 ? 12 : 4;
    if (c.roles.includes('pump')) v += this.boardPower(game, caster) + (c.pumpN || 1) * caster.battlefield.filter(b => b.card.isCreature).length >= me.life ? 15 : 2;
    if (c.roles.includes('tokens')) v += (c.tokenCount || 1) * c.tokenPT[0] * 0.8;
    if (c.roles.includes('ramp')) v += game.round <= 3 ? (this.level === 'cutthroat' ? 3 : 1) : 0;
    if (c.roles.includes('wipe')) {
      // a wipe is bad for me only if I lose more than the table does
      const mine = this.boardValue(game, me), others = game.opponentsOf(me).filter(q => q !== caster).reduce((s, q) => s + this.boardValue(game, q), 0) / Math.max(1, game.opponentsOf(me).length - 1), theirs = this.boardValue(game, caster);
      v += (mine - Math.max(others, theirs)) * 1.3;
    }
    if (c.roles.includes('removal') && t && t.card) v += t.owner === me.i ? this.permBase(t) * 1.4 + 3 : -4; // removal on someone else is fine by me
    if (c.dmg && t && t.i === me.i) v += c.dmg >= me.life ? 40 : c.dmg * 0.6;
    if (c.roles.includes('counter')) v += 0; // handled via depth
    // the leader's spells matter more; the player furthest behind is worth letting through
    v *= 1 + (casterThreat - this.avgThreat(game, me)) / (this.level === 'cutthroat' ? 25 : 40);
    return v;
  }
  avgThreat(game, me) { const o = game.opponentsOf(me); return o.reduce((s, q) => s + this.threatOf(game, me, q), 0) / Math.max(1, o.length); }
  chooseCounter(game, me, spell, options, depth) {
    // counter-wars: only fight back over a counter if the original spell was mine and mattered
    if (spell.card.roles.includes('counter') && spell.target && spell.target.spell) {
      const original = spell.target.spell; if (original.caster !== me) return null;
      const myVal = this.castValueRaw(game, me, original.card);
      if (this.level === 'casual' || myVal < 8) return null;
      return this.cheapestCounter(game, me, options, myVal >= 14);
    }
    if (spell.caster === me) return null;
    const threat = this.spellThreat(game, me, spell);
    const counters = me.hand.filter(c => c.roles.includes('counter')).length;
    let threshold = { casual: 6, focused: 9, cutthroat: 11 }[this.level];
    if (this.level === 'cutthroat') { threshold -= (counters - 1) * 2; if (game.round <= 2) threshold += 4; }
    if (this.level === 'focused' && counters >= 3) threshold -= 2;
    if (this.level === 'casual') { if (this.rng() < 0.35) return null; threshold += (this.rng() - 0.5) * 6; } // casual misses things and occasionally counters junk
    if (threat < threshold) return null;
    // cutthroat saves free counters (Force etc.) for big threats or when tapped out
    return this.cheapestCounter(game, me, options, threat >= 16 || this.level !== 'cutthroat');
  }
  cheapestCounter(game, me, options, allowFree) {
    const sorted = [...options].sort((a, b) => { const fa = game.castMode(me, a, 'hand', { instant: true }) === 'free' ? 1 : 0, fb = game.castMode(me, b, 'hand', { instant: true }) === 'free' ? 1 : 0; if (fa !== fb) return fa - fb; return a.mana.total - b.mana.total; });
    for (const c of sorted) { const mode = game.castMode(me, c, 'hand', { instant: true }); if (mode === 'mana' || (mode === 'free' && allowFree)) return c; }
    return null;
  }
  /** mana I want to keep open on my own turn for counters */
  reserveFor(game, me) {
    if (this.level === 'casual') return 0;
    const counters = me.hand.filter(c => c.roles.includes('counter') && !(c.counter.free && game.castMode(me, c) === 'free'));
    if (!counters.length) return 0;
    const cheapest = Math.min(...counters.map(c => c.mana.total));
    const maxT = Math.max(0, ...game.opponentsOf(me).map(q => this.threatOf(game, me, q)));
    if (this.level === 'focused') return game.round >= 3 ? cheapest : 0;
    return (game.round >= 2 || maxT > 10) ? cheapest : 0; // cutthroat holds up earlier
  }
  // ---------- instant-speed outside counters ----------
  combatResponse(game, me, attacker, onMe, options) {
    const incoming = onMe.reduce((s, a) => s + game.powerOf(attacker, a.attacker), 0);
    let best = null, bv = 0;
    for (const a of onMe) {
      const b = a.attacker; if (b.card.kw.includes('hexproof')) continue;
      const p = game.powerOf(attacker, b);
      let v = p + (b.card.isCommander ? (me.cmdDamage[attacker.i] || 0) / 3 + 3 : 0) + this.permBase(b) * 0.5;
      if (incoming >= me.life && incoming - p < me.life) v += 30; // removing this one saves my life
      if (b.card.isCommander && (me.cmdDamage[attacker.i] || 0) + p >= 21) v += 30;
      if (v > bv) { bv = v; best = b; }
    }
    const need = { casual: 12, focused: 7, cutthroat: 6 }[this.level];
    if (!best || bv < need) return null;
    const card = [...options].sort((x, y) => x.mana.total - y.mana.total)[0];
    best.owner = attacker.i; return { card, target: best };
  }
  endStepAction(game, me, activeP, options) {
    if (!options.length) return null;
    const nextIsMe = game.after(activeP)[0] === me; // I untap next: spend freely
    const keep = nextIsMe ? 0 : this.reserveFor(game, me);
    const spare = game.availableMana(me) - keep;
    if (spare <= 0) return null;
    const fits = options.filter(c => c.mana.total <= spare);
    const removal = fits.filter(c => c.roles.includes('removal'));
    if (removal.length) { const t = this.bestTarget(game, me, b => b.card.isCreature || /permanent|artifact|enchantment/.test(removal[0].oracle.toLowerCase())); if (t && t.value >= { casual: 99, focused: 7, cutthroat: 5 }[this.level]) return { card: removal[0], target: t.perm }; }
    const draw = fits.filter(c => c.roles.includes('draw')); if (draw.length && (nextIsMe || this.level === 'cutthroat')) return { card: draw[0] };
    const flashC = fits.filter(c => c.isCreature); if (flashC.length && nextIsMe) return { card: flashC.sort((a, b) => b.cmc - a.cmc)[0] };
    return null;
  }
  // ---------- main phase ----------
  castValueRaw(game, me, c) {
    let v = c.cmc;
    if (c.isCreature) v += 2 + c.power * 0.5 + c.kw.length * 0.5;
    if (c.roles.includes('engine')) v += 4; if (c.roles.includes('wincon')) v += 8; if (c.isCommander) v += 4;
    return v;
  }
  castValue(game, me, c) {
    const opps = game.opponentsOf(me); const myCreatures = me.battlefield.filter(b => b.card.isCreature).length;
    const maxThreat = Math.max(0, ...opps.map(q => this.threatOf(game, me, q)));
    let v = c.cmc;
    if (c.roles.includes('counter')) return -99; // never main-phase a counterspell
    if (c.roles.includes('ramp')) v += game.round <= 4 ? 6 : 1;
    if (c.roles.includes('draw')) v += me.hand.length <= 3 ? 5 : 2;
    if (c.roles.includes('wipe')) { const oppPower = opps.reduce((s, q) => s + this.boardPower(game, q), 0); const myPower = this.boardPower(game, me); v += (oppPower >= myPower * 2 + 6 || opps.some(q => this.boardPower(game, q) >= me.life)) ? 10 : -12; }
    if (c.roles.includes('removal')) { const t = this.bestTarget(game, me, b => b.card.isCreature); v += t ? 3 + maxThreat / 8 : -8; if (c.flash && this.level !== 'casual') v -= 3; } // flash removal: prefer holding it
    if (c.isCreature) v += 2 + c.power * 0.5 + c.kw.length * 0.5 + (c.roles.includes('engine') ? 2 : 0);
    if (c.roles.includes('pump')) v += myCreatures >= 3 ? 4 : -5;
    if (c.roles.includes('tokens')) v += 2;
    if (c.roles.includes('wincon')) v += game.round >= 5 ? 6 : -3;
    if (c.isInstant && !c.roles.length) v -= 3;
    if (c.isInstant && c.roles.includes('draw') && this.level === 'cutthroat') v -= 2; // cast at end of opponent's turn instead
    if (this.level === 'casual') v += (this.rng() - 0.5) * 6;
    if (this.level === 'cutthroat' && c.roles.includes('engine')) v += 3;
    return v;
  }
  chooseDiscard(game, p) { return [...p.hand].sort((a, b) => this.castValue(game, p, a) - this.castValue(game, p, b))[0]; }
  chooseLand(me) {
    const lands = me.hand.filter(c => c.isLand); if (!lands.length) return null;
    const have = new Set(me.battlefield.filter(b => b.card.isLand).flatMap(b => b.card.produces));
    const need = new Set([...me.hand, ...me.command].filter(c => !c.isLand).flatMap(c => c.colors));
    return lands.sort((a, b) => { const fa = a.produces.filter(x => need.has(x) && !have.has(x)).length, fb = b.produces.filter(x => need.has(x) && !have.has(x)).length; if (fb !== fa) return fb - fa; return (a.etbTapped ? 1 : 0) - (b.etbTapped ? 1 : 0); })[0];
  }
  /** main phase: (main1) crack fetches, land drop; then spend mana by value */
  async mainPhase(game, me, second) {
    if (!second) {
      const land = this.chooseLand(me); if (land) await game.playLand(me, land);
      // crack fetches now only if the mana matters this turn; otherwise hold them for the end step before my turn
      for (const b of [...me.battlefield]) if (b.card.fetch && game.canActivate(me, b) && me.life > b.card.fetch.life + 2 && game.fetchTargets(me, b).length && this.needManaNow(game, me)) await game.activateFetch(me, b);
    }
    let guard = 12; const skip = new Set();
    while (guard-- > 0 && !game.winner && !me.dead) {
      const reserve = this.reserveFor(game, me);
      const options = [];
      for (const c of me.hand) if (!skip.has(c) && game.castMode(me, c, 'hand')) options.push({ c, v: this.castValue(game, me, c), zone: 'hand' });
      for (const c of me.command) if (game.castMode(me, c, 'cmd')) options.push({ c, v: this.castValue(game, me, c) + (this.level === 'casual' ? 6 : 4) - me.cmdTax, zone: 'cmd' });
      if (!options.length) break;
      options.sort((a, b) => b.v - a.v);
      // respect counter reserve unless the play is clearly worth tapping out for
      const pick = options.find(o => o.v >= 12 || !reserve || game.canPayCost(me, game.costOf(me, o.c, o.zone), reserve));
      if (!pick || pick.v < (this.level === 'cutthroat' ? -2 : -4)) break;
      let target = null;
      if (pick.c.roles.includes('removal')) { const t = this.bestTarget(game, me, b => b.card.isCreature); target = t && t.perm; }
      if (pick.c.dmg && !pick.c.roles.includes('removal') && !pick.c.roles.includes('wipe')) target = this.pickFace(game, me);
      if (pick.c.roles.includes('removal') && !target) { skip.add(pick.c); continue; }
      const ok = await game.cast(me, pick.c, pick.zone, target);
      if (!ok && game.castMode(me, pick.c, pick.zone)) skip.add(pick.c); // countered or failed; avoid loops
    }
  }
  needManaNow(game, me) {
    if (this.level === 'casual') return true;
    const avail = game.availableMana(me);
    const wants = [...me.hand.filter(c => !c.isLand && !c.roles.includes('counter')).map(c => [c, 'hand']), ...me.command.map(c => [c, 'cmd'])];
    // a spell becomes castable with one more mana (or the right colour) this turn
    return wants.some(([c, z]) => { const cost = game.costOf(me, c, z); return cost.total <= avail + 1 && !game.canPayCost(me, cost) && this.castValue(game, me, c) > 0; });
  }
  /** what to do with priority outside my main phase */
  priorityAction(game, me, step, active, options, ctx) {
    const fetches = options.filter(o => o.kind === 'fetch' && me.life > o.card.fetch.life + 2 && game.fetchTargets(me, o.perm).length);
    if (fetches.length) {
      const beforeMe = game.after(active)[0] === me;
      if (this.level === 'casual' ? active === me : (step === 'end' && beforeMe) || (active === me && step === 'upkeep')) return fetches[0];
    }
    const casts = options.filter(o => o.kind === 'cast').map(o => o.card);
    if (!casts.length) return null;
    if (step === 'declareAttackers' && ctx.attacks && active !== me) {
      const onMe = ctx.attacks.filter(a => a.defender === me && active.battlefield.includes(a.attacker));
      const removal = casts.filter(c => c.roles.includes('removal'));
      if (onMe.length && removal.length) { const r = this.combatResponse(game, me, active, onMe, removal); if (r) return { kind: 'cast', card: r.card, target: r.target }; }
    }
    if (step === 'end' && active !== me) { const r = this.endStepAction(game, me, active, casts); if (r) return { kind: 'cast', card: r.card, target: r.target }; }
    return null;
  }
  chooseFetch(game, me, pool, n = 1) {
    const have = new Set(me.battlefield.filter(b => b.card.isLand).flatMap(b => b.card.produces));
    const need = new Set([...me.hand, ...me.command].filter(c => !c.isLand).flatMap(c => c.colors));
    const score = c => c.produces.filter(x => need.has(x) && !have.has(x)).length * 3 + c.produces.length - (c.etbTapped ? 1.5 : 0);
    const out = [], names = new Set();
    for (const c of [...pool].sort((a, b) => score(b) - score(a))) { if (out.length >= n) break; if (n > 1 && names.has(c.name)) continue; out.push(c); names.add(c.name); }
    return out;
  }
  pickFace(game, me) { return [...game.opponentsOf(me)].sort((a, b) => this.threatOf(game, me, b) - this.threatOf(game, me, a))[0]; }
  chooseAttacks(game, me) {
    let attackers = me.battlefield.filter(b => game.canAttackWith(me, b) && game.powerOf(me, b) > 0);
    // mana creatures stay home (they're worth more as mana, especially with counter mana to hold up) unless the swing is lethal
    const totalP = attackers.reduce((s, a) => s + game.powerOf(me, a), 0);
    if (this.level !== 'casual' && !game.opponentsOf(me).some(q => totalP >= q.life)) attackers = attackers.filter(b => !(b.card.roles.includes('ramp') && game.powerOf(me, b) <= 2));
    if (!attackers.length) return [];
    const myPower = attackers.reduce((s, a) => s + game.powerOf(me, a), 0);
    const oppsPower = game.opponentsOf(me).map(q => this.boardPower(game, q));
    const ahead = myPower >= Math.max(1, ...oppsPower) * 1.5;
    const lateGame = game.round > 10 || (ahead && this.level !== 'casual');
    const opps = game.opponentsOf(me).map(q => ({ q, threat: this.threatOf(game, me, q), blockers: q.battlefield.filter(b => b.card.isCreature && !b.tapped) }));
    const lethalOn = opps.filter(o => myPower >= o.q.life && o.blockers.length === 0);
    let primary;
    if (lethalOn.length) primary = lethalOn.sort((a, b) => b.threat - a.threat)[0];
    else if (this.level === 'casual') primary = opps.sort((a, b) => a.q.life - b.q.life)[0];
    else primary = opps.sort((a, b) => b.threat - a.threat)[0];
    const biggestOppPower = Math.max(0, ...opps.map(o => o.blockers.reduce((s, b) => s + game.powerOf(o.q, b), 0)));
    let keepHome = 0;
    if (this.level !== 'casual' && !lethalOn.length) while (biggestOppPower - keepHome * 3 >= me.life * (this.level === 'cutthroat' ? 0.9 : 0.75) && keepHome < Math.floor(attackers.length / 2)) keepHome++;
    const sorted = [...attackers].sort((a, b) => { const ea = a.card.kw.some(k => EVASIVE.includes(k)) ? 1 : 0, eb = b.card.kw.some(k => EVASIVE.includes(k)) ? 1 : 0; if (eb !== ea) return eb - ea; return game.powerOf(me, b) - game.powerOf(me, a); });
    let n = 0;
    const going = sorted.slice(0, sorted.length - keepHome).filter(a => {
      if (this.level === 'casual' || lethalOn.length || lateGame) return true;
      const evasive = a.card.kw.some(k => EVASIVE.includes(k));
      const eats = primary.blockers.filter(b => game.canBlock(b, a) && game.powerOf(primary.q, b) >= game.toughOf(me, a) && game.toughOf(primary.q, b) > game.powerOf(me, a)).length;
      return evasive || a.card.kw.includes('indestructible') || eats === 0 || n++ >= primary.blockers.length;
    });
    if (!going.length) return [];
    const assignments = going.map(a => ({ attacker: a, defender: primary.q }));
    if (this.level === 'cutthroat' && primary.blockers.length) { const weakest = opps.filter(o => o !== primary).sort((a, b) => a.q.life - b.q.life)[0]; if (weakest && !weakest.blockers.length) for (const as of assignments) if (as.attacker.card.kw.some(k => ['flying', 'unblockable'].includes(k)) && weakest.q.life <= game.powerOf(me, as.attacker) * 3) as.defender = weakest.q; }
    return assignments;
  }
  chooseBlocks(game, me, attackerP, attacks, blockers) {
    const out = new Map(); const free = [...blockers];
    const incoming = attacks.reduce((s, a) => s + game.powerOf(attackerP, a.attacker), 0);
    let lifeAfter = me.life - incoming;
    // biggest attackers first
    for (const { attacker } of [...attacks].sort((a, b) => game.powerOf(attackerP, b.attacker) - game.powerOf(attackerP, a.attacker))) {
      const can = free.filter(b => game.canBlock(b, attacker)); if (!can.length) continue;
      const ap = game.powerOf(attackerP, attacker), at = game.toughOf(attackerP, attacker);
      const safe = can.filter(b => game.toughOf(me, b) > ap && !attacker.card.kw.includes('deathtouch'));
      const trade = can.filter(b => game.powerOf(me, b) >= at || b.card.kw.includes('deathtouch'));
      const cmdLethal = attacker.card.isCommander && (me.cmdDamage[attackerP.i] || 0) + ap >= 21;
      let pick = null;
      if (this.level === 'casual') { if (lifeAfter <= 0) pick = can.sort((a, b) => game.toughOf(me, b) - game.toughOf(me, a))[0]; else pick = safe[0] || null; }
      else {
        if (safe.length) pick = safe.sort((a, b) => game.powerOf(me, a) - game.powerOf(me, b))[0];
        else if (trade.length && this.permValue(trade[0], me, game, me) <= this.permValue(attacker, attackerP, game, me)) pick = trade.sort((a, b) => this.permBase(a) - this.permBase(b))[0];
        else if (lifeAfter <= 0 || cmdLethal) pick = can.sort((a, b) => this.permBase(a) - this.permBase(b))[0]; // chump to survive
        else if (this.level === 'cutthroat' && lifeAfter <= 8) pick = can.sort((a, b) => this.permBase(a) - this.permBase(b))[0];
      }
      if (pick) { out.set(attacker, pick); free.splice(free.indexOf(pick), 1); if (!attacker.card.kw.includes('trample')) lifeAfter += ap; }
    }
    return out;
  }
  keep(hand, mulls = 0) {
    const lands = hand.filter(c => c.isLand).length; const cheap = hand.filter(c => !c.isLand && c.cmc <= 3).length;
    if (mulls >= 2) return lands >= 1 && lands <= 6;            // going to 5 or fewer is worse than a mediocre 7
    if (mulls === 1) return lands >= 2 && lands <= 5 || (lands === 6 && cheap >= 1);
    if (this.level === 'casual') return lands >= 2 && lands <= 5;
    return lands >= 2 && lands <= 5 && cheap >= 1;
  }
  bottomChoice(hand, n) {
    const lands = hand.filter(c => c.isLand), spells = hand.filter(c => !c.isLand).sort((a, b) => b.cmc - a.cmc);
    const out = []; while (out.length < n) { if (lands.length > 4) out.push(lands.pop()); else if (spells.length) out.push(spells.shift()); else out.push(lands.pop()); } return out;
  }
}

root.Goldfish = { Game, AI, buildDeck, tagCard, manaInfo, counterHits, shuffle, mulberry, EVASIVE };
})(typeof window !== 'undefined' ? window : globalThis);
