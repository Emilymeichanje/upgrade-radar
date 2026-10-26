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

const KW = ['shroud','flying','trample','menace','haste','lifelink','deathtouch','first strike','double strike','vigilance','hexproof','indestructible','flash','reach','ward','unblockable','skulk','shadow','fear','intimidate','horsemanship','defender'];
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

const words = s => s.split(/,? or an? |, an? |, | or /).map(w => w.replace(/^an? /, '').trim()).filter(Boolean);
/** how a land enters: optional choices (pay life, reveal) and conditions (check / fast / slow lands) */
function tagLandEntry(card, o) {
  const lm = o.match(/you may pay (\d+) life\. if you don't, (it|this land) enters tapped/);
  card.etbLife = lm ? +lm[1] : 0; card.shock = !!lm;
  const rv = o.match(/you may reveal an? ([a-z ,]+?) card from your hand\. if you don't, (it|this land) enters tapped/);
  card.reveal = rv ? words(rv[1]) : null;
  const ck = o.match(/enters (the battlefield )?tapped unless you control an? ([a-z ,]+?)(\.|\n|$)/);
  card.etbCond = /unless you control two or fewer other lands/.test(o) ? { kind: 'fewLands' }
    : /unless you control two or more other lands/.test(o) ? { kind: 'manyLands' }
    : /unless you have two or more opponents/.test(o) ? { kind: 'opps' }
    : ck && !/\blands?$/.test(ck[2]) ? { kind: 'control', words: words(ck[2]) } : null;
  card.etbTapped = !card.shock && !card.reveal && !card.etbCond && /enters (the battlefield )?tapped/.test(o) && !/unless/.test(o);
}
// ============================== ABILITIES: triggers, activated abilities, graveyard casting ==============================
const NUMX = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, x: 2 };
const numOf = s => NUMX[s] || parseInt(s) || 1;
/** effect text (lowercased, card name already replaced by "this card") -> list of ops the engine can run */
function parseOps(t) {
  const ops = []; let m;
  if ((m = t.match(/(target player|target opponent|each opponent|each player) mills? (a|one|two|three|four|five|\d+) cards?/))) ops.push({ op: 'millOpp', n: numOf(m[2]), each: m[1].startsWith('each'), all: m[1] === 'each player' });
  else if ((m = t.match(/\bmills? (a|one|two|three|four|five|\d+) cards?/))) ops.push({ op: 'mill', n: numOf(m[1]) });
  if ((m = t.match(/\bdraws? (a|one|two|three|\d+) cards?/)) && !/each player draws|target player draws|each opponent draws/.test(t)) ops.push({ op: 'draw', n: numOf(m[1]) });
  if ((m = t.match(/(each opponent|each other player|target opponent|target player) loses (\d+|x) life/))) ops.push({ op: 'drain', n: numOf(m[2]), each: m[1].startsWith('each') });
  if ((m = t.match(/(?:you|and|,) gain (\d+|x) life/))) ops.push({ op: 'gain', n: numOf(m[1]) });
  if ((m = t.match(/(?:you|and) lose (\d+) life/))) ops.push({ op: 'lose', n: numOf(m[1]) });
  if ((m = t.match(/deals? (\d+|x) damage to (any target|each opponent|target opponent|target player|target creature or planeswalker|target creature|each creature)/))) ops.push({ op: 'damage', n: numOf(m[1]), to: m[2] });
  if ((m = t.match(/create (a|an|one|two|three|four|five|x|\d+) (?:tapped )?(\d+)\/(\d+)[^.]*?creature tokens?/))) ops.push({ op: 'tokens', n: numOf(m[1]), pt: [+m[2], +m[3]], kw: ['flying', 'haste', 'lifelink', 'deathtouch', 'vigilance', 'trample'].filter(k => new RegExp('with [^.]*' + k).test(t)) });
  else if ((m = t.match(/create (a|an|one|two|three|\d+) (treasure|clue|food|blood) tokens?/))) ops.push({ op: 'note', text: `creates ${m[1]} ${m[2]} token${numOf(m[1]) > 1 ? 's' : ''}` });
  if ((m = t.match(/return (?:up to (one|two|three) )?(?:another )?target ([a-z ]*?)card from your graveyard to your hand/))) ops.push({ op: 'gyToHand', n: m[1] ? numOf(m[1]) : 1, filter: m[2].trim() });
  if ((m = t.match(/return (?:up to one )?(?:another )?target ([a-z ]*?)creature card (?:with mana value (\d+) or less )?from your graveyard to the battlefield/))) ops.push({ op: 'gyToBf', max: m[2] ? +m[2] : null });
  if (/return this card from your graveyard to the battlefield|return this card to the battlefield/.test(t)) ops.push({ op: 'selfToBf', tapped: /to the battlefield tapped/.test(t) });
  if (/return this card from your graveyard to your hand|return this card to its owner's hand|return this card to your hand/.test(t)) ops.push({ op: 'selfToHand' });
  if ((m = t.match(/put (a|one|two|three|x|\d+) \+1\/\+1 counters? on (this card|each creature you control|each other creature you control|target creature)/))) ops.push({ op: 'counters', n: numOf(m[1]), to: m[2] });
  if ((m = t.match(/(?:reveal|look at) the top (\w+) cards of your library\. (?:you may )?put (?:an? |up to one )?([a-z ]*?)card (?:from among them )?into your hand(?: and the rest| and put the rest|\. put the rest) into your graveyard/))) ops.push({ op: 'dig', n: numOf(m[1]), filter: m[2].trim(), rest: 'graveyard' });
  if ((m = t.match(/\bscry (\d+)/))) ops.push({ op: 'scry', n: +m[1] });
  if ((m = t.match(/\bsurveil (\d+)/))) ops.push({ op: 'surveil', n: +m[1] });
  if ((m = t.match(/search your library for an? (basic )?([a-z ]*?)\bland card[^.]*?put it into your hand/))) ops.push({ op: 'landToHand', basic: !!m[1], types: ['plains', 'island', 'swamp', 'mountain', 'forest'].filter(x => m[2].includes(x)) });
  if ((m = t.match(/destroy target (creature|artifact|enchantment|nonland permanent|permanent|artifact or enchantment)/))) ops.push({ op: 'destroy', what: m[1] });
  if ((m = t.match(/(each opponent|target opponent|target player|each player|each other player) sacrifices (a|an|one|two|three) (creature or planeswalker|creature|nonland permanent|permanent)/))) ops.push({ op: 'edict', who: m[1], n: numOf(m[2]), what: m[3] });
  if (/return all nonland permanents you don't control to their owners' hands/.test(t)) ops.push({ op: 'bounceAllOpp' });
  return ops;
}
/** static abilities: anthems / lords, granted keywords, equipment, extra land drops, cost reducers, self evasion */
function tagStatic(card, lines) {
  card.anthems = []; card.equip = null; card.extraLands = 0; card.reducers = [];
  for (const l of lines) {
    let m;
    const subj = s => s.replace(/\bcreature tokens\b/, 'token').replace(/\bcreatures?\b/g, '').replace(/\s+/g, ' ').trim();
    if ((m = l.match(/^(other )?([a-z ,-]+?) you control get \+(\d+)\/\+(\d+)(?: and have ([a-z ,]+?))?\.?$/))) card.anthems.push({ other: !!m[1], filter: subj(m[2]), pump: [+m[3], +m[4]], kws: m[5] ? KW.filter(k => m[5].includes(k)) : [] });
    else if ((m = l.match(/^(other )?([a-z ,-]+?) you control have ([a-z ,]+?)\.?$/))) { const kws = KW.filter(k => m[3].includes(k)); if (kws.length) card.anthems.push({ other: !!m[1], filter: subj(m[2]), pump: [0, 0], kws }); }
    if ((m = l.match(/^equipped creature gets \+(\d+)\/\+(\d+)(?: and has ([a-z ,]+?))?\.?$/))) card.equip = { pump: [+m[1], +m[2]], kws: m[3] ? KW.filter(k => m[3].includes(k)) : [] };
    else if ((m = l.match(/^equipped creature has ([a-z ,]+?)\.?$/))) card.equip = { pump: [0, 0], kws: KW.filter(k => m[1].includes(k)) };
    if ((m = l.match(/you may play (an|two) additional lands? on each of your turns/))) card.extraLands = m[1] === 'two' ? 2 : 1;
    if ((m = l.match(/^([a-z ,]*?)spells you cast cost \{(\d+)\} less to cast/))) card.reducers.push({ n: +m[2], filter: m[1].replace(/\bthat are\b.*$/, '').trim() });
    if (/^this card can't be blocked\.?$/.test(l) && !card.kw.includes('unblockable')) card.kw.push('unblockable');
  }
}
/** does a card match a filter like "vampire", "red", "legendary", "noncreature", "artifact or enchantment"? */
function matchesFilter(c, filter) {
  if (!filter) return true;
  const ty = (c.type || '').toLowerCase();
  return filter.split(/,? or |, /).some(alt => alt.trim().split(/\s+/).filter(w => w && !/^(spells?|cards?|creatures?)$/.test(w)).every(w => {
    if (COLORW && COLORW[w]) return (c.colors || []).includes(COLORW[w]);
    if (w === 'token') return !!c.token; if (w === 'nontoken') return !c.token;
    if (w === 'multicolored') return (c.colors || []).length > 1; if (w === 'colorless') return !(c.colors || []).length;
    if (w.startsWith('non')) return !ty.includes(w.slice(3));
    const sing = w.replace(/ves$/, 'f').replace(/ies$/, 'y').replace(/s$/, '');
    return ty.includes(w) || ty.includes(sing);
  }));
}
function costParts(s) {
  // "{1}{b}{g}, exile this card" -> {mana, tap, sacSelf, exileSelf, discardSelf, life, exileOthers, discard, ok}
  const parts = s.split(/,\s*/); const out = { manaStr: '', tap: false, sacSelf: false, exileSelf: false, discardSelf: false, life: 0, exileOthers: 0, discard: 0, ok: true };
  for (const part of parts) {
    const q = part.trim();
    if (/^(\{[^}]+\})+$/.test(q)) { const syms = q.match(/\{[^}]+\}/g); for (const y of syms) { if (y === '{t}') out.tap = true; else if (y === '{q}') out.ok = false; else out.manaStr += y; } }
    else if (/^sacrifice this (card|creature|artifact|enchantment|land|permanent)$/.test(q)) out.sacSelf = true;
    else if (/^exile this (card|creature|artifact|enchantment)( from your graveyard)?$/.test(q)) out.exileSelf = true;
    else if (/^discard this card$/.test(q)) out.discardSelf = true;
    else if (/^pay (\d+) life$/.test(q)) out.life = +q.match(/\d+/)[0];
    else if (/^exile (one|two|three|four|five|six|\d+) other cards? from your graveyard$/.test(q)) out.exileOthers = numOf(q.split(' ')[1]);
    else if (/^discard a card$/.test(q)) out.discard = 1;
    else if (/^sacrifice (a|another) creature$/.test(q)) out.sacOther = q.includes('another') ? 'another' : 'creature';
    else out.ok = false; // a cost we don't model (sacrifice a creature, remove counters, tap untapped creatures...)
  }
  out.cost = manaInfo(out.manaStr.toUpperCase());
  return out;
}
/** activated abilities on the battlefield / in the graveyard / in hand, triggers, and casting from the graveyard */
function tagAbilities(card) {
  const name = card.name.toLowerCase(), short = name.split(',')[0].split(' // ')[0];
  const txt = card.oracle.toLowerCase().split(name).join('this card').split(short).join('this card').replace(/this (creature|artifact|enchantment|land|permanent)(?! token)/g, 'this card');
  const lines = txt.split('\n').map(l => l.replace(/\([^)]*\)/g, '').trim()).filter(Boolean);
  card.abilities = []; card.triggers = []; card.etbOps = null; card.gyCast = null;
  const instantSpeed = l => !/activate only as a sorcery/.test(l);
  for (const raw of lines) {
    const l = raw.replace(/^[a-z ]+ — (?=[{a-z])/, s => /^(landfall|flashback|escape|unearth|cycling|embalm|eternalize|scavenge)/.test(s) ? s : ''); // drop ability words like "Raid — "
    let m;
    // ---- casting from the graveyard
    if ((m = l.match(/^flashback (\{[^ —]+\})$/))) { card.gyCast = { kind: 'flashback', cost: manaInfo(m[1].toUpperCase()), exileAfter: true }; continue; }
    if (/^jump-start$/.test(l)) { card.gyCast = { kind: 'jump-start', cost: card.mana, discard: 1, exileAfter: true }; continue; }
    if (/^retrace$/.test(l)) { card.gyCast = { kind: 'retrace', cost: card.mana, discardLand: 1 }; continue; }
    if ((m = l.match(/^escape—(\{[^,]+\}), exile (\w+) other cards? from your graveyard/))) { card.gyCast = { kind: 'escape', cost: manaInfo(m[1].toUpperCase()), exileOthers: numOf(m[2]), exileAfter: !(card.isCreature || card.isArtifact || card.isEnchantment || card.isPlaneswalker) }; continue; }
    if (/you may cast this card from your graveyard/.test(l)) { card.gyCast = { kind: 'from graveyard', cost: card.mana }; continue; }
    // ---- keyword abilities from the graveyard / hand
    if ((m = l.match(/^unearth (\{[^ ]+\})$/))) { card.abilities.push({ zone: 'graveyard', label: 'unearth', cost: manaInfo(m[1].toUpperCase()), speed: 'sorcery', ops: [{ op: 'selfToBf', haste: true, unearth: true }] }); continue; }
    if ((m = l.match(/^(embalm|eternalize) (\{[^ ]+\})$/))) { card.abilities.push({ zone: 'graveyard', label: m[1], cost: manaInfo(m[2].toUpperCase()), exileSelf: true, speed: 'sorcery', ops: [{ op: 'tokenCopy', pt: m[1] === 'eternalize' ? [4, 4] : null }] }); continue; }
    if ((m = l.match(/^scavenge (\{[^ ]+\})$/))) { card.abilities.push({ zone: 'graveyard', label: 'scavenge', cost: manaInfo(m[1].toUpperCase()), exileSelf: true, speed: 'sorcery', ops: [{ op: 'counters', n: card.power || 1, to: 'target creature' }] }); continue; }
    if ((m = l.match(/^equip(?: [a-z ]+)? (\{[^ ]+\})$/))) { card.abilities.push({ zone: 'battlefield', label: 'equip', cost: manaInfo(m[1].toUpperCase()), speed: 'sorcery', ops: [{ op: 'attach' }] }); continue; }
    if ((m = l.match(/^overload (\{[^ ]+\})$/))) { card.abilities.push({ zone: 'hand', label: 'overload', cost: manaInfo(m[1].toUpperCase()), discardSelf: true, speed: card.isInstant ? 'instant' : 'sorcery', ops: [{ op: 'bounceAllOpp' }] }); continue; }
    if ((m = l.match(/^cycling (\{[^ ]+\})$/))) { card.abilities.push({ zone: 'hand', label: 'cycling', cost: manaInfo(m[1].toUpperCase()), discardSelf: true, speed: 'instant', ops: [{ op: 'draw', n: 1 }] }); continue; }
    if ((m = l.match(/^(basic land|plains|island|swamp|mountain|forest)cycling (\{[^ ]+\})$/))) { card.abilities.push({ zone: 'hand', label: m[1] + 'cycling', cost: manaInfo(m[2].toUpperCase()), discardSelf: true, speed: 'instant', ops: [{ op: 'landToHand', basic: m[1] === 'basic land', types: m[1] === 'basic land' ? [] : [m[1]] }] }); continue; }
    // ---- triggers
    if ((m = l.match(/^at the beginning of your upkeep, if this card is in your graveyard, (.+)$/))) { const ops = parseOps(m[1]); if (ops.length) card.triggers.push({ when: 'upkeep', zone: 'graveyard', ops, may: /you may/.test(m[1]) }); continue; }
    if ((m = l.match(/^at the beginning of (your|each) upkeep, (.+)$/))) { const ops = parseOps(m[2]); if (ops.length) card.triggers.push({ when: 'upkeep', zone: 'battlefield', each: m[1] === 'each', ops, may: /you may/.test(m[2]) }); continue; }
    if ((m = l.match(/^at the beginning of your end step, (.+)$/))) { const ops = parseOps(m[1]); if (ops.length) card.triggers.push({ when: 'end', zone: 'battlefield', ops }); continue; }
    if ((m = l.match(/^(?:landfall — )?whenever a land (?:you control )?enters(?: the battlefield)?(?: under your control)?, (.+)$/))) {
      const ops = parseOps(m[1]); const fromGy = /from your graveyard/.test(m[1]) && ops.some(o => o.op === 'selfToBf');
      if (ops.length) card.triggers.push({ when: 'landfall', zone: fromGy ? 'graveyard' : 'battlefield', ops, may: /you may/.test(m[1]) }); continue; }
    if ((m = l.match(/^whenever (this card or )?(another |a )?(nontoken )?creature (you control )?dies, (.+)$/))) { const ops = parseOps(m[5]); if (ops.length) card.triggers.push({ when: 'dies', zone: 'battlefield', self: !!m[1], another: m[2] === 'another ', yours: !!m[4], nontoken: !!m[3], ops }); continue; }
    if ((m = l.match(/^whenever you cast (?:a |an |your first )?([a-z ,]*?)spell(?: [a-z ]+ turn)?, (.+)$/))) { const ops = parseOps(m[2]); if (ops.length) card.triggers.push({ when: 'cast', zone: 'battlefield', filter: m[1].trim(), ops }); continue; }
    if ((m = l.match(/^whenever (another |one or more )?([a-z ]*?)creatures? (you control )?enters?(?: the battlefield)?( under your control)?, (.+)$/))) { const ops = parseOps(m[5]); if (ops.length) card.triggers.push({ when: 'creatureEnters', zone: 'battlefield', another: m[1] === 'another ', yours: !!(m[3] || m[4]), filter: m[2].trim(), ops }); continue; }
    if ((m = l.match(/^whenever (this card|a creature you control|one or more creatures you control|equipped creature) attacks?, (.+)$/))) { const ops = parseOps(m[2]); if (ops.length) card.triggers.push({ when: 'attack', zone: 'battlefield', who: m[1], ops }); continue; }
    if ((m = l.match(/^whenever (this card|a creature you control|equipped creature|one or more creatures you control) deals? combat damage to (?:a player|an opponent), (.+)$/))) { const ops = parseOps(m[2]); if (ops.length) card.triggers.push({ when: 'combatDamage', zone: 'battlefield', who: m[1], ops }); continue; }
    if ((m = l.match(/^when this card dies, (.+)$/))) { const ops = parseOps(m[1]); if (ops.length) card.triggers.push({ when: 'dies', zone: 'self', ops }); continue; }
    if ((m = l.match(/^when(?:ever)? this card enters(?: the battlefield)?(?: or attacks)?, (.+)$/))) { const ops = parseOps(m[1]).filter(o => !(o.op === 'destroy' && card.roles.includes('removal'))); if (ops.length) card.etbOps = (card.etbOps || []).concat(ops); continue; }
    // ---- activated abilities "cost: effect"
    if ((m = l.match(/^([^:"]+): (.+)$/)) && !/^[+−-]?\d+$/.test(m[1].trim()) && !/^add \{|add (one|two) mana|mana of any/.test(m[2])) {
      const cp = costParts(m[1]); if (!cp.ok) continue;
      const ops = parseOps(m[2]); if (!ops.length) continue;
      const zone = /from your graveyard/.test(m[2]) && ops.some(o => o.op === 'selfToBf' || o.op === 'selfToHand') || /from your graveyard/.test(m[1]) ? 'graveyard' : 'battlefield';
      if (card.fetch && zone === 'battlefield') continue; // fetchlands have their own handling
      card.abilities.push({ zone, label: '', cost: cp.cost, tap: cp.tap, sacSelf: cp.sacSelf, exileSelf: cp.exileSelf, discardSelf: cp.discardSelf, life: cp.life, exileOthers: cp.exileOthers, discard: cp.discard, sacOther: cp.sacOther, speed: instantSpeed(l) ? 'instant' : 'sorcery', ops, text: m[2] });
    }
  }
  tagStatic(card, lines);
  // Teysa Karlov-style: death triggers of your permanents trigger twice
  card.doublesDeath = /dying causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time/.test(txt);
  return card;
}

/** "{T}: Add ..." -> {amount, colors}. colors 'C' = colourless only. Only plain {T} costs (no filters / sac outlets). */
function parseManaAbility(o) {
  const all = [...o.matchAll(/(?:^|\n)\{t\}: add ([^.\n]+)/g)].map(m => parseManaText(m[1])).filter(Boolean);
  if (!all.length) return null;
  return { amount: Math.max(...all.map(x => x.amount)), colors: [...new Set(all.flatMap(x => x.colors))].sort((a, b) => (a === 'C') - (b === 'C')) };
}
function parseManaText(t) {
  if (/one mana of any color|one mana of any one color/.test(t)) return { amount: 1, colors: ['W', 'U', 'B', 'R', 'G'] };
  if (/two mana in any combination of colors/.test(t)) return { amount: 2, colors: ['W', 'U', 'B', 'R', 'G'] };
  if (/three mana in any combination|three mana of any one color/.test(t)) return { amount: 3, colors: ['W', 'U', 'B', 'R', 'G'] };
  const syms = (t.match(/^((?:\{[wubrgc]\})+)/) || [])[1];
  if (syms && !/ or /.test(t.slice(0, syms.length + 4))) { const list = syms.match(/\{([wubrgc])\}/g).map(s => s[1].toUpperCase()); return { amount: list.length, colors: [...new Set(list)] }; }
  const opts = (t.match(/\{([wubrgc])\}/g) || []).map(s => s[1].toUpperCase()); // "{R} or {G}", "{G}, {W}, or {U}"
  return opts.length ? { amount: 1, colors: [...new Set(opts)] } : null;
}
/** how widely played a card is in Commander (0..1), from EDHREC: a proxy for card strength the AI can use */
const POP = new Map();
function setPopularity(map) { POP.clear(); for (const [k, v] of Object.entries(map || {})) POP.set(k.toLowerCase(), Math.max(0, Math.min(1, +v || 0))); }
const COLORW = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
/** graveyard hate: "exile target player's graveyard" (spells and Bojuka Bog-style lands) */
function tagGyHate(card, o) {
  card.gyHate = /exile all graveyards|exile all cards from all graveyards|exile each graveyard/.test(o) ? 'all'
    : /exile each opponent's graveyard|exile all cards from each opponent's graveyard/.test(o) ? 'opps'
    : /exile (all cards from )?target player's graveyard|exile target player's graveyard/.test(o) ? 'target' : null;
}
/** tutors: "search your library for a [creature] card, put it into your hand / graveyard / on top / onto the battlefield" */
function tagTutor(card, o) {
  const m = o.match(/search your library for (a|an|up to (one|two|three|four|five)) ([a-z ,-]*?)cards?\b([^.]*?)[.,] (?:reveal (?:it|them|that card|those cards)[^,.]*, )?(?:then )?(?:shuffle(?: and|,)? )?(?:then )?put (?:it|that card|the card|them|those cards) (into your hand|into your graveyard|on top( of your library)?|onto the battlefield)/);
  if (!m || /\bland\b/.test(m[3])) return;
  const n = m[2] ? (NUM[m[2]] || { four: 4, five: 5 }[m[2]] || 1) : 1;
  const alts = m[3].trim() ? m[3].trim().split(/,? or |, /).map(s => s.trim().split(/\s+/).filter(w => w && w !== 'card')).filter(a => a.length) : [];
  const mv = (m[4] + ' ' + o).match(/mana value (x|\d+) or less|mana value less than or equal to (x|\d+)/);
  card.tutor = { n, alts, dest: /hand/.test(m[5]) ? 'hand' : /graveyard/.test(m[5]) ? 'graveyard' : /battlefield/.test(m[5]) ? 'battlefield' : 'top', max: mv ? ((v => v === 'x' ? 3 : +v)(mv[1] || mv[2])) : null, upTo: !!m[2] };
  card.roles.push('tutor');
}
/** reanimation: return / put a creature card from a graveyard onto the battlefield */
function tagReanimate(card, o) {
  const m = o.match(/(?:return|put) target creature card (?:with mana value (\d+) or less )?from (a|your|an opponent's) graveyard (?:to|onto) the battlefield|return enchanted creature card to the battlefield/);
  if (!m) return;
  card.reanimate = { scope: m[2] === 'your' ? 'mine' : m[2] === "an opponent's" ? 'opps' : 'any', max: m[1] ? +m[1] : null, lifeLoss: /you lose life equal to its mana value/.test(o) };
  card.roles.push('reanimate');
}
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
    { const ma = parseManaAbility(o); card.manaAmount = ma ? ma.amount : 1; }
    tagLandEntry(card, o); tagGyHate(card, o); tagAbilities(card);
    return card;
  }
  const r = card.roles;
  tagTutor(card, o); tagReanimate(card, o); tagGyHate(card, o);
  if (/add \{|add (one|two|three) mana|search your library for (up to \w+ )?(a )?basic land|lands? onto the battlefield|treasure token/.test(o)) r.push('ramp');
  if (/draw (a|two|three|x|\d+) cards?|draw cards|investigate|clue token/.test(o)) r.push('draw');
  const ow = o.replace(/exile all (cards from )?(all )?graveyards?|exile all cards from [a-z' ]*graveyards?/g, '');
  if (/destroy all (creatures|nonland|permanents|artifacts and creatures)|exile all (creatures|nonland|other)|(each creature|all creatures|all other creatures) gets? -\d|deals? \d+ damage to each (creature|other creature|nonland)|return all nonland permanents to their owners/.test(ow)) r.push('wipe');
  else if (/destroy target|exile target (creature|permanent|nonland|artifact|enchantment)|deals? \d+ damage to (any target|target creature)|fight|target creature gets -\d\/-\d|return target (creature|nonland permanent)( you don't control| an opponent controls)? to its owner|shuffles it into (its|their) library|on the bottom of (its|their) owner's library/.test(o)) r.push('removal');
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
  if (card.reanimate && r.includes('removal')) r.splice(r.indexOf('removal'), 1);
  if (/creatures you control get \+|each creature you control gets \+/.test(o)) r.push('pump');
  if (/create (a|an|two|three|x|\d+) .* tokens?/.test(o)) r.push('tokens');
  if (/extra combat|additional combat/.test(o)) r.push('extracombat');
  if (/hexproof|indestructible|protection|phase out/.test(o) && (card.isInstant || card.isEnchantment || card.isArtifact)) r.push('protect');
  if (/gain \w+ life|lifelink/.test(o)) r.push('lifegain');
  if (/you win the game|loses the game|infinite/.test(o)) r.push('wincon');
  if (card.isCreature && /whenever|at the beginning/.test(o)) r.push('engine');
  if (!card.isCreature && (card.isArtifact || card.isEnchantment) && /whenever|at the beginning/.test(o) && !r.includes('ramp')) r.push('engine');
  tagAbilities(card);
  card.pop = POP.get(card.name.toLowerCase()) || 0;
  if (!isLand) card.manaAb = parseManaAbility(o);
  // numbers applied when the card resolves: spells use their text minus triggered/activated lines; permanents use etbOps instead
  const isPerm = card.isCreature || card.isArtifact || card.isEnchantment || card.isPlaneswalker;
  const res = isPerm ? '' : o.split('\n').filter(l => !/^(at the beginning|whenever|when )/.test(l) && !/^[^:"]+: /.test(l) && !/^(flashback|cycling|escape|jump-start)/.test(l)).join('\n');
  card.spellOps = isPerm ? null : parseOps(res).filter(op => ['dig', 'mill', 'millOpp', 'scry', 'surveil', 'gyToHand', 'drain', 'landToHand', 'counters'].includes(op.op));
  if (card.spellOps && !card.spellOps.length) card.spellOps = null;
  const tokN = res.match(/create (a|an|two|three|four|\d+)/); card.tokenCount = tokN ? (NUM[tokN[1]] || parseInt(tokN[1]) || 1) : 0;
  const tokPT = o.match(/(\d+)\/(\d+) [a-z ]*creature token/); card.tokenPT = tokPT ? [+tokPT[1], +tokPT[2]] : [1, 1];
  const dmg = res.match(/deals? (\d+) damage/); card.dmg = dmg ? +dmg[1] : 0;
  const drawN = res.match(/draw (a|two|three|four|\d+) cards?/); card.drawN = drawN ? (NUM[drawN[1]] || parseInt(drawN[1]) || 1) : 0;
  const pump = o.match(/get \+(\d+)\/\+(\d+)/); card.pumpN = pump ? +pump[1] : 0;
  const gain = res.match(/gain (\d+) life/); card.gainN = gain ? +gain[1] : 0;
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
  async emit(e) { if ((this.emits = (this.emits || 0) + 1) > 60000) throw new Error('game stalled (too many actions): ' + e.type); this.refreshStatics(); if (this.hooks.emit) await this.hooks.emit(e, this); }
  /** apply anthems / lords / equipment: per-creature static pump (b.spump) and granted keywords (card.kw = base + grants) */
  refreshStatics() {
    for (const p of this.players) {
      const anth = p.battlefield.filter(b => b.card.anthems && b.card.anthems.length);
      const equips = p.battlefield.filter(b => b.card.equip && b.attachedTo != null);
      for (const b of p.battlefield) {
        const c = b.card; if (!c.isCreature) continue;
        if (!c.kwBase) c.kwBase = (c.kw || []).slice();
        let pp = 0, tt = 0; const kws = new Set(c.kwBase);
        for (const a of anth) for (const an of a.card.anthems) { if (an.other && a === b) continue; if (!matchesFilter(c, an.filter)) continue; pp += an.pump[0]; tt += an.pump[1]; an.kws.forEach(k => kws.add(k)); }
        for (const e of equips) if (e.attachedTo === b.id) { pp += e.card.equip.pump[0]; tt += e.card.equip.pump[1]; e.card.equip.kws.forEach(k => kws.add(k)); }
        if (kws.has('shroud')) kws.add('hexproof');
        b.spump = [pp, tt]; c.kw = [...kws];
      }
    }
  }
  /** loop guard: at most 250 triggered abilities resolve per turn (stops token / death-trigger loops) */
  trigOk() { if (this.trigBudget == null) this.trigBudget = 250; if (this.trigBudget-- > 0) return true; if (!this.trigWarned) { this.trigWarned = true; this.say('— trigger limit reached this turn (loop stopped)'); } return false; }
  landLimit(p) { return 1 + p.battlefield.reduce((s, b) => s + (b.card.extraLands || 0), 0); }
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
  manaSources(p) { return p.battlefield.filter(b => !b.tapped && !(b.summoning && b.card.isCreature) && (b.card.isLand ? b.card.produces.length > 0 : !!b.card.manaAb)); }
  srcInfo(b) { return b.card.isLand ? { amount: b.card.manaAmount || 1, colors: b.card.produces } : b.card.manaAb; }
  availableMana(p) { return this.manaSources(p).reduce((s, b) => s + this.srcInfo(b).amount, 0); }
  /** plan which sources to tap for `cost` (+ `reserve` generic left over). returns the sources, or null */
  manaPlan(p, cost, reserve = 0) {
    const srcs = this.manaSources(p).map(b => ({ b, ...this.srcInfo(b), left: this.srcInfo(b).amount, used: false }));
    if (srcs.reduce((s, x) => s + x.amount, 0) < cost.total + reserve) return null;
    const need = { ...cost.pips };
    // colour pips: prefer sources with the fewest colours (and already-tapped ones)
    for (const col of 'WUBRG') while (need[col] > 0) {
      const cand = srcs.filter(s => s.left > 0 && s.colors.includes(col)).sort((a, b) => (b.used - a.used) || (a.colors.length - b.colors.length) || (a.amount - b.amount))[0];
      if (!cand) return null; cand.left--; cand.used = true; need[col]--;
    }
    // generic: use leftovers of tapped sources first, then colourless, then the rest
    let g = cost.generic;
    while (g > 0) {
      const cand = srcs.filter(s => s.left > 0).sort((a, b) => (b.used - a.used) || ((b.colors[0] === 'C') - (a.colors[0] === 'C')) || (a.colors.length - b.colors.length) || (Math.abs(a.left - g) - Math.abs(b.left - g)))[0];
      if (!cand) return null; const k = Math.min(cand.left, g); cand.left -= k; g -= k; cand.used = true;
    }
    const spare = srcs.filter(s => !s.used).reduce((s, x) => s + x.amount, 0);
    if (spare < reserve) return null;
    return srcs.filter(s => s.used).map(s => s.b);
  }
  costOf(p, card, zone) {
    let cost = zone === 'gy' ? (card.gyCast ? card.gyCast.cost : card.mana) : zone === 'cmd' ? { ...card.mana, total: card.mana.total + p.cmdTax, generic: card.mana.generic + p.cmdTax } : card.mana;
    const red = p.battlefield.reduce((s, b) => s + (b.card.reducers || []).filter(r => matchesFilter(card, r.filter)).reduce((x, r) => x + r.n, 0), 0);
    if (red && cost.generic) { const k = Math.min(red, cost.generic); cost = { ...cost, generic: cost.generic - k, total: cost.total - k }; }
    return cost;
  }
  canPayCost(p, cost, reserve = 0) { return !!this.manaPlan(p, cost, reserve); }
  payCost(p, cost) { const plan = this.manaPlan(p, cost) || []; for (const b of plan) b.tapped = true; }
  /** can `p` cast `card` right now? returns 'mana' | 'free' | null. `instant` = outside own main phase */
  castMode(p, card, zone = 'hand', { instant = false } = {}) {
    if (card.isLand) return null;
    if (instant && !card.flash) return null;
    if (!instant && this.stack.length) return null;
    if (zone === 'gy') { const gc = card.gyCast; if (!gc || !p.graveyard.includes(card)) return null; if (gc.exileOthers && p.graveyard.filter(c => c !== card).length < gc.exileOthers) return null; if (gc.discard && !p.hand.length) return null; if (gc.discardLand && !p.hand.some(c => c.isLand)) return null; return this.canPayCost(p, this.costOf(p, card, zone)) ? 'mana' : null; }
    const free = this.freeMode(p, card);
    if (free && card.counter.free === 'commander') return 'free'; // no downside: never pay mana for it
    if (this.canPayCost(p, this.costOf(p, card, zone))) return 'mana';
    return free;
  }
  freeMode(p, card) {
    const f = card.counter && card.counter.free;
    if (f === 'pitch' || (f === 'pitchNotTurn' && this.players[this.active] !== p)) { if (p.hand.some(c => c !== card && c.colors.includes('U'))) return 'free'; }
    if (f === 'commander' && p.battlefield.some(b => b.card.isCommander)) return 'free';
    return null;
  }
  /** cards that become castable this turn only if `perm` is untapped */
  enabledBy(p, perm) {
    const myTurn = this.players[this.active] === p && this.phase !== 'end';
    const pool = [...p.hand.filter(c => !c.isLand).map(c => [c, 'hand']), ...p.command.map(c => [c, 'cmd'])];
    const can = () => new Set(pool.filter(([c, z]) => (myTurn || c.flash) && this.canPayCost(p, this.costOf(p, c, z))).map(([c]) => c));
    const was = perm.tapped; perm.tapped = true; const before = can(); perm.tapped = false; const after = can(); perm.tapped = was;
    return [...after].filter(c => !before.has(c));
  }
  wouldEnterTapped(p, card) {
    if (card.etbTapped) return true;
    if (card.etbCond && !this.condMet(p, card.etbCond)) return true;
    if (card.reveal && !p.hand.some(c => c !== card && card.reveal.some(w => c.type.toLowerCase().includes(w)))) return true;
    return false;
  }
  condMet(p, cond) {
    const lands = p.battlefield.filter(b => b.card.isLand).length;
    if (cond.kind === 'fewLands') return lands <= 2;
    if (cond.kind === 'manyLands') return lands >= 2;
    if (cond.kind === 'opps') return this.opponentsOf(p).length >= 2;
    if (cond.kind === 'control') return p.battlefield.some(b => cond.words.some(w => b.card.type.toLowerCase().includes(w)));
    return true;
  }
  /** a land enters the battlefield, resolving its optional / conditional "enters tapped" text. returns [perm, notes] */
  async landEnters(p, card, tapped = false) {
    const perm = { id: UID++, card, tapped: tapped || !!card.etbTapped, summoning: false, counters: 0 }; const notes = [];
    if (!perm.tapped && card.etbCond && !this.condMet(p, card.etbCond)) { perm.tapped = true; notes.push('tapped'); }
    if (!perm.tapped && card.reveal) { const r = p.hand.find(c => c !== card && card.reveal.some(w => c.type.toLowerCase().includes(w))); if (r) notes.push('reveals ' + r.name); else { perm.tapped = true; notes.push('tapped, nothing to reveal'); } }
    p.battlefield.push(perm);
    if (!perm.tapped && card.shock) {
      perm.tapped = true; const n = card.etbLife;
      let pay = false;
      if (p.life > n) pay = p.human ? (this.hooks.humanETB ? !!(await this.hooks.humanETB({ p, card, perm, life: n, enables: this.enabledBy(p, perm) })) : false) : p.ai ? p.ai.payLifeForLand(this, p, card, perm) : false;
      if (pay) { perm.tapped = false; await this.changeLife(p, -n, card); notes.push(`paid ${n} life`); } else notes.push('tapped');
    }
    return [perm, notes];
  }
  async choosePayUnless(payer, victim, counterCard, n) {
    if (payer.human) return this.hooks.humanPayUnless ? !!(await this.hooks.humanPayUnless({ p: payer, spell: victim, counter: counterCard, n })) : true;
    return payer.ai ? payer.ai.payUnless(this, payer, victim, n) : true;
  }
  // ---------- casting with priority ----------
  async playLand(p, card) {
    const i = p.hand.indexOf(card); if (i < 0 || p.landsThisTurn >= this.landLimit(p) || !card.isLand) return false;
    p.hand.splice(i, 1); p.landsThisTurn++;
    const [perm, notes] = await this.landEnters(p, card);
    this.say(`plays ${card.name}${notes.length ? ' (' + notes.join(', ') + ')' : card.etbTapped ? ' (tapped)' : ''}`, p); await this.emit({ type: 'land', p, card, perm });
    if (card.gyHate) await this.doGyHate(p, card); // Bojuka Bog-style enter trigger
    await this.landfall(p);
    return true;
  }
  /** cast a spell; returns true if it resolved. target: perm (with .owner) or player */
  async cast(p, card, zone = 'hand', target = null, { instant = false, depth = 0 } = {}) {
    let mode = this.castMode(p, card, zone, { instant }); if (!mode) return false;
    let exile = null;
    if (p.human && card.counter && card.counter.free && card.counter.free.startsWith('pitch') && this.freeMode(p, card) && this.hooks.humanAltCost) {
      const canMana = this.canPayCost(p, this.costOf(p, card, zone)), blues = p.hand.filter(c => c !== card && c.colors.includes('U'));
      if (canMana || blues.length > 1) { const r = await this.hooks.humanAltCost({ p, card, canMana, blues }); if (!r) return false; mode = r.mode; exile = r.exile || null; }
    }
    const src = zone === 'cmd' ? p.command : zone === 'gy' ? p.graveyard : p.hand; const i = src.indexOf(card); if (i < 0) return false;
    src.splice(i, 1);
    if (zone === 'gy') { const gc = card.gyCast;
      if (gc.exileOthers) { const others = p.graveyard.filter(c => c !== card).sort((a, b) => a.cmc - b.cmc).slice(0, gc.exileOthers); for (const c of others) { p.graveyard.splice(p.graveyard.indexOf(c), 1); p.exile.push(c); } }
      if (gc.discard) { const d = p.ai ? p.ai.chooseDiscard(this, p) : (this.hooks.humanDiscard ? await this.hooks.humanDiscard(p) : p.hand[0]); if (d) { p.hand.splice(p.hand.indexOf(d), 1); p.graveyard.push(d); } }
      if (gc.discardLand) { const d = p.hand.find(c => c.isLand); if (d) { p.hand.splice(p.hand.indexOf(d), 1); p.graveyard.push(d); } }
    }
    if (mode === 'mana') this.payCost(p, this.costOf(p, card, zone));
    else if (card.counter.free.startsWith('pitch')) { // exile the least valuable other blue card, pay 1 life
      const blues = p.hand.filter(c => c.colors.includes('U')).sort((a, b) => a.cmc - b.cmc); const ex = exile && p.hand.includes(exile) ? exile : blues[0]; p.hand.splice(p.hand.indexOf(ex), 1); p.exile.push(ex); p.life -= 1;
      this.say(`exiles ${ex.name} to cast ${card.name} for free`, p);
    }
    if (zone === 'cmd') p.cmdTax += 2;
    const spell = { card, caster: p, target, zone }; this.stack.push(spell);
    this.say(`casts ${card.name}${zone === 'gy' ? ' (' + card.gyCast.kind + ')' : ''}${target ? ' → ' + (target.spell ? target.spell.card.name : target.card ? target.card.name : target.name) : ''}`, p);
    await this.emit({ type: 'cast', p, card, target, depth });
    await this.castTriggers(p, card);
    // priority: everyone else in turn order may respond with a counterspell
    let countered = false;
    if (depth < 4) for (const q of this.after(p)) {
      if (countered || this.winner) break;
      const resp = await this.askCounter(q, spell, depth);
      if (resp && resp.ability) { await this.activate(q, resp.ability); continue; }
      if (resp) { const isCounter = resp.card.roles.includes('counter'); const ok = await this.cast(q, resp.card, 'hand', isCounter ? { spell } : null, { instant: true, depth: depth + 1 }); if (ok && spell.countered) countered = true; }
    }
    this.stack.splice(this.stack.indexOf(spell), 1);
    if (spell.countered) {
      await this.emit({ type: 'countered', p, card });
      if (card.isCommander) { p.command.push(card); this.say(`— ${card.name} returns to the command zone`, p); } else if (zone === 'gy' && card.gyCast.exileAfter) p.exile.push(card); else p.graveyard.push(card);
      return false;
    }
    await this.resolve(spell);
    return true;
  }
  async askCounter(q, spell, depth) {
    const counters = q.hand.filter(c => c.roles.includes('counter') && counterHits(c, spell.card) && this.castMode(q, c, 'hand', { instant: true }));
    const threatened = this.threatTo(q, spell);
    const protects = threatened.length ? q.hand.filter(c => c.roles.includes('protect') && c.isInstant && this.castMode(q, c, 'hand', { instant: true })) : [];
    const options = [...counters, ...protects];
    if (!options.length && !(q.ai && threatened.length)) return null;
    if (q.human) return options.length && this.hooks.humanRespond ? await this.hooks.humanRespond({ kind: 'counter', spell, options, depth, threatened }) : null;
    if (q.ai) {
      const c = counters.length ? q.ai.chooseCounter(this, q, spell, counters, depth) : null; if (c) return { card: c };
      const pr = protects.length ? q.ai.chooseProtect(this, q, spell, protects, threatened) : null; if (pr) return { card: pr, protect: true };
      if (q.ai.level === 'cutthroat' && threatened.length === 1 && threatened[0].card.isCreature && !threatened[0].card.isCommander) {
        const outlet = this.abilityOptions(q, { instant: true }).find(o => o.ab.sacOther);
        if (outlet) return { ability: { ...outlet, victim: threatened[0] } };
      }
      return null;
    }
    return null;
  }
  async resolve(spell) {
    const { card, caster: p, target } = spell;
    // counterspell resolving against a spell on the stack
    if (card.roles.includes('counter') && target && target.spell) {
      const victim = target.spell;
      if (card.counter.unless && victim.caster && this.canPayCost(victim.caster, { generic: card.counter.unless, pips: { W: 0, U: 0, B: 0, R: 0, G: 0 }, total: card.counter.unless }) && await this.choosePayUnless(victim.caster, victim, card, card.counter.unless)) {
        this.payCost(victim.caster, { generic: card.counter.unless, pips: { W: 0, U: 0, B: 0, R: 0, G: 0 }, total: card.counter.unless });
        this.say(`pays {${card.counter.unless}} for ${card.name}`, victim.caster); await this.emit({ type: 'paid', p: victim.caster, n: card.counter.unless });
      } else victim.countered = true;
      p.graveyard.push(card); await this.emit({ type: 'resolve', p, card }); return;
    }
    const perm = card.isCreature || card.isArtifact || card.isEnchantment || card.isPlaneswalker;
    if (card.roles.includes('wipe')) {
      await this.emit({ type: 'wipe', p, card });
      for (const q of this.alive()) for (const b of q.battlefield.filter(b => b.card.isCreature && !b.card.kw.includes('indestructible') && b.protTurn !== this.turn)) await this.destroy(q, b, true);
      this.say(`— board wiped`, p);
      for (const q of this.alive()) if (q.battlefield.some(x => x.card.isCreature && x.protTurn === this.turn)) this.say(`— ${q.name}'s creatures survive (protected)`, p);
    } else if (card.roles.includes('removal') && target && target.card) {
      const owner = this.players[target.owner];
      if (!owner.battlefield.includes(target)) this.say(`— target is gone`, p);
      else if (target.protTurn === this.turn) this.say(`— ${target.card.name} is protected`, p);
      else if (target.card.kw.includes('indestructible') && !/exile|return/.test(card.oracle.toLowerCase())) this.say(`— ${target.card.name} is indestructible`, p);
      else {
        const o = card.oracle.toLowerCase();
        if (/to (its|their) owner's hand/.test(o) && !/exile/.test(o)) await this.bounce(owner, target, p);
        else if (/shuffles it into (its|their) library|on the bottom of (its|their) owner's library|on top of (its|their) owner's library/.test(o)) await this.tuck(owner, target, p, /on top/.test(o));
        else await this.destroy(owner, target);
      }
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
      for (const t of p.battlefield.slice(-n)) await this.creatureEntered(p, t);
    }
    if (card.roles.includes('protect') && card.isInstant) this.doProtect(p, card);
    if (card.tutor) await this.doTutor(p, card);
    if (card.spellOps) await this.runOps(p, card.spellOps, card, {});
    if (card.gyHate) await this.doGyHate(p, card);
    if (card.reanimate) await this.doReanimate(p, card);
    if (card.roles.includes('pump')) p.pumpUntilEOT = (p.pumpUntilEOT || 0) + (card.pumpN || 1);
    if (card.roles.includes('extracombat')) p.extraCombat = true;
    let pm = null;
    if (perm) { pm = { id: UID++, card, tapped: false, summoning: card.isCreature, counters: 0, loyalty: card.isPlaneswalker ? 4 : 0 }; p.battlefield.push(pm); }
    else if (spell.zone === 'gy' && card.gyCast && card.gyCast.exileAfter) { p.exile.push(card); this.say(`— ${card.name} is exiled`, p); }
    else p.graveyard.push(card);
    await this.emit({ type: 'resolve', p, card, perm: pm });
    if (pm && card.etbOps) await this.runOps(p, card.etbOps, card, { perm: pm });
    if (pm) await this.creatureEntered(p, pm);
    if (card.roles.includes('wincon') && this.rng() < 0.15 && this.round >= 6) {
      this.say(`— ${card.name} goes off!`, p); await this.emit({ type: 'combo', p, card });
      for (const q of this.opponentsOf(p)) await this.kill(q, `${p.name}'s ${card.name}`);
    }
  }
  /** protection instants (Heroic Intervention, Tamiyo's Safekeeping...): until end of turn */
  doProtect(p, card) {
    const o = card.oracle.toLowerCase();
    let perms;
    if (/permanents you control|creatures you control|each creature you control/.test(o)) perms = p.battlefield.filter(b => /permanents/.test(o) || b.card.isCreature);
    else { const threat = [...this.stack].reverse().find(s => s.target && s.target.card && p.battlefield.includes(s.target)); perms = threat ? [threat.target] : p.battlefield.filter(b => b.card.isCreature).sort((a, b) => b.card.power - a.card.power).slice(0, 1); }
    for (const b of perms) b.protTurn = this.turn;
    this.say(`— protects ${perms.length === 1 ? perms[0].card.name : perms.length + ' permanents'} this turn`, p);
  }
  /** does `spell` threaten q's board? (for protection responses) */
  threatTo(q, spell) {
    const c = spell.card;
    if (c.roles.includes('wipe')) return q.battlefield.filter(b => b.card.isCreature && !b.card.kw.includes('indestructible') && b.protTurn !== this.turn);
    if (c.roles.includes('removal') && spell.target && spell.target.card && q.battlefield.includes(spell.target) && spell.target.protTurn !== this.turn) return [spell.target];
    return [];
  }
  // ---------- triggers ----------
  async fireTriggers(p, when) {
    // battlefield triggers of the active player (and "each upkeep" triggers of everyone)
    for (const q of this.alive()) for (const b of [...q.battlefield]) for (const tr of b.card.triggers || []) {
      if (tr.when !== when || tr.zone !== 'battlefield' || !(q === p || tr.each)) continue;
      if (!q.battlefield.includes(b)) continue;
      if (tr.may && !(await this.chooseMay(q, b.card, tr))) continue;
      this.say(`— ${b.card.name} triggers`, q); await this.emit({ type: 'trigger', p: q, card: b.card, perm: b });
      (this.trigOk()) && await this.runOps(q, tr.ops, b.card, { perm: b });
    }
    // graveyard triggers (e.g. "at the beginning of your upkeep, if this card is in your graveyard...")
    for (const c of [...p.graveyard]) for (const tr of c.triggers || []) {
      if (tr.when !== when || tr.zone !== 'graveyard' || !p.graveyard.includes(c)) continue;
      if (tr.may && !(await this.chooseMay(p, c, tr))) continue;
      this.say(`— ${c.name} triggers from the graveyard`, p); await this.emit({ type: 'trigger', p, card: c });
      (this.trigOk()) && await this.runOps(p, tr.ops, c, {});
    }
  }
  async landfall(p) { await this.fireTriggers(p, 'landfall'); }
  async deathTriggers(owner, perm) {
    const dead = perm.card;
    // the creature's own "when this dies" trigger
    for (const tr of dead.triggers || []) if (tr.when === 'dies' && (tr.zone === 'self' || tr.self)) {
      const times = owner.battlefield.some(b => b.card.doublesDeath) ? 2 : 1;
      for (let k = 0; k < times; k++) { this.say(`— ${dead.name} dies trigger${times > 1 && k ? ' (again)' : ''}`, owner); (this.trigOk()) && await this.runOps(owner, tr.ops, dead, {}); }
    }
    for (const q of this.alive()) for (const b of [...q.battlefield]) for (const tr of b.card.triggers || []) {
      if (tr.when !== 'dies' || tr.zone !== 'battlefield' || b === perm) continue;
      if (tr.yours && q !== owner) continue;
      if (tr.nontoken && dead.token) continue;
      const times = q.battlefield.some(x => x.card.doublesDeath) ? 2 : 1;
      for (let k = 0; k < times; k++) { this.say(`— ${b.card.name} triggers (${dead.name} died)${k ? ' again' : ''}`, q); await this.emit({ type: 'trigger', p: q, card: b.card, perm: b }); (this.trigOk()) && await this.runOps(q, tr.ops, b.card, { perm: b }); }
    }
  }
  async chooseMay(p, card, tr) {
    if (p.human) return this.hooks.humanMay ? !!(await this.hooks.humanMay({ p, card, text: tr.ops.map(o => o.op).join(', ') })) : true;
    return true; // the AI takes beneficial optional triggers
  }
  // ---------- running effects ----------
  async chooseFromList(p, src, pool, n, dest) {
    if (!pool.length) return [];
    if (p.human) return [].concat((this.hooks.humanSearch ? await this.hooks.humanSearch({ p, card: src, pool, n, dest, upTo: true }) : null) || []);
    return p.ai ? [].concat(p.ai.chooseCards(this, p, pool, n, dest) || []) : pool.slice(0, n);
  }
  async choosePlayer(p, src, players, why) {
    if (!players.length) return null;
    if (players.length === 1) return players[0];
    if (p.human) return this.hooks.humanChoosePlayer ? await this.hooks.humanChoosePlayer({ p, card: src, players, why }) : players[0];
    return p.ai ? p.ai.pickFace(this, p) : players[0];
  }
  async runOps(p, ops, src, ctx = {}) {
    for (const op of ops) {
      if (p.dead || this.winner) return;
      switch (op.op) {
        case 'mill': { const milled = p.library.splice(-Math.min(op.n, p.library.length)).reverse(); p.graveyard.push(...milled); this.say(`— mills ${milled.map(c => c.name).join(', ') || 'nothing'}`, p); await this.emit({ type: 'mill', p, cards: milled }); break; }
        case 'millOpp': { const vs = op.all ? this.alive() : op.each ? this.opponentsOf(p) : [await this.choosePlayer(p, src, this.opponentsOf(p), `${src.name}: which player mills ${op.n}?`)]; for (const q of vs.filter(Boolean)) { const milled = q.library.splice(-Math.min(op.n, q.library.length)).reverse(); q.graveyard.push(...milled); this.say(`— ${q.name} mills ${milled.map(c => c.name).join(', ')}`, p); await this.emit({ type: 'mill', p: q, cards: milled }); } break; }
        case 'draw': await this.draw(p, op.n); break;
        case 'gain': await this.changeLife(p, op.n, src); break;
        case 'lose': await this.changeLife(p, -op.n, src); break;
        case 'drain': { const vs = op.each ? this.opponentsOf(p) : [await this.choosePlayer(p, src, this.opponentsOf(p), `${src.name}: which player loses ${op.n} life?`)]; for (const q of vs.filter(Boolean)) await this.changeLife(q, -op.n, src); break; }
        case 'damage': {
          if (op.to === 'each opponent') { for (const q of this.opponentsOf(p)) await this.changeLife(q, -op.n, src); break; }
          if (op.to === 'each creature') { for (const q of this.alive()) for (const b of q.battlefield.filter(b => b.card.isCreature && this.toughOf(q, b) <= op.n && b.protTurn !== this.turn)) await this.destroy(q, b); break; }
          const creatureOnly = /creature/.test(op.to);
          let hit = null;
          if (p.ai) { const t = p.ai.bestTarget(this, p, b => b.card.isCreature && (b.card.toughness + (b.counters || 0)) <= op.n); if (t && (creatureOnly || t.value >= 6)) hit = t.perm; }
          else if (p.human && creatureOnly) { const pool = this.opponentsOf(p).flatMap(q => q.battlefield.filter(b => b.card.isCreature).map(b => b.card)); const pick = (await this.chooseFromList(p, src, pool, 1, 'damage'))[0]; if (pick) for (const q of this.alive()) { const b = q.battlefield.find(b => b.card === pick); if (b) { hit = b; hit.owner = q.i; } } }
          if (hit) { const owner = this.players[hit.owner]; this.say(`— ${op.n} damage to ${hit.card.name}`, p); if (this.toughOf(owner, hit) <= op.n && hit.protTurn !== this.turn) await this.destroy(owner, hit); }
          else if (!creatureOnly) { const q = await this.choosePlayer(p, src, this.opponentsOf(p), `${src.name}: deal ${op.n} damage to which player?`); if (q) { this.say(`— ${op.n} damage to ${q.name}`, p); await this.changeLife(q, -op.n, src); } }
          break;
        }
        case 'tokens': { const n = Math.min(op.n, 8); const made = []; for (let k = 0; k < n; k++) made.push({ id: UID++, card: { uid: UID++, name: src.name + ' token', type: 'Token Creature', isCreature: true, power: op.pt[0], toughness: op.pt[1], kw: op.kw || [], roles: [], colors: [], mana: manaInfo(''), cmc: 0, token: true, oracle: '' }, tapped: false, summoning: true, counters: 0 }); p.battlefield.push(...made); await this.emit({ type: 'tokens', p, n, card: src }); for (const t of made) await this.creatureEntered(p, t); break; }
        case 'tokenCopy': { p.battlefield.push({ id: UID++, card: { ...src, uid: UID++, name: src.name + ' token', token: true, power: op.pt ? op.pt[0] : src.power, toughness: op.pt ? op.pt[1] : src.toughness, isCommander: false }, tapped: false, summoning: true, counters: 0 }); this.say(`— creates a token copy of ${src.name}`, p); await this.emit({ type: 'tokens', p, n: 1, card: src }); break; }
        case 'note': this.say(`— ${op.text}`, p); break;
        case 'edict': {
          const vs = op.who === 'each player' ? this.alive() : op.who.startsWith('each') ? this.opponentsOf(p) : [await this.choosePlayer(p, src, this.opponentsOf(p).filter(q => q.battlefield.some(b => b.card.isCreature)), `${src.name}: which player sacrifices?`)];
          for (const q of vs.filter(Boolean)) for (let k = 0; k < op.n; k++) {
            const pool = q.battlefield.filter(b => op.what.includes('creature') ? (b.card.isCreature || (op.what.includes('planeswalker') && b.card.isPlaneswalker)) : !b.card.isLand);
            if (!pool.length) break;
            let v = null;
            if (q.human) { const pick = (await this.chooseFromList(q, src, pool.map(b => b.card), 1, 'sacrifice'))[0]; v = pool.find(b => b.card === pick) || pool[0]; }
            else v = q.ai ? [...pool].sort((a, b) => q.ai.permBase(a) - q.ai.permBase(b))[0] : pool[0];
            this.say(`— ${q.name} sacrifices ${v.card.name}`, p); await this.destroy(q, v);
          }
          break;
        }
        case 'bounceAllOpp': { for (const q of this.opponentsOf(p)) for (const b of q.battlefield.filter(b => !b.card.isLand)) await this.bounce(q, b, p); this.say(`— returns every nonland permanent its opponents control to hand`, p); break; }
        case 'attach': {
          const mine = p.battlefield.filter(b => b.card.isCreature); if (!mine.length || !ctx.perm) break;
          let t = null;
          if (p.ai) t = p.ai.bestEquipTarget(this, p, ctx.perm);
          else { const pick = (await this.chooseFromList(p, src, mine.map(b => b.card), 1, 'equip'))[0]; t = mine.find(b => b.card === pick); }
          if (t) { ctx.perm.attachedTo = t.id; this.refreshStatics(); this.say(`— ${src.name} is attached to ${t.card.name}`, p); }
          break;
        }
        case 'dig': {
          const top = p.library.splice(-Math.min(op.n, p.library.length)).reverse();
          const ty = op.filter; const pool = top.filter(c => !ty || ty.split(/ or /).some(w => c.type.toLowerCase().includes(w.trim())));
          const pick = (await this.chooseFromList(p, src, pool, 1, 'dig'))[0];
          if (pick) p.hand.push(pick);
          const rest = top.filter(c => c !== pick); p.graveyard.push(...rest);
          this.say(`— reveals ${top.map(c => c.name).join(', ')}${pick ? `; takes ${pick.name}` : ''}; the rest go to the graveyard`, p); await this.emit({ type: 'mill', p, cards: rest }); break;
        }
        case 'gyToHand': {
          const ty = op.filter.replace(/\bcard\b/, '').trim(); const pool = p.graveyard.filter(c => c !== src && (!ty || ty.split(' ').every(w => w.startsWith('non') ? !c.type.toLowerCase().includes(w.slice(3)) : c.type.toLowerCase().includes(w))));
          const picks = await this.chooseFromList(p, src, pool, op.n, 'gyhand');
          for (const c of picks) { const i = p.graveyard.indexOf(c); if (i >= 0) { p.graveyard.splice(i, 1); p.hand.push(c); } }
          this.say(picks.length ? `— returns ${picks.map(c => c.name).join(', ')} to hand` : '— returns nothing', p); await this.emit({ type: 'tutor', p, card: src, picks, dest: 'hand' }); break;
        }
        case 'gyToBf': { const pool = p.graveyard.filter(c => c.isCreature && c !== src && (op.max == null || c.cmc <= op.max)); const pick = (await this.chooseFromList(p, src, pool, 1, 'reanimate'))[0]; if (pick) { p.graveyard.splice(p.graveyard.indexOf(pick), 1); const pm = { id: UID++, card: pick, tapped: false, summoning: true, counters: 0 }; p.battlefield.push(pm); this.say(`— returns ${pick.name} to the battlefield`, p); await this.emit({ type: 'reanimate', p, card: pick, perm: pm, from: p }); if (pick.etbOps) await this.runOps(p, pick.etbOps, pick, { perm: pm }); await this.creatureEntered(p, pm); } break; }
        case 'selfToBf': { const i = p.graveyard.indexOf(src); if (i < 0) break; p.graveyard.splice(i, 1); const pm = { id: UID++, card: src, tapped: !!op.tapped, summoning: !op.haste && !src.kw.includes('haste'), counters: 0, unearth: !!op.unearth }; p.battlefield.push(pm); this.say(`— ${src.name} returns to the battlefield${op.unearth ? ' (unearthed)' : ''}`, p); await this.emit({ type: 'reanimate', p, card: src, perm: pm, from: p }); if (src.etbOps) await this.runOps(p, src.etbOps, src, { perm: pm }); await this.creatureEntered(p, pm); break; }
        case 'selfToHand': { const i = p.graveyard.indexOf(src); if (i < 0) break; p.graveyard.splice(i, 1); p.hand.push(src); this.say(`— ${src.name} returns to hand`, p); await this.emit({ type: 'tutor', p, card: src, picks: [src], dest: 'hand' }); break; }
        case 'counters': {
          let targets = [];
          if (op.to === 'this card' && ctx.perm) targets = [ctx.perm];
          else if (/each/.test(op.to)) targets = p.battlefield.filter(b => b.card.isCreature && !(/other/.test(op.to) && b === ctx.perm));
          else { const mine = p.battlefield.filter(b => b.card.isCreature); targets = mine.length ? [p.ai ? mine.sort((a, b) => p.ai.permBase(b) - p.ai.permBase(a))[0] : (await this.chooseFromList(p, src, mine.map(b => b.card), 1, 'counters')).map(c => mine.find(b => b.card === c))[0]].filter(Boolean) : []; }
          for (const b of targets) b.counters = (b.counters || 0) + op.n;
          if (targets.length) this.say(`— ${op.n} +1/+1 counter${op.n > 1 ? 's' : ''} on ${targets.length === 1 ? targets[0].card.name : targets.length + ' creatures'}`, p); break;
        }
        case 'scry': case 'surveil': {
          const top = p.library.slice(-op.n).reverse(); if (!top.length) break;
          const away = p.human ? await this.chooseFromList(p, src, top, top.length, op.op) : p.ai.chooseScry(this, p, top);
          for (const c of away) { p.library.splice(p.library.indexOf(c), 1); if (op.op === 'scry') p.library.unshift(c); else p.graveyard.push(c); }
          this.say(`— ${op.op} ${op.n}${away.length ? `: ${away.length} to the ${op.op === 'scry' ? 'bottom' : 'graveyard'}` : ''}`, p); break;
        }
        case 'landToHand': { const pool = p.library.filter(c => c.isLand && (!op.basic || /basic/i.test(c.type)) && (!op.types.length || op.types.some(t => c.type.toLowerCase().includes(t)))); const pick = (await this.chooseFromList(p, src, pool, 1, 'land'))[0]; if (pick) { p.library.splice(p.library.indexOf(pick), 1); p.hand.push(pick); } shuffle(p.library, this.rng); this.say(pick ? `— searches for ${p.human ? pick.name : 'a land'} (into hand)` : '— finds no land', p); break; }
        case 'destroy': {
          const ok = b => op.what === 'creature' ? b.card.isCreature : op.what === 'artifact' ? b.card.isArtifact : op.what === 'enchantment' ? b.card.isEnchantment : op.what === 'artifact or enchantment' ? (b.card.isArtifact || b.card.isEnchantment) : !b.card.isLand;
          let hit = null;
          if (p.ai) { const t = p.ai.bestTarget(this, p, ok); hit = t && t.perm; }
          else { const pool = this.opponentsOf(p).flatMap(q => q.battlefield.filter(ok).map(b => b.card)); const pick = (await this.chooseFromList(p, src, pool, 1, 'destroy'))[0]; if (pick) for (const q of this.alive()) { const b = q.battlefield.find(b => b.card === pick); if (b) { hit = b; hit.owner = q.i; } } }
          if (hit && hit.protTurn !== this.turn) await this.destroy(this.players[hit.owner], hit); break;
        }
      }
    }
  }
  // ---------- activated abilities ----------
  abilitySource(q, card, ab) {
    if (ab.zone === 'battlefield') return q.battlefield.find(b => b.card === card) || null;
    if (ab.zone === 'graveyard') return q.graveyard.includes(card) ? card : null;
    if (ab.zone === 'hand') return q.hand.includes(card) ? card : null;
    return null;
  }
  canUseAbility(q, card, ab, perm, { instant = false } = {}) {
    if (q.dead) return false;
    const src = perm || this.abilitySource(q, card, ab); if (!src) return false;
    if (ab.speed === 'sorcery' && (instant || this.players[this.active] !== q || !/main/.test(this.phase) || this.stack.length)) return false;
    if (ab.tap) { const b = src; if (!b.id || b.tapped || (b.summoning && b.card.isCreature && !b.card.kw.includes('haste'))) return false; }
    if (ab.life && q.life <= ab.life) return false;
    if (ab.exileOthers && q.graveyard.filter(c => c !== card).length < ab.exileOthers) return false;
    if (ab.discard && q.hand.filter(c => c !== card).length < ab.discard) return false;
    if (ab.sacOther && !q.battlefield.some(b => b.card.isCreature && (ab.sacOther !== 'another' || b !== src))) return false;
    if (ab.ops.some(o => o.op === 'attach') && !q.battlefield.some(b => b.card.isCreature)) return false;
    // something to do?
    for (const op of ab.ops) { if (op.op === 'gyToHand' && !q.graveyard.some(c => c !== card)) return false; if (op.op === 'gyToBf' && !q.graveyard.some(c => c.isCreature && c !== card)) return false; if (op.op === 'counters' && op.to === 'target creature' && !q.battlefield.some(b => b.card.isCreature)) return false; }
    if (ab.tap) { const was = src.tapped; src.tapped = true; const ok = this.canPayCost(q, ab.cost); src.tapped = was; return ok; }
    return this.canPayCost(q, ab.cost);
  }
  abilityOptions(q, { instant = false } = {}) {
    const out = [];
    const add = (card, perm, zone) => (card.abilities || []).forEach((ab, ai) => { if (ab.zone === zone && this.canUseAbility(q, card, ab, perm, { instant })) out.push({ kind: 'ability', card, perm, ab, ai }); });
    for (const b of q.battlefield) add(b.card, b, 'battlefield');
    for (const c of q.graveyard) add(c, null, 'graveyard');
    for (const c of q.hand) add(c, null, 'hand');
    return out;
  }
  gyCastOptions(q, { instant = false } = {}) { return q.graveyard.filter(c => c.gyCast && this.castMode(q, c, 'gy', { instant })).map(c => ({ kind: 'cast', card: c, zone: 'gy' })); }
  async activate(q, opt) {
    const { card, ab } = opt; const perm = opt.perm || (ab.zone === 'battlefield' ? q.battlefield.find(b => b.card === card) : null);
    if (!this.canUseAbility(q, card, ab, perm)) return false;
    if (ab.tap && perm) perm.tapped = true;
    this.payCost(q, ab.cost);
    if (ab.life) await this.changeLife(q, -ab.life, card);
    if (ab.discard) { const d = q.ai ? q.ai.chooseDiscard(this, q) : (this.hooks.humanDiscard ? await this.hooks.humanDiscard(q) : q.hand.find(c => c !== card)); if (d && d !== card) { q.hand.splice(q.hand.indexOf(d), 1); q.graveyard.push(d); } }
    if (ab.sacOther) {
      const pool = q.battlefield.filter(b => b.card.isCreature && (ab.sacOther !== 'another' || b !== perm));
      let v = opt.victim && pool.includes(opt.victim) ? opt.victim : null;
      if (!v) { if (q.human) { const pick = (await this.chooseFromList(q, card, pool.map(b => b.card), 1, 'sacrifice'))[0]; v = pool.find(b => b.card === pick); } else v = q.ai ? q.ai.chooseSacVictim(this, q, pool) : pool[0]; }
      if (!v) return false;
      this.say(`sacrifices ${v.card.name} to ${card.name}`, q); await this.sacrifice(q, v);
    }
    if (ab.exileOthers) { const others = q.graveyard.filter(c => c !== card).sort((a, b) => a.cmc - b.cmc).slice(0, ab.exileOthers); for (const c of others) { q.graveyard.splice(q.graveyard.indexOf(c), 1); q.exile.push(c); } }
    await this.emit({ type: 'activate', p: q, perm, card });
    this.say(`activates ${card.name}${ab.label ? ' (' + ab.label + ')' : ''}`, q);
    // pay "this card" costs: sacrifice / exile / discard the source
    if (ab.sacSelf && perm) await this.sacrifice(q, perm);
    if (ab.exileSelf) { if (perm) { const i = q.battlefield.indexOf(perm); if (i >= 0) q.battlefield.splice(i, 1); if (!card.token) q.exile.push(card); await this.emit({ type: 'destroy', owner: q, perm, quiet: true }); } else { const i = q.graveyard.indexOf(card); if (i >= 0) { q.graveyard.splice(i, 1); q.exile.push(card); } } }
    if (ab.discardSelf) { const i = q.hand.indexOf(card); if (i >= 0) { q.hand.splice(i, 1); q.graveyard.push(card); } }
    await this.runOps(q, ab.ops, card, { perm });
    return true;
  }
  tutorMatch(c, t) {
    if (t.max != null && (c.isLand || c.cmc > t.max)) return false;
    if (!t.alts.length) return true;
    const ty = c.type.toLowerCase();
    return t.alts.some(ws => ws.every(w => COLORW[w] ? c.colors.includes(COLORW[w]) : w.startsWith('non') ? !ty.includes(w.slice(3)) : ty.includes(w)));
  }
  async doTutor(p, card) {
    const t = card.tutor; const pool = p.library.filter(c => this.tutorMatch(c, t));
    let picks = [];
    if (pool.length) picks = p.human ? [].concat((this.hooks.humanSearch ? await this.hooks.humanSearch({ p, card, pool, n: t.n, dest: t.dest, upTo: true }) : null) || []) : p.ai ? [].concat(p.ai.chooseTutor(this, p, pool, t) || []) : [];
    picks = picks.filter(c => p.library.includes(c)).slice(0, t.n);
    for (const c of picks) p.library.splice(p.library.indexOf(c), 1);
    shuffle(p.library, this.rng);
    const names = picks.map(c => c.name).join(', ');
    for (const c of picks) {
      if (t.dest === 'hand') p.hand.push(c);
      else if (t.dest === 'graveyard') p.graveyard.push(c);
      else if (t.dest === 'top') p.library.push(c); // top of library = end of the array
      else if (c.isLand) await this.landEnters(p, c);
      else p.battlefield.push({ id: UID++, card: c, tapped: false, summoning: c.isCreature, counters: 0, loyalty: c.isPlaneswalker ? 4 : 0 });
    }
    const hidden = !p.human && (t.dest === 'hand' || (t.dest === 'top' && !/reveal/.test(card.oracle.toLowerCase())));
    const where = { hand: 'into hand', graveyard: 'into the graveyard', top: 'on top of library', battlefield: 'onto the battlefield' }[t.dest];
    this.say(picks.length ? `— searches for ${hidden ? (picks.length > 1 ? picks.length + ' cards' : 'a card') : names} (${where})` : `— searches and finds nothing`, p);
    await this.emit({ type: 'tutor', p, card, picks, dest: t.dest });
  }
  graveCreatures(p, scope, max) {
    const owners = scope === 'mine' ? [p] : scope === 'opps' ? this.opponentsOf(p) : this.players;
    const out = [];
    for (const q of owners) for (const c of q.graveyard) if (c.isCreature && !/token/i.test(c.type) && (max == null || c.cmc <= max)) out.push(c);
    return out;
  }
  ownerOfGrave(c) { return this.players.find(q => q.graveyard.includes(c)); }
  async doReanimate(p, card) {
    const r = card.reanimate; const pool = this.graveCreatures(p, r.scope, r.max);
    if (!pool.length) { this.say(`— no creature card to return`, p); return; }
    const pick = p.human ? [].concat((this.hooks.humanSearch ? await this.hooks.humanSearch({ p, card, pool, n: 1, dest: 'reanimate' }) : null) || [])[0] : p.ai ? p.ai.chooseReanimate(this, p, pool) : pool[0];
    const owner = pick && this.ownerOfGrave(pick); if (!owner) return;
    owner.graveyard.splice(owner.graveyard.indexOf(pick), 1);
    const pm = { id: UID++, card: pick, tapped: false, summoning: true, counters: 0 }; p.battlefield.push(pm);
    this.say(`— returns ${pick.name}${owner !== p ? ' from ' + owner.name + "'s graveyard" : ''} to the battlefield`, p);
    await this.emit({ type: 'reanimate', p, card: pick, perm: pm, from: owner });
    if (pick.etbOps) await this.runOps(p, pick.etbOps, pick, { perm: pm });
    await this.creatureEntered(p, pm);
    if (r.lifeLoss && pick.cmc) await this.changeLife(p, -pick.cmc, card);
  }
  async doGyHate(p, card) {
    let victims = card.gyHate === 'all' ? this.alive() : card.gyHate === 'opps' ? this.opponentsOf(p) : null;
    if (!victims) {
      const withCards = this.alive().filter(q => q.graveyard.length);
      if (!withCards.length) return;
      const v = p.human ? (this.hooks.humanChoosePlayer ? await this.hooks.humanChoosePlayer({ p, card, players: withCards, why: `${card.name}: exile which graveyard?` }) : null) : p.ai ? p.ai.chooseGyHate(this, p, withCards) : null;
      victims = v ? [v] : [];
    }
    for (const q of victims) { if (!q.graveyard.length) continue; const n = q.graveyard.length; q.exile.push(...q.graveyard); q.graveyard = []; this.say(`— exiles ${q.name}'s graveyard (${n} card${n > 1 ? 's' : ''})`, p); await this.emit({ type: 'gyhate', p, victim: q, card }); }
  }
  async bounce(owner, perm, by) {
    const i = owner.battlefield.indexOf(perm); if (i < 0) return; await this.emit({ type: 'destroy', owner, perm, quiet: true }); owner.battlefield.splice(i, 1);
    if (perm.card.token) { this.say(`— ${perm.card.name} is bounced and vanishes`, by); return; }
    if (perm.card.isCommander) owner.command.push(perm.card); else owner.hand.push(perm.card);
    this.say(`— ${perm.card.name} returns to ${owner.name}'s ${perm.card.isCommander ? 'command zone' : 'hand'}`, by);
  }
  async tuck(owner, perm, by, top) {
    const i = owner.battlefield.indexOf(perm); if (i < 0) return; await this.emit({ type: 'destroy', owner, perm, quiet: true }); owner.battlefield.splice(i, 1);
    if (perm.card.token) return;
    if (perm.card.isCommander) { owner.command.push(perm.card); this.say(`— ${perm.card.name} goes to the command zone`, by); return; }
    if (top) owner.library.push(perm.card); else owner.library.splice(Math.floor(this.rng() * (owner.library.length + 1)), 0, perm.card);
    this.say(`— ${perm.card.name} goes into ${owner.name}'s library`, by);
  }
  /** a creature entered: fire "whenever a creature enters" triggers everywhere */
  async creatureEntered(p, perm) {
    if (!perm || !perm.card.isCreature) return;
    for (const q of this.alive()) for (const b of [...q.battlefield]) for (const tr of b.card.triggers || []) {
      if (tr.when !== 'creatureEnters' || (tr.another && b === perm) || (tr.yours && q !== p) || !matchesFilter(perm.card, tr.filter)) continue;
      (this.trigOk()) && await this.runOps(q, tr.ops, b.card, { perm: b, entered: perm });
    }
  }
  async castTriggers(p, card) {
    for (const b of [...p.battlefield]) for (const tr of b.card.triggers || []) {
      if (tr.when !== 'cast' || !matchesFilter(card, tr.filter)) continue;
      this.say(`— ${b.card.name} triggers (cast ${card.name})`, p); await this.emit({ type: 'trigger', p, card: b.card, perm: b });
      (this.trigOk()) && await this.runOps(p, tr.ops, b.card, { perm: b });
    }
  }
  async attackTriggers(p, atk) {
    for (const b of [...p.battlefield]) for (const tr of b.card.triggers || []) {
      if (tr.when !== 'attack') continue;
      const n = tr.who === 'this card' ? (atk.some(a => a.attacker === b) ? 1 : 0) : tr.who === 'equipped creature' ? (atk.some(a => a.attacker.id === b.attachedTo) ? 1 : 0) : tr.who === 'one or more creatures you control' ? 1 : atk.length;
      for (let k = 0; k < n; k++) { this.say(`— ${b.card.name} attack trigger`, p); (this.trigOk()) && await this.runOps(p, tr.ops, b.card, { perm: b }); }
    }
  }
  async combatDamageTriggers(p, attacker) {
    for (const b of [...p.battlefield]) for (const tr of b.card.triggers || []) {
      if (tr.when !== 'combatDamage') continue;
      const hit = tr.who === 'this card' ? b === attacker : tr.who === 'equipped creature' ? b.attachedTo === attacker.id : true;
      if (!hit) continue;
      if (tr.who === 'one or more creatures you control' && this._cdOnce && this._cdOnce.has(b)) continue;
      (this._cdOnce = this._cdOnce || new Set()).add(b);
      this.say(`— ${b.card.name} combat damage trigger`, p); (this.trigOk()) && await this.runOps(p, tr.ops, b.card, { perm: b });
    }
  }
  async destroy(owner, perm, quiet) {
    if (!owner.battlefield.includes(perm)) return;
    await this.emit({ type: 'destroy', owner, perm, quiet });
    const i = owner.battlefield.indexOf(perm); if (i < 0) return; owner.battlefield.splice(i, 1);
    if (perm.card.isCommander) { owner.command.push(perm.card); this.say(`— ${perm.card.name} returns to the command zone`, owner); }
    else if (perm.unearth) owner.exile.push(perm.card);
    else if (!perm.card.token) owner.graveyard.push(perm.card);
    if (perm.card.isCreature) await this.deathTriggers(owner, perm);
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
      const [pm, notes] = await this.landEnters(p, land, f.tapped && !(f.untapIf4 && landsNow + 1 >= 4));
      this.say(`cracks ${perm.card.name} → ${land.name}${notes.length ? ' (' + notes.join(', ') + ')' : pm.tapped ? ' (tapped)' : ''}`, p);
      await this.emit({ type: 'land', p, card: land, perm: pm, fetched: true });
      if (land.gyHate) await this.doGyHate(p, land);
      await this.landfall(p);
    }
    if (!picks.length) this.say(`cracks ${perm.card.name} and finds nothing`, p);
    shuffle(p.library, this.rng);
    return true;
  }
  async sacrifice(owner, perm) {
    await this.emit({ type: 'destroy', owner, perm, quiet: true });
    const i = owner.battlefield.indexOf(perm); if (i >= 0) owner.battlefield.splice(i, 1);
    if (perm.card.isCommander) { owner.command.push(perm.card); this.say(`— ${perm.card.name} returns to the command zone`, owner); }
    else if (!perm.card.token) owner.graveyard.push(perm.card);
    if (perm.card.isCreature) await this.deathTriggers(owner, perm);
  }
  // ---------- priority ----------
  /** everything `q` could legally do right now outside their own main phase */
  legalActions(q) {
    if (q.dead) return [];
    const out = [];
    for (const c of q.hand) if (c.flash && !c.roles.includes('counter') && this.castMode(q, c, 'hand', { instant: true })) out.push({ kind: 'cast', card: c });
    for (const b of q.battlefield) if (b.card.fetch && this.canActivate(q, b)) out.push({ kind: 'fetch', perm: b, card: b.card });
    out.push(...this.gyCastOptions(q, { instant: true }), ...this.abilityOptions(q, { instant: true }));
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
    if (act.kind === 'cast') return this.cast(q, act.card, act.zone || 'hand', act.target || null, { instant: act.instant !== false });
    if (act.kind === 'ability') return this.activate(q, act);
    return false;
  }
  // ---------- combat ----------
  canBlock(b, a) {
    const k = a.card.kw;
    if (k.includes('unblockable') || k.includes('shadow') || k.includes('horsemanship') || k.includes('menace')) return false; // only single blocks are modelled, so menace can't be blocked
    if (k.includes('flying') && !(b.card.kw.includes('flying') || b.card.kw.includes('reach'))) return false;
    if (k.includes('fear') || k.includes('intimidate') || k.includes('skulk')) return b.card.kw.includes('flying') && false;
    return true;
  }
  powerOf(p, b) { return b.card.power + (b.counters || 0) + (b.spump ? b.spump[0] : 0) + (b.card.isCreature ? (p.pumpUntilEOT || 0) : 0); }
  toughOf(p, b) { return b.card.toughness + (b.counters || 0) + (b.spump ? b.spump[1] : 0) + (b.card.isCreature ? (p.pumpUntilEOT || 0) : 0); }
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
    await this.attackTriggers(p, atk); this._cdOnce = new Set();
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
      if (p.battlefield.includes(h.attacker) || h.attacker.card.triggers) await this.combatDamageTriggers(p, h.attacker);
    }
    for (const [q, why] of killQ) await this.kill(q, why);
    this.phase = 'main2';
    await this.emit({ type: 'combatEnd', p });
  }
  // ---------- turn structure ----------
  async beginTurn(p) {
    this.turn++; if (p === this.alive()[0] || this.round === 0) this.round++;
    this.trigBudget = 250; this.trigWarned = false;
    p.landsThisTurn = 0; p.pumpUntilEOT = 0; p.extraCombat = false; this.phase = 'untap'; this.step = 'untap';
    for (const b of p.battlefield) { b.tapped = false; b.summoning = false; }
    this.say(`— turn ${this.turn} —`, p);
    await this.emit({ type: 'turn', p });
  }
  async takeTurn(p) {
    await this.beginTurn(p); if (p.dead || this.winner) return;
    this.phase = 'upkeep'; await this.fireTriggers(p, 'upkeep'); if (p.dead || this.winner) return;
    await this.priorityRound('upkeep', p); if (p.dead || this.winner) return;
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
    this.phase = 'end'; await this.fireTriggers(p, 'end'); if (p.dead || this.winner) return;
    await this.priorityRound('end', p);
  }
  async cleanup(p) {
    while (p.hand.length > 7) { const c = p.ai ? p.ai.chooseDiscard(this, p) : (this.hooks.humanDiscard ? await this.hooks.humanDiscard(p) : p.hand[0]); p.hand.splice(p.hand.indexOf(c), 1); p.graveyard.push(c); this.say(`discards ${c.name}`, p); }
    p.pumpUntilEOT = 0;
    for (const b of p.battlefield.filter(b => b.unearth)) { p.battlefield.splice(p.battlefield.indexOf(b), 1); p.exile.push(b.card); this.say(`— ${b.card.name} is exiled (unearth)`, p); }
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
  constructor(level = 'focused', rng = Math.random) { this.expert = level === 'expert'; this.level = this.expert ? 'cutthroat' : level; this.rng = rng; }
  popW() { return this.expert ? 1 : { casual: 0, focused: 0.4, cutthroat: 0.6 }[this.level]; }
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
    if (c.anthems && c.anthems.length) v += 4;
    if (c.equip) v += 1.5;
    v += (c.pop || 0) * 5 * this.popW(); // widely played staples are strong cards
    return v;
  }
  /** cheap, unconditional, instant-speed or exile-based removal is "premium": save it for real threats */
  isPremium(c) { const o = (c.oracle || '').toLowerCase(); return c.mana.total <= 2 || /exile target/.test(o) || (c.isInstant && c.mana.total <= 3 && /destroy target/.test(o)); }
  removalNeed(game, me, c) {
    const base = this.isPremium(c) ? { casual: 5, focused: 7, cutthroat: 6 } : { casual: 3, focused: 4.5, cutthroat: 4 };
    let need = base[this.level] * (this.expert ? this.params().removalScale : 1);
    if (me.hand.filter(x => x.roles.includes('removal')).length >= 3) need -= 1.5; // plenty of removal: spend it more freely
    return need;
  }
  permValue(b, owner, game, me) {
    const c = b.card; let v = this.permBase(b);
    if (c.isCreature && c.roles.includes('ramp') && game.powerOf(owner, b) <= 1 && !c.isCommander) v *= game.round <= 2 && this.level === 'cutthroat' ? 0.9 : 0.5; // mana dorks: rarely worth a removal spell
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
    v += (c.pop || 0) * 6 * this.popW();
    if (c.anthems && c.anthems.length) v += caster.battlefield.filter(b => b.card.isCreature).length * 1.2;
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
    if (this.expert) threshold += this.params().counterAdj;
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
    if (this.expert && !this.params().reserve) return 0;
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
    const card = [...options].sort((x, y) => x.mana.total - y.mana.total)[0];
    const need = { casual: 12, focused: 7, cutthroat: 6 }[this.level] + (this.isPremium(card) && bv < 30 ? 2 : 0);
    if (!best || bv < need) return null;
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
    if (removal.length) { const t = this.bestTarget(game, me, b => b.card.isCreature || /permanent|artifact|enchantment/.test(removal[0].oracle.toLowerCase())); if (t && this.level !== 'casual' && t.value >= this.removalNeed(game, me, removal[0])) return { card: removal[0], target: t.perm }; }
    const draw = fits.filter(c => c.roles.includes('draw')); if (draw.length && (nextIsMe || this.level === 'cutthroat')) return { card: draw[0] };
    const tut = fits.filter(c => c.tutor && this.castValue(game, me, c) > 0); if (tut.length && nextIsMe) return { card: tut[0] };
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
    if (c.roles.includes('protect') && c.isInstant) return -99; // protection is held for a wipe or removal
    const nonPerm = c.isInstant || c.isSorcery;
    if (nonPerm && !c.roles.length && !c.dmg && !c.drawN && !c.gainN && !c.tokenCount && !c.tutor && !c.reanimate && !c.gyHate && !c.spellOps) return -50;
    if (c.spellOps) for (const op of c.spellOps) v += op.op === 'gyToHand' ? (me.graveyard.length ? Math.max(...me.graveyard.map(x => this.castValueRaw(game, me, x))) * 0.6 : -10) : op.op === 'dig' ? 2 : op.op === 'drain' ? op.n * 1.2 : op.op === 'landToHand' ? 1.5 : 0.5; // no effect we model: don't cast it blindly
    if (c.roles.includes('ramp')) v += game.round <= 4 ? 6 : 1;
    if (c.roles.includes('draw')) v += me.hand.length <= 3 ? 5 : 2;
    if (c.roles.includes('wipe')) { const oppPower = opps.reduce((s, q) => s + this.boardPower(game, q), 0); const myPower = this.boardPower(game, me); v += (oppPower >= myPower * 2 + 6 || opps.some(q => this.boardPower(game, q) >= me.life)) ? 10 : -12; }
    if (c.roles.includes('removal')) { const t = this.bestTarget(game, me, b => b.card.isCreature); const need = this.removalNeed(game, me, c); v += t && t.value >= need ? 3 + maxThreat / 8 + (t.value - need) / 2 : -10; if (c.flash && this.level !== 'casual') v -= 3; } // flash removal: prefer holding it
    if (c.isCreature) v += 2 + c.power * 0.5 + c.kw.length * 0.5 + (c.roles.includes('engine') ? 2 : 0);
    if (c.roles.includes('pump')) v += myCreatures >= 3 ? 4 : -5;
    if (c.tutor) v += c.tutor.dest === 'graveyard' ? (me.hand.some(x => x.reanimate) ? 7 : -3) : c.tutor.dest === 'hand' ? 4 : 3;
    if (c.reanimate) { const pool = game.graveCreatures(me, c.reanimate.scope, c.reanimate.max); const best = pool.length ? Math.max(...pool.map(x => this.castValueRaw(game, me, x))) : -99; v += best >= 5 ? best : -20; }
    if (c.gyHate && !c.isLand) v += game.opponentsOf(me).some(q => this.graveValue(game, q) >= 10) ? 5 : -6;
    if (c.roles.includes('tokens')) v += 2;
    if (c.roles.includes('wincon')) v += game.round >= 5 ? 6 : -3;
    if (c.isInstant && !c.roles.length) v -= 3;
    if (c.isInstant && c.roles.includes('draw') && this.level === 'cutthroat') v -= 2; // cast at end of opponent's turn instead
    if (this.level === 'casual') v += (this.rng() - 0.5) * 6;
    if (this.level === 'cutthroat' && c.roles.includes('engine')) v += 3;
    if (c.anthems && c.anthems.length) v += myCreatures >= 2 ? 3 + myCreatures : -1;
    v += (c.pop || 0) * 3 * this.popW();
    if (this.expert && c.isCreature && !c.isCommander && !c.roles.includes('engine') && !(c.etbOps && c.etbOps.length) && this.params().wipe && this.wipeRisk(game, me)) v -= 6; // don't overextend into a likely wipe
    return v;
  }
  chooseDiscard(game, p) { return [...p.hand].sort((a, b) => this.castValue(game, p, a) - this.castValue(game, p, b))[0]; }
  chooseLand(me, game) {
    const lands = me.hand.filter(c => c.isLand); if (!lands.length) return null;
    const have = new Set(me.battlefield.filter(b => b.card.isLand).flatMap(b => b.card.produces));
    const need = new Set([...me.hand, ...me.command].filter(c => !c.isLand).flatMap(c => c.colors));
    return lands.sort((a, b) => { const fa = a.produces.filter(x => need.has(x) && !have.has(x)).length, fb = b.produces.filter(x => need.has(x) && !have.has(x)).length; if (fb !== fa) return fb - fa; const ta = game ? game.wouldEnterTapped(me, a) : a.etbTapped, tb = game ? game.wouldEnterTapped(me, b) : b.etbTapped;
      if (ta !== tb && (game ? game.round <= 2 || this.needManaNow(game, me) : true)) return (ta ? 1 : 0) - (tb ? 1 : 0);
      // nothing to cast this turn: get the tapped land / slow land out of the way now
      if (ta !== tb) return (tb ? 1 : 0) - (ta ? 1 : 0);
      if (a.etbCond && a.etbCond.kind === 'fewLands' && !(b.etbCond && b.etbCond.kind === 'fewLands')) return -1; // fast lands: play early
      return 0; })[0];
  }
  /** main phase: (main1) crack fetches, land drop; then spend mana by value */
  async mainPhase(game, me, second) {
    if (!second) {
      for (let k = 0; k < 3 && me.landsThisTurn < game.landLimit(me); k++) { const land = this.chooseLand(me, game); if (!land || !(await game.playLand(me, land))) break; }
      // crack fetches now only if the mana matters this turn; otherwise hold them for the end step before my turn
      for (const b of [...me.battlefield]) if (b.card.fetch && game.canActivate(me, b) && me.life > b.card.fetch.life + 2 && game.fetchTargets(me, b).length && this.needManaNow(game, me)) await game.activateFetch(me, b);
    }
    let guard = 12; const skip = new Set();
    while (guard-- > 0 && !game.winner && !me.dead) {
      const reserve = this.reserveFor(game, me);
      const options = [];
      for (const c of me.hand) if (!skip.has(c) && game.castMode(me, c, 'hand') && (second || !this.expert || !this.params().seq || this.combatRelevant(game, me, c))) options.push({ c, v: this.castValue(game, me, c), zone: 'hand' });
      for (const c of me.command) if (game.castMode(me, c, 'cmd') && (second || !this.expert || !this.params().seq || this.combatRelevant(game, me, c) || !me.battlefield.some(b => b.card.isCreature))) options.push({ c, v: this.castValue(game, me, c) + (this.level === 'casual' ? 6 : this.expert ? this.params().cmdBonus : 4) - me.cmdTax, zone: 'cmd' });
      for (const c of me.graveyard) if (!skip.has(c) && c.gyCast && game.castMode(me, c, 'gy')) options.push({ c, v: this.castValue(game, me, c) + 0.5, zone: 'gy' });
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
    if (!game.winner && !me.dead) await this.useAbilities(game, me, false);
  }
  /** how much an activated ability is worth right now (0 = don't) */
  abilityValue(game, me, opt) {
    const { card, ab, perm } = opt; let v = 0;
    for (const op of ab.ops) {
      if (op.op === 'gyToHand') { const pool = me.graveyard.filter(c => c !== card); v += pool.length ? Math.max(...pool.map(c => this.castValue(game, me, c))) - 1 : -9; }
      else if (op.op === 'draw') v += ab.zone === 'hand' && ab.discardSelf ? 3 - Math.max(0, this.castValue(game, me, card)) : 2.5 * op.n;
      else if (op.op === 'landToHand') v += me.battlefield.filter(b => b.card.isLand).length + me.hand.filter(c => c.isLand).length < 5 ? 5 : 0.5;
      else if (op.op === 'selfToBf' || op.op === 'tokenCopy') v += this.castValueRaw(game, me, card) * (op.unearth ? 0.7 : 1);
      else if (op.op === 'gyToBf') { const pool = me.graveyard.filter(c => c.isCreature && c !== card); v += pool.length ? Math.max(...pool.map(c => this.castValueRaw(game, me, c))) : -9; }
      else if (op.op === 'tokens') v += op.n * (op.pt[0] + op.pt[1]) / 2;
      else if (op.op === 'gain') v += op.n * 0.3;
      else if (op.op === 'drain') v += op.n * 1.2;
      else if (op.op === 'damage') v += op.n;
      else if (op.op === 'counters') v += op.n * 1.5;
      else if (op.op === 'destroy') { const t = this.bestTarget(game, me, b => !b.card.isLand); v += t ? t.value * 0.8 - 2 : -9; }
      else if (op.op === 'scry' || op.op === 'surveil') v += 0.5 * op.n;
      else if (op.op === 'dig') v += 2;
      else if (op.op === 'attach') { const t = this.bestEquipTarget(game, me, perm || {}); v += t && card.equip ? 2 + (card.equip.pump[0] + card.equip.pump[1]) * 0.8 + card.equip.kws.length * 1.5 - (perm && perm.attachedTo != null && me.battlefield.some(b => b.id === perm.attachedTo) ? 2 : 0) : -9; }
      else if (op.op === 'edict') v += game.opponentsOf(me).filter(q => q.battlefield.some(b => b.card.isCreature)).length * (op.who.startsWith('each') ? 3 : 4);
      else if (op.op === 'bounceAllOpp') v += game.opponentsOf(me).reduce((s, q) => s + q.battlefield.filter(b => !b.card.isLand).reduce((x, b) => x + this.permBase(b) * 0.6, 0), 0) - 4;
    }
    if (ab.sacOther) { const pool = me.battlefield.filter(b => b.card.isCreature && (ab.sacOther !== 'another' || b !== perm)); const vic = pool.length ? this.chooseSacVictim(game, me, pool) : null; v += vic ? this.deathPayoff(game, me) - this.permBase(vic) * (vic.card.token ? 0.3 : 1) : -99; }
    if (perm && (ab.sacSelf || ab.exileSelf)) v -= this.permBase(perm) * 0.7;
    if (ab.life) v -= ab.life * (me.life < 15 ? 0.6 : 0.2);
    return v;
  }
  async useAbilities(game, me, instant) {
    for (let guard = 0; guard < 6 && !game.winner && !me.dead; guard++) {
      const reserve = instant ? 0 : this.reserveFor(game, me);
      const opts = game.abilityOptions(me, { instant }).map(o => ({ o, v: this.abilityValue(game, me, o) })).filter(x => x.v >= 3 && (x.o.ab.cost.total === 0 || game.canPayCost(me, x.o.ab.cost, reserve)));
      if (!opts.length) return;
      opts.sort((a, b) => b.v - a.v);
      if (!(await game.activate(me, opts[0].o))) return;
    }
  }
  chooseCards(game, me, pool, n, dest) {
    const score = c => dest === 'land' ? c.produces.filter(x => !me.battlefield.some(b => b.card.produces && b.card.produces.includes(x))).length * 3 + c.produces.length
      : dest === 'reanimate' ? this.castValueRaw(game, me, c) : this.castValue(game, me, c);
    return [...pool].sort((a, b) => score(b) - score(a)).slice(0, n);
  }
  chooseScry(game, me, top) {
    const lands = me.battlefield.filter(b => b.card.isLand).length + me.hand.filter(c => c.isLand).length;
    return top.filter(c => (c.isLand && lands >= 6) || (!c.isLand && lands < 3 && c.cmc >= 5) || (!c.isLand && this.castValue(game, me, c) < -3));
  }
  /** am I already ahead on board with opponents able to wipe? (expert) */
  wipeRisk(game, me) {
    const mine = me.battlefield.filter(b => b.card.isCreature).length; if (mine < 4) return false;
    const myP = this.boardPower(game, me), best = Math.max(0, ...game.opponentsOf(me).map(q => this.boardPower(game, q)));
    if (myP < best * 1.5 + 4) return false;
    return game.opponentsOf(me).some(q => q.hand.length >= 3 && q.battlefield.filter(b => b.card.isLand).length >= 4);
  }
  /** does this spell matter for this combat? (expert casts the rest after combat) */
  combatRelevant(game, me, c) {
    if (c.isCreature) return c.kw.includes('haste') || c.roles.includes('ramp') || !!c.manaAb || (c.anthems && c.anthems.length > 0) || me.battlefield.some(b => b.card.anthems && b.card.anthems.some(a => a.kws.includes('haste')));
    return ['removal', 'ramp', 'draw', 'pump', 'extracombat', 'tutor', 'wipe', 'reanimate', 'tokens'].some(r => c.roles.includes(r)) || !!c.equip || !!(c.anthems && c.anthems.length) || !!c.manaAb || !!c.spellOps;
  }
  /** expert: which of my would-be attackers stay home to survive the crack-back from everyone who sees me as their target */
  expertHome(game, me, attackers) {
    const P = this.params();
    const incoming = [];
    for (const q of game.opponentsOf(me)) {
      const ranked = game.opponentsOf(q).sort((a, b) => this.threatOf(game, q, b) - this.threatOf(game, q, a));
      const share = ranked[0] === me ? 1 : P.sideShare;
      for (const b of q.battlefield) if (b.card.isCreature && !b.card.kw.includes('defender')) incoming.push({ p: game.powerOf(q, b) * share, evasive: b.card.kw.some(k => ['flying', 'unblockable', 'menace', 'shadow'].includes(k)) });
    }
    incoming.sort((a, b) => b.p - a.p);
    const alwaysHome = me.battlefield.filter(b => b.card.isCreature && !attackers.includes(b)).length + attackers.filter(a => a.card.kw.includes('vigilance')).length;
    const cands = attackers.filter(a => !a.card.kw.includes('vigilance')).sort((a, b) => (game.toughOf(me, b) - (b.card.kw.some(k => EVASIVE.includes(k)) ? 4 : 0)) - (game.toughOf(me, a) - (a.card.kw.some(k => EVASIVE.includes(k)) ? 4 : 0)));
    const dmgWith = k => { let blockers = alwaysHome + k, d = 0; for (const x of incoming) { if (!x.evasive && blockers > 0) { blockers--; continue; } d += x.p; } return d; };
    let k = 0; while (k < cands.length && dmgWith(k) > me.life * P.crackFrac) k++;
    return new Set(cands.slice(0, k));
  }
  params() { return this._params || (this._params = Object.assign({ crackFrac: 0.3, sideShare: 0.25, removalScale: 1, counterAdj: 0, reserve: 1, wipe: 1, seq: 1, cmdBonus: 4, lateRound: 10, target: 'threat', lifeW: 0.5, home: 'base', spread: 1, chumpLife: 8 }, AI.tuning || {})); }
  bestEquipTarget(game, me, eq) {
    const mine = me.battlefield.filter(b => b.card.isCreature);
    const score = b => game.powerOf(me, b) + (b.card.kw.some(k => EVASIVE.includes(k)) ? 3 : 0) + (b.card.isCommander ? 2 : 0) - (b.summoning && !b.card.kw.includes('haste') ? 2 : 0) - (b.card.roles.includes('ramp') ? 3 : 0);
    const best = [...mine].sort((a, b) => score(b) - score(a))[0];
    return best && best.id !== eq.attachedTo ? best : null;
  }
  chooseSacVictim(game, me, pool) { return [...pool].sort((a, b) => ((b.card.token ? 1 : 0) - (a.card.token ? 1 : 0)) || ((a.card.isCommander ? 1 : 0) - (b.card.isCommander ? 1 : 0)) || (this.permBase(a) - this.permBase(b)))[0]; }
  /** total value of my death triggers for one creature dying */
  deathPayoff(game, me) {
    const mult = me.battlefield.some(b => b.card.doublesDeath) ? 2 : 1; let v = 0;
    for (const b of me.battlefield) for (const tr of b.card.triggers || []) if (tr.when === 'dies' && tr.zone === 'battlefield') for (const op of tr.ops) v += op.op === 'drain' ? op.n * (op.each ? game.opponentsOf(me).length : 1) * 1.2 : op.op === 'gain' ? op.n * 0.3 : op.op === 'draw' ? 2.5 : op.op === 'tokens' ? 2 : op.op === 'counters' ? 1.5 : 0.5;
    return v * mult;
  }
  /** shockland-style "pay N life or it enters tapped": pay only when the untapped mana does something this turn */
  payLifeForLand(game, me, card, perm) {
    const n = card.etbLife; if (me.life - n <= (this.level === 'cutthroat' ? 4 : 8)) return false;
    const myTurn = game.players[game.active] === me && game.phase !== 'end';
    const en = game.enabledBy(me, perm);
    if (myTurn) {
      if (en.some(c => !c.roles.includes('counter') && this.castValue(game, me, c) > 0)) return true;
      if (this.reserveFor(game, me) && en.some(c => c.roles.includes('counter'))) return true; // holding up a counter this turn cycle
      return this.level === 'casual' ? this.rng() < 0.35 : false; // casual players pay out of habit sometimes
    }
    // off-turn (e.g. fetched at someone's end step): it untaps in my untap step anyway, so only pay to respond right now
    return this.level !== 'casual' && en.some(c => c.roles.includes('counter') || (c.flash && c.roles.includes('removal')));
  }
  /** "counter unless its controller pays {N}": decline only when paying strips my counter backup for a minor spell */
  payUnless(game, me, spell, n) {
    if (this.level === 'casual') return true;
    const r = this.reserveFor(game, me);
    if (r && !game.canPayCost(me, { generic: n, pips: { W: 0, U: 0, B: 0, R: 0, G: 0 }, total: n }, r) && this.castValueRaw(game, me, spell.card) < 6) return false;
    return true;
  }
  chooseProtect(game, me, spell, options, threatened) {
    const v = threatened.reduce((s, b) => s + this.permBase(b), 0);
    const need = { casual: 10, focused: 6, cutthroat: 5 }[this.level];
    return v >= need ? [...options].sort((a, b) => a.mana.total - b.mana.total)[0] : null;
  }
  graveValue(game, q) { return q.graveyard.filter(c => c.isCreature).reduce((s, c) => s + this.castValueRaw(game, q, c), 0); }
  chooseGyHate(game, me, players) {
    const opps = players.filter(q => q !== me); if (!opps.length) return null;
    return opps.sort((a, b) => this.graveValue(game, b) - this.graveValue(game, a))[0];
  }
  chooseReanimate(game, me, pool) { return [...pool].sort((a, b) => this.castValueRaw(game, me, b) - this.castValueRaw(game, me, a))[0]; }
  chooseTutor(game, me, pool, t) {
    const avail = game.availableMana(me) + 1;
    const score = c => {
      let v = this.castValueRaw(game, me, c);
      if (t.dest === 'graveyard') return c.isCreature ? v + c.cmc : -5; // something worth reanimating
      if (c.roles.includes('wincon')) v += 6;
      if (c.roles.includes('reanimate') && me.graveyard.some(x => x.isCreature && x.cmc >= 5)) v += 8;
      if (t.dest !== 'battlefield' && !c.isLand && c.mana.total <= avail + 1) v += 3; // castable soon
      if (c.roles.includes('counter') && this.level !== 'casual') v += 2;
      return v + (c.pop || 0) * 6 * this.popW();
    };
    return [...pool].sort((a, b) => score(b) - score(a)).slice(0, t.n);
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
    const abil = options.filter(o => o.kind === 'ability');
    if (abil.length && step === 'end' && (game.after(active)[0] === me || this.level === 'casual')) {
      const best = abil.map(o => ({ o, v: this.abilityValue(game, me, o) })).filter(x => x.v >= 3).sort((a, b) => b.v - a.v)[0];
      if (best) return best.o;
    }
    const casts = options.filter(o => o.kind === 'cast' && o.zone !== 'gy').map(o => o.card);
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
    const lateGame = game.round > (this.expert ? this.params().lateRound : 10) || (ahead && this.level !== 'casual');
    const opps = game.opponentsOf(me).map(q => ({ q, threat: this.threatOf(game, me, q), blockers: q.battlefield.filter(b => b.card.isCreature && !b.tapped) }));
    if (!opps.length) return [];
    const lethalOn = opps.filter(o => myPower >= o.q.life && o.blockers.length === 0);
    let primary;
    if (lethalOn.length) primary = lethalOn.sort((a, b) => b.threat - a.threat)[0];
    else if (this.level === 'casual') primary = opps.sort((a, b) => a.q.life - b.q.life)[0];
    else if (this.expert && this.params().target === 'life') primary = opps.sort((a, b) => a.q.life - b.q.life)[0];
    else if (this.expert && this.params().target === 'mix') primary = opps.sort((a, b) => (b.threat - b.q.life * this.params().lifeW) - (a.threat - a.q.life * this.params().lifeW))[0];
    else primary = opps.sort((a, b) => b.threat - a.threat)[0];
    const biggestOppPower = Math.max(0, ...opps.map(o => (this.expert ? o.q.battlefield.filter(b => b.card.isCreature) : o.blockers).reduce((s, b) => s + game.powerOf(o.q, b), 0)));
    let keepHome = 0;
    if (this.level !== 'casual' && !lethalOn.length) while (biggestOppPower - keepHome * 3 >= me.life * (this.level === 'cutthroat' ? 0.9 : 0.75) && keepHome < Math.floor(attackers.length / 2)) keepHome++;
    const sorted = [...attackers].sort((a, b) => { const ea = a.card.kw.some(k => EVASIVE.includes(k)) ? 1 : 0, eb = b.card.kw.some(k => EVASIVE.includes(k)) ? 1 : 0; if (eb !== ea) return eb - ea; return game.powerOf(me, b) - game.powerOf(me, a); });
    let n = 0;
    let pool = sorted.slice(0, sorted.length - keepHome);
    if (this.expert && this.params().home === 'none') pool = sorted;
    if (this.expert && this.params().home === 'model' && !lethalOn.length) { const home = this.expertHome(game, me, attackers); pool = sorted.filter(a => !home.has(a)); }
    const going = pool.filter(a => {
      if (this.level === 'casual' || lethalOn.length || lateGame) return true;
      const evasive = a.card.kw.some(k => EVASIVE.includes(k));
      const eats = primary.blockers.filter(b => game.canBlock(b, a) && game.powerOf(primary.q, b) >= game.toughOf(me, a) && game.toughOf(primary.q, b) > game.powerOf(me, a)).length;
      return evasive || a.card.kw.includes('indestructible') || eats === 0 || n++ >= primary.blockers.length;
    });
    if (!going.length || !primary) return [];
    let assignments = going.map(a => ({ attacker: a, defender: primary.q }));
    if (this.expert && this.params().spread && !lethalOn.length && opps.length > 1) {
      // send each attacker where it actually connects, preferring the bigger threats
      const ranked = [...opps].sort((a, b) => b.threat - a.threat);
      assignments = going.map(a => {
        const clear = ranked.find(o => !o.blockers.some(b => game.canBlock(b, a) && (game.powerOf(o.q, b) >= game.toughOf(me, a) || game.toughOf(o.q, b) > game.powerOf(me, a))));
        return { attacker: a, defender: (clear && clear.threat >= ranked[0].threat * 0.5 ? clear : primary).q };
      });
    }
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
        else if (this.level === 'cutthroat' && lifeAfter <= (this.expert ? this.params().chumpLife : 8)) pick = can.sort((a, b) => this.permBase(a) - this.permBase(b))[0];
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
    if (this.expert) { const ramp = hand.filter(c => !c.isLand && c.cmc <= 2 && (c.manaAb || c.roles.includes('ramp'))).length; if (lands === 2) return ramp >= 1 || cheap >= 3; return lands >= 3 && lands <= 5 && (cheap >= 1 || ramp >= 1); }
    return lands >= 2 && lands <= 5 && cheap >= 1;
  }
  bottomChoice(hand, n) {
    const lands = hand.filter(c => c.isLand), spells = hand.filter(c => !c.isLand).sort((a, b) => b.cmc - a.cmc);
    const out = []; while (out.length < n) { if (lands.length > 4) out.push(lands.pop()); else if (spells.length) out.push(spells.shift()); else out.push(lands.pop()); } return out;
  }
}

root.Goldfish = { Game, AI, buildDeck, tagCard, setPopularity, manaInfo, counterHits, shuffle, mulberry, EVASIVE };
})(typeof window !== 'undefined' ? window : globalThis);
