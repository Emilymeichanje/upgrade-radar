// Execution sweep: plays every card in tests/fixtures/owner.json on a stocked board and flags every
// spell / mode / enter effect / ability / trigger that leaves the game state unchanged, throws or hangs.
// It finds effects that are MISSING; it cannot tell whether an effect that happens is the right one.
//   node scripts/sweep-exec.js [nameRegex] > report.json
require(__dirname + '/../playtest.js');
const { Game, AI, buildDeck, tagCard } = Goldfish;
const R = require(__dirname + '/../tests/fixtures/owner.json'); const ROWS = R.cards || R;
const only = process.argv[2] && process.argv[2] !== '-' ? new RegExp(process.argv[2], 'i') : null;
// SWEEP_RICH=1: a second, busier board (things already happened this turn, a spell on the stack, attackers, X = 3) to re-test lines that did nothing on the plain one. SWEEP_LIST=file.json: only these card names.
const RICH = !!process.env.SWEEP_RICH; const LIST = process.env.SWEEP_LIST ? new Set(JSON.parse(require('fs').readFileSync(process.env.SWEEP_LIST, 'utf8'))) : null;
const mk = (name, type, mana, oracle, cmc, p, t) => ({ name, type, mana, oracle: oracle || '', cmc: cmc || 0, power: p, toughness: t });
const BAS = [['Plains', 'W'], ['Island', 'U'], ['Swamp', 'B'], ['Mountain', 'R'], ['Forest', 'G']];
const deckList = () => { const l = []; for (let i = 0; i < 8; i++) for (const [n] of BAS) l.push(mk(n, 'Basic Land — ' + n, '', '', 0));
  const sp = [mk('Lib Bear', 'Creature — Bear', '{1}{G}', '', 2, '2', '2'), mk('Lib Bolt', 'Instant', '{R}', 'Lib Bolt deals 3 damage to any target.', 1), mk('Lib Rock', 'Artifact', '{2}', '{T}: Add {C}.', 2), mk('Lib Charm', 'Enchantment', '{1}{W}', '', 2), mk('Lib Wizard', 'Legendary Creature — Human Wizard', '{2}{U}', '', 3, '2', '3'), mk('Lib Rite', 'Sorcery', '{2}{B}', 'Draw two cards.', 3), mk('Lib Blade', 'Artifact — Equipment', '{1}', 'Equipped creature gets +1/+1.\nEquip {1}', 1), mk('Lib Aura', 'Enchantment — Aura', '{W}', 'Enchant creature\nEnchanted creature gets +1/+1.', 1), mk('Lib Walker', 'Legendary Planeswalker — Jace', '{2}{U}{U}', '+1: Draw a card.', 4), mk('Lib Dragon', 'Creature — Dragon', '{4}{R}{R}', 'Flying', 6, '5', '5')];
  while (l.length < 99) l.push({ ...sp[l.length % sp.length] }); l.push(mk('Sweep Cmdr', 'Legendary Creature — Elf Noble', '{1}{G}', '', 2, '2', '2')); return l; };
