/* Upgrade Radar — Goldfish Table
   A rules-lite 4-seat Commander simulator. It knows card types, costs, P/T, keywords and a few tagged
   roles (ramp, draw, removal, wipe, pump). It does NOT resolve oracle text. Treat results as curve/speed
   feedback, not as a verdict on specific interactions.
   Exposed as window.Goldfish = { Game, AI, buildDeck, tagCard } so index.html and headless tests share it. */
(function (root) {
'use strict';

// ---------- card tagging (from slim Scryfall objects: name, mana, type, oracle, cmc, power?, toughness?) ----------
const KW = ['flying','trample','menace','haste','lifelink','deathtouch','first strike','double strike','vigilance','hexproof','indestructible','flash','reach','ward','unblockable','skulk','shadow','fear','intimidate','horsemanship','defender'];
function manaInfo(cost) {
  // returns {generic, pips:{W,U,B,R,G}, total, x}
  const pips = { W: 0, U: 0, B: 0, R: 0, G: 0 }; let generic = 0, x = false;
  for (const m of (cost || '').match(/\{[^}]+\}/g) || []) {
    const s = m.slice(1, -1);
    if (/^\d+$/.test(s)) generic += +s;
    else if (s === 'X') x = true;
    else if (/^[WUBRG]$/.test(s)) pips[s]++;
    else if (/\//.test(s)) { const c = s.split('/').find(p => /^[WUBRG]$/.test(p)); if (c) pips[c]++; else generic++; } // hybrid: pick first colour; phyrexian: colour
    else if (s === 'C') generic++;
    else generic++;
  }
  const total = generic + Object.values(pips).reduce((a, b) => a + b, 0);
  return { generic, pips, total, x };
}
function tagCard(c) {
  const t = c.type || '', o = (c.oracle || '').toLowerCase();
  const front = t.split(' // ')[0];
  const isLand = /\bLand\b/.test(front);
  const card = {
    name: c.name, type: front, oracle: c.oracle || '', cmc: isLand ? 0 : (c.cmc || 0), mana: manaInfo(c.mana),
    img: c.img || '', isLand, isCreature: /\bCreature\b/.test(front), isInstant: /\bInstant\b/.test(front), isSorcery: /\bSorcery\b/.test(front),
    isArtifact: /\bArtifact\b/.test(front), isEnchantment: /\bEnchantment\b/.test(front), isPlaneswalker: /\bPlaneswalker\b/.test(front),
    isLegendary: /\bLegendary\b/.test(front),
    power: parseInt(c.power) || (c.power === '*' ? 2 : 0), toughness: parseInt(c.toughness) || (c.toughness === '*' ? 2 : 0), kw: [...new Set(KW.filter(k => new RegExp('\\b' + k + '\\b').test(o)).concat((c.keywords || []).map(k => k.toLowerCase()).filter(k => KW.includes(k))))],
    roles: [], produces: [],
  };
  if (isLand) {
    for (const col of 'WUBRG') if (new RegExp('add \\{' + col + '\\}|\\{t\\}: add \\{[^}]*' + col, 'i').test(o) || new RegExp('\\b' + { W: 'plains', U: 'island', B: 'swamp', R: 'mountain', G: 'forest' }[col] + '\\b', 'i').test(front)) card.produces.push(col);
    if (/add one mana of any color|add .*mana of any (one )?color|any type/i.test(o) || /command tower|mana confluence|city of brass|exotic orchard|reflecting pool|forbidden orchard|gemstone caverns|cavern of souls|path of ancestry|prismatic vista/i.test(c.name)) card.produces = ['W', 'U', 'B', 'R', 'G'];
    if (!card.produces.length && /add \{c\}|\{t\}: add/i.test(o)) card.produces = ['C'];
    if (!card.produces.length && /fetch|search your library for a .*land/i.test(o)) card.produces = ['W', 'U', 'B', 'R', 'G']; // fetchlands: treat as any colour
    if (!card.produces.length) card.produces = ['C'];
    card.etbTapped = /enters (the battlefield )?tapped/i.test(o) && !/unless/i.test(o);
    return card;
  }
  // roles (coarse; mirrors the radar's heuristics)
  const r = card.roles;
  if (/add \{|add (one|two|three) mana|search your library for (up to \w+ )?(a )?basic land|lands? onto the battlefield|treasure token/.test(o)) r.push('ramp');
  if (/draw (a|two|three|x|\d+) cards?|draw cards|investigate|clue token/.test(o)) r.push('draw');
  if (/destroy all|exile all|each creature|all creatures|deals? \d+ damage to each/.test(o)) r.push('wipe');
  else if (/destroy target|exile target (creature|permanent|nonland|artifact|enchantment)|deals? \d+ damage to (any target|target creature)|fight|-\d\/-\d|sacrifices? a creature/.test(o)) r.push('removal');
  if (/counter target/.test(o)) r.push('counter');
  if (/creatures you control get \+|each creature you control gets \+/.test(o)) r.push('pump');
  if (/create (a|an|two|three|x|\d+) .* tokens?/.test(o)) r.push('tokens');
  if (/extra combat|additional combat/.test(o)) r.push('extracombat');
  if (/hexproof|indestructible|protection|phase out/.test(o) && (card.isInstant || card.isEnchantment || card.isArtifact)) r.push('protect');
  if (/gain \w+ life|lifelink/.test(o)) r.push('lifegain');
  if (/you win the game|loses the game|infinite/.test(o)) r.push('wincon');
  if (card.isCreature && /whenever|at the beginning/.test(o)) r.push('engine');
  const tokN = o.match(/create (a|an|two|three|four|\d+)/); card.tokenCount = tokN ? ({ a: 1, an: 1, two: 2, three: 3, four: 4 }[tokN[1]] || parseInt(tokN[1]) || 1) : 0;
  const tokPT = o.match(/(\d+)\/(\d+) [a-z ]*creature token/); card.tokenPT = tokPT ? [+tokPT[1], +tokPT[2]] : [1, 1];
  const dmg = o.match(/deals? (\d+) damage/); card.dmg = dmg ? +dmg[1] : 0;
  const drawN = o.match(/draw (a|two|three|four|\d+) cards?/); card.drawN = drawN ? ({ a: 1, two: 2, three: 3, four: 4 }[drawN[1]] || parseInt(drawN[1]) || 1) : 0;
  const pump = o.match(/get \+(\d+)\/\+(\d+)/); card.pumpN = pump ? +pump[1] : 0;
  const gain = o.match(/gain (\d+) life/); card.gainN = gain ? +gain[1] : 0;
  return card;
}

// ---------- deck building ----------
function buildDeck(cards, commanderNames) {
  const cmd = new Set(commanderNames.map(n => n.toLowerCase()));
  const library = [], commanders = [];
  for (const c of cards) (cmd.has(c.name.toLowerCase()) ? commanders : library).push(tagCard(c));
  return { library, commanders };
}
function shuffle(a, rng) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function mulberry(seed) { return function () { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------- game ----------
class Game {
  constructor(seats, opts = {}) {
    // seats: [{name, deck:{library,commanders}, human:bool, ai:AI|null}]
    this.rng = mulberry(opts.seed || Date.now() & 0xffffffff);
    this.log = []; this.turn = 0; this.active = 0; this.winner = null; this.onLog = opts.onLog || (() => {});
    this.players = seats.map((s, i) => ({
      i, name: s.name, human: !!s.human, ai: s.ai || null, life: 40, poison: 0, dead: false,
      library: shuffle([...s.deck.library], this.rng), hand: [], battlefield: [], graveyard: [], exile: [],
      command: [...s.deck.commanders], cmdTax: 0, landsThisTurn: 0, cmdDamage: {}, mulligans: 0,
    }));
    for (const p of this.players) this.draw(p, 7);
  }
  say(msg, p) { const line = (p ? p.name + ': ' : '') + msg; this.log.push({ t: this.turn, m: line }); this.onLog(line); }
  draw(p, n = 1) { for (let k = 0; k < n; k++) { if (!p.library.length) { p.deckedOut = true; this.kill(p, 'drew from an empty library'); return; } p.hand.push(p.library.pop()); } }
  mulligan(p) { // London mulligan
    p.library.push(...p.hand); p.hand = []; shuffle(p.library, this.rng); this.draw(p, 7); p.mulligans++;
    if (p.mulligans > 0) { const bottom = p.hand.splice(0, 0); } // bottoming chosen by caller via bottomCards
  }
  bottomCards(p, cards) { for (const c of cards) { const i = p.hand.indexOf(c); if (i >= 0) { p.hand.splice(i, 1); p.library.unshift(c); } } }
  alive() { return this.players.filter(p => !p.dead); }
  opponentsOf(p) { return this.alive().filter(q => q !== p); }
  kill(p, why) { if (p.dead) return; p.dead = true; this.say(`is out (${why})`, p); const a = this.alive(); if (a.length === 1) { this.winner = a[0]; this.say(`${a[0].name} wins on turn ${this.turn}`); } }
  // --- mana (rules-lite: lands tap for one of their colours; rocks/dorks counted as permanents with 'ramp' producing one mana of any colour) ---
  manaSources(p) { return p.battlefield.filter(b => !b.tapped && !b.summoning && (b.card.isLand || (b.card.roles.includes('ramp') && (b.card.isArtifact || b.card.isCreature)))); }
  canPay(p, card) {
    const srcs = this.manaSources(p); if (srcs.length < card.mana.total) return false;
    // greedy colour assignment
    const pool = srcs.map(s => s.card.isLand ? s.card.produces : ['W', 'U', 'B', 'R', 'G']);
    const need = { ...card.mana.pips }; const used = new Set();
    for (const col of 'WUBRG') while (need[col] > 0) { const i = pool.findIndex((pr, idx) => !used.has(idx) && pr.includes(col)); if (i < 0) return false; used.add(i); need[col]--; }
    return pool.length - used.size >= card.mana.generic;
  }
  pay(p, card) { const srcs = this.manaSources(p); let n = card.mana.total; // tap lands first that match colours, generic from the rest
    const need = { ...card.mana.pips };
    for (const s of srcs) { if (n <= 0) break; const pr = s.card.isLand ? s.card.produces : ['W', 'U', 'B', 'R', 'G']; const col = 'WUBRG'.split('').find(c => need[c] > 0 && pr.includes(c)); if (col) { need[col]--; s.tapped = true; n--; } }
    for (const s of srcs) { if (n <= 0) break; if (!s.tapped) { s.tapped = true; n--; } } }
  availableMana(p) { return this.manaSources(p).length; }
  // --- playing ---
  playLand(p, card) { const i = p.hand.indexOf(card); if (i < 0 || p.landsThisTurn >= 1) return false; p.hand.splice(i, 1); p.battlefield.push({ card, tapped: !!card.etbTapped, summoning: false, damage: 0, counters: 0 }); p.landsThisTurn++; this.say(`plays ${card.name}`, p); return true; }
  castFromHand(p, card, target) { const i = p.hand.indexOf(card); if (i < 0 || !this.canPay(p, card)) return false; p.hand.splice(i, 1); this.pay(p, card); this.resolve(p, card, target); return true; }
  castCommander(p, card, target) { const i = p.command.indexOf(card); if (i < 0) return false; const taxed = { ...card, mana: { ...card.mana, total: card.mana.total + p.cmdTax, generic: card.mana.generic + p.cmdTax } }; if (!this.canPay(p, taxed)) return false; p.command.splice(i, 1); this.pay(p, taxed); p.cmdTax += 2; card.isCommander = true; this.resolve(p, card, target); return true; }
  resolve(p, card, target) {
    this.say(`casts ${card.name}${target ? ' → ' + (target.card ? target.card.name : target.name) : ''}`, p);
    const perm = card.isCreature || card.isArtifact || card.isEnchantment || card.isPlaneswalker;
    // effects (coarse)
    if (card.roles.includes('wipe')) { for (const q of this.alive()) { const dead = q.battlefield.filter(b => b.card.isCreature && !b.card.kw.includes('indestructible')); for (const b of dead) this.destroy(q, b); } this.say(`— board wiped`, p); }
    else if (card.roles.includes('removal') && target && target.card) { const owner = this.players[target.owner]; if (!target.card.kw.includes('indestructible') && !target.card.kw.includes('hexproof')) this.destroy(owner, target); else this.say(`— ${target.card.name} shrugs it off`, p); }
    if (card.dmg && target && !target.card) { target.life -= card.dmg; this.say(`— ${target.name} takes ${card.dmg}`, p); if (target.life <= 0) this.kill(target, 'ran out of life'); }
    if (card.drawN) this.draw(p, card.drawN);
    if (card.gainN) p.life += card.gainN;
    if (card.roles.includes('ramp') && (card.isSorcery || card.isInstant)) { const land = p.library.find(c => c.isLand && c.produces.length); if (land) { p.library.splice(p.library.indexOf(land), 1); p.battlefield.push({ card: land, tapped: true, summoning: false, damage: 0 }); this.say(`— fetches ${land.name}`, p); } }
    if (card.tokenCount && card.roles.includes('tokens')) for (let k = 0; k < Math.min(card.tokenCount, 8); k++) p.battlefield.push({ card: { name: 'Token', type: 'Creature', isCreature: true, power: card.tokenPT[0], toughness: card.tokenPT[1], kw: [], roles: [], mana: { total: 0 }, cmc: 0, token: true }, tapped: false, summoning: true, damage: 0 });
    if (card.roles.includes('pump')) p.pumpUntilEOT = (p.pumpUntilEOT || 0) + (card.pumpN || 1);
    if (card.roles.includes('extracombat')) p.extraCombat = true;
    if (perm) p.battlefield.push({ card, tapped: false, summoning: card.isCreature, damage: 0, loyalty: card.isPlaneswalker ? 4 : 0 });
    else p.graveyard.push(card);
    if (card.roles.includes('wincon') && this.rng() < 0.15 && this.turn >= 6) { this.say(`— ${card.name} goes off!`, p); for (const q of this.opponentsOf(p)) this.kill(q, `${p.name}'s ${card.name}`); }
  }
  destroy(owner, perm) { const i = owner.battlefield.indexOf(perm); if (i < 0) return; owner.battlefield.splice(i, 1); if (perm.card.isCommander) { owner.command.push(perm.card); this.say(`— ${perm.card.name} returns to the command zone`, owner); } else if (!perm.card.token) owner.graveyard.push(perm.card); }
  // --- combat ---
  attack(p, assignments) { // assignments: [{attacker, defender(player)}]
    const results = []; const deaths = []; const kill0 = this.kill.bind(this); this.kill = (q, why) => { if (!q.dead) deaths.push([q, why]); q.dead = true; };
    for (const { attacker, defender } of assignments) {
      if (attacker.tapped || attacker.summoning && !attacker.card.kw.includes('haste')) continue;
      if (!attacker.card.kw.includes('vigilance')) attacker.tapped = true;
      const blockers = defender.battlefield.filter(b => b.card.isCreature && !b.tapped && this.canBlock(b, attacker));
      const blocker = defender.human ? null : (defender.ai ? defender.ai.chooseBlocker(this, defender, attacker, blockers) : null);
      const pw = attacker.card.power + (p.pumpUntilEOT || 0) + (attacker.counters || 0);
      if (blocker) {
        const bp = blocker.card.power + (blocker.counters || 0);
        const aDies = bp >= attacker.card.toughness + (attacker.counters || 0) || blocker.card.kw.includes('deathtouch');
        const bDies = pw >= blocker.card.toughness + (blocker.counters || 0) || attacker.card.kw.includes('deathtouch');
        if (attacker.card.kw.includes('first strike') && bDies) { this.destroy(defender, blocker); results.push(`${attacker.card.name} kills ${blocker.card.name} first`); continue; }
        if (bDies && !blocker.card.kw.includes('indestructible')) this.destroy(defender, blocker);
        if (aDies && !attacker.card.kw.includes('indestructible')) this.destroy(p, attacker);
        if (attacker.card.kw.includes('trample') && bDies) { const over = Math.max(0, pw - blocker.card.toughness); defender.life -= over; }
        results.push(`${blocker.card.name} blocks ${attacker.card.name}${bDies ? ' and dies' : ''}${aDies ? ', attacker dies' : ''}`);
      } else {
        const dmg = attacker.card.kw.includes('double strike') ? pw * 2 : pw; defender.life -= dmg;
        if (attacker.card.kw.includes('lifelink')) p.life += dmg;
        if (attacker.card.isCommander) { defender.cmdDamage[p.i] = (defender.cmdDamage[p.i] || 0) + dmg; if (defender.cmdDamage[p.i] >= 21) this.kill(defender, `commander damage from ${attacker.card.name}`); }
        results.push(`${attacker.card.name} hits ${defender.name} for ${dmg}`);
      }
      if (defender.life <= 0) this.kill(defender, 'ran out of life');
    }
    this.kill = kill0; if (results.length) this.say(results.join('; '), p);
    for (const [q, why] of deaths) { q.dead = false; this.kill(q, why); }
  }
  canBlock(b, a) { const k = a.card.kw; if (k.includes('unblockable') || k.includes('shadow') || k.includes('horsemanship')) return false; if (k.includes('flying') && !(b.card.kw.includes('flying') || b.card.kw.includes('reach'))) return false; if (k.includes('fear') || k.includes('intimidate')) return false; if (k.includes('menace')) return false; /* simplification: menace needs 2 blockers; we don't double-block */ return true; }
  // --- turn structure ---
  beginTurn(p) { this.turn++; p.landsThisTurn = 0; p.pumpUntilEOT = 0; p.extraCombat = false; for (const b of p.battlefield) { b.tapped = false; b.summoning = false; } if (this.turn > 1 || this.active !== 0) this.draw(p, 1); this.say(`— turn ${this.turn} —`, p); }
  endTurn(p) { // discard to 7
    while (p.hand.length > 7) { const c = p.ai ? p.ai.chooseDiscard(this, p) : p.hand[0]; p.hand.splice(p.hand.indexOf(c), 1); p.graveyard.push(c); }
    p.pumpUntilEOT = 0;
  }
  nextPlayer() { let n = this.active; do { n = (n + 1) % this.players.length; } while (this.players[n].dead && this.alive().length); this.active = n; return this.players[n]; }
  // run one AI turn end to end
  aiTurn(p) { this.beginTurn(p); if (p.dead) return; p.ai.playTurn(this, p); this.endTurn(p); }
}

// ---------- AI ----------
// difficulty: 'casual' | 'focused' | 'cutthroat'
class AI {
  constructor(level = 'focused', rng = Math.random) { this.level = level; this.rng = rng; }
  // --- threat assessment: how dangerous is each opponent right now? ---
  threatOf(game, me, q) {
    const board = q.battlefield;
    const creatures = board.filter(b => b.card.isCreature);
    const power = creatures.reduce((s, b) => s + b.card.power + (b.counters || 0), 0);
    const evasive = creatures.filter(b => b.card.kw.some(k => ['flying', 'unblockable', 'menace', 'trample', 'shadow'].includes(k))).reduce((s, b) => s + b.card.power, 0);
    const engines = board.filter(b => b.card.roles.includes('engine') || b.card.roles.includes('draw') || b.card.isPlaneswalker).length;
    const mana = board.filter(b => b.card.isLand || b.card.roles.includes('ramp')).length;
    const cmdOut = board.some(b => b.card.isCommander) ? 1 : 0;
    const cmdDmgOnMe = (me.cmdDamage[q.i] || 0);
    const lethalSoon = power >= me.life ? 3 : power >= me.life / 2 ? 1.5 : 0;
    const lifeLead = (q.life - 40) / 20;
    // weights by difficulty: casual looks only at raw power; cutthroat weights engines, evasion and tempo
    const w = { casual: { power: 1, evasive: 0.3, engines: 0.5, mana: 0, cmd: 0.5, lethal: 1, life: 0, cmddmg: 0.3 },
                focused: { power: 1, evasive: 0.8, engines: 1.5, mana: 0.3, cmd: 1, lethal: 2, life: 0.5, cmddmg: 0.6 },
                cutthroat: { power: 1, evasive: 1.2, engines: 2.5, mana: 0.6, cmd: 1.5, lethal: 3, life: 1, cmddmg: 1 } }[this.level];
    return power * w.power + evasive * w.evasive + engines * 4 * w.engines + mana * w.mana + cmdOut * 3 * w.cmd + lethalSoon * 4 * w.lethal + lifeLead * 2 * w.life + cmdDmgOnMe / 3 * w.cmddmg;
  }
  // --- how valuable is a permanent as a removal target? ---
  permValue(b, owner, game, me) {
    const c = b.card; let v = 0;
    if (c.isCreature) v += c.power * 1.2 + c.toughness * 0.3 + (c.kw.length) * 1.5 + (c.roles.includes('engine') ? 5 : 0) + (c.kw.some(k => ['flying', 'unblockable', 'menace'].includes(k)) ? 2 : 0);
    if (c.isPlaneswalker) v += 7;
    if (c.roles.includes('draw') || c.roles.includes('engine')) v += this.level === 'casual' ? 1 : 5;
    if (c.roles.includes('ramp') && !c.isLand) v += this.level === 'cutthroat' ? 2.5 : 0.5;
    if (c.isCommander) v += this.level === 'casual' ? 2 : 5;
    if (c.roles.includes('wincon')) v += 8;
    v *= 1 + this.threatOf(game, me, owner) / 40; // scale by how scary the owner is
    return v;
  }
  bestTarget(game, me, kind) {
    let best = null, bv = -1;
    for (const q of game.opponentsOf(me)) for (const b of q.battlefield) {
      if (kind === 'creature' && !b.card.isCreature) continue;
      if (b.card.kw.includes('hexproof') || b.card.kw.includes('indestructible')) continue;
      const v = this.permValue(b, q, game, me); if (v > bv) { bv = v; best = { ...b, owner: q.i, _ref: b }; }
    }
    return best ? Object.assign(best._ref, { owner: best.owner }) : null;
  }
  // --- card priority in hand ---
  castValue(game, me, c) {
    const opps = game.opponentsOf(me); const myCreatures = me.battlefield.filter(b => b.card.isCreature).length;
    const oppCreatures = opps.reduce((s, q) => s + q.battlefield.filter(b => b.card.isCreature).length, 0);
    const maxThreat = Math.max(0, ...opps.map(q => this.threatOf(game, me, q)));
    let v = c.cmc * 1.0; // bigger spells are generally better when castable
    if (c.roles.includes('ramp')) v += game.turn <= 4 ? 6 : 1;
    if (c.roles.includes('draw')) v += me.hand.length <= 3 ? 5 : 2;
    if (c.roles.includes('wipe')) { const oppPower = opps.reduce((s, q) => s + q.battlefield.filter(b => b.card.isCreature).reduce((t, b) => t + b.card.power, 0), 0); const myPower = me.battlefield.filter(b => b.card.isCreature).reduce((t, b) => t + b.card.power, 0); v += (oppPower >= myPower * 2 + 6 || oppPower >= me.life) ? 10 : -12; }
    if (c.roles.includes('removal')) v += this.bestTarget(game, me, 'creature') ? 3 + maxThreat / 8 : -8;
    if (c.isCreature) v += 2 + c.power * 0.5 + c.kw.length * 0.5 + (c.roles.includes('engine') ? 2 : 0);
    if (c.roles.includes('pump')) v += myCreatures >= 3 ? 4 : -5;
    if (c.roles.includes('tokens')) v += 2;
    if (c.roles.includes('wincon')) v += game.turn >= 5 ? 6 : -3;
    if (c.isInstant && !c.roles.length) v -= 3; // tricks we can't model: hold them
    if (this.level === 'casual') v += (this.rng() - 0.5) * 6; // casual plays loosely
    if (this.level === 'cutthroat' && c.roles.includes('engine')) v += 3;
    return v;
  }
  chooseDiscard(game, p) { return [...p.hand].sort((a, b) => this.castValue(game, p, a) - this.castValue(game, p, b))[0]; }
  chooseBlocker(game, me, attacker, blockers) {
    if (!blockers.length) return null;
    const incoming = attacker.card.power; const lethal = incoming >= me.life;
    const safe = blockers.filter(b => b.card.toughness > incoming && !attacker.card.kw.includes('deathtouch'));
    const trades = blockers.filter(b => b.card.power >= attacker.card.toughness);
    if (this.level === 'casual') { if (lethal) return blockers.sort((a, b) => b.card.toughness - a.card.toughness)[0]; return safe[0] || null; }
    if (safe.length) return safe.sort((a, b) => a.card.power - b.card.power)[0]; // cheapest safe block
    if (lethal) return blockers.sort((a, b) => b.card.toughness - a.card.toughness)[0];
    const goodTrade = trades.filter(b => this.permValue(b, me, game, me) <= this.permValue(attacker, game.players[attacker.ownerIdx] || me, game, me));
    if (goodTrade.length) return goodTrade[0];
    // cutthroat chump-blocks only to stay out of lethal range next turn
    if (this.level === 'cutthroat' && me.life - incoming <= 8) return blockers.sort((a, b) => a.card.power - b.card.power)[0];
    return null;
  }
  chooseLand(me) { // prefer untapped lands that fix colours we lack
    const lands = me.hand.filter(c => c.isLand); if (!lands.length) return null;
    const have = new Set(me.battlefield.filter(b => b.card.isLand).flatMap(b => b.card.produces));
    const need = new Set(me.hand.filter(c => !c.isLand).flatMap(c => Object.entries(c.mana.pips).filter(([, n]) => n > 0).map(([k]) => k)).concat(me.command.flatMap(c => Object.entries(c.mana.pips).filter(([, n]) => n > 0).map(([k]) => k))));
    return lands.sort((a, b) => { const fa = a.produces.filter(x => need.has(x) && !have.has(x)).length, fb = b.produces.filter(x => need.has(x) && !have.has(x)).length; if (fb !== fa) return fb - fa; return (a.etbTapped ? 1 : 0) - (b.etbTapped ? 1 : 0); })[0];
  }
  playTurn(game, me) {
    // 1. land
    const land = this.chooseLand(me); if (land) game.playLand(me, land);
    // 2. main phase: spend mana greedily by value; commander when affordable and valuable
    let guard = 12;
    while (guard-- > 0) {
      const options = [];
      for (const c of me.hand) if (!c.isLand && game.canPay(me, c)) options.push({ c, v: this.castValue(game, me, c), zone: 'hand' });
      for (const c of me.command) { const taxed = { ...c, mana: { ...c.mana, total: c.mana.total + me.cmdTax, generic: c.mana.generic + me.cmdTax } }; if (game.canPay(me, taxed)) options.push({ c, v: this.castValue(game, me, c) + (this.level === 'casual' ? 6 : 4) - me.cmdTax, zone: 'cmd' }); }
      if (!options.length) break;
      options.sort((a, b) => b.v - a.v); const pick = options[0];
      if (pick.v < (this.level === 'cutthroat' ? -2 : -4)) break; // nothing worth casting
      let target = null;
      if (pick.c.roles.includes('removal')) target = this.bestTarget(game, me, 'creature');
      if (pick.c.dmg && !pick.c.roles.includes('removal')) target = this.pickFace(game, me);
      if (pick.c.roles.includes('removal') && !target) { // nothing to remove: skip this card for now
        pick.c._skip = true; const i = me.hand.indexOf(pick.c); if (i >= 0) { me.hand.splice(i, 1); me.hand.push(pick.c); } if (options.length === 1) break; continue;
      }
      if (pick.zone === 'cmd') game.castCommander(me, pick.c, target); else game.castFromHand(me, pick.c, target);
      if (game.winner) return;
    }
    // 3. combat
    this.combat(game, me);
    if (me.extraCombat && !game.winner) { for (const b of me.battlefield) if (b.card.isCreature) b.tapped = false; this.combat(game, me); }
  }
  pickFace(game, me) { const opps = game.opponentsOf(me); return opps.sort((a, b) => this.threatOf(game, me, b) - this.threatOf(game, me, a))[0]; }
  combat(game, me) {
    const attackers = me.battlefield.filter(b => b.card.isCreature && !b.tapped && (!b.summoning || b.card.kw.includes('haste')) && !b.card.kw.includes('defender') && b.card.power > 0);
    if (!attackers.length) return;
    const myPower = attackers.reduce((s, a) => s + a.card.power, 0);
    const oppsPower = game.opponentsOf(me).map(q => q.battlefield.filter(b => b.card.isCreature).reduce((s, b) => s + b.card.power, 0));
    const ahead = myPower >= Math.max(1, ...oppsPower) * 1.5; // clearly the biggest board: race
    const lateGame = game.turn > 10 * game.alive().length || (ahead && this.level !== 'casual');
    const opps = game.opponentsOf(me).map(q => ({ q, threat: this.threatOf(game, me, q), blockers: q.battlefield.filter(b => b.card.isCreature && !b.tapped) }));
    // who do we attack? casual: random-ish / lowest life. focused: highest threat unless someone is at lethal. cutthroat: lethal first, then highest threat, spreading to avoid opening ourselves.
    const totalPower = attackers.reduce((s, a) => s + a.card.power, 0);
    const lethalOn = opps.filter(o => totalPower >= o.q.life && o.blockers.length === 0);
    let primary;
    if (lethalOn.length) primary = lethalOn.sort((a, b) => b.threat - a.threat)[0];
    else if (this.level === 'casual') primary = opps.sort((a, b) => a.q.life - b.q.life)[0];
    else primary = opps.sort((a, b) => b.threat - a.threat)[0];
    // how many to keep home? casual keeps none; focused keeps enough to not die to the biggest board; cutthroat computes exact
    const biggestOppPower = Math.max(0, ...opps.map(o => o.blockers.reduce((s, b) => s + b.card.power, 0)));
    let keepHome = 0;
    if (this.level !== 'casual') { let myLife = me.life; const sortedDef = [...attackers].sort((a, b) => b.card.toughness - a.card.toughness); while (biggestOppPower - keepHome * 3 >= myLife * (this.level === 'cutthroat' ? 0.9 : 0.75) && keepHome < Math.floor(attackers.length / 2)) keepHome++; if (lethalOn.length) keepHome = 0; }
    const sorted = [...attackers].sort((a, b) => { const ea = a.card.kw.some(k => ['flying', 'unblockable', 'menace', 'trample'].includes(k)) ? 1 : 0, eb = b.card.kw.some(k => ['flying', 'unblockable', 'menace', 'trample'].includes(k)) ? 1 : 0; if (eb !== ea) return eb - ea; return b.card.power - a.card.power; });
    let going_count = 0;
    const going = sorted.slice(0, sorted.length - keepHome).filter(a => {
      // don't suicide into a bigger untapped blocker unless evasive or we're casual/lethal
      if (this.level === 'casual' || lethalOn.length || lateGame) return true;
      const evasive = a.card.kw.some(k => ['flying', 'unblockable', 'menace', 'shadow', 'trample'].includes(k));
      const eats = primary.blockers.filter(b => game.canBlock(b, a) && b.card.power >= a.card.toughness && b.card.toughness > a.card.power).length;
      // blockers are a shared resource: once more attackers go in than there are good blockers, the rest connect
      return evasive || a.card.kw.includes('indestructible') || eats === 0 || going_count++ >= primary.blockers.length;
    });
    if (!going.length) return;
    const assignments = going.map(a => ({ attacker: a, defender: primary.q }));
    // cutthroat spreads evasive damage onto whoever is closest to dying if primary has blockers
    if (this.level === 'cutthroat' && primary.blockers.length) { const weakest = opps.filter(o => o !== primary).sort((a, b) => a.q.life - b.q.life)[0]; if (weakest && weakest.blockers.length === 0) for (const as of assignments) if (as.attacker.card.kw.some(k => ['flying', 'unblockable'].includes(k)) && weakest.q.life <= as.attacker.card.power * 3) as.defender = weakest.q; }
    game.attack(me, assignments);
  }
  // mulligan decision
  keep(hand, commander) { const lands = hand.filter(c => c.isLand).length; const cheap = hand.filter(c => !c.isLand && c.cmc <= 3).length; if (this.level === 'casual') return lands >= 2 && lands <= 5; return lands >= 2 && lands <= 5 && cheap >= 1; }
  bottomChoice(hand, n) { return [...hand].sort((a, b) => (b.cmc || 0) - (a.cmc || 0)).filter(c => !c.isLand).slice(0, n); }
}

root.Goldfish = { Game, AI, buildDeck, tagCard, manaInfo, shuffle, mulberry };
})(typeof window !== 'undefined' ? window : globalThis);