let UIDX = 9e6;
function board() {
  const g = new Game([0, 1, 2, 3].map(i => ({ name: 'P' + i, deck: buildDeck(deckList(), ['Sweep Cmdr']), ai: new AI('expert') })), { seed: 7, hooks: { emit: () => {} } });
  g.active = 0; g.phase = 'main1'; g.turn = 6;
  const put = (pl, c, o = {}) => { const tc = tagCard(c); if (c.token) tc.token = true; const b = { id: UIDX++, card: tc, tapped: false, counters: 0, enteredTurn: 0, summoning: false, ...o }; pl.battlefield.push(b); return b; };
  g.players.forEach((pl, i) => {
    for (let k = 0; k < 4; k++) for (const [n] of BAS) put(pl, mk(n, 'Basic Land — ' + n, '', '', 0), { sweepLand: true, tapped: k === 3 });
    put(pl, mk('Mimic', 'Creature — Shapeshifter', '{2}', 'Changeling', 2, '2', '2')); put(pl, mk('Walker', 'Legendary Planeswalker — Jace', '{2}{U}{U}', '+1: Draw a card.', 4), { counters: 4, loyalty: 4 }); put(pl, mk('Cart', 'Artifact — Vehicle', '{2}', 'Crew 1', 2, '3', '3'));
    pl.graveyard.push(tagCard(mk('Gy Blade', 'Artifact — Equipment', '{1}', 'Equipped creature gets +1/+1.\nEquip {1}', 1)), tagCard(mk('Gy Mimic', 'Creature — Shapeshifter', '{2}', 'Changeling', 2, '2', '2')), tagCard(mk('Gy Walker', 'Legendary Planeswalker — Jace', '{2}{U}{U}', '+1: Draw a card.', 4)));
    put(pl, { ...mk('Grunt', 'Token Creature — Human Soldier', '', '', 0, '1', '1'), token: true });
    put(pl, mk('Brute', 'Creature — Ogre Warrior', '{2}{R}', '', 3, '3', '3'));
    put(pl, mk('Drake', 'Creature — Drake', '{2}{U}', 'Flying', 3, '2', '2'));
    put(pl, mk('Elder', 'Legendary Creature — Elemental Dragon', '{3}{G}{G}', 'Trample', 5, '5', '5'), { counters: 1 });
    put(pl, mk('Golem', 'Artifact Creature — Golem', '{3}', '', 3, '2', '2'), { tapped: true });
    put(pl, mk('Ghoul', 'Creature — Zombie Wizard', '{1}{B}', '', 2, '2', '1'));
    put(pl, mk('Sprout', 'Creature — Elf Druid', '{G}', '', 1, '1', '1'));
    put(pl, mk('Imp', 'Creature — Goblin Rogue', '{R}', '', 1, '1', '1'));
    put(pl, mk('Cleric', 'Creature — Human Cleric', '{W}', '', 1, '1', '2'));
    put(pl, mk('Trinket', 'Artifact', '{1}', '', 1)); put(pl, mk('Blade', 'Artifact — Equipment', '{1}', 'Equipped creature gets +1/+1.\nEquip {1}', 1)); put(pl, mk('Banner', 'Enchantment', '{1}{W}', '', 2));
    put(pl, { ...mk('Treasure', 'Token Artifact — Treasure', '', '{T}, Sacrifice this artifact: Add one mana of any color.', 0), token: true });
    pl.graveyard.push(tagCard(mk('Gy Bear', 'Creature — Bear', '{1}{G}', '', 2, '2', '2')), tagCard(mk('Gy Titan', 'Legendary Creature — Giant', '{4}{W}{W}', '', 6, '6', '6')), tagCard(mk('Gy Bolt', 'Instant', '{R}', 'Gy Bolt deals 3 damage to any target.', 1)), tagCard(mk('Gy Rite', 'Sorcery', '{2}{B}', 'Draw two cards.', 3)), tagCard(mk('Forest', 'Basic Land — Forest', '', '', 0)), tagCard(mk('Gy Rock', 'Artifact', '{2}', '', 2)), tagCard(mk('Gy Charm', 'Enchantment', '{1}{W}', '', 2)), tagCard(mk('Gy Aura', 'Enchantment — Aura', '{W}', 'Enchant creature\nEnchanted creature gets +1/+1.', 1)));
    pl.exile.push(tagCard(mk('Ex Bear', 'Creature — Bear', '{1}{G}', '', 2, '2', '2')));
    pl.hand.length = 0; pl.hand.push(tagCard(mk('Hand Bear', 'Creature — Bear', '{1}{G}', '', 2, '2', '2')), tagCard(mk('Hand Bolt', 'Instant', '{R}', 'Hand Bolt deals 3 damage to any target.', 1)), tagCard(mk('Mountain', 'Basic Land — Mountain', '', '', 0)), tagCard(mk('Hand Rite', 'Sorcery', '{2}{B}', 'Draw two cards.', 3)), tagCard(mk('Hand Angel', 'Legendary Creature — Angel', '{3}{W}{W}', 'Flying', 5, '4', '4')));
    pl.life = i === 0 ? 30 : 40;
  });
  if (RICH) { const me = g.players[0], opp = g.players[1]; const T = g.turn;
    for (const pl of g.players) { Object.assign(pl, { gainedThisTurn: 3, gainedTurn: T, lostThisTurn: 3, lostTurn: T, drawsThisTurn: 2, drawTurn: T, tokensMadeTurn: 2, tokenTurn: T, creatureLeftTurn: T, spellsThisTurn: 2, spellsTurn: T, landsPlayedTurn: T, attackedTurn: T, ncDmg: 2, ncDmgTurn: T, descendTurn: T });
      pl.hand.push(tagCard(mk('Hand Mimic', 'Creature — Shapeshifter', '{2}', 'Changeling', 2, '2', '2')), tagCard(mk('Hand Blade', 'Artifact — Equipment', '{1}', 'Equipped creature gets +1/+1.\nEquip {1}', 1)), tagCard(mk('Hand Saga', 'Enchantment — Saga', '{1}{W}', '', 2)), tagCard(mk('Hand Elemental', 'Legendary Creature — Elemental Hero', '{R}', '', 1, '1', '1')));
      for (const b of pl.battlefield) { if (/Sprout|Imp|Grunt/.test(b.card.name)) b.enteredTurn = T; if (/Brute|Drake/.test(b.card.name)) b.counters = 2; if (b.card.name === 'Banner') b.counters = 3; } }
    g.diedThisTurn = 2; g.diedTurn = T; g.phase = 'combat'; const oa = opp.battlefield.filter(b => /Brute|Drake|Imp/.test(b.card.name)); const ma = me.battlefield.filter(b => /Brute|Drake|Mimic|Elder/.test(b.card.name)); g.curAttackers = [...ma, ...oa]; for (const b of [...ma, ...oa]) { b.attackTurn = T; b.attacking = true; b.tapped = true; }
    const blade = me.battlefield.find(b => b.card.name === 'Blade'), brute = me.battlefield.find(b => b.card.name === 'Brute'); if (blade && brute) blade.attachedTo = brute.id;
    const os = { id: UIDX++, kind: 'spell', card: tagCard(mk('Opp Sorcery', 'Sorcery', '{2}{R}', 'Opp Sorcery deals 3 damage to any target.', 3)), caster: opp, owner: opp, zone: 'hand', target: me.battlefield.find(b => b.card.name === 'Cleric') }; const ms = { id: UIDX++, kind: 'spell', card: tagCard(mk('My Instant', 'Instant', '{1}{U}', 'Draw two cards.', 2)), caster: me, owner: me, zone: 'hand', x: 3 }; g.stack.push(os, ms); g.richStack = [os, ms]; }
  g.refreshStatics(); return g;
}
const prim = (o, skip) => { const r = {}; for (const k in o) { if (skip && skip.has(k)) continue; const v = o[k]; const t = typeof v; if (t === 'number' || t === 'string' || t === 'boolean') r[k] = v; else if (Array.isArray(v)) r[k + '#'] = v.length; else if (v && t === 'object' && !(k === 'card' || k === 'ai' || k === 'deck')) { try { const s = JSON.stringify(v, (kk, vv) => (vv && typeof vv === 'object' && (vv.battlefield || vv.card || vv.oracle)) ? (vv.name || (vv.card && vv.card.name) || '·') : vv); if (s && s.length < 400) r[k + '~'] = s; } catch (e) { r[k + '~'] = '?'; } } } return r; };
const GSKIP = new Set(['seed', 'rngState', '_inSba', 'logSeq', 'log', 'emits', 'trigHold', 'stackBusy', '_settling', '_scanning', 'trigQueue']); const PSKIP = new Set(['b1_humEnt']);
function digest(g, ignoreCard) {
  const names = a => a.filter(c => c !== ignoreCard && (c.orig || c) !== ignoreCard).map(c => c.name).sort().join('|');
  return JSON.stringify({ g: prim(g, GSKIP), stack: g.stack.length, P: g.players.map(p => ({ ...prim(p, PSKIP), hand: names(p.hand), gy: names(p.graveyard), ex: names(p.exile), cmd: names(p.command), lib: p.library.length + ':' + (p.library[p.library.length - 1] || {}).name + ':' + (p.library[0] || {}).name, libset: names(p.library).length,
    bf: p.battlefield.filter(b => b.card !== ignoreCard && (b.card.orig || b.card) !== ignoreCard && !(b.card.mdfcOf === ignoreCard)).map(b => { const o = prim(b); delete o.id; o.n = b.card.name; o.ty = b.card.type; o.kw = (b.card.kw || []).slice().sort().join(','); if (b.card.isCreature) { try { o.pw = g.powerOf(p, b); o.tg = g.toughOf(p, b); } catch (e) {} } o.att = b.attachedTo ? ((b.attachedTo.card || {}).name || String(b.attachedTo)) : (b.attached || []).length; return JSON.stringify(o); }).sort() })) });
}
const settle = async g => { const park = g.richStack || []; const live = () => g.stack.filter(o => !park.includes(o)); for (let i = 0; i < 40 && live().length; i++) { const o = live().pop(); g.stack.splice(g.stack.indexOf(o), 1); await g.resolve(o); if (g.stack.includes(o)) g.stack.splice(g.stack.indexOf(o), 1); } try { await g.emit({ type: 'tick' }); } catch (e) {} for (let i = 0; i < 40 && live().length; i++) { const o = live().pop(); g.stack.splice(g.stack.indexOf(o), 1); await g.resolve(o); if (g.stack.includes(o)) g.stack.splice(g.stack.indexOf(o), 1); } if (g.sba) await g.sba(); };
const timed = (fn, ms = 4000) => Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error('HANG')), ms))]);
const findings = []; const stats = { cards: 0, units: 0, ok: 0 };
const add = (card, unit, kind, detail) => findings.push({ card: card.name, type: card.type, unit, kind, detail: (detail || '').slice(0, 300) });
const ctxFor = (g, tr, perm) => { const me = g.players[0], opp = g.players[1]; const own = me.battlefield.find(b => b.card.name === 'Brute'), theirs = opp.battlefield.find(b => b.card.name === 'Brute'); const spell = me.hand.find(c => c.name === 'Hand Bolt'), cre = me.hand.find(c => c.name === 'Hand Bear');
  const atker = (tr.who === 'this card' || !tr.who) && perm && perm.card.isCreature ? perm : own; if (RICH && perm) { perm.tapped = true; if (!perm.card.isPlaneswalker) perm.counters = 3; if (perm.card.equip || /Equipment|Aura/.test(perm.card.type || '')) perm.attachedTo = own.id; }
  const gyC = me.graveyard.find(c => c.name === 'Gy Bear'), gyL = me.graveyard.find(c => c.isLand); const cast0 = (g.richStack || [])[1] || { id: UIDX++, kind: 'spell', card: spell, caster: me, owner: me, zone: 'hand', x: 3 }; if (/attack|combat|block/i.test(tr.when)) { g.phase = 'combat'; g.curAttackers = [atker, own]; for (const b of [atker, own]) if (b) { b.attackTurn = g.turn; b.attacking = true; } }
  const rs = g.richStack || []; return { x: 3, X: 3, spell: rs[1] || null, obj: rs[1] || null, trigger: rs[1] || null, caster: opp, other: opp, castObj: cast0, gained: 3, lost: 3, count: 2, card: cre, milled: [gyC, gyL], cards: [cre],  perm, attacker: atker, defender: opp, atk: [{ attacker: atker, defender: opp }, { attacker: own, defender: opp }], dmg: 3, died: own, dead: own, entered: RICH ? (me.battlefield.find(b => b.card.name === 'Blade') || own) : own, it: own, castCard: /creature/.test(JSON.stringify(tr.filter || tr.req || '')) ? cre : spell, land: me.battlefield.find(b => b.card.isLand), target: theirs, who: opp, opp, drew: opp, n: 1, amount: 2, token: me.battlefield.find(b => b.card.name === 'Grunt'), sacrificed: own, discarded: gyC, blocker: theirs }; };
const sig = {}; // which state keys changed, per unit — used to spot noise keys
const diffKeys = (a, b) => { a = JSON.parse(a); b = JSON.parse(b); const out = new Set(); const walk = (x, y, p) => { if (typeof x !== 'object' || x === null || typeof y !== 'object' || y === null) { if (x !== y) out.add(p.replace(/\.\d+/g, '.#')); return; } for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], p + '.' + k); }; walk(a, b, ''); return [...out].sort(); };
// Each unit is run twice on identical boards: once for real, once as a CONTROL that does the same action with
// the card's text removed (or with no ops). If the two end states match, the text did nothing.
async function unit(card, name, expect, run) {
  stats.units++; let real, ctrl, logs = [];
  try { await timed(async () => { UIDX = 9e6; const g = board(); const me = g.players[0]; const pre = await run.pre(g, me, false); const n0 = g.log.length; await run.go(g, me, pre, false); await settle(g); real = digest(g, pre.ignore); logs = g.log.slice(n0).map(x => x.m); }); }
  catch (e) { add(card, name, e.message === 'HANG' ? 'hang' : 'throw', (e.stack || e.message).split('\n').slice(0, 3).join(' ⏎ ')); return; }
  try { await timed(async () => { UIDX = 9e6; const g = board(); const me = g.players[0]; const pre = await run.pre(g, me, true); await run.go(g, me, pre, true); await settle(g); ctrl = digest(g, pre.ignore); }); }
  catch (e) { add(card, name, 'control-failed', e.message); return; }
  if (real === ctrl) { if (expect) add(card, name, 'no-effect', expect + ' :: log=' + logs.slice(0, 4).join(' ¦ ')); else stats.ok++; return; }
  stats.ok++; const k = diffKeys(ctrl, real).join(' '); (sig[k] = sig[k] || []).push(card.name + ' / ' + name);
}
const emptyModes = ops => { const out = []; const walk = o => { for (const x of o || []) { if (x && x.op === 'modal') for (const m of x.modes || []) { if (!(m.ops && m.ops.length)) out.push(m.text); else walk(m.ops); } if (x && Array.isArray(x.ops)) walk(x.ops); } }; walk(ops); return out; };
const frontOracle = c => (c.oracle || '').split('\n//\n')[0];
(async () => {
  for (const r of ROWS) { if (only && !only.test(r[1])) continue; if (LIST && !LIST.has(r[1])) continue; let base; const raw = { name: r[1], mana: r[2], type: r[3], oracle: r[4], cmc: r[5], power: r[6], toughness: r[7] };
    try { base = tagCard({ ...raw }); } catch (e) { findings.push({ card: r[1], unit: 'parse', kind: 'throw', detail: e.message }); continue; }
    for (const t of emptyModes(base.etbOps)) add(base, 'enters', 'empty-mode', t); for (const t of emptyModes(base.spellOps)) add(base, 'spell', 'empty-mode', t);
    stats.cards++; const fresh = ctl => tagCard(ctl ? { ...raw, oracle: '' } : { ...raw }); const isSpell = base.isInstant || base.isSorcery; const text = frontOracle(base).toLowerCase();
    if (base.isLand && !base.isCreature) { // lands: enter effect + abilities
      if (base.etbOps && base.etbOps.length) await unit(base, 'land enters', 'etbOps ' + JSON.stringify(base.etbOps), { pre: async (g, me, ctl) => { const c = fresh(ctl); me.hand.push(c); return { c, ignore: c }; }, go: async (g, me, { c }) => { await g.playLand(me, c); } });
    } else if (isSpell && base.modes && base.modes.length && !base.noModes) {
      for (let i = 0; i < base.modes.length; i++) { const m = base.modes[i]; if (!(m.card.spellOps && m.card.spellOps.length) && !(m.card.spellOpsX && m.card.spellOpsX.length) && !(m.card.roles || []).length) { add(base, 'mode ' + (i + 1), 'empty', m.text); continue; }
        await unit(base, 'mode ' + (i + 1), m.text, { pre: async (g, me, ctl) => { const c = fresh(); return { c, ignore: c, ctl }; }, go: async (g, me, { c, ctl }) => { await g.resolve({ id: UIDX++, kind: 'spell', card: ctl ? tagCard({ ...raw, oracle: '' }) : c, caster: me, owner: me, zone: 'hand', modes: ctl ? undefined : [c.modes[i].card] }); } }); }
    } else if (isSpell) {
      const counter = !!base.counter || /counter target/.test(text);
      await unit(base, 'spell', text.replace(/\n/g, ' / ').slice(0, 160), { pre: async (g, me, ctl) => { const c = fresh(ctl); me.hand.push(c); let victim = null; if (counter) { const opp = g.players[1]; const vc = tagCard(mk('Victim Spell', /noncreature|instant|sorcery/.test(text) ? 'Sorcery' : 'Creature — Ogre', '{3}{R}', 'Draw a card.', 4, '4', '4')); victim = { id: UIDX++, kind: 'spell', card: vc, caster: opp, owner: opp, zone: 'hand' }; g.stack.push(victim); } return { c, ignore: c, victim }; },
        go: async (g, me, { c, victim }) => { /* cast it the real way so targets and costs are chosen; if it cannot be cast here, resolve it directly */ let target = null; try { const ai = me.ai, rm = (c.roles || []).includes('removal'); if (rm) { const t = ai.bestTarget(g, me, g.aiRmOk(c, b => g.targetOk(c, b, me) && (b.card.isCreature || !/target creature/.test((c.oracle || '').toLowerCase())))); target = t && t.perm; } if (c.dmg && !rm && !(c.roles || []).includes('wipe')) target = ai.pickFace(g, me); } catch (e) {} /* same targeting the AI uses on its own turn */ try { await g.cast(me, c, 'hand', target); } catch (e) {} if (!me.hand.includes(c)) { if (victim) { g.victimCountered = !!victim.countered || !g.stack.includes(victim); const i = g.stack.indexOf(victim); if (i >= 0) g.stack.splice(i, 1); } return; } me.hand.splice(me.hand.indexOf(c), 1); const sp = { id: UIDX++, kind: 'spell', card: c, caster: me, owner: me, zone: 'hand' }; if (victim) sp.target = { spell: victim }; await g.resolve(sp); if (victim) { g.victimCountered = !!victim.countered || !g.stack.includes(victim); const i = g.stack.indexOf(victim); if (i >= 0) g.stack.splice(i, 1); } } });
    } else { // permanents
      const hasEtb = (base.etbOps && base.etbOps.length) || /^when (?:this [a-z]+|[^\n,]*?) enters(?: the battlefield)?,/im.test(frontOracle(base));
      await unit(base, 'enters', hasEtb ? 'ETB ' + JSON.stringify(base.etbOps || []).slice(0, 120) : null, { pre: async (g, me, ctl) => { const c = fresh(ctl); me.hand.push(c); return { c, ignore: c }; }, go: async (g, me, { c }) => { let target = null; try { if ((c.roles || []).includes('removal')) { const t = me.ai.bestTarget(g, me, g.aiRmOk(c, b => g.targetOk(c, b, me) && (b.card.isCreature || !/target creature/.test((c.oracle || '').toLowerCase())))); target = t && t.perm; } } catch (e) {} me.hand.splice(me.hand.indexOf(c), 1); const sp = { id: UIDX++, kind: 'spell', card: c, caster: me, owner: me, zone: 'hand', x: 3 }; if (target) sp.target = target; await g.resolve(sp); } });
    }
    if (!isSpell) {
      const mkPerm = async (g, me) => { const c = fresh(); const b = { id: UIDX++, card: c, tapped: false, counters: c.isPlaneswalker ? 5 : 0, loyalty: 5, enteredTurn: 0, summoning: false }; me.battlefield.push(b); g.refreshStatics(); return b; };
      for (let i = 0; i < (base.abilities || []).length; i++) { const ab = base.abilities[i]; const label = 'ability ' + (i + 1) + ' [' + (ab.label || ab.text || '').slice(0, 70) + ']';
        if (!(ab.ops && ab.ops.length)) { add(base, label, 'empty', ab.text || ''); continue; } for (const t of emptyModes(ab.ops)) add(base, label, 'empty-mode', t); if (ab.zone && ab.zone !== 'battlefield') continue;
        await unit(base, label, JSON.stringify(ab.ops).slice(0, 160), { pre: async (g, me) => { const b = await mkPerm(g, me); b.tapped = !!b.card.abilities[i].tap || RICH; if (RICH) b.counters = b.card.isPlaneswalker ? 9 : 3; return { b, ignore: null }; }, go: async (g, me, { b }, ctl) => { await g.runOps(me, ctl ? [] : b.card.abilities[i].ops, b.card, { perm: b, x: 3, X: 3, target: RICH && (g.richStack || [])[0] && /counter|copy|spell/i.test(JSON.stringify(b.card.abilities[i].ops)) ? { spell: g.richStack[/copy/i.test(JSON.stringify(b.card.abilities[i].ops)) ? 1 : 0] } : g.players[1].battlefield.find(x => x.card.name === 'Brute') }); } }); }
      for (let i = 0; i < (base.triggers || []).length; i++) { const tr = base.triggers[i]; const label = 'trigger ' + (i + 1) + ' [' + tr.when + ']';
        if (!(tr.ops && tr.ops.length)) { add(base, label, 'empty', JSON.stringify(tr).slice(0, 200)); continue; } for (const t of emptyModes(tr.ops)) add(base, label, 'empty-mode', t); if (tr.zone && tr.zone !== 'battlefield') continue;
        await unit(base, label, JSON.stringify(tr.ops).slice(0, 160), { pre: async (g, me) => { const b = await mkPerm(g, me); return { b, ignore: null }; }, go: async (g, me, { b }, ctl) => { await g.runOps(me, ctl ? [] : b.card.triggers[i].ops, b.card, ctxFor(g, b.card.triggers[i], b)); } }); }
    }
  }
  const by = {}; for (const f of findings) by[f.kind] = (by[f.kind] || 0) + 1;
  const sigs = Object.entries(sig).sort((a, b) => b[1].length - a[1].length).map(([k, v]) => ({ keys: k, n: v.length, eg: v.slice(0, 4) }));
  console.log(JSON.stringify({ stats, by, findings, sigs }, null, 1)); process.exit(0);
})();
