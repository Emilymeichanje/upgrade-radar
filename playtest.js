/* Upgrade Radar — Goldfish Table engine (v4)
   4-seat Commander simulator with a real stack and instant-speed interaction.
   Oracle text is parsed into effects the engine runs: triggers, activated / loyalty abilities, statics (anthems,
   doublers, taxes, locks, cost changes), modal spells, auras, clones and land entry rules. Lines it can't read are
   simply not modelled, so unusual cards may behave like vanilla permanents.
   Every state change is announced through `hooks.emit(event)` (awaited), so a UI can animate it; headless
   runs pass no hooks. Exposed as window.Goldfish. */
(function (root) {
'use strict';

const KW = ['shroud','flying','trample','menace','haste','lifelink','deathtouch','first strike','double strike','vigilance','hexproof','indestructible','flash','reach','ward','unblockable','skulk','shadow','fear','intimidate','horsemanship','defender','infect','prowess'];
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
const NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, x: 3 };

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
    : /unless you control two or more basic lands/.test(o) ? { kind: 'basics' }
    : /unless it's your first, second, or third turn of the game/.test(o) ? { kind: 'early' }
    : /enters tapped unless you control a basic land/.test(o) ? { kind: 'basic1' }
    : /unless you control three or more other (islands|swamps|forests|mountains|plains)/.test(o) ? { kind: 'threeType', w: o.match(/three or more other (\w+?)s?\b/)[1] }
    : ck && !/\blands?$/.test(ck[2]) ? { kind: 'control', words: words(ck[2]) } : null;
  card.etbTapped = !card.shock && !card.reveal && !card.etbCond && /enters (the battlefield )?tapped/.test(o) && !/unless/.test(o);
}
// ============================== ABILITIES: triggers, activated abilities, graveyard casting ==============================
const NUMX = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10, thirteen: 13, x: 2 };
const numOf = s => NUMX[s] || parseInt(s) || 1;
/** oracle lines (lowercased) that engine code handles directly rather than through the parser; used by coverage audits */
const HANDLED = [];
const handles = (...res) => { HANDLED.push(...res); };
const ALLC = ['W', 'U', 'B', 'R', 'G'];
/** effect text (lowercased, card name already replaced by "this card") -> list of ops the engine can run */
let PENDING_MODAL = null;
/** "2/2 black zombie druid creature token" -> { types: 'Zombie Druid', tcolors: ['B'] } */
function tokenLook(s) {
  const mm = s.match(/\d+\/\d+ ([a-z ,-]*?)\s*(?:artifact )?creature tokens?/); if (!mm) return {};
  const words = mm[1].split(/[\s,]+/).filter(Boolean); const cw = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
  const tcolors = words.filter(w => cw[w]).map(w => cw[w]); const types = words.filter(w => !cw[w] && !/^(and|colorless|legendary|tapped|snow|enchantment)$/.test(w)).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  return types || tcolors.length ? { types: types || undefined, tcolors } : {};
}
function parseOps(t) {
  const ops = []; let m;
  if (t.includes('__modal__')) { if (PENDING_MODAL) ops.push(PENDING_MODAL); PENDING_MODAL = null; return ops; }
  if ((m = t.match(/(target player|target opponent|each opponent|each player) mills? (a|one|two|three|four|five|\d+) cards?/))) ops.push({ op: 'millOpp', n: numOf(m[2]), each: m[1].startsWith('each'), all: m[1] === 'each player' });
  else if ((m = t.match(/\bmills? (a|one|two|three|four|five|\d+) cards?/))) ops.push({ op: 'mill', n: numOf(m[1]) });
  if ((m = t.match(/\bdraws? (a|one|two|three|four|five|six|seven|\d+) cards?/)) && !/each player draws|target player draws|each opponent draws/.test(t)) ops.push({ op: 'draw', n: numOf(m[1]) });
  if ((m = t.match(/(each opponent|each other player|target opponent|target player) loses (\d+|x) life/))) ops.push({ op: 'drain', n: numOf(m[2]), each: m[1].startsWith('each') });
  if ((m = t.match(/(?:you|and|,)(?: may)? gain (\d+|x) life/))) ops.push({ op: 'gain', n: numOf(m[1]) });
  if ((m = t.match(/(?:you|and) lose (\d+) life/))) ops.push({ op: 'lose', n: numOf(m[1]) });
  if ((m = t.match(/deals? (\d+|x) damage to (any target|each opponent|target opponent|target player|target creature or planeswalker|target creature|each creature)/))) ops.push({ op: 'damage', n: numOf(m[1]), to: m[2] });
  if ((m = t.match(/create (a|an|one|two|three|four|five|x|\d+) (?:tapped )?(\d+)\/(\d+)[^.]*?creature tokens?/))) ops.push({ op: 'tokens', n: numOf(m[1]), pt: [+m[2], +m[3]], kw: ['flying', 'haste', 'lifelink', 'deathtouch', 'vigilance', 'trample', 'menace', 'reach'].filter(k => new RegExp('with [^.]*' + k).test(t)), artifact: /artifact creature token/.test(m[0]), changeling: /changeling/.test(t), scaling: /this token gets \+1\/\+1 for each artifact you control/.test(t), tapped: /create (?:a|an|one|two|three|four|five|x|\d+) tapped/.test(m[0]), ...tokenLook(m[0]) });
  else if ((m = t.match(/create (a|an|one|two|three|four|x|\d+) (tapped )?(treasure|clue|food|blood|map) tokens?/))) ops.push({ op: 'artifactTokens', n: numOf(m[1]), kind: m[3], tapped: !!m[2] });
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
  if ((m = t.match(/(each opponent|target opponent|target player|each player|each other player) sacrifices (a|an|one|two|three|thirteen) (creature or planeswalker|creatures?|nonland permanent|permanent)(?:s)?(?: of their choice)?/))) ops.push({ op: 'edict', who: m[1], n: numOf(m[2]), what: m[3] });
  if (/return all nonland permanents you don't control to their owners' hands/.test(t)) ops.push({ op: 'bounceAllOpp' });
  // lands from the library straight onto the battlefield (Solemn, Sakura-Tribe Elder, Wood Elves, Burnished Hart, Sword of the Animist)
  if ((m = t.match(/search your library for (a|an|up to two|up to three|two) (basic )?([a-z ]*?)\b(?:land )?cards?(?: and (?:a|an) [a-z ]+ card)?(?:[^.]*?)put (?:it|them|that card|those cards|one) onto the battlefield( tapped)?/)) && /land|plains|island|swamp|mountain|forest/.test(m[0])) ops.push({ op: 'landToBf', n: /two/.test(m[1]) ? 2 : /three/.test(m[1]) ? 3 : 1, basic: !!m[2], types: ['plains', 'island', 'swamp', 'mountain', 'forest'].filter(x => m[3].includes(x)), tapped: !!m[4] });
  if (/\bproliferate\b/.test(t)) ops.push({ op: 'proliferate' });
  if (/^transform this card/.test(t.trim())) ops.push({ op: 'transform' });
  if ((m = t.match(/you get ((?:\{e\})+)/))) ops.push({ op: 'energy', n: m[1].length / 3 });
  if (/take an extra turn after this one/.test(t)) ops.push({ op: 'extraTurn' });
  if (/permanents your opponents control lose hexproof and indestructible until end of turn/.test(t)) ops.push({ op: 'stripProt', indestructible: true });
  if (/creatures your opponents control lose hexproof and shroud and can't have hexproof or shroud/.test(t)) ops.push({ op: 'stripProt' });
  if ((m = t.match(/^creatures you control gain ([a-z ,]+?) until end of turn/))) ops.push({ op: 'grantAll', kws: KW.filter(k => m[1].includes(k)) });
  if ((m = t.match(/target (legendary creature|commander|creature) gains ([a-z ]+?) until end of turn/)) && !/hexproof and indestructible/.test(t)) ops.push({ op: 'grantKw', kw: m[2], filter: m[1] });
  if ((m = t.match(/target legendary creature gains hexproof and indestructible until end of turn/))) ops.push({ op: 'protectOne', legendary: true });
  if ((m = t.match(/target creature gets \+x\/\+0 and gains trample until end of turn/))) ops.push({ op: 'pumpTarget', n: 'X', kw: 'trample' });
  if (/until end of turn, creatures you control gain trample and get \+x\/\+x, where x is the greatest power among creatures you control/.test(t)) ops.push({ op: 'stampede' });
  if (/you may cast spells this turn as though they had flash/.test(t)) ops.push({ op: 'flashTurn' });
  if (/until your next turn, you may cast sorcery spells as though they had flash/.test(t)) ops.push({ op: 'flashTurn', sorcery: true });
  if (/put an indestructible counter on this card/.test(t)) ops.push({ op: 'selfIndCounter' });
  if (/you get an emblem with "creatures you control get \+2\/\+2 and have flying\."/.test(t)) ops.push({ op: 'emblem', pump: [2, 2], kws: ['flying'] });
  if (/choose a creature type\. return all creatures that aren't of the chosen type to their owners' hands/.test(t)) ops.push({ op: 'palisade' });
  if (/target creature you control deals damage equal to its power to target creature you don't control/.test(t)) ops.push({ op: 'bite', trample: /excess damage is dealt to that creature's controller/.test(t) });
  if (/look at the top card of your library\. if it's a ([a-z ]+?) card, you may reveal it and put it into your hand/.test(t)) ops.push({ op: 'heraldTop', filter: t.match(/if it's a ([a-z ]+?) card/)[1] });
  if ((m = t.match(/^this card gains (indestructible|hexproof) until end of turn/))) ops.push({ op: 'selfKw', kw: m[1] });
  if (/you may copy the exiled card\. if you do, you may cast the copy without paying its mana cost/.test(t)) ops.push({ op: 'castImprinted' });
  if ((m = t.match(/target creature(?: with power (\d+) or less)? can't be blocked this turn/))) ops.push({ op: 'unblockable', maxPower: m[1] ? +m[1] : null });
  if (/choose two target creature cards in your graveyard\. sacrifice a creature\. if you do, return the chosen cards to the battlefield tapped/.test(t)) ops.push({ op: 'victimize' });
  if (/return target spell or nonland permanent an opponent controls to its owner's hand/.test(t)) ops.push({ op: 'bounceSpellOrPerm' });
  else if (/return target spell (?:you don't control )?to its owner's hand/.test(t)) ops.push({ op: 'bounceSpell' });
  if ((m = t.match(/exile the top card of each player's library, then you may cast any number of spells from among those cards without paying their mana costs/))) ops.push({ op: 'etaliStorm' });
  if (/each player exiles cards from the top of their library until they exile a nonland card\. you may cast any number of spells from among the nonland cards exiled this way without paying their mana costs/.test(t)) ops.push({ op: 'etaliConquer' });
  if (/you may move all counters from this card onto target creature/.test(t)) ops.push({ op: 'moveAllCounters' });
  if ((m = t.match(/destroy up to (one|two) target (artifact or enchantment|artifacts and\/or enchantments)/))) ops.push({ op: 'destroyUpTo', n: numOf(m[1]), what: 'artifact or enchantment' });
  if ((m = t.match(/exile up to (one|two) target (artifacts and\/or enchantments|artifact or enchantment)/))) ops.push({ op: 'destroyUpTo', n: numOf(m[1]), what: 'artifact or enchantment', exile: true });
  if (/you and target opponent each draw a card/.test(t)) ops.push({ op: 'drawBoth' });
  if (/you draw a card and target opponent may draw a card/.test(t)) ops.push({ op: 'drawBoth' });
  if (/this card becomes a copy of target permanent card in your graveyard until end of turn/.test(t)) ops.push({ op: 'becomeCopyGy' });
  if (/the next spell you cast this turn can't be countered/.test(t)) ops.push({ op: 'nextUncounterable' });
  if (/the next spell you cast this turn has improvise/.test(t)) ops.push({ op: 'nextImprovise' });
  if ((m = t.match(/at the beginning of your next upkeep, pay ((?:\{[^}]+\})+)\. if you don't, you lose the game/))) ops.push({ op: 'pact', cost: m[1].toUpperCase() });
  if ((m = t.match(/deals? (\d+) damage to target attacking or blocking creature/))) ops.push({ op: 'damage', n: +m[1], to: 'target attacking or blocking creature' });
  if (/choose an exiled card an opponent owns with a void counter on it\. you may play it this turn without paying its mana cost/.test(t)) ops.push({ op: 'dauthiPlay' });
  if (/^exile the top card of your library\.?$/.test(t.trim())) ops.push({ op: 'exileTop' });
  if ((m = t.match(/(?:it|this card) deals (\d+) damage to any target/)) && !/damage equal/.test(t)) ops.push({ op: 'damage', n: +m[1], to: 'any target' });
  if (/creatures your opponents control attack this turn if able/.test(t)) ops.push({ op: 'forceAttack' });
  if (/tap target creature\.?/.test(t) && /metalcraft — if you control three or more artifacts, exile that creature/.test(t)) ops.push({ op: 'dispatch' });
  if (/target creature you control deals damage equal to its power to each other creature and each opponent/.test(t)) ops.push({ op: 'ignition' });
  if (/target creature you control gains protection from the color of your choice until end of turn/.test(t)) ops.push({ op: 'protColor' });
  if (/target nonland permanent becomes an artifact in addition to its other types until end of turn/.test(t)) ops.push({ op: 'makeArtifact' });
  if (/put any number of cards from your hand on the bottom of your library, then draw that many cards plus one/.test(t)) ops.push({ op: 'valakut' });
  if ((m = t.match(/each creature gets -x\/-x until end of turn/))) ops.push({ op: 'shrinkAll', n: 'X' });
  if (/exile the top card of your library face down\. put that card into your hand at the beginning of your next end step/.test(t)) ops.push({ op: 'necro' });
  if (/look at target player's hand/.test(t)) ops.push({ op: 'peekHand' });
  if ((m = t.match(/destroy target (nonbasic )?land(?: an opponent controls)?\.(?: its controller may search their library for a basic land card)?/))) ops.push({ op: 'destroyLand', nonbasic: !!m[1], ghost: /its controller may search/.test(t), ruin: /each player searches their library for a basic land card/.test(t) });
  if (/exile any number of target spells/.test(t)) ops.push({ op: 'exileSpells' });
  if (/untap target attacking creature\. prevent all combat damage that would be dealt to and dealt by that creature this turn/.test(t)) ops.push({ op: 'maze' });
  if (/for each token you control, create a token that's a copy of that permanent/.test(t)) ops.push({ op: 'copyTokens' });
  if (/move a counter from target permanent you control onto a second target permanent/.test(t)) ops.push({ op: 'moveCounter' });
  if (/up to one target creature phases out/.test(t)) ops.push({ op: 'phaseOut' });
  if (/put this card from your hand onto the battlefield/.test(t)) ops.push({ op: 'putSelfBf' });
  if (/^untap this card\.?$/.test(t.trim())) ops.push({ op: 'untapSelf' });
  if (/choose target nonland permanent card in your graveyard\. if you haven't cast a spell this turn, you may cast that card/.test(t)) ops.push({ op: 'conduitCast' });
  if (/choose target artifact card in your graveyard\. you may cast that card this turn/.test(t)) ops.push({ op: 'emryCast' });
  if ((m = t.match(/look at the top (two|three|four|five|six|seven) cards of your library\. (?:you may reveal an? ([a-z, ]+?) card from among them and put it into your hand|put (one|two) of them into your hand)(?: and)?\.? ?(?:put )?the rest on the bottom of your library/))) ops.push({ op: 'digBottom', n: numOf(m[1]), filter: m[2] ? m[2].trim() : '', take: m[3] ? numOf(m[3]) : 1 });
  if (/this card becomes a copy of target land, except it has this ability/.test(t)) ops.push({ op: 'copyLand' });
  if (/copy target triggered ability you control/.test(t)) ops.push({ op: 'copyTrigger' });
  if (/untap target legendary permanent/.test(t)) ops.push({ op: 'untapTarget', what: 'legendary' });
  if (/untap target creature\.?$/.test(t.trim())) ops.push({ op: 'untapTarget', what: 'creature' });
  if ((m = t.match(/untap target artifact or creature\. if it's an artifact creature, put a \+1\/\+1 counter on it/))) ops.push({ op: 'untapTarget', what: 'artifact or creature', counter: true });
  if ((m = t.match(/exile target (land|instant or sorcery|creature) card from a graveyard/))) ops.push({ op: 'exileGyCard', what: m[1] });
  if ((m = t.match(/^adapt (\d+)/)) || (m = t.match(/\badapt (\d+)/))) ops.push({ op: 'adapt', n: +m[1] });
  if ((m = t.match(/put a \+1\/\+1 counter on target artifact or creature you control/))) ops.push({ op: 'counters', n: 1, to: 'target creature' });
  if ((m = t.match(/distribute two \+1\/\+1 counters among one or two target creatures you control/))) ops.push({ op: 'counters', n: 2, to: 'target creature' });
  if (/put an hour counter on this card/.test(t)) ops.push({ op: 'hourSelf' });
  if ((m = t.match(/you may play the exiled card without paying its mana cost if (creatures you control have total power 10 or greater|you attacked with three or more creatures this turn|an opponent was dealt 7 or more damage this turn)/))) ops.push({ op: 'hideawayPlay', cond: /total power/.test(m[1]) ? 'power10' : /attacked/.test(m[1]) ? 'attack3' : 'dealt7' });
  if (/\binvestigate\b/.test(t)) ops.push({ op: 'artifactTokens', n: 1, kind: 'clue' });
  if ((m = t.match(/exile target noncreature artifact or noncreature enchantment/))) ops.push({ op: 'destroyUpTo', n: 1, what: 'noncreature artifact or noncreature enchantment', exile: true });
  if (/copy target instant or sorcery spell/.test(t)) ops.push({ op: 'copySpell', bounce: /then return it to its owner's hand/.test(t) });
  if (/reveal the top five cards of your library\. an opponent separates those cards into two piles/.test(t)) ops.push({ op: 'fof' });
  if (/deals x damage to each creature, where x is the number of creatures on the battlefield/.test(t)) ops.push({ op: 'damageEach', n: 'creatures' });
  if (/put a \+1\/\+1 counter on each green creature that entered this turn/.test(t)) ops.push({ op: 'oranRief' });
  if (/each opponent chooses a permanent they control of each permanent type and sacrifices the rest/.test(t)) ops.push({ op: 'lili9' });
  if (/your opponents can't cast noncreature spells this turn/.test(t)) ops.push({ op: 'silence', noncreature: true });
  if (/this card fights another target creature/.test(t)) ops.push({ op: 'fight' });
  if (/search your library for any number of god cards, put them onto the battlefield/.test(t)) ops.push({ op: 'tutorAll', filter: 'god' });
  if (/exile target card that's an instant or sorcery from your graveyard\. for each card exiled this way, copy it, and you may cast the copy without paying its mana cost/.test(t)) ops.push({ op: 'mizzix' });
  if (/create a token that's a copy of target creature you control\. sacrifice it at the beginning of the next end step/.test(t)) ops.push({ op: 'tokenCopyOf', n: 1, sacAtEnd: true });
  if (/create a token that's a copy of target (creature|artifact or creature you control|token you control)/.test(t) && !/sacrifice it/.test(t)) ops.push({ op: 'tokenCopyOf', n: 1, kickedN: /if this spell was kicked, create five of those tokens instead/.test(t) ? 5 : 0, what: /token you control/.test(t) ? 'token' : /artifact or creature/.test(t) ? 'artifact or creature' : 'creature', any: /target creature\./.test(t) && !/you control/.test(t) });
  if (/this card connives(?! x)/.test(t)) ops.push({ op: 'connive', n: 1 });
  if (/target creature you control connives x, where x is the number of creatures that died this turn/.test(t)) ops.push({ op: 'connive', n: 'died' });
  if (/harness this card/.test(t)) ops.push({ op: 'harness' });
  if (/this card becomes a copy of target nontoken artifact you control with mana value x/.test(t)) ops.push({ op: 'copyArtifact' });
  if (/exile x target creatures\. for each creature exiled this way, its controller creates a 2\/2 green boar creature token/.test(t)) ops.push({ op: 'swine' });
  if (/each player mills ten cards\. for each player, choose a creature or planeswalker card in that player's graveyard\. put those cards onto the battlefield under your control/.test(t)) ops.push({ op: 'breachMV' });
  if (/look at the top three cards of your library\. put one of them into your hand, put one of them on the bottom of your library, and exile one of them\. you may play the exiled card this turn/.test(t)) ops.push({ op: 'expressive' });
  if (/remove target attacking creature you control from combat and untap it/.test(t)) ops.push({ op: 'removeFromCombat' });
  if ((m = t.match(/target creature gets -(\d+|x)\/-(\d+|x) until end of turn/)) && !/morbid/.test(t)) ops.push({ op: 'shrinkTarget', n: m[1] === 'x' ? 'X' : +m[1] });
  if (/target creature gets -1\/-1 until end of turn[.\s]*morbid — that creature gets -13\/-13 until end of turn instead if a creature died this turn/.test(t)) ops.push({ op: 'shrinkTarget', n: 1, morbid: 13 });
  if (/exile the top card of your library\. you may put that card into your hand unless it has the same name as another card exiled this way/.test(t)) ops.push({ op: 'taintedPact' });
  if (/goad all creatures you don't control/.test(t)) ops.push({ op: 'goadAll' });
  if (/each player puts a vow counter on a creature they control and sacrifices the rest/.test(t)) ops.push({ op: 'promise' });
  if (/shuffle your library, then exile the top card\. until end of turn, you may play that card without paying its mana cost/.test(t)) ops.push({ op: 'urzaImpulse' });
  if (/each noncreature artifact you control becomes a 4\/4 artifact creature until end of turn/.test(t)) ops.push({ op: 'animateArtifacts' });
  if (/return from your graveyard to the battlefield any number of target creature cards that each have a different mana value x or less/.test(t)) ops.push({ op: 'agadeem' });
  if (/each player sacrifices all permanents they control that are one or more colors/.test(t)) ops.push({ op: 'allIsDust' });
  if (/exile any number of target creatures you control\. return those cards to the battlefield under their owner's control at the beginning of the next end step/.test(t)) ops.push({ op: 'eerie' });
  if ((m = t.match(/until end of turn, creatures you control have base power and toughness x\/x/))) ops.push({ op: 'mirrorEntity' });
  if (/change a target of target spell or ability to this card/.test(t)) ops.push({ op: 'spellskite' });
  if (/regenerate target (insect, rat, spider, or squirrel|creature)/.test(t)) ops.push({ op: 'regenerate', filter: /insect/.test(t) ? 'insect or rat or spider or squirrel' : '' });
  if (/choose target creature you control\. whenever that creature deals combat damage to a player or planeswalker this turn, draw that many cards/.test(t)) ops.push({ op: 'insight' });
  if (/draw seven cards\. then if your library has no cards in it, you win the game/.test(t)) ops.push({ op: 'jace8' });
  if (/you may put an? (equipment|creature|artifact) card from your hand onto the battlefield/.test(t)) ops.push({ op: 'putFromHand', what: t.match(/put an? (equipment|creature|artifact) card/)[1] });
  if (/target land you control becomes a 0\/0 creature with haste that's still a land/.test(t) || /\bearthbend (\d+)/.test(t)) ops.push({ op: 'earthbend', n: +((t.match(/earthbend (\d+)/) || [0, 1])[1]) });
  if (/the next time a source of your choice would deal damage to you this turn, prevent that damage/.test(t)) ops.push({ op: 'palm' });
  if (/put target creature card exiled with this card onto the battlefield tapped under your control with two additional \+1\/\+1 counters/.test(t)) ops.push({ op: 'darkCrystalReturn' });
  if (/exile this card\. return it to the battlefield tapped under its owner's control at the beginning of the next end step/.test(t)) ops.push({ op: 'blinkSelfEnd' });
  if (/target legendary creature becomes a god in addition to its other types\. put a \+1\/\+1 counter on it/.test(t)) ops.push({ op: 'tyrite' });
  if (/put an indestructible counter on target god/.test(t)) ops.push({ op: 'indestructibleCounter' });
  if (/you get an emblem with "at the beginning of combat on your turn, put three \+1\/\+1 counters on target artifact you control/.test(t)) ops.push({ op: 'tezzEmblem' });
  if (/deals five times x damage to each of up to x targets/.test(t)) ops.push({ op: 'crackle' });
  if (/for each opponent, exile up to one target nonland permanent that player controls until this card leaves the battlefield/.test(t)) ops.push({ op: 'oring' });
  if ((m = t.match(/creatures you control get \+(\d+)\/\+0 until end of turn/))) ops.push({ op: 'powerAll', n: +m[1] });
  if ((m = t.match(/(dragons) you control get \+(\d+)\/\+0 until end of turn/))) ops.push({ op: 'pumpTypes', types: ['dragon'], n: +m[2], tough: 0 });
  if ((m = t.match(/another target creature gains lifelink until end of turn/))) ops.push({ op: 'grantKw', kw: 'lifelink' });
  if (/creatures you control gain indestructible until end of turn/.test(t)) ops.push({ op: 'protectAll', indestructible: true });
  if (/you and permanents you control gain hexproof until end of turn/.test(t)) ops.push({ op: 'protectAll', hexproof: true, player: true, giftIndestructible: true });
  if (/permanents you control gain hexproof and indestructible/.test(t)) ops.push({ op: 'protectAll', hexproof: true, indestructible: true });
  if (/until end of turn, your life total can't change/.test(t)) ops.push({ op: 'lifeLock' });
  if (/target (creature|permanent) gains hexproof and indestructible until end of turn/.test(t)) ops.push({ op: 'protectOne' });
  if (/untap all creatures you control\. if it's your combat phase, there is an additional combat phase after this phase/.test(t)) ops.push({ op: 'untapAll', what: 'creatures' }, { op: 'extraCombat' });
  if (/creatures you control get \+1\/\+0 and gain first strike until end of turn/.test(t)) ops.push({ op: 'powerAll', n: 1, kw: 'first strike' });
  if (/whenever a creature you control deals combat damage to that player this turn, create a tapped treasure token/.test(t)) ops.push({ op: 'heistTreasure' });
  if (/the ring tempts you/.test(t)) ops.push({ op: 'note', text: 'the Ring tempts you' });
  if ((m = t.match(/search your library for (an?|up to one|up to two) ([a-z ,]+?) cards?(?: with mana (?:value|cost) (?:(\d+) or less|\{0\} or \{1\}))?,? (?:reveal (?:it|them),? )?(?:and )?put (?:it|them|that card) (into your hand|onto the battlefield)/)) && !/\bland\b|plains|island|swamp|mountain|forest/.test(m[2])) ops.push({ op: 'tutorTo', filter: m[2].trim(), max: m[3] ? +m[3] : /\{0\} or \{1\}/.test(m[0]) ? 1 : null, dest: /hand/.test(m[4]) ? 'hand' : 'battlefield', n: /two/.test(m[1]) ? 2 : 1 });
  if ((m = t.match(/search your library for (?:up to two )?basic (plains|island|swamp|mountain|forest) cards?, reveal them, put them into your hand/))) ops.push({ op: 'landToHand', basic: true, types: [m[1]], n: 2 });
  if (/^add (\{[wubrgc]\})+/.test(t.trim()) || /(?:^|\. )add (\{[wubrgc]\})+\.?/.test(t)) { const mm = t.match(/add ((?:\{[wubrgc]\})+)/); if (mm) ops.push({ op: 'addMana', colors: mm[1].match(/[wubrgc]/g).map(x => x.toUpperCase()), eot: /until end of turn, you don't lose this mana/.test(t) }); }
  if (/^add one mana of any color\.?$/.test(t.trim())) ops.push({ op: 'addMana', colors: ['A'] });
  if ((m = t.match(/target opponent loses (\d+) life/)) && !ops.some(o => o.op === 'drain')) ops.push({ op: 'drain', n: +m[1], each: false });
  if ((m = t.match(/until end of turn, whenever a player taps an island for mana, that player adds an additional \{u\}/))) ops.push({ op: 'highTide' });
  if ((m = t.match(/look at the top (two|three|four) cards of your library,? then put them back in any order/))) ops.push({ op: 'arrange', n: numOf(m[1]), shuffle: /you may shuffle/.test(t) });
  if (/put your commander into your hand from the command zone/.test(t)) ops.push({ op: 'cmdToHand' });
  if ((m = t.match(/you may cast a spell with mana value (\d+) or less from your hand without paying its mana cost/))) ops.push({ op: 'freeCast', max: +m[1] });
  if ((m = t.match(/return (?:up to one )?target (artifact, creature, enchantment, or planeswalker|artifact, creature, or enchantment|nonland permanent|creature|artifact or creature|permanent)(?: you don't control| an opponent controls)? to its owner's hand/))) ops.push({ op: 'bounceTarget', what: m[1] });
  if ((m = t.match(/return target (permanent|creature|artifact|enchantment|artifact or enchantment) card with mana value (\d+) or less from your graveyard to the battlefield/))) ops.push({ op: 'gyPermToBf', what: m[1], max: +m[2] });
  if ((m = t.match(/create (?:a|an|one) (\d+)\/(\d+) [^.]*?creature token for each land you control/))) ops.push({ op: 'tokens', n: 'lands', pt: [+m[1], +m[2]], kw: [] });
  if ((m = t.match(/put (a|one|two) \+1\/\+1 counters? on each ([a-z]+) creature you control/))) ops.push({ op: 'counters', n: numOf(m[1]), to: 'each creature', filter: m[2] });
  if (/^\s*amass (?:[a-z]+ )?(\d+)/.test(t) || /then amass (?:[a-z]+ )?(\d+)/.test(t)) ops.push({ op: 'amass', n: +((t.match(/amass (?:[a-z]+ )?(\d+)/) || [])[1] || 1) });
  if ((m = t.match(/draw cards equal to the sacrificed creature's power/))) ops.push({ op: 'drawX' });
  if ((m = t.match(/mills? cards equal to the sacrificed creature's power/))) ops.push({ op: 'millX' });
  if ((m = t.match(/then discard (a|two|three) cards?/))) ops.push({ op: 'discard', n: numOf(m[1]) });
  if (/your opponents can't cast spells this turn/.test(t)) ops.push({ op: 'silence' });
  if (/each player exiles all creature cards from their graveyard, then sacrifices all creatures they control, then puts all cards they exiled this way onto the battlefield/.test(t)) ops.push({ op: 'livingDeath' });
  if (/put all creature cards from all graveyards onto the battlefield under your control/.test(t)) ops.push({ op: 'riseDark' });
  if (/look at the top x cards of your library, where x is your devotion to blue/.test(t)) ops.push({ op: 'thoracle' });
  if ((m = t.match(/exile (two|up to two|one or two) target artifacts, creatures, and\/or lands you control, then return (?:those cards|them)/))) ops.push({ op: 'flicker', what: 'artifact or creature', n: 2 });
  if (/return all attacking creatures to their owner's hand/.test(t)) ops.push({ op: 'bounceAttackers' });
  if ((m = t.match(/untap target (forest|land)/))) ops.push({ op: 'untapLands', n: 1 });
  if (/each player discards their hand, then draws (seven|that many|cards equal)/.test(t)) ops.push({ op: 'wheel', n: /seven/.test(t) ? 7 : 0 });
  else if ((m = t.match(/each player draws (a|two|three|\d+) cards?/))) ops.push({ op: 'drawEach', n: numOf(m[1]) });
  if ((m = t.match(/target player draws (a|two|three|\d+) cards?(?: and (?:you )?loses? (\d+) life)?/))) { ops.push({ op: 'draw', n: numOf(m[1]) }); if (m[2]) ops.push({ op: 'lose', n: +m[2] }); }
  if ((m = t.match(/untap up to (one|two|three|four|five|\d+) lands/))) ops.push({ op: 'untapLands', n: numOf(m[1]) });
  else if (/untap all lands you control/.test(t)) ops.push({ op: 'untapLands', n: 99 });
  if (/untap all (nonland permanents|creatures|artifacts) you control/.test(t)) ops.push({ op: 'untapAll', what: t.match(/untap all (nonland permanents|creatures|artifacts) you control/)[1] });
  if (/there is an additional combat phase|additional combat phase after this/.test(t)) ops.push({ op: 'extraCombat' });
  if ((m = t.match(/exile (?:up to one |another )?target (artifact or creature|creature|nonland permanent|permanent) you control,? then return (?:that card|it) to the battlefield/))) ops.push({ op: 'flicker', what: m[1] });
  if ((m = t.match(/exile the top (a|one|two|three|four|five|\d+)? ?cards? of your library\.? (?:until end of turn|until the end of your next turn|this turn)?,? ?you may play (?:it|them|that card|those cards)/))) ops.push({ op: 'impulse', n: m[1] ? numOf(m[1]) : 1, next: /until the end of your next turn|until the end of your next/.test(t) });
  if ((m = t.match(/creatures you control (?:gain [a-z ,]+ and )?get \+(\d+|x)\/\+(\d+|x)(?: and gain ([a-z ,]+))? until end of turn(?:, where x is the number of creatures you control)?/))) ops.push({ op: 'pumpAll', n: m[1] === 'x' ? 'creatures' : +m[1], kws: KW.filter(k => (m[3] || t).includes(k) && /gain/.test(t)) });
  if ((m = t.match(/creatures your opponents control get -(\d+)\/-(\d+) until end of turn/))) ops.push({ op: 'shrinkOpp', n: +m[2] });
  if ((m = t.match(/(destroy|exile) all (artifacts|enchantments|creatures with mana value (\d+) or less|creatures with mana value (\d+) or greater|creatures with power (\d+) or greater|nontoken creatures|creatures|planeswalkers)/)) && !/destroy all creatures\.|exile all creatures\./.test(t)) ops.push({ op: 'destroyAll', how: m[1], what: m[2] });
  if (/you may play an additional land this turn/.test(t)) ops.push({ op: 'extraLandTurn' });
  if (/you gain protection from everything until your next turn/.test(t)) ops.push({ op: 'playerProt' });
  if ((m = t.match(/(each opponent|target opponent|target player|each player|each other player) sacrifices (a|an|one|two|three) (nontoken creature|creature token)/))) ops.push({ op: 'edict', who: m[1], n: numOf(m[2]), what: 'creature', nontoken: m[3] === 'nontoken creature' });
  if ((m = t.match(/put target ([a-z ]*?)card from (?:a|your) graveyard on top of (?:its owner's|your) library/))) ops.push({ op: 'gyToTop', filter: m[1].trim() });
  if ((m = t.match(/return (?:all|up to (?:three|two)(?: target)?) (land|creature|artifact) cards? from your graveyard to (the battlefield|your hand)/))) ops.push({ op: 'massReturn', what: m[1], to: /hand/.test(m[2]) ? 'hand' : 'battlefield', n: /up to three/.test(t) ? 3 : /up to two/.test(t) ? 2 : 99, tapped: /tapped/.test(t) });
  if (/goad all creatures you don't control/.test(t)) ops.push({ op: 'note', text: 'goads every creature it doesn\'t control' });
  if (/prevent all combat damage that would be dealt this turn/.test(t)) ops.push({ op: 'fog' });
  return ops;
}
/** modal spells: "Choose one —" / "Choose two —" / "Choose one or more —", plus the commander upgrade on Will spells */
function tagModes(card, lines) {
  if (card.isLand || card.isCreature) return;
  const head = lines.findIndex(l => /^choose (one|two|three|one or more|one or both)\b/.test(l)); if (head < 0) return;
  const hl = lines[head], bullets = lines.slice(head + 1).filter(l => /^•/.test(l)).map(l => l.replace(/^•\s*/, '').replace(/^[a-z ,'-]+ — (?=[a-z])/, ''));
  if (bullets.length < 2) return;
  const max = /choose two/.test(hl) ? 2 : /three/.test(hl) ? 3 : /one or more|one or both/.test(hl) ? bullets.length : 1;
  card.modeCount = { min: /two/.test(hl) ? 2 : 1, max, cmdMax: /if you control a commander as you cast this spell, you may choose both/.test(hl) ? bullets.length : max };
  card.modes = bullets.map(t0 => { const text = t0.replace(/\bthis card\b/g, card.name.split(' // ')[0]); const sub = tagCard({ name: card.name, type: card.type, oracle: text.charAt(0).toUpperCase() + text.slice(1), mana: card.manaCost, cmc: card.cmc }); sub.img = card.img; sub.isMode = true; return { text, card: sub }; });
}
/** static abilities: anthems / lords, granted keywords, equipment, extra land drops, cost reducers, self evasion */
function tagStatic(card, lines) {
  card.anthems = []; card.equip = null; card.extraLands = 0; card.reducers = [];
  const S = card.statics = {};
  for (const l of lines) {
    let m;
    if (/you have no maximum hand size/.test(l)) S.noMaxHand = true;
    if ((m = l.match(/creatures can't attack you(?: or planeswalkers you control)? unless their controller pays \{(\d+|x)\} for each/))) S.attackTax = m[1] === 'x' ? 'enchantments' : +m[1];
    if (/your opponents can't cast spells during your turn/.test(l)) S.castLock = 'yourTurn';
    if (/during your turn, your opponents can't cast spells or activate abilities/.test(l)) S.castLock = 'yourTurn';
    if (/each opponent can cast spells only any time they could cast a sorcery/.test(l)) S.sorceryLock = true;
    if (/your opponents can't cast spells from anywhere other than their hands/.test(l)) S.handOnly = true;
    if ((m = l.match(/^(artifacts and creatures|creatures) your opponents control enter tapped/))) S.oppEnterTapped = m[1];
    if ((m = l.match(/^creatures your opponents control get -(\d+)\/-(\d+)/))) S.oppShrink = [+m[1], +m[2]];
    if ((m = l.match(/^each land is an? (plains|island|swamp|mountain|forest) in addition/))) S.landGrant = { plains: 'W', island: 'U', swamp: 'B', mountain: 'R', forest: 'G' }[m[1]];
    if (/lands you control are every basic land type/.test(l)) S.allTypes = true;
    if (/^lands you control have "\{t\}: add one mana of any color/.test(l)) S.lanternAll = true;
    if (/^creatures you control have "\{t\}: add one mana of any color/.test(l)) S.creatureMana = true;
    if ((m = l.match(/would create one or more (creature )?tokens under your control, (?:it creates )?(twice|three times) that many/))) S.tokenMult = { mult: m[2] === 'twice' ? 2 : 3, creatureOnly: !!m[1] };
    if ((m = l.match(/one or more (creature )?tokens would be created under your control, (twice|three times) that many/))) S.tokenMult = { mult: m[2] === 'twice' ? 2 : 3, creatureOnly: !!m[1] };
    if (/\+1\/\+1 counters would be put on (?:a creature|an artifact or creature|a permanent) you control, that many plus one/.test(l)) S.counterPlus = 1;
    if (/(?:\+1\/\+1 counters would be put on a creature you control, twice that many|would put one or more counters on a permanent you control, it puts twice that many|put twice that many of each of those kinds)/.test(l)) S.counterMult = 2;
    if ((m = l.match(/(noncombat )?damage to (?:an opponent|a permanent or player)[^,]*, it deals (double|triple) that damage/))) S.dmgMult = { mult: m[2] === 'double' ? 2 : 3, noncombat: !!m[1], oppOnly: /opponent/.test(l) };
    if ((m = l.match(/if a (red )?source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus (\d+)/))) S.dmgPlus = { n: +m[2], red: !!m[1] };
    if (/if an opponent would lose life during your turn, they lose twice that much/.test(l)) S.lossMult = 2;
    if (/if you would gain life, you gain twice that much/.test(l)) S.gainMult = 2;
    if (/if an artifact or creature entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time/.test(l)) S.etbDouble = 'artifact or creature';
    if (/if a permanent entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time/.test(l)) S.etbDouble = 'permanent';
    if (/untap all permanents you control during each other player's untap step/.test(l)) S.seedborn = 'all';
    if (/untap all artifacts you control during each other player's untap step/.test(l)) S.seedborn = 'artifacts';
    if (/^(this artifact|this card) doesn't untap during your untap step/.test(l)) S.noUntap = true;
    if (/^(this artifact|this creature|this card) enters tapped\.?$/.test(l)) S.etbTappedPerm = true;
    if (/you may cast spells as though they had flash/.test(l)) S.flashAll = true;
    if (/you may cast noncreature spells as though they had flash/.test(l)) S.flashNoncreature = true;
    if (/you may play lands from your graveyard/.test(l) && !/^• /.test(l)) S.landsFromGy = true;
    if (/^during each of your turns, you may play a land and cast a permanent spell of each permanent type from your graveyard/.test(l)) S.muldrotha = true;
    if (/^creature tokens you control have "\{t\}: add one mana of any color\."/.test(l)) S.tokenMana = true;
    if ((m = l.match(/^(?:this card|this creature) gets \+(\d+)\/\+(\d+) for each creature card in your graveyard/))) S.selfPump = { p: +m[1], t: +m[2], per: 'gyCreature' };
    if (/^if a creature attacking causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time/.test(l)) S.attackTrigDouble = true;
    if (/if you would draw a card while your library has no cards in it, you win the game instead/.test(l)) S.labMan = true;
    if ((m = l.match(/^(other )?legendary creatures you control get \+(\d+)\/\+(\d+)/))) card.anthems.push({ other: !!m[1], filter: 'legendary', pump: [+m[2], +m[3]], kws: [] });
    if ((m = l.match(/this (?:spell|creature) costs \{(\d+)\} less to cast for each creature (on the battlefield|you control)/))) S.selfReduce = { per: +m[1], what: m[2] === 'on the battlefield' ? 'creaturesAll' : 'creaturesMine' };
    if (/this spell costs \{x\} less to cast, where x is the greatest power among creatures you control/.test(l)) S.selfReduce = { what: 'greatestPower' };
    if (/this spell costs \{x\} less to cast, where x is the total power of creatures you control/.test(l)) S.selfReduce = { what: 'totalPower' };
    if ((m = l.match(/this spell costs \{(\d+)\} less to cast if you control a creature with power 4 or greater/))) S.selfReduce = { what: 'power4', n: +m[1] };
    if (/^delve$/.test(l)) S.delve = true;
    if (/^(this card|this creature) can't block\.?$/.test(l)) S.cantBlock = true;
    if (/^metalcraft — \{t\}: add/.test(l)) card.metalcraft = true;
    if ((m = l.match(/^if a triggered ability of (another )?(?:creature you control of the chosen type|([a-z ]+?) you control) triggers, (?:that ability|it) triggers an additional time/))) S.trigDouble = { another: !!m[1] || /another/.test(m[2] || ''), filter: m[2] ? m[2].replace(/^(a|an) /, '').replace(/ or another /, ' or ') : '__chosen__' };
    if (/^if a triggered ability of a creature you control with power 2 or less triggers, that ability triggers an additional time/.test(l)) S.trigDouble = { power2: true };
    if (/^if a triggered ability of another creature you control of the chosen type triggers/.test(l)) S.trigDouble = { another: true, filter: '__chosen__' };
    if (/^if you casting or copying an instant or sorcery spell causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time/.test(l)) S.castTrigDouble = true;
    if (/^if a land entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time/.test(l)) S.landTrigDouble = true;
    if (/^permanents entering don't cause abilities of permanents your opponents control to trigger/.test(l)) S.noOppEtb = true;
    if (/^(this card|this creature) can't block and can't be blocked/.test(l)) { S.cantBlock = true; if (!card.kw.includes('unblockable')) card.kw.push('unblockable'); }
    if (/attacks each combat if able\.?$/.test(l) && /^this card/.test(l)) S.mustAttack = true;
    if ((m = l.match(/^creatures with power less than this card's power can't block creatures you control/))) S.lambholt = true;
    if ((m = l.match(/^creatures you control with power 2 or less can't be blocked by creatures with power 3 or greater/))) S.delney = true;
    if ((m = l.match(/^creatures you control with \+1\/\+1 counters on them can't be blocked/))) S.counterUnblockable = true;
    if ((m = l.match(/^(?:this card's|adeline's|psychosis crawler's) power (?:and toughness are each|is) equal to the number of (creatures you control|cards in your hand)/))) S.ptEqual = { what: m[1], both: /and toughness/.test(l) };
    if ((m = l.match(/^each creature you control gets \+1\/\+0 for each time it has attacked this turn/))) S.moraug = true;
    if ((m = l.match(/^as long as this card has seven or more quest counters on it, creatures you control get \+5\/\+5/))) S.beastmaster = true;
    if ((m = l.match(/^as long as your devotion to (white|blue|black|red|green) is less than five, this card isn't a creature/))) S.devotionCreature = COLORW[m[1]];
    if ((m = l.match(/^skip your draw step/))) S.skipDraw = true;
    if ((m = l.match(/^whenever you discard a card, exile that card from your graveyard/))) S.discardExile = true;
    if ((m = l.match(/^each opponent can't draw more than one card each turn/))) S.narset = true;
    if ((m = l.match(/^if you would draw a card except the first one you draw in each of your draw steps, draw two cards instead/))) S.teferiInsight = true;
    if ((m = l.match(/^if a card would be put into an opponent's graveyard from anywhere, instead exile it with a void counter on it/))) S.dauthi = true;
    if ((m = l.match(/^you control your opponents while they're searching their libraries|^while an opponent is searching their library, they exile each card they find/))) S.oppAgent = true;
    if ((m = l.match(/^spells your opponents cast that target this card cost an additional (\d+) life to cast/))) S.targetLife = +m[1];
    if ((m = l.match(/^ward—pay (\d+) life/))) S.wardLife = +m[1];
    if ((m = l.match(/^other creatures you control have "ward—pay (\d+) life\."/))) S.wardLifeOthers = +m[1];
    if ((m = l.match(/^whenever an opponent casts a spell, if no mana was spent to cast it, counter that spell/))) S.boromir = true;
    if ((m = l.match(/^you may activate abilities of creatures you control as though those creatures had haste/))) S.abilityHaste = true;
    if ((m = l.match(/^activated abilities of creatures you control cost \{(\d+)\} less to activate/))) S.creatureAbilityReduce = +m[1];
    if ((m = l.match(/^creatures you control are every creature type/))) S.maskwood = true;
    if ((m = l.match(/^this (?:creature|card) has first strike during your turn/))) S.fsYourTurn = true;
    if ((m = l.match(/^your life total can't change/))) S.lifeLock = true;
    if ((m = l.match(/^the "legend rule" doesn't apply to permanents you control/))) S.noLegendRule = true;
    if ((m = l.match(/^you may play lands and cast spells from the top of your library\. if you cast a spell this way, pay life equal to its mana value rather than pay its mana cost/))) S.topCast = 'citadel';
    if ((m = l.match(/^you may cast artifact spells and colorless spells from the top of your library/))) S.topCast = 'forge';
    if ((m = l.match(/^you may cast creature spells of the chosen type from the top of your library/))) S.topCast = 'chosenType';
    if ((m = l.match(/^as long as this card is attached to a creature, you may play lands and cast spells from the top of your library/))) S.topCast = 'chip';
    if ((m = l.match(/^you may play lands from the top of your library/))) S.topLands = true;
    if ((m = l.match(/^(?:play with the top card of your library revealed|you may look at the top card of your library any time)/))) S.lookTop = true;
    if ((m = l.match(/^during your turn, nonland permanent cards in your graveyard have retrace/))) S.sixRetrace = true;
    if ((m = l.match(/^each nonland card in your graveyard has escape/))) S.breach = true;
    if ((m = l.match(/^you may cast aura and equipment spells as though they had flash/))) S.flashAuraEquip = true;
    if ((m = l.match(/^lands you control enter untapped/))) S.landsUntapped = true;
    if ((m = l.match(/^metalcraft — equipment you control have equip \{0\} as long as you control three or more artifacts/))) S.equipZero = true;
    if ((m = l.match(/^colorless creatures you control get \+(\d+)\/\+(\d+)/))) card.anthems.push({ other: false, filter: 'colorless', pump: [+m[1], +m[2]], kws: [] });
    if ((m = l.match(/^creature tokens you control get \+(\d+)\/\+(\d+)/))) card.anthems.push({ other: false, filter: 'token', pump: [+m[1], +m[2]], kws: [] });
    if ((m = l.match(/^other artifact creatures you control have ([a-z ,]+)/))) card.anthems.push({ other: true, filter: 'artifact', pump: [0, 0], kws: KW.filter(k => m[1].includes(k)) });
    if ((m = l.match(/^permanents you control with counters on them have ward \{(\d+)\}/))) S.wardCounters = +m[1];
    if ((m = l.match(/^(each spell you cast that's|spells you cast that are) ([a-z]+) or ([a-z]+) costs? \{(\d+)\} less to cast/))) card.reducers.push({ n: +m[4], filter: m[2] + ' or ' + m[3] });
    if ((m = l.match(/^creature spells you cast with power (\d+) or greater cost \{(\d+)\} less to cast/))) card.reducers.push({ n: +m[2], filter: 'creature', minPower: +m[1] });
    if (/^equipped creature can't be blocked and has shroud/.test(l)) card.equip = { pump: [0, 0], kws: ['unblockable', 'shroud'] };
    if ((m = l.match(/^equipped creature has ward \{(\d+)\}, is an? [a-z]+ in addition to its other types, and can't be blocked/))) card.equip = { pump: [0, 0], kws: ['unblockable'], ward: +m[1] };
    if ((m = l.match(/^equipped creature gets \+(\d+)\/\+(\d+) and loses flying/))) card.equip = { pump: [+m[1], +m[2]], kws: [], loses: ['flying'] };
    if ((m = l.match(/^equipped creature gets \+(\d+)\/\+(\d+) and has trample and "whenever (?:this creature|this card) deals combat damage to a player or planeswalker, create that many treasure tokens\."/))) card.equip = { pump: [+m[1], +m[2]], kws: ['trample'], cleaver: true };
    if ((m = l.match(/^as long as equipped creature is legendary, it has hexproof/))) card.equip = { ...(card.equip || { pump: [0, 0], kws: [] }), legendHexproof: true };
    if ((m = l.match(/^(?:this card|this creature) has haste as long as an opponent has 10 or less life/))) S.condHaste = true;
    if ((m = l.match(/^as long as you have 30 or more life, (?:this card|this creature) gets \+5\/\+5 and has flying/))) S.ascendant = true;
    if ((m = l.match(/^(?:flying, |vigilance, |first strike, )*protection from (white|blue|black|red|green)/))) S.protFrom = COLORW[m[1]];
    if ((m = l.match(/^you may cast this spell as though it had flash/))) { card.flash = true; card.flashSacIfInstant = true; }
    if ((m = l.match(/^whenever an artifact or creature an opponent controls enters untapped, they may tap that permanent/))) S.conqueror = true;
    if ((m = l.match(/^equipped creature gets \+(\d+)\/\+(\d+) for each land you control/))) card.equip = { pump: [+m[1], +m[2]], kws: [], perLand: true };
    if ((m = l.match(/^equipped creature gets \+(\d+)\/\+(\d+) and has protection from each color that's not in your commander's color identity/))) card.equip = { pump: [+m[1], +m[2]], kws: [], protNonIdentity: true };
    if ((m = l.match(/^equipped creature gets \+(\d+)\/\+(\d+) and has indestructible/))) card.equip = { pump: [+m[1], +m[2]], kws: ['indestructible'] };
    if ((m = l.match(/^enchanted creature gets \+(\d+)\/\+(\d+) and has "whenever this creature attacks, untap all lands you control\."/))) { S.auraBuff = { pump: [+m[1], +m[2]], kws: [] }; card.triggers = card.triggers || []; card.triggers.push({ when: 'attack', zone: 'battlefield', who: 'enchanted creature', ops: [{ op: 'untapLands', n: 99 }] }); }
    if ((m = l.match(/^enchanted creature gets -1\/-0/))) S.auraBuff = { pump: [-1, 0], kws: [] };
    if ((m = l.match(/^umbra armor|^totem armor/))) S.umbra = true;
    if ((m = l.match(/^enchant (creature card in a graveyard|creature or planeswalker you control|artifact you control|player)/))) S.enchant = m[1];
    if ((m = l.match(/^cumulative upkeep \{(\d+)\}/))) S.cumulative = +m[1];
    if ((m = l.match(/^(?:this card|this creature) gets \+(\d+)\/\+(\d+) for each (artifact|creature|land|enchantment|other creature) you control/))) S.selfPump = { p: +m[1], t: +m[2], per: m[3] };
    if ((m = l.match(/^nontoken creatures you control have riot/))) card.anthems.push({ other: false, filter: 'nontoken', pump: [0, 0], kws: ['haste'] });
    if (/^if you would create a clue, food, or treasure token, instead create one of each/.test(l)) S.manufactor = true;
    if ((m = l.match(/^ward \{(\d+)\}/))) S.ward = +m[1];
    if (/^affinity for artifacts$/.test(l)) S.selfReduce = { what: 'artifactsMine', per: 1 };
    if (/^convoke$/.test(l)) S.convoke = true;
    if (/^storm$/.test(l)) S.storm = true;
    if (/^prowess$/.test(l)) S.prowess = true;
    if (/^exalted$/.test(l)) S.exalted = true;
    if (/^extort$/.test(l)) S.extort = true;
    if (/^changeling$/.test(l)) { card.changeling = true; S.changeling = true; }
    if ((m = l.match(/^(?:this card|this creature) gets \+(\d+)\/\+(\d+) for each color among permanents you control/))) S.selfPump = { p: +m[1], t: +m[2], per: 'color' };
    if ((m = l.match(/^(swamp|island|forest|mountain|plains)walk$/))) S.landwalk = m[1];
    if ((m = l.match(/^protection from ([a-z]+)s$/))) S.protType = m[1];
    if (/^split second$/.test(l)) card.splitSecond = true;
    if (/^rebound$/.test(l)) card.rebound = true;
    if (/^improvise$/.test(l)) S.improvise = true;
    if (/^ascend$/.test(l)) S.ascend = true;
    if ((m = l.match(/^dredge (\d+)/))) card.dredge = +m[1];
    if ((m = l.match(/^echo ((?:\{[^}]+\})+)/))) card.echo = manaInfo(m[1].toUpperCase());
    if ((m = l.match(/^fabricate (\d+)/))) card.fabricate = +m[1];
    if ((m = l.match(/^treasures you control have "\{t\}, sacrifice this (?:artifact|card): add two mana of any one color\."/))) S.goldspan = true;
    if ((m = l.match(/^if you would create one or more treasure tokens, instead create those tokens plus an additional treasure token/))) S.treasurePlus = true;
    if (/^you may look at the top card of your library any time/.test(l)) S.lookTop = true;
    if ((m = l.match(/^whenever you tap an? (swamp|forest|island|mountain|plains) for mana, add an additional \{(\w)\}/))) S.landBonus = { type: m[1], color: m[2].toUpperCase() };
    if (/^whenever (?:a player|you) taps? a land for mana, (?:(?:that player|you) adds?|add) (?:an additional )?one mana of any type that land produced/.test(l)) S.landBonus = { type: 'land', color: null, all: /a player/.test(l) };
    if ((m = l.match(/^as an additional cost to cast this spell, (sacrifice (?:a|an) (creature|artifact or creature|artifact|land)|discard (a|two) cards?|pay (x|\d+) life|sacrifice an artifact or discard a card|discard a card or pay 3 life)/))) S.addCost = m[2] ? { sac: m[2] } : m[3] ? { discard: m[3] === 'two' ? 2 : 1 } : m[4] ? { life: m[4] === 'x' ? 'x' : +m[4] } : /discard a card or pay 3 life/.test(l) ? { life: 3 } : { sac: 'artifact' };
    if ((m = l.match(/^you may have (?:this creature|this artifact|this enchantment|this card) enter as a copy of (?:any |a |another )?([a-z ]+?) (?:on the battlefield|you control)/))) S.clone = { what: m[1], mine: /you control/.test(l) };
    if ((m = l.match(/^enchant (creature|creature or planeswalker|creature, land, or planeswalker|land|player|artifact)\.?$/))) S.enchant = m[1];
    if ((m = l.match(/^enchanted creature gets \+(\d+)\/\+(\d+)(?: and has ([a-z ,]+))?/))) S.auraBuff = { pump: [+m[1], +m[2]], kws: m[3] ? KW.filter(k => m[3].includes(k)) : [] };
    if ((m = l.match(/^enchanted creature (?:can't be blocked|has ([a-z ,]+))\.?$/))) S.auraBuff = { pump: [0, 0], kws: m[1] ? KW.filter(k => m[1].includes(k)) : ['unblockable'] };
    if (/^enchanted creature (?:is an?|becomes an?) [a-z ]*?(?:creature|land)[a-z ]*? with base power and toughness \d+\/\d+/.test(l) || /loses all other abilities/.test(l) || /^enchanted creature loses all abilities and is a/.test(l) || /^enchanted creature is a colorless land/.test(l) || /^enchanted (permanent|creature) is a colorless land/.test(l) || /^enchanted creature loses all abilities/.test(l)) S.auraNeutralize = /land/.test(l) ? 'land' : (l.match(/base power and toughness (\d+)\/(\d+)/) || l.match(/(\d+)\/(\d+)/)) ? (l.match(/(\d+)\/(\d+)/) || []).slice(1).map(Number) : [0, 1];
    if (/^when this (?:land|card) enters, return a land you control to its owner's hand/.test(l)) S.bounceLand = true;
    if ((m = l.match(/^when this (?:land|card) enters, sacrifice (two|a) lands?/))) S.sacLands = m[1] === 'two' ? 2 : 1;
    if (/^whenever this (?:land|card) becomes tapped, it deals 1 damage to you/.test(l)) S.manaLife = 1;
    if (/^enchanted creature can't attack or block/.test(l) && !S.auraNeutralize) S.auraNeutralize = 'pacify';
    if ((m = l.match(/^\{t\}: add [^.]+\. this card deals (\d+) damage to you/))) { S.manaLife = +m[1]; S.manaLifeColor = lines.some(x => /^\{t\}: add \{c\}\.?$/.test(x)); }
    const subj = s => s.replace(/\bcreature tokens\b/, 'token').replace(/\bcreatures?\b/g, '').replace(/\s+/g, ' ').trim();
    if ((m = l.match(/^(other )?([a-z ,-]+?) you control get \+(\d+)\/\+(\d+)(?: and have ([a-z ,]+?))?\.?$/))) card.anthems.push({ other: !!m[1], filter: subj(m[2]), pump: [+m[3], +m[4]], kws: m[5] ? KW.filter(k => m[5].includes(k)) : [] });
    else if ((m = l.match(/^(other )?([a-z ,-]+?) you control have ([a-z ,]+?)\.?$/))) { const kws = KW.filter(k => m[3].includes(k)); if (kws.length) card.anthems.push({ other: !!m[1], filter: subj(m[2]), pump: [0, 0], kws }); }
    if ((m = l.match(/^equipped creature gets \+(\d+)\/([+-]\d+)(?: and has ([a-z ,]+?))?\.?$/))) card.equip = { pump: [+m[1], +m[2]], kws: m[3] ? KW.filter(k => m[3].includes(k)) : [] };
    else if ((m = l.match(/^equipped creature has ([a-z ,]+?)\.?$/))) card.equip = { pump: [0, 0], kws: KW.filter(k => m[1].includes(k)) };
    if ((m = l.match(/you may play (an|two) additional lands? on each of your turns/))) card.extraLands = m[1] === 'two' ? 2 : 1;
    if ((m = l.match(/^([a-z ,]*?)spells you cast cost \{(\d+)\} less to cast/))) card.reducers.push({ n: +m[2], filter: m[1].replace(/\bthat are\b.*$/, '').trim() });
    if (/^this card can't be blocked\.?$/.test(l) && !card.kw.includes('unblockable')) card.kw.push('unblockable');
    if ((m = l.match(/^([a-z ,]*?)spells you control can't be countered/))) (card.noCounter = card.noCounter || []).push(m[1].trim());
  }
}
function tagFlags(card, c, o, isLand) {
  { const m = o.match(/^exile this card from your hand: add \{([wubrgc])\}/m); if (m) card.handMana = [m[1].toUpperCase()]; }
  { const m = o.match(/^sacrifice a creature: add (\{c\}\{c\}|one mana of any color)/m); if (m) { card.altar = m[1] === '{c}{c}' ? { amount: 2, colors: ['C'] } : { amount: 1, colors: ALLC.slice() }; card.manaAb = null; } }
  if (/^tap an untapped legendary creature you control: add one mana of any color/m.test(o)) card.legendTap = true;
  if (/^tap an untapped artifact you control: add \{u\}/m.test(o)) card.artifactU = true;
  if (/^untap this artifact during each other player's untap step/m.test(o)) card.untapOthers = true;
  if (/whenever you tap this land for mana, target opponent creates a 1\/1/.test(o)) card.orchard = true;
  if (/when you play another land, sacrifice this land/.test(o)) card.cityOfTraitors = true;
  if (/whenever you tap a permanent for \{c\}, add an additional \{c\}/.test(o)) card.cBonus = true;
  if (/whenever you tap a creature for mana, add an additional \{g\}/.test(o)) card.creatureBonus = true;
  if (/whenever a land's ability causes you to add one or more mana of the chosen color, add an additional one mana of that color/.test(o)) card.chosenLandBonus = true;
  if (/^as .* enters, choose a colou?r\.?$/m.test(o)) card.choosesColor = true;
  { const m = o.match(/^creatures you control of the chosen color get \+(\d+)\/\+(\d+)/m); if (m) card.colorAnthem = [+m[1], +m[2]]; }
  if (isLand) {
    card.landDyn = /add an amount of mana of that color equal to your devotion/.test(o) ? 'devotion' : /add an amount of mana of that color equal to the number of creatures you control of the chosen type/.test(o) ? 'chosenTypeCount'
      : /^\{t\}: add \{g\} for each creature you control/m.test(o) ? 'creatures' : /^12\+ \| \{g\}, \{t\}: add \{g\} for each creature you control/m.test(o) ? 'station' : /add six \{g\}\. spend this mana only to cast creature spells/.test(o) ? 'castle'
      : /if .* has a luck counter on it, instead add one mana of any color/.test(o) ? 'luck' : null;
    if (/^\{1\}, \{t\}: add one mana of any color\.?$/m.test(o)) card.produces = ALLC.slice();
  }
}
/** optional and alternative ways to cast a spell */
function tagCastOptions(card, c, o) {
  let m; const alts = [];
  if ((m = o.match(/^kicker ((?:\{[^}]+\})+)/m))) card.kicker = { cost: manaInfo(m[1].toUpperCase()) };
  if ((m = o.match(/^multikicker ((?:\{[^}]+\})+)/m))) card.kicker = { cost: manaInfo(m[1].toUpperCase()), multi: true };
  if ((m = o.match(/^offspring ((?:\{[^}]+\})+)/m))) card.kicker = { cost: manaInfo(m[1].toUpperCase()), offspring: true };
  if (/^gift an? /m.test(o)) card.gift = (o.match(/^gift (a card|a tapped fish|an? [a-z ]+)/m) || [])[1] || 'a card';
  if (/^bargain/m.test(o)) card.bargain = true;
  if ((m = o.match(/^evoke ((?:\{[^}]+\})+)/m))) alts.push({ kind: 'evoke', cost: manaInfo(m[1].toUpperCase()) });
  if ((m = o.match(/^dash ((?:\{[^}]+\})+)/m))) alts.push({ kind: 'dash', cost: manaInfo(m[1].toUpperCase()) });
  if ((m = o.match(/^bestow ((?:\{[^}]+\})+)/m))) alts.push({ kind: 'bestow', cost: manaInfo(m[1].toUpperCase()) });
  if (/if you control a swamp, you may pay 4 life rather than pay this spell's mana cost/.test(o)) alts.push({ kind: 'life', life: 4, cond: 'swamp', cost: manaInfo('') });
  if (/you may pay \{b\} rather than pay this spell's mana cost if there are thirteen or more creatures on the battlefield/.test(o)) alts.push({ kind: 'cheap', cond: 'creatures13', cost: manaInfo('{B}') });
  if (/if an opponent cast three or more spells this turn, you may pay \{0\} rather than pay this spell's mana cost/.test(o)) alts.push({ kind: 'cheap', cond: 'opp3spells', cost: manaInfo('') });
  if ((m = o.match(/you may sacrifice a nontoken (white|red|green|blue|black) creature rather than pay this spell's mana cost/))) alts.push({ kind: 'sacCreature', color: COLORW[m[1]], cost: manaInfo('') });
  if ((m = o.match(/if it's not your turn, you may exile an? (green|red|white|black) card from your hand rather than pay this spell's mana cost/))) alts.push({ kind: 'pitch', color: COLORW[m[1]], notTurn: true, cost: manaInfo('') });
  if (alts.length) card.alts = alts;
  // modes that carry their own cost
  const L = (c.oracle || '').split('\n//\n')[0].split('\n');
  const spree = L.filter(l => /^\+ (\{[^}]+\})+ — /.test(l));
  if (/^spree/m.test(o) && spree.length) card.costModes = { min: 1, max: spree.length, list: spree.map(l => { const mm = l.match(/^\+ ((?:\{[^}]+\})+) — (.+)$/); return { cost: manaInfo(mm[1]), text: mm[2] }; }) };
  const tier = L.filter(l => /^• [^—]+ — (\{[^}]*\})+ — /.test(l));
  if (/^tiered/m.test(o) && tier.length) card.costModes = { min: 1, max: 1, list: tier.map(l => { const mm = l.match(/^• [^—]+ — ((?:\{[^}]*\})+) — (.+)$/); return { cost: manaInfo(mm[1]), text: mm[2] }; }) };
  if ((m = o.match(/^escalate ((?:\{[^}]+\})+)/m)) && card.modes) card.escalate = manaInfo(m[1].toUpperCase());
  // split cards with fuse: each half is a mode with its own cost
  if (/ \/\/ /.test(c.mana || '') && /\n\/\/\n/.test(c.oracle || '') && /fuse/i.test(c.oracle || '')) {
    const costs = c.mana.split(' // '), texts = c.oracle.split('\n//\n').map(x => x.split('\n').filter(l => !/^fuse/i.test(l)).join('\n'));
    card.mana = manaInfo(''); card.costModes = { min: 1, max: 2, split: true, list: costs.map((k, i) => ({ cost: manaInfo(k), text: texts[i] })) };
  }
  if (card.costModes) {
    card.modes = card.costModes.list.map(x => { const sub = tagCard({ name: card.name, type: card.type, oracle: x.text.charAt(0).toUpperCase() + x.text.slice(1), mana: '', cmc: card.cmc }); sub.isMode = true; sub.img = card.img; return { text: x.text, card: sub, cost: x.cost }; });
    card.modeCount = { min: card.costModes.min, max: card.costModes.max, cmdMax: card.costModes.max };
  }
}
handles(/^kicker \{/, /^multikicker \{/, /^offspring \{/, /^gift an? /, /^bargain/, /^evoke \{/, /^dash \{/, /^bestow \{/, /^spree/, /^tiered/, /^escalate \{/, /^fuse/, /^\+ \{/,
  /rather than pay this spell's mana cost/, /^this (artifact|creature) enters with (a|x|three|\w+) (\+1\/\+1|charge|wish|hour) counters? on it/, /^this artifact enters with a charge counter on it for each time it was kicked/,
  /if this spell was kicked|if the gift was promised|if this spell was bargained/);

handles(/^if this card is in your opening hand/, /^imprint — when this artifact enters/, /^if this artifact would enter, you may discard a land card instead/, /^as .* enters, choose a creature type/, /^this creature is the chosen type in addition/, /^as this artifact enters, choose artifact, creature, enchantment, instant, or sorcery/,
  /^spells you cast of the chosen type cost/, /^hideaway \d/, /^creatures you control can boast twice/, /^if an opponent would begin an extra turn, that player skips that turn instead/, /^the "legend rule" doesn't apply/,
  /^each other creature you control of the chosen type enters with an additional/, /^creatures you control of the chosen type get \+1\/\+1 for each fellowship counter/, /^enchant /, /^when this aura enters, if it's on the battlefield/, /^morph \{/, /^splice onto arcane/, /^ascend$/,
  /^rebound$/, /^improvise$/, /^echo \{/, /^dredge \d/, /^fabricate \d/, /^split second$/, /^station$/, /^reconfigure \{/, /^transmute \{/, /^harmonize \{/, /^flashback—sacrifice/, /^changeling$/, /^(swamp|island|forest|mountain|plains)walk$/, /^protection from /,
  /^when .* enters, the ring tempts you/, /^you may have this land enter tapped as a copy/, /^when this land enters untapped, you may put target/, /^this land enters tapped unless you control a basic land/,
  /^whenever (?:one or more creatures you control|a creature you control) deals? combat damage to (?:a player|an opponent)/, /^when .* enters, each player exiles cards from the top of their library until/);
handles(/^\{t\}: add one mana of any color\. spend this mana only to cast a legendary spell/, /^\{t\}: add one mana of any color among legendary permanents you control/, /^creature spells (you cast )?of the chosen type cost \{\d\} less/, /^creatures you control of the chosen type get \+1\/\+1\.?$/, /^whenever a creature you control of the chosen type enters or attacks/, /^whenever you cast a creature spell of the chosen type/, /^at the beginning of your upkeep, look at the top card of your library\. if it's a creature card of the chosen type/,
  /^(flying, |vigilance, |first strike, )*protection from (white|blue|black|red|green)$/, /^you may cast this spell as though it had flash/, /^when this enchantment enters, if it's on the battlefield, it becomes an aura/);
handles(/^as this artifact enters, you may have it become a copy of any creature on the battlefield until end of turn, except it has haste/, /^addendum — if you cast this spell during your main phase, put a \+1\/\+1 counter on each of those creatures and they gain vigilance/);
handles(/^(i|ii|iii|iv|v|vi)(, (i|ii|iii|iv|v|vi))* — /, /, choose (one or more|one that hasn't been chosen this turn|up to one|one) —$/, /^• /, /^\{[^}]+\}(\{[^}]+\})*: level \d/, /^when this class becomes level \d/,
  /^whenever a creature you control leaves the battlefield, if it had counters on it, put those counters on/, /^tap target creature\.?$/, /^metalcraft — if you control three or more artifacts, exile that creature/,
  /^whenever one or more land cards are put into your graveyard from anywhere/, /^whenever a card is put into an opponent's graveyard from anywhere, if this/, /^whenever this creature is dealt damage, it deals that much damage/,
  /^when this aura is put into a graveyard from the battlefield, return it to its owner's hand/, /would be put into a graveyard from anywhere, reveal .* and shuffle it into/, /^when .* is put into a graveyard from anywhere, its owner shuffles their graveyard into their library/,
  /^if a nontoken creature an opponent controls would die, instead exile it and you gain 2 life/, /^you may cast spells from your hand without paying their mana costs/, /^when you cast this spell, /, /has all activated abilities of creatures you control that don't have the same name/,
  /^as an additional cost to cast this spell, you may sacrifice one or more creatures\. when you do, copy this spell/, /^when the twelfth hour counter is put on this/, /^morbid — that creature gets -13\/-13/, /^at the beginning of your next upkeep, pay /,
  /^if this (creature|card) hasn't been exerted this turn, you may exert it as it attacks/, /^this (creature|card) has first strike during your turn/, /^when this creature enters, you may destroy another target creature\. if a creature is destroyed this way, you gain life equal to its toughness/);
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
    if ((c.changeling || c.maskwood) && /creature/.test(ty) && !/^(artifact|enchantment|land|planeswalker|instant|sorcery|legendary|basic|battle|kindred|tribal)$/.test(sing)) return true;
    return ty.includes(w) || ty.includes(sing);
  }));
}
function costParts(s) { let m;
  // "{1}{b}{g}, exile this card" -> {mana, tap, sacSelf, exileSelf, discardSelf, life, exileOthers, discard, ok}
  const parts = s.split(/,\s*/); const out = { manaStr: '', tap: false, sacSelf: false, exileSelf: false, discardSelf: false, life: 0, exileOthers: 0, discard: 0, ok: true };
  for (const part of parts) {
    const q = part.trim();
    if (/^(\{[^}]+\})+$/.test(q)) { const syms = q.match(/\{[^}]+\}/g); for (const y of syms) { if (y === '{t}') out.tap = true; else if (y === '{q}') out.ok = false; else out.manaStr += y; } }
    else if (/^sacrifice this (card|creature|artifact|enchantment|land|permanent)$/.test(q)) out.sacSelf = true;
    else if (/^exile this (card|creature|artifact|enchantment)( from your graveyard)?$/.test(q)) out.exileSelf = true;
    else if (/^discard this card$/.test(q)) out.discardSelf = true;
    else if (/^pay (\d+) life$/.test(q)) out.life = +q.match(/\d+/)[0];
    else if (/^pay life equal to the number of colors in your commanders?'? color identity$/.test(q)) out.life = 2;
    else if (/^exile (one|two|three|four|five|six|\d+) other cards? from your graveyard$/.test(q)) out.exileOthers = numOf(q.split(' ')[1]);
    else if (/^discard a card$/.test(q)) out.discard = 1;
    else if (/^sacrifice (a|another) creature$/.test(q)) out.sacOther = q.includes('another') ? 'another' : 'creature';
    else if ((m = q.match(/^sacrifice two other artifacts and\/or creatures$/))) out.sacCost = { n: 2, what: 'artifact or creature', another: true };
    else if ((m = q.match(/^sacrifice (a|another|two|three|ten|x) ([a-z ]+?)s?$/))) out.sacCost = { n: m[1] === 'x' ? 'x' : numOf(m[1] === 'another' ? 'a' : m[1]), what: m[2].replace(/ permanent$/, ''), another: m[1] === 'another' };
    else if (/^remove a \+1\/\+1 counter from this card$/.test(q)) out.removeCounter = 1;
    else if ((m = q.match(/^remove an? ([a-z]+) counter from this card$/))) out.removeKind = m[1];
    else if ((m = q.match(/^exile (three|two|a) cards? from your graveyard$/))) out.exileOthers = numOf(m[1]);
    else if (/^exile a creature you control$/.test(q)) out.exileCreature = true;
    else if ((m = q.match(/^discard (two|three) cards$/))) out.discard = numOf(m[1]);
    else if (/^tap an untapped creature you control$/.test(q)) out.tapCreature = true;
    else out.ok = false; // a cost we don't model (sacrifice a creature, remove counters, tap untapped creatures...)
  }
  out.cost = manaInfo(out.manaStr.toUpperCase());
  return out;
}
/** activated abilities on the battlefield / in the graveyard / in hand, triggers, and casting from the graveyard */
function tagAbilities(card) {
  const name = card.name.toLowerCase().split(' // ')[0], short = name.split(',')[0];
  const first = card.isLegendary && !/,/.test(name) && /^[a-z]{4,}/.test(name) && !/^the /.test(name) ? name.split(' ')[0] : null;
  const front = (card.parseOracle != null ? card.parseOracle : card.oracle).split('\n//\n')[0];
  let txt0 = front.toLowerCase().split(name).join('this card').split(short).join('this card'); if (first) txt0 = txt0.replace(new RegExp('\\b' + first + '\\b(?!,)', 'g'), 'this card');
  const txt = txt0.replace(/this (creature|artifact|enchantment|land|permanent|aura|saga|class|equipment|planet|vehicle|spacecraft|god)(?! token)/g, 'this card');
  const lines = txt.split('\n').map(l => l.replace(/\([^)]*\)/g, '').trim()).filter(Boolean);
  card.abilities = []; card.triggers = []; card.etbOps = null; card.gyCast = null;
  const instantSpeed = l => !/activate only as a sorcery/.test(l);
  const skipLines = new Set();
  for (let li = 0; li < lines.length; li++) {
    if (skipLines.has(li)) continue;
    let raw = lines[li];
    { const mm = raw.match(/^(.*?), choose (one or more|one that hasn't been chosen this turn|up to one|one) —$/);
      if (mm && /^•/.test(lines[li + 1] || '') && !/^choose/.test(raw)) {
        const modes = []; for (let k = li + 1; k < lines.length && /^•/.test(lines[k]); k++) { skipLines.add(k); const text = lines[k].replace(/^•\s*/, '').replace(/^[a-z ,'-]+ — (?=[a-z])/, ''); modes.push({ text, ops: parseOps(text) }); }
        PENDING_MODAL = { op: 'modal', pick: mm[2] === 'one or more' ? 'any' : mm[2] === 'up to one' ? 'upToOne' : mm[2] === 'one' ? 'one' : 'unchosen', modes };
        raw = mm[1] + ', __modal__';
      } }
    if (/^(i|ii|iii|iv|v|vi)(, (i|ii|iii|iv|v|vi))* — /.test(raw)) continue; // saga chapters are handled by tagSaga
    const l = raw.replace(/^[a-z' ]+ — (?=[{a-z])/, s => /^(landfall|addendum|renew|adamant|grand summon|max speed|flashback|escape|unearth|cycling|embalm|eternalize|scavenge|metalcraft|imprint)/.test(s) ? s : ''); // drop ability words like "Raid — "
    let m;
    // ---- casting from the graveyard
    if ((m = l.match(/^flashback (\{[^ —]+\})$/))) { card.gyCast = { kind: 'flashback', cost: manaInfo(m[1].toUpperCase()), exileAfter: true }; continue; }
    if ((m = l.match(/^flashback—sacrifice (two|three) creatures/))) { card.gyCast = { kind: 'flashback', cost: manaInfo(''), sacCreatures: numOf(m[1]), exileAfter: true }; continue; }
    if ((m = l.match(/^harmonize ((?:\{[^}]+\})+)/))) { card.gyCast = { kind: 'harmonize', cost: manaInfo(m[1].toUpperCase().replace('{X}', '')), exileAfter: true, tapReduce: true }; continue; }
    if ((m = l.match(/^transmute ((?:\{[^}]+\})+)/))) { card.abilities.push({ zone: 'hand', label: 'transmute', cost: manaInfo(m[1].toUpperCase()), discardSelf: true, speed: 'sorcery', ops: [{ op: 'tutorTo', filter: 'card', mvEq: card.cmc, dest: 'hand', n: 1 }] }); continue; }
    if ((m = l.match(/^station$/))) { card.abilities.push({ zone: 'battlefield', label: 'station', cost: manaInfo(''), speed: 'sorcery', tapCreature: true, ops: [{ op: 'station' }] }); continue; }
    if ((m = l.match(/^reconfigure ((?:\{[^}]+\})+)/))) { card.abilities.push({ zone: 'battlefield', label: 'reconfigure', cost: manaInfo(m[1].toUpperCase()), speed: 'sorcery', ops: [{ op: 'attach' }] }); continue; }
    if ((m = l.match(/^equip (legendary creature|commander) ((?:\{[^}]+\})+)$/))) { card.abilities.push({ zone: 'battlefield', label: 'equip', equipFilter: m[1] === 'commander' ? 'commander' : 'legendary', cost: manaInfo(m[2].toUpperCase()), speed: 'sorcery', ops: [{ op: 'attach', filter: m[1] }] }); continue; }
    if ((m = l.match(/^morph ((?:\{[^}]+\})+)/))) continue;
    if ((m = l.match(/^splice onto arcane/))) continue;
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
    // ---- card-specific trigger shapes (checked before the generic ones)
    if (/^cascade$/.test(l)) { card.cascadeN = (card.cascadeN || 0) + 1; continue; }
    if (/^colorless spells you cast from your hand with mana value 7 or greater have "cascade, cascade\."/.test(l)) { (card.__lateS = card.__lateS || {}).zhulodok = true; continue; }
    if (/^the first spell you cast from exile each turn has cascade/.test(l)) { (card.__lateS = card.__lateS || {}).exileCascade = true; continue; }
    if (/^\{1\}, \{t\}: copy target activated or triggered ability you control from a colorless source/.test(l)) { card.abilities.push({ zone: 'battlefield', label: 'copy ability', cost: manaInfo('{1}'), tap: true, speed: 'instant', ops: [{ op: 'copyLastAbility' }] }); continue; }
    if (/^whenever this card attacks, defending player exiles two permanents they control/.test(l)) { card.triggers.push({ when: 'attack', zone: 'battlefield', who: 'this card', ops: [{ op: 'defExile', n: 2 }] }); continue; }
    if (/^(?:this land|this card) enters with a charge counter on it/.test(l)) { card.etbCharge = 1; continue; }
    if (/^\{x\}\{x\}, \{t\}: put x charge counters on this card/.test(l)) { card.abilities.push({ zone: 'battlefield', label: 'charge', cost: manaInfo(''), tap: true, xx: true, speed: 'instant', ops: [{ op: 'chargeX' }] }); continue; }
    if (/^\{3\}, \{t\}, sacrifice this card: destroy each nonland permanent with mana value equal to the number of charge counters on this card/.test(l)) { card.abilities.push({ zone: 'battlefield', label: 'blast', cost: manaInfo('{3}'), tap: true, sacSelf: true, speed: 'instant', ops: [{ op: 'blastZone' }] }); continue; }
    if (/^as an additional cost to cast this spell, reveal a colorless creature card from your hand/.test(l)) { card.revealColorless = true; continue; }
    if (/^exile each creature and planeswalker with mana value less than the revealed card's mana value/.test(l)) { card.spellOpsX = [{ op: 'calamity' }]; continue; }
    if (/^when you cast this spell and whenever this card attacks, destroy up to one target nonland permanent\. its controller creates a tapped powerstone token/.test(l)) { const ops = [{ op: 'levelerDestroy' }]; card.castSelfOps = ops; card.triggers.push({ when: 'attack', zone: 'battlefield', who: 'this card', ops }); continue; }
    if (/^when you cast this spell, you may search your library for a colorless creature card with mana value 7 or greater, reveal it, then shuffle and put that card on top/.test(l)) { card.castSelfOps = [{ op: 'tutorTopColorless7' }]; continue; }
    if ((m = l.match(/^the first creature spell you cast each turn costs \{(\d+)\} less to cast/))) { (card.__lateR = card.__lateR || []).push({ n: +m[1], filter: 'creature', firstCreature: true }); continue; }
    if (/^once each turn, you may pay \{0\} rather than pay the mana cost for a colorless spell you cast from your hand/.test(l)) { (card.__lateS = card.__lateS || {}).monolith = true; continue; }
    if (/^for each opponent, exile up to one target permanent that player controls with an even mana value/.test(l)) { card.spellOpsX = [...(card.spellOpsX || []), { op: 'exileEachOpp', parity: 0 }]; continue; }
    if (/^adamant — if at least three colorless mana was spent to cast this spell, return a permanent card with an odd mana value from your graveyard to the battlefield/.test(l)) { card.spellOpsX = [...(card.spellOpsX || []), { op: 'adamantReturnOdd' }]; continue; }
    if (/^if a triggered ability of a colorless spell you control or another colorless permanent you control triggers, that ability triggers an additional time/.test(l)) { (card.__lateS = card.__lateS || {}).echoes = true; continue; }
    if (/^whenever you cast a colorless spell, copy it/.test(l)) { card.triggers.push({ when: 'cast', zone: 'battlefield', filter: 'colorless', ops: [{ op: 'copyCastAny' }] }); continue; }
    if (/^\{t\}: each player gains control of all creatures they own/.test(l)) { card.abilities.push({ zone: 'battlefield', label: 'homeward', cost: manaInfo(''), tap: true, speed: 'instant', ops: [{ op: 'homeward' }] }); continue; }
    if (/^this artifact enters with a number of suspect counters on it equal to the greatest number of creatures a player controls/.test(l) || /^this card enters with a number of suspect counters on it equal to the greatest number of creatures a player controls/.test(l)) { card.etbSuspect = true; continue; }
    if (/^whenever an opponent sacrifices a nontoken permanent, put that card onto the battlefield under your control/.test(l)) { (card.__lateS = card.__lateS || {}).betrays = true; continue; }
    if ((m = l.match(/^colorless spells you cast with mana value (\d+) or greater cost \{(\d+)\} less to cast/))) { (card.__lateR = card.__lateR || []).push({ n: +m[2], filter: 'colorless', minMV: +m[1] }); continue; }
    if (/^living weapon$/.test(l)) { card.livingWeapon = true; continue; }
    if ((m = l.match(/^equipped creature gets \+(\d+)\/\+(\d+) and has first strike, trample, indestructible, haste, and "whenever (?:this creature|this card) deals combat damage to a creature, exile that creature\."/))) { card.__lateE = { pump: [+m[1], +m[2]], kws: ['first strike', 'trample', 'indestructible', 'haste'], exileDamaged: true }; continue; }
    if (/^you may cast colorless spells and artifact spells as though they had flash/.test(l)) { (card.__lateS = card.__lateS || {}).flashColorlessArtifact = true; continue; }
    if (/^you may cast colorless spells as though they had flash/.test(l)) { (card.__lateS = card.__lateS || {}).flashColorless = true; continue; }
    if (/^whenever you cast a spell, if the amount of mana spent to cast that spell is greater than this card's power, put a \+1\/\+1 counter on this card/.test(l)) { card.triggers.push({ when: 'cast', zone: 'battlefield', filter: '', spentGtPower: true, ops: [{ op: 'counters', n: 1, to: 'this card' }] }); continue; }
    if (/^when this card dies, reveal the top card of your library\. you may put that card onto the battlefield if it's a permanent card with mana value 3 or less\. otherwise, put that card into your hand/.test(l)) { card.triggers.push({ when: 'dies', zone: 'battlefield', self: true, ops: [{ op: 'reshaper' }] }); continue; }
    if (/^this spell costs \{x\} less to cast, where x is the total mana value of noncreature artifacts you control/.test(l)) { (card.__lateS = card.__lateS || {}).selfReduce = { what: 'noncreatureArtifactMV' }; continue; }
    if (/^sacrifice two artifacts: return this card from your graveyard to your hand/.test(l)) { card.abilities.push({ zone: 'graveyard', label: 'return', cost: manaInfo(''), sacCost: { n: 2, what: 'artifact' }, speed: 'instant', ops: [{ op: 'selfToHand' }] }); continue; }
    if (/^\{2\}: this card becomes a copy of target artifact, creature, enchantment, or land until end of turn/.test(l)) { card.abilities.push({ zone: 'battlefield', label: 'mirror', cost: manaInfo('{2}'), speed: 'instant', ops: [{ op: 'mirageCopy' }] }); continue; }
    if (/^start your engines!?$/.test(l)) { (card.__lateS = card.__lateS || {}).engines = true; continue; }
    if (/^max speed — \{t\}: add \{c\}\{c\}/.test(l)) { card.maxSpeedCC = true; continue; }
    if (/^counter target spell or ability that targets a permanent you control/.test(l)) { card.counter = { ...(card.counter || {}), hits: 'targetsMine' }; if (!card.roles.includes('counter')) card.roles.push('counter'); continue; }
    if (/^this spell costs \{7\} less to cast if it targets a spell or ability that targets a creature you control with power 7 or greater/.test(l)) { card.notOfThisWorld = true; continue; }
    if (/^whenever you activate an ability, if it isn't a mana ability, you may pay \{2\}\. if you do, copy that ability/.test(l)) { (card.__lateS = card.__lateS || {}).rings = true; continue; }
    if (/^exile this card\.?$/.test(l)) { card.exileOnResolve = true; continue; }
    if (/^whenever you cast a colorless spell with mana value 7 or greater, you may sacrifice this card\. if you do, search your library for a colorless creature card, reveal it, put it into your hand/.test(l)) { card.triggers.push({ when: 'cast', zone: 'battlefield', filter: 'colorless', mvMin: 7, ops: [{ op: 'sanctum' }] }); continue; }
    if (/^whenever you cast a colorless spell, until end of turn, this card gains trample and gets \+x\/\+x, where x is that spell's mana value/.test(l)) { card.triggers.push({ when: 'cast', zone: 'battlefield', filter: 'colorless', ops: [{ op: 'cicada' }] }); continue; }
    if (/^whenever you play a land or cast a spell, draw a card/.test(l)) { card.triggers.push({ when: 'cast', zone: 'battlefield', filter: '', ops: [{ op: 'draw', n: 1 }] }); card.triggers.push({ when: 'landPlayed', zone: 'battlefield', ops: [{ op: 'draw', n: 1 }] }); continue; }
    if (/^at the beginning of your end step, your life total becomes half your starting life total, rounded up/.test(l)) { card.triggers.push({ when: 'end', zone: 'battlefield', ops: [{ op: 'lifeBecomesHalfStart' }] }); continue; }
    if ((m = l.match(/^(\d+)\+ \| \{t\}: add x mana of any one color, where x is the number of charge counters on this card/))) { card.stationMana = +m[1]; continue; }
    if (/^when this card enters, target opponent reveals their hand\. you choose a nonland card from it and exile that card/.test(l)) { card.etbOps = [...(card.etbOps || []), { op: 'tksExile' }]; continue; }
    if (/^when this card leaves the battlefield, target opponent draws a card/.test(l)) { card.ltbOps = [{ op: 'oppDraws', n: 1 }]; continue; }
    if (/^−x: exile each permanent with mana value x or less that's one or more colors/.test(l)) { card.abilities.push({ zone: 'battlefield', label: '−X', loyalty: 0, loyaltyX: true, cost: manaInfo(''), speed: 'sorcery', ops: [{ op: 'uginX' }], text: l }); continue; }
    if (/^when you cast this spell, exile two target permanents/.test(l)) { card.castSelfOps = [{ op: 'exileTargets', n: 2 }]; continue; }
    if (/^whenever this card attacks, defending player exiles the top twenty cards of their library/.test(l)) { card.triggers.push({ when: 'attack', zone: 'battlefield', who: 'this card', ops: [{ op: 'defExileTop', n: 20 }] }); continue; }
    if (/^whenever this card attacks, put a blight counter on target land/.test(l)) { card.triggers.push({ when: 'attack', zone: 'battlefield', who: 'this card', ops: [{ op: 'blight' }] }); continue; }
    if (/^whenever you tap a land for \{c\}, add an additional \{c\}/.test(l)) { (card.__lateS = card.__lateS || {}).landCBonus = true; continue; }
    if (/^metalcraft — \{t\}: add \{c\} for each urza's land you control/.test(l)) { card.urzaWorkshop = true; continue; }
    if (/^your opponents can't cast spells with even mana values/.test(l)) { (card.__lateS = card.__lateS || {}).winnowCast = true; continue; }
    if (/^your opponents can't block with creatures with even mana values/.test(l)) { (card.__lateS = card.__lateS || {}).winnowBlock = true; continue; }
    if (/^whenever an opponent casts an instant or sorcery spell, they may pay \{2\}\. if they don't, you may copy that spell/.test(l)) { card.triggers.push({ when: 'oppCast', zone: 'battlefield', filter: 'instant or sorcery', tax: 2, ops: [{ op: 'copyCastAny', theirs: true }] }); continue; }
    if (/^grand summon — \{t\}: add one mana of any color\. when you next cast a creature spell this turn, that creature enters with two additional \+1\/\+1 counters on it/.test(l) || /^\{t\}: add one mana of any color\. when you next cast a creature spell this turn, that creature enters with two additional \+1\/\+1 counters on it/.test(l)) { card.manaAb = { amount: 1, colors: ['W', 'U', 'B', 'R', 'G'] }; card.grandSummon = 2; continue; }
    if (/^whenever another permanent you control is put into a graveyard from the battlefield, if it had one or more counters on it, you may put that number of \+1\/\+1 counters on target creature/.test(l)) { (card.__lateS = card.__lateS || {}).yunaCounters = true; continue; }
    if ((m = l.match(/^whenever one or more (creature )?cards leave your graveyard( during your turn)?, (.+)$/))) { let ops = parseOps(m[3]); if (/create a 0\/1 green plant creature token, then put a \+1\/\+1 counter on each plant you control/.test(m[3])) ops = [{ op: 'tokens', n: 1, pt: [0, 1], kw: [], types: 'Plant', tcolors: ['G'] }, { op: 'counters', n: 1, to: 'each plant you control', filter: 'plant' }]; if (ops.length) { card.triggers.push({ when: 'gyLeave', zone: 'battlefield', creatureOnly: !!m[1], yourTurn: !!m[2], ops }); continue; } }
    if ((m = l.match(/^whenever one or more (creature|land) cards are put into your graveyard from your library, put (one of them|them) onto the battlefield( tapped)?/))) { card.triggers.push({ when: 'milled', zone: 'battlefield', what: m[1], ops: [{ op: 'milledToBf', what: m[1], all: m[2] === 'them', tapped: !!m[3] }] }); continue; }
    if ((m = l.match(/^whenever one or more cards are put into exile from your library and\/or your graveyard, (.+)$/))) { const ops = parseOps(m[1]); if (ops.length) { card.triggers.push({ when: 'exiledLG', zone: 'battlefield', ops }); continue; } }
    if (/^when this card dies, return it to its owner's hand at the beginning of the next end step/.test(l)) { card.triggers.push({ when: 'dies', zone: 'battlefield', self: true, ops: [{ op: 'handAtEnd' }] }); continue; }
    if (/^at the beginning of your upkeep, each opponent loses x life and you scry x, where x is the number of zombies you control/.test(l)) { card.triggers.push({ when: 'upkeep', zone: 'battlefield', ops: [{ op: 'scarabUpkeep' }] }); continue; }
    if (/^\{2\}\{u\}\{b\}: exile target creature card from a graveyard\. create a token that's a copy of it, except it's a 4\/4 black zombie/.test(l)) { card.abilities.push({ zone: 'battlefield', label: '', cost: manaInfo('{2}{U}{B}'), speed: 'instant', ops: [{ op: 'scarabCopy' }] }); continue; }
    if (/^when this card enters, sacrifice it unless it escaped/.test(l)) { card.etbFirst = [{ op: 'sacUnlessEscaped' }]; continue; }
    if (/^whenever this card enters or attacks, you gain 3 life and draw a card, then you may put a land card from your hand onto the battlefield/.test(l)) { const ops = [{ op: 'gain', n: 3 }, { op: 'draw', n: 1 }, { op: 'landFromHand' }]; card.etbOps = [...(card.etbOps || []), ...ops]; card.triggers.push({ when: 'attack', zone: 'battlefield', who: 'this card', ops }); continue; }
    if ((m = l.match(/^renew — ((?:\{[^}]+\})+), exile this card from your graveyard: put two \+1\/\+1 counters and a flying counter on target creature/))) { card.abilities.push({ zone: 'graveyard', label: 'renew', cost: manaInfo(m[1].toUpperCase()), exileSelf: true, speed: 'sorcery', ops: [{ op: 'counters', n: 2, to: 'target creature', addKw: 'flying' }] }); continue; }
    if (/^pay x \{e\}, sacrifice a creature, return this card to its owner's hand: return target creature card with mana value x from your graveyard to the battlefield/.test(l)) { card.abilities.push({ zone: 'battlefield', label: '', cost: manaInfo(''), energyX: true, sacOther: 'creature', returnSelf: true, speed: 'sorcery', ops: [{ op: 'gyToBfMV' }] }); continue; }
    if ((m = l.match(/^crew (\d+)/))) { card.abilities.push({ zone: 'battlefield', label: 'crew', cost: manaInfo(''), crew: +m[1], speed: 'instant', ops: [{ op: 'crew' }] }); continue; }
    if ((m = l.match(/^as this card enters, choose (\w+) or (\w+)\.?$/))) { card.siege = [m[1], m[2]].map(s => s[0].toUpperCase() + s.slice(1)); continue; }
    if (card.siege && /^• (\w+) — /.test(l)) continue;
    if ((m = l.match(/^whenever (a player|an opponent) casts their second spell each turn, (.+)$/))) { const ops = parseOps(m[2]); if (ops.length) card.triggers.push({ when: m[1] === 'a player' ? 'anyCast' : 'oppCast', zone: 'battlefield', filter: '', second: true, ops }); continue; }
    if (/^whenever an opponent attacks you with two or more creatures, draws their second card each turn, or casts their second spell each turn, you draw a card/.test(l)) { const ops = [{ op: 'draw', n: 1 }]; card.triggers.push({ when: 'attackedBy2', zone: 'battlefield', ops }, { when: 'oppDraw', zone: 'battlefield', second: true, ops }, { when: 'oppCast', zone: 'battlefield', filter: '', second: true, ops }); continue; }
    if ((m = l.match(/^whenever an opponent attacks with creatures, if two or more of those creatures are attacking you[^,]*, (.+)$/))) { card.triggers.push({ when: 'attackedBy2', zone: 'battlefield', ops: parseOps(m[1]) }); continue; }
    if ((m = l.match(/^whenever you create or sacrifice a token, (.+)$/))) { const ops = parseOps(m[1]); card.triggers.push({ when: 'tokenEvent', zone: 'battlefield', ops }); continue; }
    if ((m = l.match(/^whenever a token you control leaves the battlefield, (.+)$/))) { card.triggers.push({ when: 'tokenLeaves', zone: 'battlefield', ops: parseOps(m[1]) }); continue; }
    if ((m = l.match(/^whenever a creature an opponent controls dies, (.+)$/))) { let ops = parseOps(m[1]); if (/that player loses (\d+) life/.test(m[1])) ops = [{ op: 'loseOwner', n: +m[1].match(/loses (\d+)/)[1] }]; card.triggers.push({ when: 'dies', zone: 'battlefield', opp: true, ops }); continue; }
    if ((m = l.match(/^whenever a nontoken creature an opponent controls would die|^if a nontoken creature an opponent controls would die, instead exile it and you gain 2 life/))) { card.statics = card.statics || {}; card.darkCrystal = true; continue; }
    if ((m = l.match(/^whenever a creature dies, (.+)$/))) { card.triggers.push({ when: 'dies', zone: 'battlefield', anyDeath: true, ops: /put a charge counter on this card/.test(m[1]) ? [{ op: 'chargeSelf', n: 1 }] : parseOps(m[1]) }); continue; }
    if ((m = l.match(/^whenever an attacking creature dies, (.+)$/))) { card.triggers.push({ when: 'dies', zone: 'battlefield', attacking: true, ops: parseOps(m[1]) }); continue; }
    if ((m = l.match(/^whenever (?:this card|this creature) or another ([a-z]+) you control dies, (.+)$/))) { const ops = /this card deals (\d+) damage to any target/.test(m[2]) ? [{ op: 'damage', n: +m[2].match(/deals (\d+)/)[1], to: 'any target' }] : parseOps(m[2]); card.triggers.push({ when: 'dies', zone: 'battlefield', yours: true, filter: m[1], ops }, { when: 'dies', zone: 'self', ops }); continue; }
    if ((m = l.match(/^whenever this card or another creature or planeswalker you control dies, (.+)$/))) { const ops = parseOps(m[1]); card.triggers.push({ when: 'dies', zone: 'battlefield', yours: true, ops }, { when: 'dies', zone: 'self', ops }); continue; }
    if ((m = l.match(/^whenever (this card dies or )?another (creature or artifact|artifact) you control is put into a graveyard from the battlefield, (.+)$/))) { const ops = /return to your hand target artifact card in your graveyard with lesser mana value/.test(m[3]) ? [{ op: 'returnLesserArtifact' }] : parseOps(m[3]); card.triggers.push({ when: 'dies', zone: 'battlefield', yours: true, artifacts: true, creaturesToo: m[2] !== 'artifact', ops }); if (m[1]) card.triggers.push({ when: 'dies', zone: 'self', ops }); continue; }
    if ((m = l.match(/^when this card dies, if it was a creature, return it to the battlefield under its owner's control\. it's an enchantment/))) { card.triggers.push({ when: 'dies', zone: 'self', ops: [{ op: 'returnAsEnchantment' }] }); continue; }
    if ((m = l.match(/^when (?:this card|enchanted permanent) dies or is put into exile, return that card to the battlefield under your control/))) { card.triggers.push({ when: 'dies', zone: 'battlefield', enchantedDies: true, ops: [{ op: 'returnEnchanted' }] }); continue; }
    if ((m = l.match(/^when this card dies, return it to the battlefield tapped and transformed under its owner's control/))) { card.triggers.push({ when: 'dies', zone: 'self', ops: [{ op: 'returnTransformed' }] }); continue; }
    if ((m = l.match(/^whenever (another )?(?:creature you control|creature) enters, (?:this card|it) deals damage equal to (?:that creature's|its) power to any target/))) { card.triggers.push({ when: 'creatureEnters', zone: 'battlefield', yours: true, another: !!m[1], filter: '', ops: [{ op: 'damageEnteredPower' }] }); continue; }
    if ((m = l.match(/^whenever a creature you control enters, it deals damage equal to its power to any target/))) { card.triggers.push({ when: 'creatureEnters', zone: 'battlefield', yours: true, filter: '', ops: [{ op: 'damageEnteredPower' }] }); continue; }
    if ((m = l.match(/^whenever a creature you control with flying enters, it gains haste until end of turn/))) { card.triggers.push({ when: 'creatureEnters', zone: 'battlefield', yours: true, filter: '', withKw: 'flying', ops: [{ op: 'pumpEntered', p: 0, haste: true }] }); continue; }
    if ((m = l.match(/^whenever (?:a|another) ([a-z]+) you control enters, it deals x damage to any target, where x is the number of ([a-z]+)s you control/))) { card.triggers.push({ when: 'creatureEnters', zone: 'battlefield', yours: true, filter: m[1], ops: [{ op: 'damage', n: { count: m[2] }, to: 'any target' }] }); continue; }
    if ((m = l.match(/^whenever another creature you control enters, it gets \+(\d+)\/\+(\d+) and gains haste until end of turn/))) { card.triggers.push({ when: 'creatureEnters', zone: 'battlefield', yours: true, another: true, filter: '', ops: [{ op: 'pumpEntered', p: +m[1], haste: true }] }); continue; }
    if ((m = l.match(/^whenever (?:this card or )?another ([a-z ]+?) you control enters, (.+)$/)) && !/creature/.test(m[1]) && !/^(artifact|enchantment|equipment|token|land)s?$/.test(m[1])) { const ops = parseOps(m[2]); if (ops.length) { card.triggers.push({ when: 'creatureEnters', zone: 'battlefield', yours: true, another: !/^whenever this card or/.test(l), filter: m[1], ops }); continue; } }
    if ((m = l.match(/^whenever this card or another ([a-z ]+?) creature you control enters, (.+)$/))) { card.triggers.push({ when: 'creatureEnters', zone: 'battlefield', yours: true, filter: m[1], ops: parseOps(m[2]) }); continue; }
    if ((m = l.match(/^whenever this card or another (artifact|equipment) you control enters, (.+)$/))) { const ops = /attach that equipment to target creature you control/.test(m[2]) ? [{ op: 'attachEntered' }] : parseOps(m[2]); card.triggers.push({ when: 'permEnters', zone: 'battlefield', filter: m[1], ops, may: /you may/.test(m[2]) }); continue; }
    if ((m = l.match(/^whenever an equipment you control enters, you may attach it to target creature you control/))) { card.triggers.push({ when: 'permEnters', zone: 'battlefield', filter: 'equipment', ops: [{ op: 'attachEntered' }] }); continue; }
    if ((m = l.match(/^whenever an artifact you control enters, put a loyalty counter on this card/))) { card.triggers.push({ when: 'permEnters', zone: 'battlefield', filter: 'artifact', ops: [{ op: 'loyaltySelf', n: 1 }] }); continue; }
    if ((m = l.match(/^whenever one or more tokens you control enter, (.+?)\. this ability triggers only once each turn/))) { card.triggers.push({ when: 'permEnters', zone: 'battlefield', filter: 'token', oncePerTurn: true, ops: parseOps(m[1]) }); continue; }
    if ((m = l.match(/^whenever another creature enters, its controller may draw a card if its power is greater than each other creature's power/))) { card.triggers.push({ when: 'creatureEnters', zone: 'battlefield', another: true, filter: '', ops: [{ op: 'selvalaDraw' }] }); continue; }
    if ((m = l.match(/^when this card enters and whenever you cast a spell with mana value (\d+) or greater, (.+)$/))) { const ops = parseOps(m[2]); card.etbOps = (card.etbOps || []).concat(ops); card.triggers.push({ when: 'cast', zone: 'battlefield', filter: '', mvMin: +m[1], ops }); continue; }
    if ((m = l.match(/^whenever you cast (?:or copy )?an instant or sorcery spell, this card gets \+(\d+)\/\+(\d+) until end of turn/))) { card.triggers.push({ when: 'cast', zone: 'battlefield', filter: 'instant or sorcery', ops: [{ op: 'selfPumpEOT', n: +m[1] }] }); continue; }
    if ((m = l.match(/^whenever you cast a noncreature spell, (birds?, frogs?, otters?, and rats?) you control get \+(\d+)\/\+(\d+) until end of turn\. untap them/))) { card.triggers.push({ when: 'cast', zone: 'battlefield', filter: 'noncreature', ops: [{ op: 'pumpTypes', types: ['bird', 'frog', 'otter', 'rat'], n: +m[2], untap: true }] }); continue; }
    if ((m = l.match(/^whenever you cast a spell of the chosen type, copy that spell/))) { card.triggers.push({ when: 'cast', zone: 'battlefield', filter: '__chosen__', ops: [{ op: 'copyCast' }] }); continue; }
    if ((m = l.match(/^whenever you cast a spell, choose up to one —/))) continue;
    if ((m = l.match(/^whenever you discard a card, (.+)$/))) { const ops = parseOps(m[1]); if (ops.length) card.triggers.push({ when: 'discard', zone: 'battlefield', ops }); continue; }
    if ((m = l.match(/^whenever enchanted player is attacked, create a gold token\. each opponent attacking that player does the same/))) { card.triggers.push({ when: 'enchantedAttacked', zone: 'battlefield', ops: [{ op: 'artifactTokens', n: 1, kind: 'gold' }] }); continue; }
    if ((m = l.match(/^whenever enchanted creature (attacks|deals damage to an opponent|deals combat damage to a player), (.+)$/))) { card.triggers.push({ when: m[1] === 'attacks' ? 'attack' : 'combatDamage', zone: 'battlefield', who: 'enchanted creature', ops: parseOps(m[2]) }); continue; }
    if ((m = l.match(/^whenever this card attacks or becomes the target of a spell, (.+)$/))) { const ops = parseOps(m[1]); card.triggers.push({ when: 'attack', zone: 'battlefield', who: 'this card', ops }, { when: 'targeted', zone: 'battlefield', ops }); continue; }
    if ((m = l.match(/^whenever you attack, (?:if it's the first combat phase of the turn, )?(.+)$/))) { let ops = parseOps(m[1]); if (/for each opponent, create a 1\/1 [a-z ]+ creature token that's tapped and attacking that player/.test(m[1])) ops = [{ op: 'attackingTokens', perOpp: true, pt: [1, 1] }]; if (/untap all attacking creatures\. they gain first strike until end of turn\. after this phase, there is an additional combat phase/.test(m[1])) ops = [{ op: 'untapAttackers', fs: true }, { op: 'extraCombat', firstOnly: true }]; card.triggers.push({ when: 'attack', zone: 'battlefield', who: 'you', ops }); continue; }
    if ((m = l.match(/^whenever this card attacks for the first time each turn, untap all creatures you control\. after this phase, there is an additional combat phase/))) { card.triggers.push({ when: 'attack', zone: 'battlefield', who: 'this card', firstEachTurn: true, ops: [{ op: 'untapAll', what: 'creatures' }, { op: 'extraCombat' }] }); continue; }
    if (/^if this (?:creature|card) hasn't been exerted this turn, you may exert it as it attacks/.test(l)) { card.triggers.push({ when: 'attack', zone: 'battlefield', who: 'this card', exert: true, ops: [{ op: 'exertCelebrant' }] }); continue; }
    if ((m = l.match(/^whenever this card attacks, put a \+1\/\+1 counter on it, then create a number of 1\/1 red goblin creature tokens equal to this card's power/))) { card.triggers.push({ when: 'attack', zone: 'battlefield', who: 'this card', ops: [{ op: 'counters', n: 1, to: 'this card' }, { op: 'tokens', n: { power: true }, pt: [1, 1], kw: [] }] }); continue; }
    if ((m = l.match(/^whenever this card attacks, you may tap x untapped myr you control/))) { card.triggers.push({ when: 'attack', zone: 'battlefield', who: 'this card', ops: [{ op: 'battlesphere' }] }); continue; }
    if ((m = l.match(/^whenever this card attacks, each creature you control with power 4 or greater gets \+1\/\+1 and gains trample until end of turn/))) { card.triggers.push({ when: 'attack', zone: 'battlefield', who: 'this card', ops: [{ op: 'goreclaw' }] }); continue; }
    if ((m = l.match(/^whenever a creature you control attacks, it gets \+1\/\+0 until end of turn for each other attacking creature that shares a creature type with it/))) { card.triggers.push({ when: 'attack', zone: 'battlefield', who: 'a creature you control', ops: [{ op: 'animosity' }] }); continue; }
    if ((m = l.match(/^whenever a creature you control attacks, you may put a quest counter on this card/))) { card.triggers.push({ when: 'attack', zone: 'battlefield', who: 'a creature you control', ops: [{ op: 'questSelf' }] }); continue; }
    if ((m = l.match(/^mobilize (\d+)/))) { card.triggers.push({ when: 'attack', zone: 'battlefield', who: 'this card', ops: [{ op: 'attackingTokens', n: +m[1], pt: [1, 1], sacAtEnd: true }] }); continue; }
    if ((m = l.match(/^annihilator (\d+)/))) { card.triggers.push({ when: 'attack', zone: 'battlefield', who: 'this card', ops: [{ op: 'annihilator', n: +m[1] }] }); continue; }
    if ((m = l.match(/^whenever (?:this card|ragavan) deals combat damage to a player, create a treasure token and exile the top card of that player's library\. until end of turn, you may cast that card/))) { card.triggers.push({ when: 'combatDamage', zone: 'battlefield', who: 'this card', ops: [{ op: 'artifactTokens', n: 1, kind: 'treasure' }, { op: 'pilfer' }] }); continue; }
    if ((m = l.match(/^whenever this card deals combat damage to a player, roll a d20\. you create a number of treasure tokens equal to the result/))) { card.triggers.push({ when: 'combatDamage', zone: 'battlefield', who: 'this card', ops: [{ op: 'd20Treasure' }] }); continue; }
    if ((m = l.match(/^whenever this card deals combat damage to a player, gain control of all artifacts that player controls/))) { card.triggers.push({ when: 'combatDamage', zone: 'battlefield', who: 'this card', ops: [{ op: 'stealArtifacts' }] }); continue; }
    if ((m = l.match(/^whenever this card deals combat damage to a player, they get that many poison counters/))) { card.triggers.push({ when: 'combatDamage', zone: 'battlefield', who: 'this card', ops: [{ op: 'poisonDamage' }] }); continue; }
    if ((m = l.match(/^whenever one or more artifact creatures you control deal combat damage to a player, (.+)$/))) { card.triggers.push({ when: 'combatDamage', zone: 'battlefield', who: 'one or more creatures you control', artifactOnly: true, ops: parseOps(m[1]) }); continue; }
    if ((m = l.match(/^whenever one or more creatures you control each with power greater than its base power deals combat damage to a player, (.+)$/))) { card.triggers.push({ when: 'combatDamage', zone: 'battlefield', who: 'one or more creatures you control', pumpedOnly: true, ops: parseOps(m[1]) }); continue; }
    if ((m = l.match(/^whenever this creature is dealt damage, it deals that much damage to target opponent/))) { card.taunter = true; continue; }
    if ((m = l.match(/^whenever you put one or more \+1\/\+1 counters on a creature you control, you may draw that many cards\. do this only once each turn/))) { card.triggers.push({ when: 'countersPut', zone: 'battlefield', oncePerTurn: true, ops: [{ op: 'drawX' }] }); continue; }
    if ((m = l.match(/^whenever you put one or more \+1\/\+1 counters on this card, (.+?)\. this ability triggers only once each turn/))) { card.triggers.push({ when: 'countersPut', zone: 'battlefield', selfOnly: true, oncePerTurn: true, ops: parseOps(m[1]) }); continue; }
    if ((m = l.match(/^whenever you sacrifice a clue, (.+)$/))) { card.triggers.push({ when: 'sacrifice', zone: 'battlefield', clue: true, ops: parseOps(m[1]) }); continue; }
    if ((m = l.match(/^whenever an opponent plays a land, you may put a land card from your hand onto the battlefield/))) { card.triggers.push({ when: 'oppLand', zone: 'battlefield', ops: [{ op: 'landFromHand' }] }); continue; }
    if ((m = l.match(/^whenever a land an opponent controls enters, if that player controls more lands than you, you may put a land card from your hand onto the battlefield/))) { card.triggers.push({ when: 'oppLand', zone: 'battlefield', moreLands: true, ops: [{ op: 'landFromHand' }] }); continue; }
    if ((m = l.match(/^whenever an opponent searches their library, (.+)$/))) { card.triggers.push({ when: 'oppSearch', zone: 'battlefield', ops: parseOps(m[1]) }); continue; }
    if ((m = l.match(/^whenever an opponent draws a card, this card deals (\d+) damage to them/))) { card.triggers.push({ when: 'oppDraw', zone: 'battlefield', ops: [{ op: 'drawerLoses', n: +m[1] }] }); continue; }
    if ((m = l.match(/^whenever one or more land cards are put into your graveyard from anywhere, (.+)$/))) { card.gitrog = parseOps(m[1]); continue; }
    if ((m = l.match(/^whenever a card is put into an opponent's graveyard from anywhere, if this card has three or more quest counters on it, you may have that player lose 2 life\. if you do, you gain 2 life/))) { card.bloodchief = true; continue; }
    if ((m = l.match(/^at the beginning of each end step, if an opponent lost 2 or more life this turn, you may put a quest counter on this card/))) { card.triggers.push({ when: 'end', zone: 'battlefield', each: true, cond: 'oppLost2', ops: [{ op: 'questSelf' }] }); continue; }
    if ((m = l.match(/^at the beginning of each combat, double the power and toughness of each creature you control until end of turn/))) { card.triggers.push({ when: 'eachCombat', zone: 'battlefield', ops: [{ op: 'doublePT' }] }); continue; }
    if ((m = l.match(/^at the beginning of each opponent's upkeep, that player sacrifices a creature/))) { card.triggers.push({ when: 'oppUpkeep', zone: 'battlefield', ops: [{ op: 'activeSacrifices' }] }); continue; }
    if ((m = l.match(/^at the beginning of each upkeep, put an hour counter on this card/))) { card.triggers.push({ when: 'upkeep', zone: 'battlefield', each: true, ops: [{ op: 'hourSelf' }] }); continue; }
    if ((m = l.match(/^at the beginning of your upkeep, put two descent counters on this card\. then each player creates x treasure tokens and this card deals x damage to each player/))) { card.triggers.push({ when: 'upkeep', zone: 'battlefield', ops: [{ op: 'descent' }] }); continue; }
    if ((m = l.match(/^at the beginning of your upkeep, if an opponent controls more lands than you, you may search your library for up to three basic land cards/))) { card.triggers.push({ when: 'upkeep', zone: 'battlefield', ops: [{ op: 'landTax' }] }); continue; }
    if ((m = l.match(/^at the beginning of your upkeep, if you control an artifact, (.+)$/))) { card.triggers.push({ when: 'upkeep', zone: 'battlefield', cond: 'artifact', ops: parseOps(m[1]) }); continue; }
    if ((m = l.match(/^at the beginning of your upkeep, if you control twenty or more artifacts, you win the game/))) { card.triggers.push({ when: 'upkeep', zone: 'battlefield', cond: 'artifacts20', ops: [{ op: 'winGame' }] }); continue; }
    if ((m = l.match(/^at the beginning of your upkeep, sacrifice this card unless you sacrifice a land/))) { card.triggers.push({ when: 'upkeep', zone: 'battlefield', ops: [{ op: 'gitrogUpkeep' }] }); continue; }
    if ((m = l.match(/^at the beginning of your upkeep, if you have the city's blessing, reveal the top card of your library and put it into your hand\. each opponent loses x life and you gain x life, where x is that card's mana value/))) { card.triggers.push({ when: 'upkeep', zone: 'battlefield', cond: 'blessing', ops: [{ op: 'prophet' }] }); continue; }
    if ((m = l.match(/^at the beginning of your upkeep, you may move any number of \+1\/\+1 counters from this card onto other creatures/))) { card.triggers.push({ when: 'upkeep', zone: 'battlefield', ops: [{ op: 'spreadCounters' }] }); continue; }
    if ((m = l.match(/^at the beginning of your upkeep, create a token that's a copy of enchanted artifact\. then if you control eight or more artifacts with the same name as one another, you win the game/))) { card.triggers.push({ when: 'upkeep', zone: 'battlefield', ops: [{ op: 'mechanized' }] }); continue; }
    if ((m = l.match(/^∞ — at the beginning of your upkeep, (.+)$/))) { card.triggers.push({ when: 'upkeep', zone: 'battlefield', cond: 'harnessed', ops: parseOps(m[1]) }); continue; }
    if ((m = l.match(/^at the beginning of your end step, if you control four or more creatures, transform this card/))) { card.triggers.push({ when: 'end', zone: 'battlefield', cond: 'creatures4', ops: [{ op: 'transform' }] }); continue; }
    if ((m = l.match(/^at the beginning of your end step, if you gained life this turn, create a 1\/1 white cat creature token\. then if you have the city's blessing, for each token you control that entered this turn, create a token that's a copy of it/))) { card.triggers.push({ when: 'end', zone: 'battlefield', cond: 'gainedLife', ops: [{ op: 'tokens', n: 1, pt: [1, 1], kw: [] }, { op: 'ocelotCopies' }] }); continue; }
    if ((m = l.match(/^at the beginning of your end step, discover (\d+)/))) { card.triggers.push({ when: 'end', zone: 'battlefield', ops: [{ op: 'discover', n: +m[1] }] }); continue; }
    if ((m = l.match(/^at the beginning of the end step, sacrifice this card/))) { card.triggers.push({ when: 'end', zone: 'battlefield', each: true, ops: [{ op: 'sacSelf' }] }); continue; }
    if ((m = l.match(/^at the beginning of your first main phase, add \{b\} for each charge counter on this card/))) { card.triggers.push({ when: 'main1', zone: 'battlefield', ops: [{ op: 'addManaCharge', c: 'B' }] }); continue; }
    if ((m = l.match(/^landfall — whenever a land you control enters, if it's your main phase, there's an additional combat phase after this phase\. at the beginning of that combat, untap all creatures you control/))) { card.triggers.push({ when: 'landfall', zone: 'battlefield', ops: [{ op: 'moraug' }] }); continue; }
    if ((m = l.match(/^(?:landfall — )?whenever a land you control enters, double the number of \+1\/\+1 counters on this card/))) { card.triggers.push({ when: 'landfall', zone: 'battlefield', ops: [{ op: 'doubleCounters' }] }); continue; }
    if ((m = l.match(/^whenever this (?:land|card) or another land you control enters, if you control seven or more lands with different names, (.+)$/))) { card.triggers.push({ when: 'landfall', zone: 'battlefield', cond: 'sevenNames', ops: parseOps(m[1]) }); continue; }
    if ((m = l.match(/^landfall — whenever a land you control enters, you may pay \{1\}\{g\} if this permanent is attached to a creature you control/))) { card.triggers.push({ when: 'landfall', zone: 'battlefield', ops: [{ op: 'nantuko' }] }); continue; }
    if ((m = l.match(/^when this card enters untapped, you may put target (instant or sorcery|creature) card from your graveyard on top of your library/))) { card.landEtbUntapped = [{ op: 'gyToTop', filter: m[1] }]; continue; }
    if ((m = l.match(/^hideaway (\d+)/))) { card.hideaway = +m[1]; continue; }
    if ((m = l.match(/^when this card enters, (?:you may )?exile a nonartifact, nonland card from your hand|^imprint — when this card enters/))) continue;
    if ((m = l.match(/^when you cast this spell, (.+)$/))) { card.castSelfOps = parseOps(m[1]); continue; }
    if ((m = l.match(/^when this card is put into a graveyard from anywhere, its owner shuffles their graveyard into their library/))) { card.eldrazi = true; continue; }
    if ((m = l.match(/^if this card would be put into a graveyard from anywhere, reveal this card and shuffle it into its owner's library instead/))) { card.eldrazi = 'self'; continue; }
    if ((m = l.match(/^when this aura is put into a graveyard from the battlefield, return it to its owner's hand/))) { card.rancor = true; continue; }
    if ((m = l.match(/^when (?:this card|kardur) enters, until your next turn, creatures your opponents control attack each combat if able and attack a player other than you if able/))) { card.etbOps = (card.etbOps || []).concat([{ op: 'goadAll' }]); continue; }
    if ((m = l.match(/^whenever equipped creature dies, (.+)$/))) { const ops = parseOps(m[1]); if (ops.length) card.triggers.push({ when: 'dies', zone: 'battlefield', equipped: true, ops }); continue; }
    if ((m = l.match(/^when this card enters, attach it to target (?:legendary )?creature you control/))) { card.etbOps = (card.etbOps || []).concat([{ op: 'attach' }]); continue; }
    if ((m = l.match(/^at the beginning of your upkeep, you may pay \{(\d+)\}\. if you do, untap this card/))) { card.triggers.push({ when: 'upkeep', zone: 'battlefield', ops: [{ op: 'payUntap', n: +m[1] }] }); continue; }
    if (/^at the beginning of your draw step, if this card is tapped, it deals (\d+) damage to you/.test(l)) { card.triggers.push({ when: 'drawStep', zone: 'battlefield', ops: [{ op: 'tappedHurts', n: +l.match(/deals (\d+)/)[1] }] }); continue; }
    if ((m = l.match(/^when this card enters and whenever an opponent draws a card except the first one they draw in each of their draw steps, (.+)$/))) { const ops = parseOps(m[1]); if (ops.length) { card.etbOps = (card.etbOps || []).concat(ops); card.triggers.push({ when: 'oppDraw', zone: 'battlefield', exceptFirst: true, ops }); } continue; }
    if ((m = l.match(/^whenever an opponent draws their second card each turn, (.+)$/))) { const ops = parseOps(m[1]); if (ops.length) card.triggers.push({ when: 'oppDraw', zone: 'battlefield', second: true, ops }); continue; }
    if ((m = l.match(/^whenever a creature an opponent controls enters, (.+)$/))) { const ops = parseOps(m[1]); if (ops.length) card.triggers.push({ when: 'creatureEnters', zone: 'battlefield', opp: true, filter: '', ops }); continue; }
    if ((m = l.match(/^when this card enters or dies, (.+)$/))) { const ops = parseOps(m[1]); if (ops.length) { card.etbOps = (card.etbOps || []).concat(ops); card.triggers.push({ when: 'dies', zone: 'self', ops }); } continue; }
    if ((m = l.match(/^whenever (another )?(?:an?|one or more) (artifact|enchantment|equipment|token)s? (?:you control )?enters?(?: the battlefield)?(?: under your control)?, (.+)$/))) { const ops = parseOps(m[3]); if (ops.length) card.triggers.push({ when: 'permEnters', zone: 'battlefield', filter: m[2], another: !!m[1], ops, may: /you may/.test(m[3]) }); continue; }
    if ((m = l.match(/^at the beginning of your upkeep, if this card is in your graveyard, (.+)$/))) { const ops = parseOps(m[1]); if (ops.length) card.triggers.push({ when: 'upkeep', zone: 'graveyard', ops, may: /you may/.test(m[1]) }); continue; }
    if ((m = l.match(/^at the beginning of (your|each) upkeep, (.+)$/))) { const ops = parseOps(m[2]); if (ops.length) card.triggers.push({ when: 'upkeep', zone: 'battlefield', each: m[1] === 'each', ops, may: /you may/.test(m[2]) }); continue; }
    if ((m = l.match(/^at the beginning of your end step, (.+)$/))) { const ops = parseOps(m[1]); if (ops.length) card.triggers.push({ when: 'end', zone: 'battlefield', ops }); continue; }
    if ((m = l.match(/^(?:landfall — )?whenever a land (?:you control )?enters(?: the battlefield)?(?: under your control)?, (.+)$/))) {
      const ops = parseOps(m[1]); const fromGy = /from your graveyard/.test(m[1]) && ops.some(o => o.op === 'selfToBf');
      if (ops.length) card.triggers.push({ when: 'landfall', zone: fromGy ? 'graveyard' : 'battlefield', ops, may: /you may/.test(m[1]) }); continue; }
    if ((m = l.match(/^whenever one or more other creatures die, (.+?)\. this ability triggers only once each turn/))) { const ops = parseOps(m[1]); if (ops.length) card.triggers.push({ when: 'dies', zone: 'battlefield', another: true, yours: false, nontoken: false, oncePerTurn: true, ops }); continue; }
    if ((m = l.match(/^whenever (this card or )?(another |a )?(nontoken )?creature (you control )?dies, (.+)$/))) { const ops = parseOps(m[5]); if (ops.length) card.triggers.push({ when: 'dies', zone: 'battlefield', self: !!m[1], another: m[2] === 'another ', yours: !!m[4], nontoken: !!m[3], ops }); continue; }
    if ((m = l.match(/^whenever an opponent casts (?:a |an |their first )?([a-z ]*?)spell(?: each turn)?, (?:you may )?(.+?)(?: unless that player pays \{(\d+|x)\})?\.?$/))) { const ops = parseOps(m[2]); if (ops.length) card.triggers.push({ when: 'oppCast', zone: 'battlefield', filter: m[1].trim(), firstEach: /their first/.test(l), ops, tax: m[3] ? (m[3] === 'x' ? 'power' : +m[3]) : 0 }); continue; }
    if ((m = l.match(/^whenever a player casts (?:a |an )?([a-z ]*?)spell, (.+)$/))) { const ops = parseOps(m[2]); if (ops.length) card.triggers.push({ when: 'anyCast', zone: 'battlefield', filter: m[1].trim(), ops }); continue; }
    if ((m = l.match(/^whenever an opponent draws a card(?:, if it isn't that player's turn)?, (.+)$/))) {
      const t2 = m[1]; let ops = parseOps(t2);
      if (/that player may pay \{2\}\. if the player doesn't, you create a treasure/.test(t2)) ops = [{ op: 'artifactTokens', n: 1, kind: 'treasure' }];
      if (/they lose (\d+) life|that player loses (\d+) life/.test(t2)) ops = [{ op: 'drawerLoses', n: +(t2.match(/loses? (\d+) life/) || [0, 1])[1] }];
      if (ops.length) card.triggers.push({ when: 'oppDraw', zone: 'battlefield', ops, tax: /may pay \{2\}/.test(t2) ? 2 : 0, notTheirTurn: /isn't that player's turn/.test(l), oncePerTurn: /only once each turn/.test(l) }); continue; }
    if ((m = l.match(/^whenever you draw a card, (.+)$/))) { const ops = parseOps(m[1]); if (ops.length) card.triggers.push({ when: 'youDraw', zone: 'battlefield', ops }); continue; }
    if ((m = l.match(/^whenever you gain life, (.+)$/))) { let ops = parseOps(m[1]); if (/target opponent loses that much life/.test(m[1])) ops = [{ op: 'drainX', target: true }]; if (ops.length) card.triggers.push({ when: 'lifeGain', zone: 'battlefield', ops }); continue; }
    if ((m = l.match(/^whenever an opponent loses life, you gain that much life/))) { card.triggers.push({ when: 'oppLoss', zone: 'battlefield', ops: [{ op: 'gainX' }] }); continue; }
    if ((m = l.match(/^whenever you lose life, draw that many cards/))) { card.triggers.push({ when: 'youLoss', zone: 'battlefield', ops: [{ op: 'drawX' }] }); continue; }
    if ((m = l.match(/^whenever (?:a player|you) sacrifices? (?:a|another) ?(permanent|creature|token)?, (.+)$/))) { const ops = parseOps(m[2]); if (ops.length) card.triggers.push({ when: 'sacrifice', zone: 'battlefield', any: /a player/.test(l), ops }); continue; }
    if ((m = l.match(/^at the beginning of combat on your turn, create a token that's a copy of equipped creature, except the token isn't legendary\. that token gains haste/))) { card.triggers.push({ when: 'combatStart', zone: 'battlefield', ops: [{ op: 'helmCopy' }] }); continue; }
    if ((m = l.match(/^as (?:this artifact|this card) enters, you may have it become a copy of any creature on the battlefield until end of turn, except it has haste/))) { card.mirrorClone = true; continue; }
    if ((m = l.match(/^addendum — if you cast this spell during your main phase, (.+)$/))) { card.addendum = /put a \+1\/\+1 counter on each of those creatures and they gain vigilance/.test(m[1]) ? [{ op: 'counters', n: 1, to: 'each creature you control' }, { op: 'grantAll', kws: ['vigilance'] }] : parseOps(m[1]); continue; }
    if ((m = l.match(/^at the beginning of combat on your turn, (.+)$/))) { const ops = parseOps(m[1]); if (ops.length) card.triggers.push({ when: 'combatStart', zone: 'battlefield', ops }); continue; }
    if ((m = l.match(/^at the beginning of (your|each player's) draw step, (.+)$/))) { let ops = parseOps(m[2]); if (/that player draws an additional card/.test(m[2])) ops = [{ op: 'activeDraws', n: 1 }]; if (/you may draw two additional cards/.test(m[2])) ops = [{ op: 'sylvan' }]; if (ops.length) card.triggers.push({ when: 'drawStep', zone: 'battlefield', each: m[1] !== 'your', ops }); continue; }
    if ((m = l.match(/^at the beginning of your (?:first|precombat) main phase, (.+)$/))) { const ops = parseOps(m[1]); if (ops.length) card.triggers.push({ when: 'main1', zone: 'battlefield', ops }); continue; }
    if ((m = l.match(/^whenever you cast (?:a |an |your first )?([a-z ,]*?)spell(?: [a-z ]+ turn)?, (.+)$/))) { const ops = parseOps(m[2]); if (ops.length) card.triggers.push({ when: 'cast', zone: 'battlefield', filter: m[1].trim(), ops }); continue; }
    if ((m = l.match(/^whenever (another |one or more (?:other )?)?([a-z ]*?)creatures? (you control )?(?:with (power|mana value) (\d+) or (greater|less) )?enters?(?: the battlefield)?( under your control)?, (.+?)(?:\. this ability triggers only once each turn)?\.?$/))) { const ops = parseOps(m[8]); if (ops.length) card.triggers.push({ when: 'creatureEnters', zone: 'battlefield', another: /another|other/.test(m[1] || ''), yours: !!(m[3] || m[7]), filter: m[2].trim(), stat: m[4] ? { k: m[4], n: +m[5], dir: m[6] } : null, oncePerTurn: /only once each turn/.test(l), ops }); continue; }
    if ((m = l.match(/^whenever an? ([a-z]+) you control attacks, (.+)$/)) && !/^(creature|equipped)$/.test(m[1])) { const ops = parseOps(m[2]); if (ops.length) { card.triggers.push({ when: 'attack', zone: 'battlefield', who: 'a creature you control', attackerFilter: m[1], ops }); continue; } }
    if ((m = l.match(/^whenever (this card|a creature you control|one or more creatures you control|equipped creature) attacks?, (.+)$/))) { const ops = parseOps(m[2]); if (ops.length) card.triggers.push({ when: 'attack', zone: 'battlefield', who: m[1], ops }); continue; }
    if ((m = l.match(/^whenever (this card|a creature you control|equipped creature|one or more creatures you control) deals? combat damage to (?:a player|an opponent), (.+)$/))) { const ops = parseOps(m[2]); if (ops.length) card.triggers.push({ when: 'combatDamage', zone: 'battlefield', who: m[1], ops }); continue; }
    if ((m = l.match(/^when this card dies, (.+)$/))) { const ops = parseOps(m[1]); if (ops.length) card.triggers.push({ when: 'dies', zone: 'self', ops }); continue; }
    if ((m = l.match(/^when(?:ever)? this card enters(?: the battlefield)?(?: or attacks)?, (.+)$/))) { const ops = parseOps(m[1]).filter(o => !((o.op === 'destroy' || o.op === 'bounceTarget' || o.op === 'destroyUpTo') && card.roles.includes('removal'))); if (ops.length) card.etbOps = (card.etbOps || []).concat(ops); continue; }
    // ---- planeswalker loyalty abilities "+1: effect" / "−3: effect"
    if (card.isPlaneswalker && (m = l.match(/^([+−-]?)(\d+|x): (.+)$/))) { const ops = parseOps(m[3]); if (ops.length) card.abilities.push({ zone: 'battlefield', label: (m[1] === '+' ? '+' : m[1] ? '−' : '') + m[2], loyalty: m[1] === '+' ? +m[2] : m[1] ? -(m[2] === 'x' ? 3 : +m[2]) : 0, cost: manaInfo(''), speed: 'sorcery', ops, text: m[3] }); continue; }
    // ---- activated abilities "cost: effect"
    if ((m = l.match(/^([^:"]+): (.+)$/)) && !/^[+−-]?\d+$/.test(m[1].trim()) && (!/^add \{|add (one|two) mana|mana of any/.test(m[2]) || /^exile target land card from a graveyard/.test(m[2]))) {
      const cp = costParts(m[1]); if (!cp.ok) continue;
      const ops = parseOps(m[2]); if (!ops.length) continue;
      const zone = cp.discardSelf || /put this card from your hand onto the battlefield/.test(m[2]) ? 'hand' : /from your graveyard/.test(m[2]) && ops.some(o => o.op === 'selfToBf' || o.op === 'selfToHand') || /from your graveyard/.test(m[1]) ? 'graveyard' : 'battlefield';
      if (card.fetch && zone === 'battlefield') continue; // fetchlands have their own handling
      card.abilities.push({ zone, label: '', sacCost: cp.sacCost, removeCounter: cp.removeCounter, removeKind: cp.removeKind, exileCreature: cp.exileCreature, legendReduce: /this ability costs \{1\} less to activate for each legendary creature you control/.test(m[2]), onlyYourTurn: /activate only during your turn/.test(m[2]), cost: cp.cost, tap: cp.tap, sacSelf: cp.sacSelf, exileSelf: cp.exileSelf, discardSelf: cp.discardSelf, life: cp.life, exileOthers: cp.exileOthers, discard: cp.discard, sacOther: cp.sacOther, speed: instantSpeed(l) ? 'instant' : 'sorcery', ops, text: m[2] });
    }
  }
  tagStatic(card, lines);
  if (card.__lateS) Object.assign(card.statics, card.__lateS); if (card.__lateR) card.reducers.push(...card.__lateR); if (card.__lateA) card.anthems.push(...card.__lateA); if (card.__lateE) card.equip = card.__lateE;
  tagModes(card, lines);
  if (/\bSaga\b/.test(card.type)) {
    const R = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6 }; const ch = [];
    for (const l of lines) { const m = l.match(/^((?:i|ii|iii|iv|v|vi)(?:, (?:i|ii|iii|iv|v|vi))*) — (.+)$/); if (!m) continue;
      const nums = m[1].split(', ').map(x => R[x]); const g = m[2].match(/^this card gains "(.+)"\.?$/);
      ch.push({ nums, text: m[2], ops: g ? [{ op: 'gainText', text: g[1].replace(/'/g, '"') }] : parseOps(m[2]) }); }
    if (ch.length) card.saga = { ch, last: Math.max(...ch.flatMap(x => x.nums)) };
  }
  // Teysa Karlov-style: death triggers of your permanents trigger twice
  card.doublesDeath = /dying causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time/.test(txt);
  return card;
}

/** "{T}: Add ..." -> {amount, colors}. colors 'C' = colourless only. Only plain {T} costs (no filters / sac outlets). */
function parseManaAbility(o) {
  o = o.replace(/(^|\n)(metalcraft|vivid|imprint|hellbent|threshold) — /g, '$1');
  const all = [...o.matchAll(/(?:^|\n)\{t\}(?:, pay \d+ life)?: add ([^.\n]+)/g)].map(m => parseManaText(m[1])).filter(Boolean);
  if (/^\{t\}: add one mana of any of the exiled card's colors/m.test(o)) all.push({ amount: 1, colors: ['W', 'U', 'B', 'R', 'G'] });
  if (/for each color among permanents you control, add one mana of that color/.test(o)) all.push({ amount: 1, colors: ['W', 'U', 'B', 'R', 'G'] });
  if (/^multikicker \{2\}/m.test(o) && /enters with a charge counter on it for each time it was kicked/.test(o)) all.push({ amount: 1, colors: ['C'] });
  for (const m of o.matchAll(/(?:^|\n)\{t\}, sacrifice this (?:artifact|creature|card): add ([^.\n]+)/g)) { const x = parseManaText(m[1]); if (x) all.push({ ...x, sac: true }); }
  for (const m of o.matchAll(/whenever enchanted (?:land|forest) is tapped for mana, its controller adds an additional ([^.\n]+)/g)) { const x = parseManaText(m[1].replace(/one mana of the chosen color/, 'one mana of any color')); if (x) all.push(x); }
  // filter mana (Signets): "{1}, {T}: Add {U}{B}" nets one mana of either colour
  for (const m of o.matchAll(/(?:^|\n)\{(\d)\}, \{t\}: add ([^.\n]+)/g)) { const x = parseManaText(m[2]); if (x && x.amount - +m[1] >= 1) all.push({ amount: x.amount - +m[1], colors: x.colors }); }
  // dynamic mana: X = power / greatest power / enchantments / colours among permanents ...
  const dyn = /\{t\}: add x mana of any one color, where x is this creature's power/.test(o) ? 'power'
    : /\{g\}, \{t\}: add x mana in any combination of colors, where x is the greatest power among creatures you control/.test(o) ? 'greatestPowerG'
    : /\{t\}: add x mana of any one color, where x is the number of enchantments you control/.test(o) ? 'enchantments'
    : /for each color among permanents you control, add one mana of that color/.test(o) ? 'colors'
    : /add one mana of any type that a land you control could produce\. if this creature has a \+1\/\+1 counter on it, add three mana/.test(o) ? 'incubation'
    : /ferocious — \{t\}: add \{g\}\{g\}\{g\}\{g\}/.test(o) ? 'ferocious'
    : /\{t\}: add four mana of the chosen color\. spend this mana only to cast monocolored spells of that color/.test(o) ? 'throne'
    : /\{t\}: add \{c\} for each charge counter on this artifact/.test(o) ? 'charge'
    : /\{t\}: add one mana of the chosen color/.test(o) ? 'chosenColor' : null;
  if (dyn) return { amount: 1, colors: dyn === 'ferocious' ? ['G'] : dyn === 'charge' ? ['C'] : ALLC.slice(), dyn };
  if (/^\{t\}, tap an untapped creature you control: add one mana of any color/m.test(o)) return { amount: 1, colors: ALLC.slice(), needCreature: true };
  if (/^discard your hand, sacrifice this artifact: add three mana of any one color/m.test(o)) return { amount: 3, colors: ALLC.slice(), led: true };
  if (!all.length) return null;
  return { amount: Math.max(...all.map(x => x.amount)), colors: [...new Set(all.flatMap(x => x.colors))].sort((a, b) => (a === 'C') - (b === 'C')), sac: all.every(x => x.sac) || undefined };
}
handles(/^\{t\}: add x mana|^\{g\}, \{t\}: add x mana|for each color among permanents you control, add one mana|^\{t\}: add one mana of any type that a land you control could produce|^ferocious — \{t\}: add|^\{t\}: add four mana of the chosen color|^\{t\}: add \{c\} for each charge counter|^\{t\}: add one mana of the chosen color|^\{t\}, tap an untapped creature you control: add|^discard your hand, sacrifice this artifact: add three mana/,
  /^exile this card from your hand: add \{[wubrgc]\}/, /^sacrifice a creature: add/, /^tap an untapped (legendary creature|artifact) you control: add/,
  /^\{t\}: add \{c\}\. if .* has a luck counter on it, instead add one mana of any color/, /^\{2\}, \{t\}: choose a color\. add an amount of mana of that color equal to/,
  /^\{t\}: add \{g\} for each creature you control/, /^12\+ \| \{g\}, \{t\}: add \{g\} for each creature you control/, /^\{2\}\{g\}\{g\}, \{t\}: add six \{g\}/,
  /^\{1\}, \{t\}: add one mana of any color\.?$/, /^whenever you tap this land for mana, target opponent creates a 1\/1/, /^when you play another land, sacrifice this land/,
  /^untap this artifact during each other player's untap step/, /^(whenever you tap a permanent for \{c\}|whenever a land's ability causes you to add one or more mana of the chosen color|whenever you tap a creature for mana), add an additional/,
  /^until end of turn, whenever a player taps an island for mana, that player adds an additional \{u\}/, /^as .* enters, choose a colou?r\.?$/, /^creatures you control of the chosen color get/,
  /^this land enters tapped unless it's your first, second, or third turn of the game/, /^add \{[wubrgc]\}(\{[wubrgc]\})*\.?$/, /^whenever you cast a spell, add \{r\}\. until end of turn/,
  /^at the beginning of your first main phase, add \{b\} for each charge counter/, /^landfall — whenever a land you control enters, add one mana of any color/);
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
/** keywords a card has itself: lines made only of keywords ("Flying, haste"), not reminder text or granted abilities */
function kwLines(o) {
  const out = [];
  for (const raw of o.split('\n')) { const l = raw.replace(/\([^)]*\)/g, '').trim().replace(/\.$/, ''); if (!l) continue; const parts = l.split(/,\s*|\s+and\s+/); if (parts.every(p => KW.includes(p.trim()) || /^(ward \{\d+\}|protection from [a-z]+|(swamp|island|forest|mountain|plains)walk|toxic \d+)$/.test(p.trim()))) for (const p of parts) if (KW.includes(p.trim())) out.push(p.trim()); }
  if (/^this card can't be blocked\.?$/m.test(o)) out.push('unblockable');
  return out;
}
function tagCard(c) {
  const t = c.type || '';
  // Classes: only level 1 text is active until the class levels up
  let parseOracle = null, classLevels = null, saga = null;
  if (/\bClass\b/.test(t.split(' // ')[0])) {
    const L = (c.oracle || '').split('\n'); const idx = L.findIndex(l => /^\{[^}]+\}(\{[^}]+\})*: Level \d/.test(l));
    if (idx > 0) { parseOracle = L.slice(0, idx).join('\n'); classLevels = [];
      let cur = null; for (const l of L.slice(idx)) { const m = l.match(/^((?:\{[^}]+\})+): Level (\d)/); if (m) { cur = { k: +m[2], cost: manaInfo(m[1]), lines: [] }; classLevels.push(cur); } else if (cur) cur.lines.push(l); } }
  }
  const o = (parseOracle != null ? parseOracle : (c.oracle || '')).split('\n//\n')[0].toLowerCase();
  const front = t.split(' // ')[0];
  const isLand = /\bLand\b/.test(front);
  const card = {
    uid: UID++, name: c.name, type: front, oracle: c.oracle || '', cmc: isLand ? 0 : (c.cmc || 0), manaCost: c.mana || '', mana: manaInfo(c.mana),
    img: c.img || '', isLand, isCreature: /\bCreature\b/.test(front), isInstant: /\bInstant\b/.test(front), isSorcery: /\bSorcery\b/.test(front),
    isArtifact: /\bArtifact\b/.test(front), isEnchantment: /\bEnchantment\b/.test(front), isPlaneswalker: /\bPlaneswalker\b/.test(front),
    isLegendary: /\bLegendary\b/.test(front),
    power: parseInt(c.power) || (c.power === '*' ? 2 : 0), toughness: parseInt(c.toughness) || (c.toughness === '*' ? 2 : 0),
    kw: kwLines(o).concat((c.keywords || []).map(k => k.toLowerCase()).filter(k => KW.includes(k))).filter((k, i, a) => a.indexOf(k) === i),
    roles: [], produces: [],
  };
  card.colors = Object.entries(card.mana.pips).filter(([, n]) => n > 0).map(([k]) => k);
  if (parseOracle != null) card.parseOracle = parseOracle;
  if (classLevels) card.classLevels = classLevels;
  card.__classLevels = classLevels;
  card.xCount = ((c.mana || '').match(/\{X\}/g) || []).length;
  card.flash = card.isInstant || card.kw.includes('flash');
  if (isLand) {
    // fetchlands: "{T}, Pay 1 life, Sacrifice: Search your library for a Plains or Swamp card, put it onto the battlefield"
    const fm = /\{t\}[^:\n]*sacrifice[^:\n]*: search your library for [^.]*(land|plains|island|swamp|mountain|forest)/.test(o) && o.match(/search your library for (a|an|up to two) ([a-z ,]+?) cards?/);
    if (fm) {
      const q = fm[2];
      card.fetch = {
        types: ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'].filter(t => q.includes(t.toLowerCase())),
        basic: /basic land/.test(q), count: fm[1] === 'up to two' ? 2 : 1,
        life: +((o.match(/pay (\d+) life/) || [])[1] || 0), generic: +((o.match(/\{(\d+)\}, \{t\}, sacrifice/) || [])[1] || 0),
        tapped: /onto the battlefield tapped/.test(o), untapIf4: /four or more lands, untap/.test(o),
      };
      { const pm = o.match(/((?:\{[\dwubrg]\})+), \{t\}, sacrifice/); if (pm) { const pips = { W: 0, U: 0, B: 0, R: 0, G: 0 }; let gen = 0; for (const s of pm[1].match(/\{([\dwubrg])\}/g)) { const k = s[1]; if (/\d/.test(k)) gen += +k; else pips[k.toUpperCase()]++; } card.fetch.generic = gen; card.fetch.pips = pips; } }
      if (/^land$/.test(q.trim())) card.fetch.any = true;
      if (/that share a land type/.test(o)) card.fetch.shareType = true;
      { const km = o.match(/search your library for an? (plains|island|swamp|mountain|forest) card and an? (plains|island|swamp|mountain|forest) card/); if (km) { card.fetch.pair = [km[1], km[2]].map(s => s[0].toUpperCase() + s.slice(1)); card.fetch.types = card.fetch.pair; card.fetch.count = 2; } }
      card.produces = /^\{t\}: add \{c\}/m.test(o) ? ['C'] : []; card.etbTapped = /^this land enters tapped/m.test(o) || (/enters (the battlefield )?tapped/.test(o) && !/search your library/.test(o.split('enters')[0] || ''));
      tagAbilities(card);
      return card;
    }
    for (const col of 'WUBRG') if (new RegExp('add \\{' + col + '\\}|\\{t\\}: add \\{[^}]*' + col, 'i').test(o) || new RegExp('\\b' + { W: 'plains', U: 'island', B: 'swamp', R: 'mountain', G: 'forest' }[col] + '\\b', 'i').test(front)) card.produces.push(col);
    if (/add one mana of any color|mana of any (one )?color|any type/i.test(o) || /command tower|mana confluence|city of brass|exotic orchard|reflecting pool|forbidden orchard|gemstone caverns|path of ancestry/i.test(c.name)) card.produces = ['W', 'U', 'B', 'R', 'G'];
    if (!card.produces.length) card.produces = ['C'];
    { const ma = parseManaAbility(o.split('\n//\n')[0]); card.manaAmount = ma ? ma.amount : 1; }
    tagLandEntry(card, o); tagGyHate(card, o); tagAbilities(card); tagFlags(card, c, o, true);
    if (card.saga) { const sv = card.saga; card.saga = sv; }
    return card;
  }
  const r = card.roles;
  tagTutor(card, o); tagReanimate(card, o); tagGyHate(card, o);
  if (/add \{|add (one|two|three) mana|search your library for (up to \w+ )?(a )?basic land|lands? onto the battlefield|treasure token/.test(o)) r.push('ramp');
  if (/draw (a|two|three|x|\d+) cards?|draw cards|investigate|clue token/.test(o)) r.push('draw');
  const ow = o.replace(/exile all (cards from )?(all )?graveyards?|exile all cards from [a-z' ]*graveyards?/g, '');
  if (/destroy all (creatures|nonland|permanents|artifacts and creatures)|exile all (creatures|nonland|other)|(each creature|all creatures|all other creatures) gets? -\d|deals? \d+ damage to each (creature|other creature|nonland)|return all nonland permanents to their owners/.test(ow)) r.push('wipe');
  else if (/destroy (?:another |up to one )?target|exile target (creature|permanent|nonland|artifact|enchantment)|deals? \d+ damage to (any target|target creature)|fight|target creature gets -\d\/-\d|return target (creature|nonland permanent)( you don't control| an opponent controls)? to its owner|shuffles it into (its|their) library|on the bottom of (its|their) owner's library/.test(o)) r.push('removal');
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
  if (/all creatures get -x\/-x until end of turn/.test(o) && !r.includes('wipe')) r.push('wipe');
  if (/hexproof|indestructible|protection|phase out/.test(o) && (card.isInstant || card.isEnchantment || card.isArtifact)) r.push('protect');
  if (/gain \w+ life|lifelink/.test(o)) r.push('lifegain');
  if (/you win the game|loses the game|infinite/.test(o)) r.push('wincon');
  if (card.isCreature && /whenever|at the beginning/.test(o)) r.push('engine');
  if (!card.isCreature && (card.isArtifact || card.isEnchantment) && /whenever|at the beginning/.test(o) && !r.includes('ramp')) r.push('engine');
  tagAbilities(card);
  card.pop = POP.get(card.name.toLowerCase()) || 0;
  if (!isLand) card.manaAb = card.grandSummon ? { amount: 1, colors: ['W', 'U', 'B', 'R', 'G'] } : parseManaAbility(o);
  if (card.castSelfOps && card.castSelfOps.some(x => x.op === 'tutorTopColorless7')) card.tutor = null;
  // numbers applied when the card resolves: spells use their text minus triggered/activated lines; permanents use etbOps instead
  const isPerm = card.isCreature || card.isArtifact || card.isEnchantment || card.isPlaneswalker;
  const res = isPerm ? '' : o.split('\n').filter(l => !/^(at the beginning(?! of your next upkeep)|whenever|when )/.test(l) && !/^[^:"]+: /.test(l) && !/^(flashback|cycling|escape|jump-start|addendum)/.test(l)).join('\n');
  card.freeCmd = /if you control a commander, you may cast this spell without paying its mana cost/.test(o);
  card.uncounterable = /this spell can't be countered/.test(o);
  card.redirect = /change the target of target spell|choose new targets for target spell|change the target of target (instant|sorcery)/.test(o);
  if (card.redirect && !r.includes('redirect')) r.push('redirect');
  const tokN = res.match(/create (a|an|two|three|four|\d+) (?:tapped )?(?:\d+\/\d+|[a-z ]*creature token)/); card.tokenCount = tokN ? (NUM[tokN[1]] || parseInt(tokN[1]) || 1) : 0;
  const drawN = res.match(/draw (a|two|three|four|five|six|seven|\d+) cards?/); card.drawN = drawN ? (NUM[drawN[1]] || parseInt(drawN[1]) || 1) : 0;
  card.spellOps = isPerm ? null : (/^threshold — return that card from your graveyard to the battlefield instead if there are seven or more cards in your graveyard/m.test(o) ? [{ op: 'gyToHand', n: 1, filter: 'creature', thresholdBf: 7 }] : parseOps(res)).filter(op => !((op.op === 'destroy' && r.includes('removal')) || (op.op === 'destroyAll' && op.how === 'destroy' && r.includes('wipe') && /creature/.test(op.what || '')) || (op.op === 'damage' && card.dmg) || (op.op === 'draw' && card.drawN) || (op.op === 'gain' && card.gainN) || (op.op === 'tokens' && card.tokenCount) || (op.op === 'landToBf' && r.includes('ramp')) || (op.op === 'pumpAll' && r.includes('pump')) || (op.op === 'extraCombat' && r.includes('extracombat')) || (op.op === 'bounceTarget' && r.includes('removal')) || (op.op === 'lose' && !/loses? \d+ life/.test(res)) || (op.op === 'note' && /goad/.test(op.text || '')) || (op.op === 'gyToBf' && card.reanimate) || (op.op === 'tutorTo' && card.tutor)));
  if (card.spellOps && !card.spellOps.length) card.spellOps = null;
  if (card.spellOpsX) card.spellOps = card.spellOpsX;
  const tokPT = o.match(/(\d+)\/(\d+) [a-z ]*creature token/); card.tokenPT = tokPT ? [+tokPT[1], +tokPT[2]] : [1, 1];
  const dmg = res.match(/deals? (\d+) damage/); card.dmg = dmg ? +dmg[1] : 0;
  const pump = o.match(/get \+(\d+)\/\+(\d+)/); card.pumpN = pump ? +pump[1] : 0;
  const gain = res.match(/gain (\d+) life/); card.gainN = gain ? +gain[1] : 0;
  tagFlags(card, c, o, isLand);
  tagCastOptions(card, c, o);
  if (card.__classLevels) { for (const x of card.__classLevels) card.abilities.push({ zone: 'battlefield', label: 'level ' + x.k, cost: x.cost, speed: 'sorcery', ops: [{ op: 'levelUp', k: x.k }], levelReq: x.k - 1 }); delete card.__classLevels; }
  card.startLoyalty = parseInt(c.loyalty) || (card.isPlaneswalker ? Math.max(3, Math.min(6, Math.round(card.cmc) || 4)) : 0);
  if (card.statics && card.statics.auraNeutralize && !r.includes('removal')) r.push('removal');
  // modal double-faced cards with a land back (Spikefield Hazard, Shatterskull Smashing...)
  const faces = t.split(' // ');
  if (faces.length > 1 && !/ \/\/ /.test(c.mana || '')) {
    const backText = (c.oracle || '').split('\n//\n')[1] || '';
    const back = tagCard({ name: c.name.split(' // ')[1] || c.name, type: faces[1], oracle: backText, cmc: 0, img: c.img, power: c.power2, toughness: c.toughness2 });
    back.orig = card;
    if (/transforms from/i.test(backText) || /\btransform\b/i.test((c.oracle || '').split('\n//\n')[0])) card.backFace = back;
    else if (/\bLand\b/.test(faces[1]) && !isLand) card.backLand = back;
    else card.backFace = back;
  }
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
  if (h === 'targetsMine') return true;
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
  /** cards that just reached a graveyard (any way) */
  watchGraveyards() {
    for (const q of this.players) {
      const n0 = q._gyLen || 0; if (q.graveyard.length < n0) { q._gyLen = q.graveyard.length; continue; }
      if (q.graveyard.length === n0) continue;
      const fresh = q.graveyard.slice(n0);
      for (const c of fresh) {
        if (c.eldrazi && q.graveyard.includes(c)) { if (c.eldrazi === 'self') { q.graveyard.splice(q.graveyard.indexOf(c), 1); q.library.splice(Math.floor(this.rng() * (q.library.length + 1)), 0, c); } else { q.library.push(...q.graveyard); q.graveyard = []; } shuffle(q.library, this.rng); this.say(`— ${c.name}: shuffled into the library`, q); }
      }
      if (this.opponentsOf(q).some(o => o.battlefield.some(b => b.card.statics && b.card.statics.dauthi && !b.neutral))) for (const c of fresh) { const i = q.graveyard.indexOf(c); if (i >= 0 && !c.token) { q.graveyard.splice(i, 1); c.voidCounter = true; q.exile.push(c); } }
      const lands = fresh.filter(c => c.isLand && q.graveyard.includes(c)).length;
      if (lands) for (const b of q.battlefield.filter(b => b.card.gitrog && !b.neutral)) (this.pendingDraw = this.pendingDraw || []).push([q, b.card.gitrog, b]);
      for (const o of this.opponentsOf(q)) for (const b of o.battlefield.filter(b => b.card.bloodchief && (b.quest || 0) >= 3 && !b.neutral)) for (let k = 0; k < fresh.length; k++) (this.pendingDrainBC = this.pendingDrainBC || []).push([o, q, b.card]);
      q._gyLen = q.graveyard.length;
    }
    // cards leaving a graveyard, and cards exiled from a library or graveyard (Teval, Insidious Roots, Kheru Goldkeeper, Laelia)
    for (const q of this.players) {
      const gy = new Set(q.graveyard.map(c => c.uid)), lib = new Set(q.library.map(c => c.uid)), ex = new Set(q.exile.map(c => c.uid));
      if (q._gySet) {
        const left = [...q._gySet.keys()].filter(u => !gy.has(u)).map(u => q._gySet.get(u));
        const exiled = q.exile.filter(c => !q._exSet.has(c.uid) && (q._libSet.has(c.uid) || q._gySet.has(c.uid)));
        for (const b of q.battlefield) { if (b.neutral) continue; for (const tr of b.card.triggers || []) {
          if (tr.when === 'gyLeave' && left.length && (!tr.creatureOnly || left.some(c => c.isCreature)) && (!tr.yourTurn || this.players[this.active] === q)) (this.pendingGen = this.pendingGen || []).push([q, tr.ops, b, {}, `${b.card.name}: cards left the graveyard`]);
          if (tr.when === 'exiledLG' && exiled.length) (this.pendingGen = this.pendingGen || []).push([q, tr.ops, b, {}, `${b.card.name}: cards exiled from library/graveyard`]); } }
      }
      q._gySet = new Map(q.graveyard.map(c => [c.uid, c])); q._libSet = lib; q._exSet = ex;
    }
  }
  /** cards milled into q's graveyard from their library (Colossal Grave-Reaver, Hedge Shredder) */
  milledHook(q, cards) {
    const inGy = cards.filter(c => q.graveyard.includes(c)); if (!inGy.length) return;
    for (const b of q.battlefield) { if (b.neutral) continue; for (const tr of b.card.triggers || []) if (tr.when === 'milled' && inGy.some(c => tr.what === 'creature' ? c.isCreature : c.isLand)) (this.pendingGen = this.pendingGen || []).push([q, tr.ops, b, { milled: inGy }, `${b.card.name}: cards milled`]); }
  }
  async emit(e) { if ((this.emits = (this.emits || 0) + 1) > 60000) throw new Error('game stalled (too many actions): ' + e.type); this.refreshStatics(); if (e.type === 'mill' && e.p && e.cards) this.milledHook(e.p, e.cards); this.watchGraveyards(); if (!this.flushing && ((this.pendingDraw && this.pendingDraw.length) || (this.pendingDrainBC && this.pendingDrainBC.length) || (this.pendingGen && this.pendingGen.length))) await this.flushPending(); if (this.hooks.emit) await this.hooks.emit(e, this); if (!this.flushing && ((this.pendingLife && this.pendingLife.length) || (this.pendingSac && this.pendingSac.length) || (this.pendingTok && this.pendingTok.length))) await this.flushPending(); }
  /** apply anthems / lords / equipment: per-creature static pump (b.spump) and granted keywords (card.kw = base + grants) */
  refreshStatics() {
    // auras whose creature left go to the graveyard; equipment just falls off
    const allPerms = this.players.flatMap(q => q.battlefield);
    const ids = new Set(allPerms.map(b => b.id));
    for (const q of this.players) for (const b of [...q.battlefield]) if (b.attachedTo != null && !ids.has(b.attachedTo)) { if (b.card.statics && b.card.statics.enchant && !/player/.test(b.card.statics.enchant)) { q.battlefield.splice(q.battlefield.indexOf(b), 1); if (b.bestowed) { b.attachedTo = null; b.bestowed = false; q.battlefield.push(b); continue; } if (!b.card.token) (b.card.rancor ? q.hand : q.graveyard).push(b.card.orig || b.card); this.say(`— ${b.card.name} ${b.card.rancor ? 'returns to hand' : 'goes to the graveyard'} (enchanted creature left)`, q); } else b.attachedTo = null; }
    const auras = allPerms.filter(b => b.attachedTo != null && b.card.statics && (b.card.statics.auraBuff || b.card.statics.auraNeutralize));
    for (const b of allPerms) {
      const ns = auras.filter(a => a.attachedTo === b.id && a.card.statics.auraNeutralize);
      const n = ns.find(a => a.card.statics.auraNeutralize !== 'pacify');
      b.pacified = ns.length > 0;
      b.neutral = n ? (Array.isArray(n.card.statics.auraNeutralize) ? n.card.statics.auraNeutralize.map(Number) : n.card.statics.auraNeutralize === 'land' ? 'land' : [0, 1]) : null;
    }
    // devotion gods (Purphoros, Heliod) are creatures only with enough devotion; city's blessing; temporary changes ending
    for (const p of this.players) {
      if (!p.blessing && p.battlefield.some(b => b.card.statics && b.card.statics.ascend) && p.battlefield.length >= 10) p.blessing = true;
      for (const b of p.battlefield) {
        const S = b.card.statics || (b.devoBase && b.devoBase.statics) || {};
        if (S.devotionCreature) { if (!b.devoBase) b.devoBase = b.card; const want = this.devotion(p, S.devotionCreature) >= 5; const cur = b.card.isCreature; if (want !== cur) b.card = want ? b.devoBase : (b.devoNon || (b.devoNon = { ...b.devoBase, isCreature: false, orig: b.devoBase.orig || b.devoBase })); }
        if (b.animTurn != null && b.animTurn !== this.turn && b.animBase) { b.card = b.animBase; b.animBase = null; b.animTurn = null; }
        if (b.revertTurn != null && b.revertTurn !== this.turn && b.revertCard) { b.card = b.revertCard; b.revertCard = null; b.revertTurn = null; }
      }
    }
    for (const p of this.players) {
      const anth = p.battlefield.filter(b => b.card.anthems && b.card.anthems.length && !b.neutral);
      const shrink = this.players.filter(q => q !== p && !q.dead).flatMap(q => q.battlefield).filter(b => b.card.statics && b.card.statics.oppShrink && !b.neutral).reduce((s, b) => [s[0] + b.card.statics.oppShrink[0], s[1] + b.card.statics.oppShrink[1]], [0, 0]);
      const equips = p.battlefield.filter(b => b.card.equip && b.attachedTo != null);
      for (const b of p.battlefield) {
        const c = b.card; if (!c.isCreature) continue;
        if (!c.kwBase) c.kwBase = (c.kw || []).slice();
        let pp = 0, tt = 0; const kws = new Set(c.kwBase);
        for (const a of anth) for (const an of a.card.anthems) { if (an.other && a === b) continue; if (!matchesFilter(c, an.filter)) continue; pp += an.pump[0]; tt += an.pump[1]; an.kws.forEach(k => kws.add(k)); }
        for (const e of equips) if (e.attachedTo === b.id) { pp += e.card.equip.pump[0]; tt += e.card.equip.pump[1]; e.card.equip.kws.forEach(k => kws.add(k)); }
        for (const a of auras) if (a.attachedTo === b.id && a.card.statics.auraBuff) { pp += a.card.statics.auraBuff.pump[0]; tt += a.card.statics.auraBuff.pump[1]; a.card.statics.auraBuff.kws.forEach(k => kws.add(k)); }
        if (p.kwEOT) p.kwEOT.forEach(k => kws.add(k));
        for (const x of p.battlefield) if (x.card.colorAnthem && x.chosenColor && (c.colors || []).includes(x.chosenColor) && !x.neutral) { pp += x.card.colorAnthem[0]; tt += x.card.colorAnthem[1]; }
        pp -= shrink[0]; tt -= shrink[1];
        const sp = c.statics && c.statics.selfPump; if (sp && sp.per === 'gyCreature') { const k = p.graveyard.filter(x => x.isCreature).length; pp += sp.p * k; tt += sp.t * k; } else if (sp && sp.per === 'color') { const k = this.colorsAmong(p); pp += sp.p * k; tt += sp.t * k; } else if (sp) { const k = p.battlefield.filter(x => sp.per === 'artifact' ? x.card.isArtifact : sp.per === 'land' ? x.card.isLand : sp.per === 'enchantment' ? x.card.isEnchantment : sp.per === 'other creature' ? x.card.isCreature && x !== b : x.card.isCreature).length; pp += sp.p * k; tt += sp.t * k; }
        // keywords / P/T from card-specific statics
        if (b.kwTurn === this.turn && b.kwT) b.kwT.forEach(k => kws.add(k));
        if (b.kwPerm) b.kwPerm.forEach(k => kws.add(k));
        for (const e of p.emblems || []) { pp += e.pump[0]; tt += e.pump[1]; e.kws.forEach(k => kws.add(k)); }
        { const S4 = c.statics || {}; if (S4.condHaste && this.opponentsOf(p).some(q => q.life <= 10)) kws.add('haste'); if (S4.ascendant && p.life >= 30) { pp += 5; tt += 5; kws.add('flying'); } }
        b.equipWard = 0; b.cleaver = false;
        for (const e of equips) if (e.attachedTo === b.id) { const eq = e.card.equip; if (eq.loses) eq.loses.forEach(k => kws.delete(k)); if (eq.legendHexproof && c.isLegendary) kws.add('hexproof'); if (eq.ward) b.equipWard = eq.ward; if (eq.cleaver) b.cleaver = true; }
        if (b.indestructibleTurn === this.turn || b.indestructibleCounter) kws.add('indestructible');
        for (const x of p.battlefield) { const S2 = x.card.statics; if (!S2 || x.neutral) continue;
          if (S2.beastmaster && (x.quest || 0) >= 7) { pp += 5; tt += 5; }
          if (S2.moraug && b.attackTurn === this.turn) pp += b.attacksThisTurn || 0;
          if (S2.maskwood) c.maskwood = true;
          if (S2.wardLifeOthers && x !== b) b.wardLife = S2.wardLifeOthers; }
        const S3 = c.statics || {};
        if (S3.ptEqual) { const n = S3.ptEqual.what === 'creatures you control' ? p.battlefield.filter(x => x.card.isCreature).length : p.hand.length; pp += n - (c.power || 0); if (S3.ptEqual.both) tt += n - (c.toughness || 0); }
        if (S3.fsYourTurn && this.players[this.active] === p) kws.add('first strike');
        for (const e of equips) if (e.attachedTo === b.id && e.card.equip.perLand) { const n = p.battlefield.filter(x => x.card.isLand).length - 1; pp += e.card.equip.pump[0] * n; tt += e.card.equip.pump[1] * n; }
        b.protColors = null;
        for (const e of equips) if (e.attachedTo === b.id && e.card.equip.protNonIdentity) { const id = new Set(p.command.concat(p.battlefield.filter(x => x.card.isCommander).map(x => x.card)).flatMap(x => x.colors || [])); b.protColors = ALLC.filter(x => !id.has(x)); }
        if (b.protColor && b.protColor.turn === this.turn) b.protColors = [...(b.protColors || []), b.protColor.c];
        if (S3.protFrom) b.protColors = [...(b.protColors || []), S3.protFrom];
        if (p.stripTurn && p.stripTurn.turn === this.turn) { kws.delete('hexproof'); kws.delete('shroud'); if (p.stripTurn.ind) kws.delete('indestructible'); }
        if (b.neutral) kws.clear();
        if (p.stripTurn && p.stripTurn.turn === this.turn) { kws.delete('hexproof'); kws.delete('shroud'); if (p.stripTurn.ind) kws.delete('indestructible'); }
        if (kws.has('shroud')) kws.add('hexproof');
        b.spump = [pp, tt]; c.kw = [...kws];
      }
    }
  }
  /** loop guard: at most 250 triggered abilities resolve per turn (stops token / death-trigger loops) */
  trigOk() { if (this.trigBudget == null) this.trigBudget = 250; if (this.trigBudget-- > 0) return true; if (!this.trigWarned) { this.trigWarned = true; this.say('— trigger limit reached this turn (loop stopped)'); } return false; }
  landLimit(p) { return 1 + (p.extraLandsTurn || 0) + p.battlefield.reduce((s, b) => s + (b.card.extraLands || 0), 0); }
  say(msg, p) { const line = (p ? p.name + ': ' : '') + msg; this.log.push({ t: this.turn, m: line }); if (this.hooks.log) this.hooks.log(line); }
  alive() { return this.players.filter(p => !p.dead); }
  opponentsOf(p) { return this.alive().filter(q => q !== p); }
  /** players in turn order starting after `p` */
  after(p) { const out = []; const n = this.players.length; for (let k = 1; k < n; k++) { const q = this.players[(p.i + k) % n]; if (!q.dead) out.push(q); } return out; }
  drawSilent(p, n) { for (let k = 0; k < n; k++) { if (!p.library.length) { p.deckedOut = true; return; } p.hand.push(p.library.pop()); } }
  async draw(p, n = 1) {
    let drawn = 0;
    if (p.drawTurn !== this.turn) { p.drawTurn = this.turn; p.drawsThisTurn = 0; }
    if (p.battlefield.some(b => b.card.statics && b.card.statics.teferiInsight && !b.neutral)) { const firstInStep = this.phase === 'draw' && this.players[this.active] === p && !p.drawsThisTurn; n = firstInStep ? 1 + (n - 1) * 2 : n * 2; }
    if (this.opponentsOf(p).some(o => o.battlefield.some(b => b.card.statics && b.card.statics.narset && !b.neutral))) { n = Math.max(0, Math.min(n, 1 - (p.drawsThisTurn || 0))); if (!n) { this.say('— can\'t draw more than one card this turn (Narset)', p); return; } }
    for (let k = 0; k < n; k++) {
      const dr = p.graveyard.find(c => c.dredge && p.library.length >= c.dredge);
      if (dr && (p.ai ? p.ai.wantsDredge(this, p, dr) : (this.hooks.humanMay && await this.hooks.humanMay({ p, card: dr, question: `dredge ${dr.dredge} instead of drawing (mill ${dr.dredge}, return it to hand)?` })))) { const m = p.library.splice(-dr.dredge); p.graveyard.push(...m); p.graveyard.splice(p.graveyard.indexOf(dr), 1); p.hand.push(dr); this.say(`— dredges ${dr.name}`, p); continue; }
      if (!p.library.length) {
        if (p.battlefield.some(b => b.card.statics && b.card.statics.labMan && !b.neutral)) { this.say(`— draws from an empty library and wins instead`, p); for (const q of this.opponentsOf(p)) await this.kill(q, `${p.name}'s win-instead effect`); return; }
        await this.kill(p, 'drew from an empty library'); return;
      }
      p.hand.push(p.library.pop()); drawn++;
    }
    p.drawsThisTurn += drawn;
    await this.emit({ type: 'draw', p, n });
    if (drawn) await this.drawTriggers(p, drawn);
  }
  async drawTriggers(p, n) {
    for (const b of p.battlefield.filter(x => !x.neutral)) for (const tr of b.card.triggers || []) if (tr.when === 'youDraw') for (let k = 0; k < n && !p.dead && this.trigOk(); k++) await this.runTrig(p, b, tr, {});
    for (const q of this.opponentsOf(p)) for (const b of q.battlefield.filter(x => !x.neutral)) for (const tr of b.card.triggers || []) {
      if (tr.when !== 'oppDraw' || (tr.notTheirTurn && this.players[this.active] === p)) continue;
      let times = n;
      if (tr.second) { const before = (p.drawsThisTurn || 0) - n; if (!(before < 2 && before + n >= 2)) continue; times = 1; }
      if (tr.exceptFirst && this.players[this.active] === p && this.phase === 'draw') times = Math.max(0, n - 1); if (tr.oncePerTurn) { if (b.trigTurn === this.turn) continue; b.trigTurn = this.turn; times = 1; }
      for (let k = 0; k < times && !p.dead && !q.dead && this.trigOk(); k++) {
        if (tr.tax && await this.payTax(p, b.card, tr.tax, `${b.card.name}: pay {${tr.tax}}, or ${q.name} ${tr.ops[0].op === 'artifactTokens' ? 'creates a Treasure' : 'gets the trigger'}?`)) continue;
        this.say(`— ${b.card.name} triggers (${p.name} drew)`, q); await this.emit({ type: 'trigger', p: q, card: b.card, perm: b });
        await this.runTrig(q, b, tr, { other: p });
      }
    }
  }
  async lifeTriggers(p, delta) {
    if (delta > 0) { p.gainedTurn = this.turn; for (const b of p.battlefield.filter(x => !x.neutral)) for (const tr of b.card.triggers || []) if (tr.when === 'lifeGain') { this.say(`— ${b.card.name} triggers (gained ${delta})`, p); await this.runTrig(p, b, tr, { x: delta }); } return; }
    if (p.lostTurn !== this.turn) { p.lostTurn = this.turn; p.lostThisTurn = 0; } p.lostThisTurn += -delta;
    if (!p.dead) for (const b of p.battlefield.filter(x => !x.neutral)) for (const tr of b.card.triggers || []) if (tr.when === 'youLoss') await this.runTrig(p, b, tr, { x: -delta });
    for (const q of this.opponentsOf(p)) for (const b of q.battlefield.filter(x => !x.neutral)) for (const tr of b.card.triggers || []) if (tr.when === 'oppLoss') { this.say(`— ${b.card.name} triggers (${p.name} lost ${-delta})`, q); await this.runTrig(q, b, tr, { x: -delta }); }
  }
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
    if (delta < 0) { const act = this.players[this.active]; if (act && act !== p && act.speedTurn !== this.turn && act.battlefield.some(b => b.card.statics && b.card.statics.engines) && (act.speed || 1) < 4) { act.speed = (act.speed || 1) + 1; act.speedTurn = this.turn; this.say(`— speed ${act.speed}${act.speed === 4 ? ' (max speed)' : ''}`, act); } }
    if (!delta || p.dead) return;
    if (p.lifeLockTurn === this.turn || p.battlefield.some(b => b.card.statics && b.card.statics.lifeLock && !b.neutral)) { this.say(`— ${p.name}'s life total can't change`); return; }
    if (delta < 0 && p.palmTurn === this.turn && source) { const c = this.cardController(source); if (c && c !== p) { p.palmTurn = null; this.say(`— Deflecting Palm prevents ${-delta} and deals it to ${c.name}`, p); await this.changeLife(c, delta, null); return; } }
    if (delta < 0 && p.prot && source) { const c = this.cardController(source); if (c && c !== p) { this.say(`— ${p.name} has protection: ${-delta} prevented`); return; } }
    if (delta > 0) for (const b of p.battlefield) if (b.card.statics && b.card.statics.gainMult && !b.neutral) delta *= 2;
    if (delta < 0) { const act = this.players[this.active]; if (act !== p && !act.dead && act.battlefield.some(b => b.card.statics && b.card.statics.lossMult && !b.neutral)) delta *= 2; }
    p.life += delta; await this.emit({ type: 'life', p, delta, source });
    if (p.life <= 0) await this.kill(p, 'ran out of life');
    await this.lifeTriggers(p, delta);
  }
  // ---------- mana ----------
  /** static effects on mana: Urborg/Yavimaya (every land), Chromatic Lantern / Prismatic Omen (yours), Cryptolith Rite (your creatures) */
  manaFlags(p) {
    const f = { grant: [], any: false, creature: false, bonus: [], artifactU: false, legendTap: false, cBonus: false, creatureBonus: false, chosenLand: [] };
    for (const q of this.players) for (const b of q.battlefield) { const S = b.card.statics, c = b.card; if (b.neutral) continue;
      if (q === p) { if (c.artifactU) f.artifactU = true; if (c.legendTap) f.legendTap = true; if (c.cBonus) f.cBonus = true; if (c.creatureBonus) f.creatureBonus = true; if (c.chosenLandBonus && b.chosenColor) f.chosenLand.push(b.chosenColor); }
      if (!S) continue;
      if (S.landBonus && (q === p || S.landBonus.all)) f.bonus.push(S.landBonus); if (S.landGrant) f.grant.push(S.landGrant); if (q === p && (S.lanternAll || S.allTypes)) f.any = true; if (q === p && S.creatureMana) f.creature = true; if (q === p && S.tokenMana) f.tokenCreature = true; if (q === p && S.landCBonus) f.landC = true; }
    if (this.highTideTurn === this.turn) f.bonus.push({ type: 'island', color: 'U' });
    if (p.battlefield.some(b => b.card.isLand && b.card.name === 'The World Tree' && !b.neutral) && p.battlefield.filter(b => b.card.isLand).length >= 6) f.any = true;
    return f;
  }
  /** untapped permanents that can make mana (kept for callers that want permanents) */
  manaSources(p) { return [...new Set(this.manaSrcs(p).filter(s => s.b).map(s => s.b))]; }
  devotion(p, col) { return p.battlefield.reduce((s, b) => s + (((b.card.mana || {}).pips || {})[col] || 0), 0); }
  colorsAmong(p) { return new Set(p.battlefield.flatMap(b => b.card.colors || [])).size; }
  landInfo(p, b, f, card) {
    const c = b.card; let colors = c.produces; if (f.any) colors = ALLC.slice(); else if (f.grant.length) colors = [...new Set([...colors, ...f.grant])];
    let amount = c.manaAmount || 1;
    if (c.landDyn === 'devotion') { const best = ALLC.map(x => [x, this.devotion(p, x)]).sort((a, z) => z[1] - a[1])[0]; if (best[1] - 2 > 1) { amount = best[1] - 2; colors = [best[0]]; } }
    else if (c.landDyn === 'chosenTypeCount') { const n = p.battlefield.filter(x => x.card.isCreature && b.chosenType && matchesFilter(x.card, b.chosenType)).length; if (n - 2 > 1) { amount = n - 2; colors = ALLC.slice(); } }
    else if (c.landDyn === 'creatures') amount = Math.max(1, p.battlefield.filter(x => x.card.isCreature).length);
    else if (c.landDyn === 'station') { if ((b.charge || 0) >= 12) amount = Math.max(1, p.battlefield.filter(x => x.card.isCreature).length - 1); }
    else if (c.landDyn === 'castle') { if (card && card.isCreature) amount = 2; }
    else if (c.landDyn === 'luck') { if (b.luck) colors = ALLC.slice(); }
    for (const lb of f.bonus) if (lb.type === 'land' || c.type.toLowerCase().includes(lb.type)) { amount++; if (lb.color && !colors.includes(lb.color)) colors = [...colors, lb.color]; }
    for (const col of f.chosenLand) if (colors.includes(col)) amount++;
    if (f.cBonus && colors.includes('C')) amount++;
    if (b.blight) { colors = ['C']; amount = 1; }
    if (c.urzaWorkshop && p.battlefield.filter(x => x.card.isArtifact).length >= 3) amount = Math.max(amount, p.battlefield.filter(x => x.card.isLand && /urza's/i.test(x.card.type)).length);
    if (c.maxSpeedCC && (p.speed || 0) >= 4) amount = Math.max(amount, 2);
    if (f.landC && colors.length === 1 && colors[0] === 'C') amount++;
    return { amount, colors };
  }
  dynInfo(p, b, ab, card) {
    const crs = p.battlefield.filter(x => x.card.isCreature);
    switch (ab.dyn) {
      case 'power': return { amount: Math.max(0, this.powerOf(p, b)), colors: ALLC.slice() };
      case 'greatestPowerG': return { amount: Math.max(0, Math.max(0, ...crs.map(x => this.powerOf(p, x))) - 1), colors: ALLC.slice() };
      case 'enchantments': return { amount: p.battlefield.filter(x => x.card.isEnchantment).length, colors: ALLC.slice() };
      case 'colors': return { amount: this.colorsAmong(p), colors: ALLC.slice() };
      case 'incubation': return { amount: (b.counters || 0) > 0 ? 3 : 1, colors: [...new Set(p.battlefield.filter(x => x.card.isLand).flatMap(x => x.card.produces))] };
      case 'ferocious': return { amount: crs.some(x => this.powerOf(p, x) >= 4) ? 4 : 1, colors: ['G'] };
      case 'throne': { const ok = card && card.colors && card.colors.length === 1 && card.colors[0] === b.chosenColor; return { amount: ok ? 4 : 0, colors: [b.chosenColor || 'C'] }; }
      case 'charge': return { amount: b.charge || 0, colors: ['C'] };
      case 'chosenColor': return { amount: 1, colors: [b.chosenColor || 'C'] };
    }
    return { amount: ab.amount, colors: ab.colors };
  }
  /** every way `p` could make mana right now, as plan-able sources */
  manaSrcs(p, cost = null) {
    const f = this.manaFlags(p), out = [], arts = p.battlefield.filter(b => b.card.isArtifact).length, card = cost && cost.card;
    (p.pool || []).forEach((m, i) => out.push({ kind: 'pool', idx: i, amount: 1, colors: m.c === 'A' ? ALLC.slice() : [m.c], pen: -2 }));
    const hasteAll = p.battlefield.some(b => /you may activate abilities of creatures you control as though those creatures had haste/.test(b.card.oracle.toLowerCase()));
    const used = new Set();
    for (const b of p.battlefield) {
      if (b.tapped || b.neutral) continue;
      const c = b.card, S = c.statics || {}; let info = null;
      const sick = b.summoning && c.isCreature && !hasteAll && !c.kw.includes('haste');
      if (c.isLand) { if (c.produces.length) info = this.landInfo(p, b, f, card); }
      else if (c.stationMana && (b.charge || 0) >= c.stationMana) info = { amount: b.charge, colors: ALLC.slice() };
      else if (c.manaAb && c.manaAb.artifactOnly && card && !card.isArtifact) info = null;
      else if (c.manaAb && !(c.metalcraft && arts < 3) && !c.manaAb.led && !sick) info = c.manaAb.dyn ? this.dynInfo(p, b, c.manaAb, card) : { amount: c.manaAb.amount + (c.name === 'Treasure' && p.battlefield.some(x => x.card.statics && x.card.statics.goldspan && !x.neutral) ? 1 : 0), colors: c.manaAb.colors };
      else if (c.isCreature && (f.creature || (f.tokenCreature && c.token)) && !sick) info = { amount: 1, colors: ALLC.slice() };
      if (!info && c.isArtifact && f.artifactU) { out.push({ kind: 'perm', b, amount: 1, colors: ['U'], pen: 1 }); used.add(b); continue; }
      if (!info || info.amount <= 0) continue;
      info = { ...info };
      if (c.isCreature && f.creatureBonus && !c.isLand) { info.amount++; if (!info.colors.includes('G')) info.colors = [...info.colors, 'G']; }
      if (!c.isLand && f.cBonus && info.colors.includes('C')) info.amount++;
      if (c.manaAb && c.manaAb.needCreature && !p.battlefield.some(x => x.card.isCreature && !x.tapped && x !== b)) continue;
      out.push({ kind: 'perm', b, ...info, sac: !!(c.manaAb && c.manaAb.sac), pain: S.manaLife ? 1 : 0, pen: (c.manaAb && c.manaAb.sac ? 5 : 0) + (S.manaLife ? 1 : 0) + (c.isCreature && !c.isLand ? 0.5 : 0) });
      used.add(b);
    }
    if (f.legendTap) for (const b of p.battlefield) if (b.card.isCreature && b.card.isLegendary && !b.tapped && !used.has(b)) { out.push({ kind: 'perm', b, amount: 1, colors: ALLC.slice(), pen: 3 }); used.add(b); }
    for (const c of p.hand) if (c.handMana && c !== card) out.push({ kind: 'hand', c, amount: 1, colors: c.handMana, pen: 8 });
    const alt = p.battlefield.find(b => b.card.altar && !b.neutral);
    if (alt) for (const t of p.battlefield.filter(b => b.card.isCreature && b.card.token)) out.push({ kind: 'altar', b: t, amount: alt.card.altar.amount, colors: alt.card.altar.colors, pen: 6, via: alt.card });
    if (!p.hand.filter(c => c !== card).length) for (const b of p.battlefield.filter(b => b.card.manaAb && b.card.manaAb.led)) out.push({ kind: 'led', b, amount: 3, colors: ALLC.slice(), pen: 9 });
    return out;
  }
  availableMana(p) { return this.manaSrcs(p).reduce((s, x) => s + x.amount, 0); }
  /** plan which sources to use for `cost` (+ `reserve` generic left over). returns the chosen sources, or null */
  manaPlan(p, cost, reserve = 0) {
    const srcs = this.manaSrcs(p, cost).map(s => ({ ...s, left: s.amount, used: false }));
    if (srcs.reduce((s, x) => s + x.amount, 0) < cost.total + reserve) return null;
    const need = { ...cost.pips };
    for (const col of 'WUBRG') while (need[col] > 0) {
      const cand = srcs.filter(s => s.left > 0 && s.colors.includes(col)).sort((a, b) => (b.used - a.used) || (a.pen - b.pen) || (a.colors.length - b.colors.length) || (a.amount - b.amount))[0];
      if (!cand) return null; cand.left--; cand.used = true; cand.pip = true; need[col]--;
    }
    let g = cost.generic;
    while (g > 0) {
      const cand = srcs.filter(s => s.left > 0).sort((a, b) => (b.used - a.used) || (a.pen - b.pen) || ((b.colors[0] === 'C') - (a.colors[0] === 'C')) || (a.colors.length - b.colors.length) || (Math.abs(a.left - g) - Math.abs(b.left - g)))[0];
      if (!cand) return null; const k = Math.min(cand.left, g); cand.left -= k; g -= k; cand.used = true;
    }
    const spare = srcs.filter(s => !s.used).reduce((s, x) => s + x.amount, 0);
    if (spare < reserve) return null;
    const out = srcs.filter(s => s.used); out.pip = new Set(srcs.filter(s => s.pip && s.b).map(s => s.b));
    return out;
  }
  costOf(p, card, zone) {
    const ggc = zone === 'gy' ? this.gyGrant(p, card) : null;
    if (ggc && ggc.tapReduce) { const c = p.battlefield.filter(b => b.card.isCreature && !b.tapped).sort((a, b) => this.powerOf(p, b) - this.powerOf(p, a))[0]; if (c) { const k = Math.min(this.powerOf(p, c), ggc.cost.generic); return { ...ggc.cost, generic: ggc.cost.generic - k, total: ggc.cost.total - k, card }; } }
    let cost = zone === 'gy' ? (ggc ? ggc.cost : card.mana) : zone === 'cmd' ? { ...card.mana, total: card.mana.total + p.cmdTax, generic: card.mana.generic + p.cmdTax } : card.mana;
    const red = p.battlefield.reduce((s, b) => s + (b.card.reducers || []).filter(r => matchesFilter(card, r.filter) && (!r.minPower || (card.power || 0) >= r.minPower) && (!r.minMV || card.cmc >= r.minMV) && (!r.firstCreature || !(p.creatureSpellTurn === this.turn))).reduce((x, r) => x + r.n, 0), 0) + p.battlefield.filter(b => b.chosenCardType && matchesFilter(card, b.chosenCardType)).length;
    if (red && cost.generic) { const k = Math.min(red, cost.generic); cost = { ...cost, generic: cost.generic - k, total: cost.total - k }; }
    const S = card.statics || {};
    if (S.selfReduce && cost.generic) {
      const sr = S.selfReduce, crs = q => q.battlefield.filter(b => b.card.isCreature); let k = 0;
      if (sr.what === 'creaturesAll') k = sr.per * this.alive().reduce((s, q) => s + crs(q).length, 0);
      else if (sr.what === 'creaturesMine') k = sr.per * crs(p).length;
      else if (sr.what === 'greatestPower') k = Math.max(0, ...crs(p).map(b => this.powerOf(p, b)));
      else if (sr.what === 'totalPower') k = crs(p).reduce((s, b) => s + Math.max(0, this.powerOf(p, b)), 0);
      else if (sr.what === 'power4') k = crs(p).some(b => this.powerOf(p, b) >= 4) ? sr.n : 0;
      else if (sr.what === 'artifactsMine') k = p.battlefield.filter(b => b.card.isArtifact).length;
      else if (sr.what === 'noncreatureArtifactMV') k = p.battlefield.filter(b => b.card.isArtifact && !b.card.isCreature).reduce((s, b) => s + (b.card.cmc || 0), 0);
      k = Math.min(k, cost.generic); if (k) cost = { ...cost, generic: cost.generic - k, total: cost.total - k };
    }
    if ((S.improvise || p.improviseNext === this.turn) && cost.generic) { const k = Math.min(cost.generic, p.battlefield.filter(b => b.card.isArtifact && !b.tapped && !b.card.manaAb).length); if (k) cost = { ...cost, generic: cost.generic - k, total: cost.total - k, improvise: k }; }
    if (S.convoke && cost.generic) { const k = Math.min(cost.generic, p.battlefield.filter(b => b.card.isCreature && !b.tapped).length); if (k) cost = { ...cost, generic: cost.generic - k, total: cost.total - k, convoke: k }; }
    if (S.delve && cost.generic) { const k = Math.min(cost.generic, p.graveyard.filter(c => c !== card).length); if (k) cost = { ...cost, generic: cost.generic - k, total: cost.total - k, delve: k }; }
    return { ...cost, card };
  }
  canPayCost(p, cost, reserve = 0) { return !!this.manaPlan(p, cost, reserve); }
  payCost(p, cost) {
    const plan = this.manaPlan(p, cost) || [];
    this.lastSpend = { total: cost.total || 0, c: plan.reduce((s, x) => s + ((x.colors && x.colors.length === 1 && x.colors[0] === 'C') ? (x.amount || 1) : 0), 0) };
    const poolIdx = [];
    for (const s of plan) {
      if (s.kind === 'pool') { poolIdx.push(s.idx); continue; }
      if (s.kind === 'hand') { const i = p.hand.indexOf(s.c); if (i >= 0) { p.hand.splice(i, 1); p.exile.push(s.c); this.say(`— exiles ${s.c.name} from hand for mana`, p); } continue; }
      if (s.kind === 'altar') { const i = p.battlefield.indexOf(s.b); if (i >= 0) { p.battlefield.splice(i, 1); this.say(`— sacrifices ${s.b.card.name} to ${s.via.name}`, p); (this.pendingSac = this.pendingSac || []).push([p, s.b]); } continue; }
      if (s.kind === 'led') { const i = p.battlefield.indexOf(s.b); if (i >= 0) { p.graveyard.push(...p.hand); p.hand = []; p.battlefield.splice(i, 1); p.graveyard.push(s.b.card); this.say(`— discards their hand and sacrifices ${s.b.card.name} for mana`, p); } continue; }
      const b = s.b; b.tapped = true; const S = b.card.statics || {};
      if (b.card.grandSummon) { p.grandTurn = this.turn; p.grandN = (p.grandN || 0) + b.card.grandSummon; }
      if (b.card.manaAb && b.card.manaAb.needCreature) { const t = p.battlefield.filter(x => x.card.isCreature && !x.tapped && x !== b).sort((a, z) => (a.card.manaAb ? 1 : 0) - (z.card.manaAb ? 1 : 0) || this.powerOf(p, a) - this.powerOf(p, z))[0]; if (t) t.tapped = true; }
      if (S.manaLife && (!S.manaLifeColor || (plan.pip && plan.pip.has(b)))) (this.pendingLife = this.pendingLife || []).push([p, -S.manaLife, b.card]);
      if (b.card.orchard) (this.pendingTok = this.pendingTok || []).push(p);
      if (b.card.manaAb && b.card.manaAb.sac) { const i = p.battlefield.indexOf(b); if (i >= 0) { p.battlefield.splice(i, 1); this.say(`— sacrifices ${b.card.name} for mana`, p); (this.pendingSac = this.pendingSac || []).push([p, b]); } }
    }
    if (poolIdx.length) p.pool = p.pool.filter((x, i) => !poolIdx.includes(i));
  }
  /** floating mana (rituals, Lotus Cobra, Birgi...). eot: survives step changes */
  addMana(p, colors, eot = false) { p.pool = p.pool || []; for (const c of colors) p.pool.push({ c, eot }); this.say(`— adds ${colors.map(c => c === 'A' ? '{any}' : '{' + c + '}').join('')}`, p); }
  emptyPools(all = false) { for (const q of this.players) if (q.pool && q.pool.length) q.pool = all ? [] : q.pool.filter(x => x.eot); }
  /** life loss / sacrifice triggers queued by mana payments (payCost is synchronous) */
  async flushPending() {
    if (this.flushing) return; this.flushing = true;
    try {
      while ((this.pendingLife && this.pendingLife.length) || (this.pendingSac && this.pendingSac.length) || (this.pendingTok && this.pendingTok.length) || (this.pendingDraw && this.pendingDraw.length) || (this.pendingDrainBC && this.pendingDrainBC.length) || (this.pendingGen && this.pendingGen.length)) {
        for (const [q, ops, b, ctx, why] of (this.pendingGen || []).splice(0)) if (!q.dead && this.trigOk() && (q.battlefield.includes(b))) { this.say(`— ${why}`, q); await this.runOps(q, ops, b.card, { perm: b, ...ctx }); }
        for (const [q, d, c] of (this.pendingLife || []).splice(0)) await this.changeLife(q, d, c);
        for (const [q, b] of (this.pendingSac || []).splice(0)) await this.sacTriggers(q, b);
        for (const [q, ops, b] of (this.pendingDraw || []).splice(0)) if (!q.dead && this.trigOk()) await this.runOps(q, ops, b.card, { perm: b });
        for (const [o, q, src] of (this.pendingDrainBC || []).splice(0)) if (!q.dead && !o.dead && this.trigOk()) { await this.changeLife(q, -2, src); await this.changeLife(o, 2, src); }
        for (const q of (this.pendingTok || []).splice(0)) { const o = this.opponentsOf(q)[0]; if (o) await this.runOps(o, [{ op: 'tokens', n: 1, pt: [1, 1], kw: ['flying'] }], { name: 'Spirit' }, {}); }
      }
    } finally { this.flushing = false; }
  }
  /** can `p` cast `card` right now? returns 'mana' | 'free' | null. `instant` = outside own main phase */
  canFlash(p, card) { const colorless = !(card.colors || []).length; if (p.battlefield.some(b => !b.neutral && b.card.statics && ((b.card.statics.flashColorless && colorless) || (b.card.statics.flashColorlessArtifact && (colorless || card.isArtifact))))) return true; const ft = p.flashTurn; if (ft && ((ft.game && ft.turn === this.turn) || (ft.sorcery && card.isSorcery && (p.turnCount || 0) < ft.turn))) return true; return card.flash || p.battlefield.some(b => { const S = b.card.statics; return S && !b.neutral && (S.flashAll || (S.flashNoncreature && !card.isCreature) || (S.flashAuraEquip && /aura|equipment/i.test(card.type))); }); }
  /** Grand Abolisher / Teferi / Drannith-style restrictions on casting */
  castLocked(p, zone, instant) {
    const act = this.players[this.active];
    if (this.opponentsOf(p).some(q => q.silenceTurn === this.turn)) return true;
    if (p.noMoreSpellsTurn === this.turn) return true;
    for (const q of this.opponentsOf(p)) for (const b of q.battlefield) { const S = b.card.statics; if (!S || b.neutral) continue;
      if (S.castLock === 'yourTurn' && act === q) return true;
      if (S.sorceryLock && instant) return true;
      if (S.handOnly && zone !== 'hand') return true; }
    return false;
  }
  addCostOk(p, card) {
    if (!card.isCreature && this.opponentsOf(p).some(q => q.silenceNCTurn === this.turn)) return false;
    const a = card.statics && card.statics.addCost; if (!a) return true;
    if (a.sac) return p.battlefield.some(b => a.sac.split(' or ').some(w => w === 'creature' ? b.card.isCreature : w === 'artifact' ? b.card.isArtifact : w === 'land' ? b.card.isLand : false));
    if (a.discard) return p.hand.filter(c => c !== card).length >= a.discard;
    if (a.life) return p.life > (a.life === 'x' ? 3 : a.life);
    return true;
  }
  /** extra mana for a set of modes (spree / tiered / split / escalate) */
  modeCost(card, picks) {
    let g = 0; const pips = { W: 0, U: 0, B: 0, R: 0, G: 0 };
    const add = c => { g += c.generic; for (const k in c.pips) pips[k] += c.pips[k]; };
    if (card.costModes) for (const s of picks) { const m = card.modes.find(x => x.card === s); if (m && m.cost) add(m.cost); }
    if (card.escalate && picks.length > 1) for (let k = 1; k < picks.length; k++) add(card.escalate);
    return { generic: g, pips, total: g + Object.values(pips).reduce((a, b) => a + b, 0) };
  }
  addCosts(...cs) { const pips = { W: 0, U: 0, B: 0, R: 0, G: 0 }; let g = 0; for (const c of cs) if (c) { g += c.generic || 0; for (const k in c.pips || {}) pips[k] += c.pips[k]; } const out = { generic: g, pips, total: g + Object.values(pips).reduce((a, b) => a + b, 0) }; const card = cs.find(c => c && c.card); if (card) out.card = card.card; return out; }
  /** alternative costs `p` could use for `card` right now */
  altOptions(p, card, zone) {
    if (!card.alts || zone === 'gy') return [];
    return card.alts.filter(a => {
      if (a.cond === 'swamp' && !p.battlefield.some(b => /swamp/i.test(b.card.type))) return false;
      if (a.life && p.life <= a.life) return false;
      if (a.cond === 'creatures13' && this.alive().reduce((s, q) => s + q.battlefield.filter(b => b.card.isCreature).length, 0) < 13) return false;
      if (a.cond === 'opp3spells' && !this.opponentsOf(p).some(q => (q.spellsThisTurn || 0) >= 3)) return false;
      if (a.kind === 'sacCreature' && !p.battlefield.some(b => b.card.isCreature && !b.card.token && (b.card.colors || []).includes(a.color))) return false;
      if (a.kind === 'pitch' && (this.players[this.active] === p || !p.hand.some(c => c !== card && (c.colors || []).includes(a.color)))) return false;
      if (a.kind === 'bestow' && !p.battlefield.some(b => b.card.isCreature)) return false;
      return this.canPayCost(p, { ...a.cost, card });
    });
  }
  /** cheapest legal mode choice cost (spree needs one mode) */
  minModeCost(card) { if (!card.costModes) return null; const cs = card.modes.map(m => m.cost).sort((a, b) => a.total - b.total); return cs[0]; }
  castMode(p, card, zone = 'hand', { instant = false } = {}) {
    if (card.isLand) return null;
    if (instant && !this.canFlash(p, card)) return null;
    if (this.castLocked(p, zone, instant) || !this.addCostOk(p, card)) return null;
    if (card.cmc % 2 === 0 && this.opponentsOf(p).some(q => q.battlefield.some(b => b.card.statics && b.card.statics.winnowCast && !b.neutral))) return null;
    if (card.revealColorless && !p.hand.some(c => c !== card && c.isCreature && !(c.colors || []).length)) return null;
    if (zone === 'hand' && !(card.colors || []).length && !card.isLand && p.monoTurn !== this.turn && p.battlefield.some(b => b.card.statics && b.card.statics.monolith && !b.neutral) && !(instant && !this.canFlash(p, card)) && !(!instant && this.stack.length)) return 'free';
    if (!instant && this.stack.length) return null;
    if (zone === 'top') { const tp = p.library[p.library.length - 1] === card && this.topPerm(p, card); if (!tp) return null; if (tp === 'citadel') return 'free'; return this.canPayCost(p, this.costOf(p, card, 'hand')) ? 'mana' : null; }
    if (zone === 'exile') { const e = (p.exileCast || []).find(x => x.card === card); if (!e) return null; if (e.free) return 'free'; return this.canPayCost(p, this.costOf(p, card, 'hand')) ? 'mana' : null; }
    if (zone === 'gy') { const gc = this.gyGrant(p, card); if (!gc || !p.graveyard.includes(card)) return null; if (gc.sacCreatures && p.battlefield.filter(b => b.card.isCreature).length < gc.sacCreatures) return null; if (gc.exileOthers && p.graveyard.filter(c => c !== card).length < gc.exileOthers) return null; if (gc.discard && !p.hand.length) return null; if (gc.discardLand && !p.hand.some(c => c.isLand)) return null; return this.canPayCost(p, this.costOf(p, card, zone)) ? 'mana' : null; }
    const free = this.freeMode(p, card);
    if (free && (card.freeCmd || (card.counter && card.counter.free === 'commander'))) return 'free'; // no downside: never pay mana for it
    if (p.battlefield.some(b => /you may cast spells from your hand without paying their mana costs/.test(b.card.oracle.toLowerCase()) && !b.neutral) && zone === 'hand') return 'free';
    if (this.canPayCost(p, this.addCosts(this.costOf(p, card, zone), this.minModeCost(card)))) return 'mana';
    if (this.altOptions(p, card, zone).length) return 'alt';
    return free;
  }
  /** a graveyard casting permission for this card right now (its own flashback/escape or one granted by Six / Underworld Breach) */
  /** Muldrotha: a permanent type of this card not yet used from the graveyard this turn */
  muldType(p, card) { const used = p.muldTurn === this.turn ? p.muldUsed || [] : []; return ['Creature', 'Artifact', 'Enchantment', 'Planeswalker', 'Battle'].find(t => card.type.includes(t) && !used.includes(t)) || null; }
  canLandFromGy(p) { return p.battlefield.some(b => b.card.statics && b.card.statics.landsFromGy && !b.neutral) || (this.players[this.active] === p && p.battlefield.some(b => b.card.statics && b.card.statics.muldrotha && !b.neutral) && !(p.muldTurn === this.turn && (p.muldUsed || []).includes('Land'))); }
  gyGrant(p, card) {
    if (card.gyCast) return card.gyCast;
    if (card.isLand) return null;
    if (p.battlefield.some(b => b.card.statics && b.card.statics.breach && !b.neutral)) return { kind: 'escape', cost: card.mana, exileOthers: 3, exileAfter: !(card.isCreature || card.isArtifact || card.isEnchantment || card.isPlaneswalker) };
    if (this.players[this.active] === p && !card.isInstant && !card.isSorcery && p.battlefield.some(b => b.card.statics && b.card.statics.sixRetrace && !b.neutral)) return { kind: 'retrace', cost: card.mana, discardLand: 1 };
    if (this.players[this.active] === p && !card.isInstant && !card.isSorcery && p.battlefield.some(b => b.card.statics && b.card.statics.muldrotha && !b.neutral) && this.muldType(p, card)) return { kind: 'muldrotha', cost: card.mana };
    return null;
  }
  /** may `p` cast / play the top card of their library (Bolas's Citadel, Mystic Forge, Realmwalker, Oracle of Mul Daya...) */
  topPerm(p, card) {
    for (const b of p.battlefield) { const S = b.card.statics; if (!S || b.neutral) continue;
      if (card.isLand && (S.topLands || S.topCast === 'citadel' || (S.topCast === 'chip' && b.attachedTo != null))) return 'land';
      if (card.isLand) continue;
      if (S.topCast === 'citadel' && p.life > card.cmc) return 'citadel';
      if (S.topCast === 'forge' && (card.isArtifact || !(card.colors || []).length)) return 'mana';
      if (S.topCast === 'chosenType' && card.isCreature && b.chosenType && matchesFilter(card, b.chosenType)) return 'mana';
      if (S.topCast === 'chip' && b.attachedTo != null) return 'mana'; }
    return null;
  }
  freeMode(p, card) {
    if (card.notOfThisWorld && this.stack.some(o => o.caster !== p && o.target && o.target.card && p.battlefield.includes(o.target) && o.target.card.isCreature && this.powerOf(p, o.target) >= 7)) return 'free';
    const f = card.counter && card.counter.free;
    if (f === 'pitch' || (f === 'pitchNotTurn' && this.players[this.active] !== p)) { if (p.hand.some(c => c !== card && c.colors.includes('U'))) return 'free'; }
    if ((f === 'commander' || card.freeCmd) && p.battlefield.some(b => b.card.isCommander)) return 'free';
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
    if (cond.kind === 'never') return false;
    if (cond.kind === 'basic1') return p.battlefield.some(b => b.card.isLand && /\bBasic\b/.test(b.card.type));
    if (cond.kind === 'early') return (p.turnCount || 0) <= 3;
    if (cond.kind === 'opps') return this.opponentsOf(p).length >= 2;
    if (cond.kind === 'threeType') return p.battlefield.filter(b => b.card.type.toLowerCase().includes(cond.w.replace(/e?s$/, ''))).length >= 3;
    if (cond.kind === 'basics') return p.battlefield.filter(b => b.card.isLand && /\bBasic\b/.test(b.card.type)).length >= 2;
    if (cond.kind === 'control') return p.battlefield.some(b => cond.words.some(w => b.card.type.toLowerCase().includes(w)));
    return true;
  }
  /** a land enters the battlefield, resolving its optional / conditional "enters tapped" text. returns [perm, notes] */
  async landEnters(p, card, tapped = false) {
    if (/^you may have this land enter tapped as a copy of any land on the battlefield/im.test(card.oracle)) { const pool = this.allPerms(b => b.card.isLand && b.card.name !== card.name); const t = p.ai || !p.human ? [...pool].sort((a, b) => ((b.card.landDyn ? 5 : 0) + (b.card.manaAmount || 1) + b.card.produces.length) - ((a.card.landDyn ? 5 : 0) + (a.card.manaAmount || 1) + a.card.produces.length))[0] : await this.pickPerm(p, card, pool, { dest: 'copy' }); if (t) { const c = { ...t.card, uid: UID++, orig: card, isCommander: false }; const pm = { id: UID++, card: c, tapped: true, summoning: false, counters: 0, enteredTurn: this.turn }; p.battlefield.push(pm); this.say(`— ${card.name} enters as a copy of ${t.card.name}`, p); return [pm, ['tapped']]; } }
    const perm = { id: UID++, card, tapped: tapped || !!card.etbTapped, summoning: false, counters: 0, enteredTurn: this.turn, charge: card.etbCharge || 0 }; const notes = [];
    if (!perm.tapped && card.etbCond && !this.condMet(p, card.etbCond)) { perm.tapped = true; notes.push('tapped'); }
    if (!perm.tapped && card.reveal) { const r = p.hand.find(c => c !== card && card.reveal.some(w => c.type.toLowerCase().includes(w))); if (r) notes.push('reveals ' + r.name); else { perm.tapped = true; notes.push('tapped, nothing to reveal'); } }
    p.battlefield.push(perm);
    if (card.orig) perm.card = card; // MDFC land face
    if (/choose a creature type/i.test(card.oracle)) perm.chosenType = this.chooseCreatureType(p);
    if (card.saga) { perm.lore = 0; await this.loreUp(p, perm); }
    if (card.hideaway) { const top = p.library.splice(-Math.min(card.hideaway, p.library.length)).reverse(); if (top.length) { const val = c => p.ai ? p.ai.castValueRaw(this, p, c) : c.cmc; const pick = [...top].sort((a, b) => val(b) - val(a))[0]; p.exile.push(pick); perm.hideaway = pick; perm.hideawayCond = /total power 10/.test(card.oracle) ? 'power10' : /attacked with three/.test(card.oracle) ? 'attack3' : 'dealt7'; p.library.unshift(...top.filter(c => c !== pick)); notes.push('hides a card'); } }
    const S = card.statics || {};
    if (S.bounceLand || S.sacLands) {
      const n = S.sacLands || 1, out = [];
      for (let k = 0; k < n; k++) {
        const pool = p.battlefield.filter(b => b.card.isLand && !out.includes(b) && (S.sacLands ? b !== perm : true)); if (!pool.length) break;
        let v; if (p.human) { const pick = (await this.chooseFromList(p, card, pool.map(b => b.card), 1, S.bounceLand ? 'bounceLand' : 'sacrifice'))[0]; v = pool.find(b => b.card === pick) || pool[0]; }
        else v = [...pool].sort((a, b) => (b.tapped - a.tapped) || ((a === perm) - (b === perm)) || ((b.card.etbTapped ? 0 : 1) - (a.card.etbTapped ? 0 : 1)) || (a.card.produces.length - b.card.produces.length))[0];
        out.push(v);
      }
      for (const v of out) { if (S.bounceLand) await this.bounce(p, v, p); else await this.sacrifice(p, v); }
      notes.push(S.bounceLand ? 'returns ' + out.map(b => b.card.name).join(', ') + ' to hand' : 'sacrifices ' + out.map(b => b.card.name).join(', '));
    }
    if (perm.tapped && p.battlefield.some(b => b.card.statics && b.card.statics.landsUntapped && !b.neutral)) perm.tapped = false;
    if (!perm.tapped && card.shock) {
      perm.tapped = true; const n = card.etbLife;
      let pay = false;
      if (p.life > n) pay = p.human ? (this.hooks.humanETB ? !!(await this.hooks.humanETB({ p, card, perm, life: n, enables: this.enabledBy(p, perm) })) : false) : p.ai ? p.ai.payLifeForLand(this, p, card, perm) : false;
      if (pay) { perm.tapped = false; await this.changeLife(p, -n, card); notes.push(`paid ${n} life`); } else notes.push('tapped');
    }
    if (p.battlefield.some(b => b.card.statics && b.card.statics.landsUntapped && !b.neutral) && perm.tapped && !notes.includes('paid')) perm.tapped = false;
    if (!perm.tapped && card.landEtbUntapped) await this.runOps(p, card.landEtbUntapped, card, { perm });
    return [perm, notes];
  }
  async choosePayUnless(payer, victim, counterCard, n) {
    if (payer.human) return this.hooks.humanPayUnless ? !!(await this.hooks.humanPayUnless({ p: payer, spell: victim, counter: counterCard, n })) : true;
    return payer.ai ? payer.ai.payUnless(this, payer, victim, n) : true;
  }
  // ---------- casting with priority ----------
  async playLand(p, card) {
    const fromGy = !p.hand.includes(card) && p.graveyard.includes(card) && card.isLand && this.canLandFromGy(p);
    if (fromGy && !p.battlefield.some(b => b.card.statics && b.card.statics.landsFromGy && !b.neutral)) { if (p.muldTurn !== this.turn) { p.muldTurn = this.turn; p.muldUsed = []; } p.muldUsed.push('Land'); }
    const fromTop = !fromGy && !p.hand.includes(card) && p.library[p.library.length - 1] === card && card.isLand && this.topPerm(p, card);
    const exE = !fromGy && !fromTop && !p.hand.includes(card) ? (p.exileCast || []).find(e => e.card === card) : null;
    if (exE) p.exileCast.splice(p.exileCast.indexOf(exE), 1);
    const zone = fromGy ? p.graveyard : fromTop ? p.library : exE ? (exE.owner || p).exile : p.hand;
    const i = zone.indexOf(card); if (i < 0 || p.landsThisTurn >= this.landLimit(p) || !(card.isLand || card.backLand)) return false;
    zone.splice(i, 1); p.landsThisTurn++; delete card.impulse;
    for (const b of p.battlefield.filter(b => b.card.cityOfTraitors)) { this.say(`— sacrifices ${b.card.name}`, p); await this.sacrifice(p, b); }
    const [perm, notes] = await this.landEnters(p, card.isLand ? card : card.backLand);
    if (fromGy) notes.push('from the graveyard');
    this.say(`plays ${card.name}${notes.length ? ' (' + notes.join(', ') + ')' : card.etbTapped ? ' (tapped)' : ''}`, p); await this.emit({ type: 'land', p, card, perm });
    if (card.gyHate) await this.doGyHate(p, card); // Bojuka Bog-style enter trigger
    await this.landfall(p);
    return true;
  }
  /** cast a spell; returns true if it resolved. target: perm (with .owner) or player */
  // ============================== THE STACK ==============================
  // Every spell is a stack object { id, card, caster, target, zone }. Targets can be permanents, players, or other
  // stack objects ({spell: obj}) anywhere on the stack. Players pass priority in turn order; when everyone passes in a
  // row, the top object resolves (or fizzles if its target became illegal) and priority starts again with the active player.
  /** cast a spell. Outside a priority loop this runs the stack until it's empty; returns true if this spell resolved. */
  async cast(p, card, zone = 'hand', target = null, opts = {}) {
    const obj = await this.putOnStack(p, card, zone, target, opts);
    if (!obj) return false;
    if (this.stackBusy) return true; // cast in response: it resolves when everyone passes
    await this.runStack(p);
    return !!obj.resolved;
  }
  async putOnStack(p, card, zone = 'hand', target = null, { instant = false, free = false, owner = null } = {}) {
    if (card.counter && card.counter.hits === 'targetsMine' && target && target.spell && !(target.spell.target && target.spell.target.card && this.ownerOf(target.spell.target) === p)) return null;
    let obj_gc = null;
    if (zone === 'exile') { const e = (p.exileCast || []).find(x => x.card === card); if (!e) return null; if (e.free) free = true; p.exileCast.splice(p.exileCast.indexOf(e), 1); const o = e.owner || p; const i = o.exile.indexOf(card); if (i >= 0) o.exile.splice(i, 1); p.hand.push(card); owner = o; zone = 'hand'; }
    if (zone === 'top') { if (p.library[p.library.length - 1] !== card) return null; const S = this.topPerm(p, card); if (!S) return null; p.library.pop(); p.hand.push(card); zone = 'hand'; if (S === 'citadel') { free = true; await this.changeLife(p, -card.cmc, card); this.say(`pays ${card.cmc} life to cast ${card.name} from the top of the library`, p); } }
    let mode = free ? 'free' : this.castMode(p, card, zone, { instant }); if (!mode) return null;
    let exile = null;
    if (p.human && card.counter && card.counter.free && card.counter.free.startsWith('pitch') && this.freeMode(p, card) && this.hooks.humanAltCost) {
      const canMana = this.canPayCost(p, this.costOf(p, card, zone)), blues = p.hand.filter(c => c !== card && c.colors.includes('U'));
      if (canMana || blues.length > 1) { const r = await this.hooks.humanAltCost({ p, card, canMana, blues }); if (!r) return null; mode = r.mode; exile = r.exile || null; }
    }
    const src = zone === 'cmd' ? p.command : zone === 'gy' ? p.graveyard : p.hand; const i = src.indexOf(card); if (i < 0) return null;
    src.splice(i, 1);
    if (zone === 'gy') { const gc = this.gyGrant(p, card); obj_gc = gc;
      if (gc.sacCreatures) { const pool = p.battlefield.filter(b => b.card.isCreature).sort((a, b) => (b.card.token - a.card.token) || (p.ai ? p.ai.permBase(a) - p.ai.permBase(b) : 0)).slice(0, gc.sacCreatures); for (const v of pool) await this.sacrifice(p, v); }
      if (gc.tapReduce) { const c = p.battlefield.filter(b => b.card.isCreature && !b.tapped).sort((a, b) => this.powerOf(p, b) - this.powerOf(p, a))[0]; if (c) c.tapped = true; }
      if (gc.exileOthers) { const others = p.graveyard.filter(c => c !== card).sort((a, b) => a.cmc - b.cmc).slice(0, gc.exileOthers); for (const c of others) { p.graveyard.splice(p.graveyard.indexOf(c), 1); p.exile.push(c); } }
      if (gc.discard) { const d = p.ai ? p.ai.chooseDiscard(this, p) : (this.hooks.humanDiscard ? await this.hooks.humanDiscard(p) : p.hand[0]); if (d) { p.hand.splice(p.hand.indexOf(d), 1); p.graveyard.push(d); } }
      if (gc.discardLand) { const d = p.hand.find(c => c.isLand); if (d) { p.hand.splice(p.hand.indexOf(d), 1); p.graveyard.push(d); } }
    }
    delete card.impulse;
    // choose how to pay: alternative cost, kicker, X, cost-carrying modes
    const extra = { x: 0, kicks: 0, gift: false, bargain: false, alt: null, modes: null };
    if (mode === 'alt' || (mode === 'mana' && card.alts)) {
      const alts = this.altOptions(p, card, zone).filter(a => mode === 'alt' || a.kind === 'dash' || a.kind === 'evoke' || a.kind === 'bestow' || a.kind === 'life' || a.kind === 'cheap' || a.kind === 'sacCreature' || a.kind === 'pitch');
      let pick = null;
      if (alts.length) { if (p.human) pick = this.hooks.humanPayOpt ? await this.hooks.humanPayOpt({ p, card, normal: mode === 'mana', alts }) : (mode === 'alt' ? alts[0] : null); else if (p.ai) pick = p.ai.chooseAlt(this, p, card, alts, mode === 'mana'); }
      if (pick === undefined) { src.splice(i, 0, card); return null; }
      if (pick) { extra.alt = pick; mode = 'altpay'; } else if (mode === 'alt') { src.splice(i, 0, card); return null; }
    }
    if (card.modes && card.costModes && mode !== 'free') extra.modes = await this.chooseModes(p, card, mode === 'altpay' ? extra.alt.cost : this.costOf(p, card, zone));
    else if (card.modes && card.costModes) extra.modes = await this.chooseModes(p, card, null);
    const baseCost = mode === 'altpay' ? { ...extra.alt.cost, card } : mode === 'mana' ? this.costOf(p, card, zone) : null;
    if (baseCost || mode === 'free') {
      const sofar = this.addCosts(baseCost, extra.modes ? this.modeCost(card, extra.modes) : null);
      if (card.kicker && mode !== 'free') extra.kicks = await this.chooseKicks(p, card, sofar);
      const withK = this.addCosts(sofar, ...Array(extra.kicks).fill(card.kicker && card.kicker.cost));
      if (card.xCount && mode !== 'free') extra.x = await this.chooseX(p, card, withK);
      if (card.gift) extra.gift = p.human ? !!(this.hooks.humanMay && await this.hooks.humanMay({ p, card, question: `promise the gift (${card.gift}) to an opponent?` })) : !!(p.ai && p.ai.chooseGift(this, p, card, target));
      if (card.bargain) { const pool = p.battlefield.filter(b => b.card.isArtifact || b.card.isEnchantment || b.card.token); if (pool.length) { const yes = p.human ? !!(this.hooks.humanMay && await this.hooks.humanMay({ p, card, question: 'bargain (sacrifice an artifact, enchantment or token)?' })) : pool.some(b => b.card.token || this.ownerOf(b) && p.ai.permBase(b) < 3); if (yes) { const v = pool.sort((a, b) => (b.card.token - a.card.token) || (p.ai ? p.ai.permBase(a) - p.ai.permBase(b) : 0))[0]; this.say(`bargains ${v.card.name}`, p); await this.sacrifice(p, v); extra.bargain = true; } } }
      extra.extraCost = this.addCosts(this.addCosts(extra.modes ? this.modeCost(card, extra.modes) : null, ...Array(extra.kicks).fill(card.kicker && card.kicker.cost)), { generic: extra.x * card.xCount, pips: {} });
    }
    if (mode === 'altpay') {
      const a = extra.alt;
      this.payCost(p, this.addCosts({ ...a.cost, card }, extra.extraCost));
      if (a.life) await this.changeLife(p, -a.life, card);
      if (a.kind === 'sacCreature') { const v = p.battlefield.filter(b => b.card.isCreature && !b.card.token && (b.card.colors || []).includes(a.color)).sort((x, y) => (p.ai ? p.ai.permBase(x) - p.ai.permBase(y) : 0))[0]; if (v) { this.say(`sacrifices ${v.card.name} instead of paying ${card.name}'s cost`, p); await this.sacrifice(p, v); } }
      if (a.kind === 'pitch') { const ex = p.hand.filter(c => (c.colors || []).includes(a.color)).sort((x, y) => x.cmc - y.cmc)[0]; if (ex) { p.hand.splice(p.hand.indexOf(ex), 1); p.exile.push(ex); this.say(`exiles ${ex.name} to cast ${card.name}`, p); } }
      this.say(`casts ${card.name} for its ${a.kind === 'cheap' || a.kind === 'life' ? 'alternative' : a.kind} cost`, p);
    }
    if (mode === 'free' && extra.extraCost && extra.extraCost.total) this.payCost(p, extra.extraCost);
    if (mode === 'mana') { const cst = this.addCosts(this.costOf(p, card, zone), extra.extraCost); Object.assign(cst, { convoke: this.costOf(p, card, zone).convoke, delve: this.costOf(p, card, zone).delve });
      { const imp = this.costOf(p, card, zone).improvise; if (imp) { const as = p.battlefield.filter(b => b.card.isArtifact && !b.tapped && !b.card.manaAb).slice(0, imp); for (const b of as) b.tapped = true; this.say(`improvises with ${as.length} artifact${as.length > 1 ? 's' : ''}`, p); } }
      if (cst.convoke) { const cr = p.battlefield.filter(b => b.card.isCreature && !b.tapped).sort((a, b) => (b.summoning - a.summoning) || (this.powerOf(p, a) - this.powerOf(p, b))).slice(0, cst.convoke); for (const b of cr) b.tapped = true; this.say(`convokes with ${cr.length} creature${cr.length > 1 ? 's' : ''}`, p); }
      this.payCost(p, cst);
      if (cst.delve) { const ex = p.graveyard.filter(c => c !== card).sort((a, b) => (b.isLand - a.isLand) || (a.isCreature - b.isCreature) || (a.cmc - b.cmc)).slice(0, cst.delve); for (const c of ex) { p.graveyard.splice(p.graveyard.indexOf(c), 1); p.exile.push(c); } this.say(`delves ${ex.length} card${ex.length > 1 ? 's' : ''}`, p); } }
    else if (!free && card.counter && card.counter.free && card.counter.free.startsWith('pitch') && !card.freeCmd) { // exile the least valuable other blue card, pay 1 life
      const blues = p.hand.filter(c => c.colors.includes('U')).sort((a, b) => a.cmc - b.cmc); const ex = exile && p.hand.includes(exile) ? exile : blues[0]; p.hand.splice(p.hand.indexOf(ex), 1); p.exile.push(ex); p.life -= 1;
      this.say(`exiles ${ex.name} to cast ${card.name} for free`, p);
    }
    await this.payAddCost(p, card);
    if (zone === 'cmd') p.cmdTax += 2;
    if (free && card.isLand) return null;
    if (target && target.card) { const to = this.ownerOf(target); if (to && to !== p) { const tl = target.card.statics && target.card.statics.targetLife; if (tl) { await this.changeLife(p, -tl, card); this.say(`pays ${tl} life to target ${target.card.name}`, p); } const wl = (target.card.statics && target.card.statics.wardLife) || target.wardLife; if (target.equipWard && !(target.card.statics && target.card.statics.ward)) { const wc = { generic: target.equipWard, pips: { W: 0, U: 0, B: 0, R: 0, G: 0 }, total: target.equipWard }; if (this.canPayCost(p, wc)) this.payCost(p, wc); else { this.say(`casts ${card.name} — countered by ward`, p); return null; } } if (wl) { await this.changeLife(p, -wl, card); this.say(`pays ${wl} life for ward`, p); } } }
    if (mode === 'free' && zone === 'hand' && !(card.colors || []).length && p.battlefield.some(b => b.card.statics && b.card.statics.monolith && !b.neutral) && !this.freeMode(p, card)) p.monoTurn = this.turn;
    const obj = { id: UID++, kind: 'spell', spent: mode === 'free' ? 0 : (this.lastSpend ? this.lastSpend.total : card.cmc), spentC: mode === 'free' ? 0 : (this.lastSpend ? this.lastSpend.c : 0), owner, noMana: mode === 'free' || (extra.alt && extra.alt.cost.total === 0), uncounterable: p.uncounterNext === this.turn, card, caster: p, target, zone, x: extra.x, kicks: extra.kicks, kicked: extra.kicks > 0, gift: extra.gift, bargained: extra.bargain, alt: extra.alt && extra.alt.kind };
    if (extra.modes) obj.modes = extra.modes;
    if (obj_gc) { obj.gyKind = obj_gc.kind; obj.gyExile = !!obj_gc.exileAfter; if (obj_gc.kind === 'muldrotha') { if (p.muldTurn !== this.turn) { p.muldTurn = this.turn; p.muldUsed = []; } p.muldUsed.push(this.muldType(p, card)); } }
    else if (card.modes && (card.isInstant || card.isSorcery)) obj.modes = await this.chooseModes(p, card);
    if (obj.gift) { const o = this.opponentsOf(p)[0]; if (o) { if (/fish/.test(card.gift)) await this.runOps(o, [{ op: 'tokens', n: 1, pt: [1, 1], kw: [] }], { name: 'Fish' }, {}); else await this.draw(o, 1); this.say(`— gift promised to ${o.name}`, p); } }
    // ward: targeting an opponent's permanent with ward costs extra, or the spell is countered
    if (target && target.card) { const o = this.ownerOf(target); const w = target.card.statics && target.card.statics.ward; if (o && o !== p && w) { const wc = { generic: w, pips: { W: 0, U: 0, B: 0, R: 0, G: 0 }, total: w }; if (this.canPayCost(p, wc)) { this.payCost(p, wc); this.say(`pays ward {${w}}`, p); } else { this.say(`casts ${card.name} — countered by ward`, p); await this.leaveStack(obj, 'countered'); obj.countered = true; return obj; } } }
    if (obj.uncounterable) p.uncounterNext = null;
    if (/as an additional cost to cast this spell, you may sacrifice one or more creatures\. when you do, copy this spell for each creature sacrificed this way/i.test(card.oracle)) {
      const pool = p.battlefield.filter(b => b.card.isCreature && (p.human ? true : b.card.token || (p.ai && p.ai.permBase(b) < 2)));
      const vs = p.human ? (await this.chooseFromList(p, card, pool.map(b => b.card), pool.length, 'sacrifice')).map(c => pool.find(b => b.card === c)).filter(Boolean) : pool;
      for (const v of vs) await this.sacrifice(p, v);
      obj.plumb = vs.length;
    }
    if (p.improviseNext === this.turn) p.improviseNext = null;
    this.spellsThisTurnAll = (this.spellsThisTurnAll || 0) + 1;
    this.stack.push(obj);
    if (obj.noMana && this.opponentsOf(p).some(q => q.battlefield.some(b => b.card.statics && b.card.statics.boromir && !b.neutral)) && !this.isUncounterable(obj)) { this.stack.pop(); this.say(`casts ${card.name} — countered (no mana was spent)`, p); obj.countered = true; await this.leaveStack(obj, 'countered'); return obj; }
    if (target && target.card) for (const tr of target.card.triggers || []) if (tr.when === 'targeted') { const to = this.ownerOf(target); if (to) await this.runOps(to, tr.ops, target.card, { perm: target }); }
    if (obj.plumb) { for (let k = 0; k < obj.plumb; k++) this.stack.push({ id: UID++, kind: 'spell', card, caster: p, target, zone: 'copy', isMode: true, isCopy: true }); this.say(`— ${obj.plumb} cop${obj.plumb > 1 ? 'ies' : 'y'}`, p); }
    if (card.statics && card.statics.storm && this.spellsThisTurnAll > 1) { const n = Math.min(this.spellsThisTurnAll - 1, 15); for (let k = 0; k < n; k++) this.stack.push({ id: UID++, kind: 'spell', card, caster: p, target, zone: 'copy', isMode: true, isCopy: true }); this.say(`— storm: ${n} cop${n > 1 ? 'ies' : 'y'}`, p); }
    this.say(`casts ${card.name}${zone === 'gy' ? ' (' + (obj_gc ? obj_gc.kind : 'graveyard') + ')' : ''}${target ? ' → ' + this.targetName(target) : ''}`, p);
    await this.emit({ type: 'cast', p, card, target, obj, depth: this.stack.length - 1 });
    await this.castTriggers(p, card);
    return obj;
  }
  async payAddCost(p, card) {
    const a = card.statics && card.statics.addCost; if (!a) return;
    if (a.sac) {
      const pool = p.battlefield.filter(b => a.sac.split(' or ').some(w => w === 'creature' ? b.card.isCreature : w === 'artifact' ? b.card.isArtifact : w === 'land' ? b.card.isLand : false)); if (!pool.length) return;
      let v; if (p.human) { const pick = (await this.chooseFromList(p, card, pool.map(b => b.card), 1, 'sacrifice'))[0]; v = pool.find(b => b.card === pick) || pool[0]; } else v = p.ai ? p.ai.chooseSacVictim(this, p, pool) : pool[0];
      this.say(`sacrifices ${v.card.name} to cast ${card.name}`, p); await this.sacrifice(p, v);
    } else if (a.discard) { for (let k = 0; k < a.discard; k++) { const d = p.ai ? p.ai.chooseDiscard(this, p) : (this.hooks.humanDiscard ? await this.hooks.humanDiscard(p) : p.hand[0]); if (d) { p.hand.splice(p.hand.indexOf(d), 1); p.graveyard.push(d); this.say(`discards ${d.name} to cast ${card.name}`, p); } } }
    else if (a.life) { const n = a.life === 'x' ? 3 : a.life; await this.changeLife(p, -n, card); this.say(`pays ${n} life to cast ${card.name}`, p); }
  }
  /** modal spells: which modes (sub-cards) to use */
  async chooseModes(p, card, base = null) {
    const mc = card.modeCount, max = p.battlefield.some(b => b.card.isCommander) ? mc.cmdMax : mc.max, subs = card.modes.map(m => m.card);
    const afford = picks => !base || this.canPayCost(p, this.addCosts(base, this.modeCost(card, picks), { card }));
    let pick;
    if (p.human) pick = this.hooks.humanModes ? await this.hooks.humanModes({ p, card, modes: card.modes, min: mc.min, max }) : null;
    else if (p.ai) pick = p.ai.chooseModes(this, p, card, subs, mc.min, max);
    pick = (pick || []).filter(s => subs.includes(s)).slice(0, max);
    if (base) { while (pick.length > mc.min && !afford(pick)) pick.pop(); if (!afford(pick)) { const one = subs.find(s => afford([s])); pick = one ? [one] : pick; } }
    if (pick.length < mc.min) pick = [...pick, ...subs.filter(s => !pick.includes(s) && afford([...pick, s]))].slice(0, mc.min);
    this.say(`— ${card.name}: ${pick.map(s => card.modes.find(m => m.card === s).text).join(' + ')}`, p);
    return pick;
  }
  async chooseKicks(p, card, sofar) {
    const k = card.kicker; let max = 0; while (max < (k.multi ? 6 : 1) && this.canPayCost(p, this.addCosts(sofar, ...Array(max + 1).fill(k.cost)))) max++;
    if (!max) return 0;
    if (p.human) { if (!this.hooks.humanNumber) return 0; return Math.min(max, +(await this.hooks.humanNumber({ p, card, min: 0, max, question: k.multi ? 'how many times to kick it?' : k.offspring ? `pay offspring {${k.cost.total}}?` : `pay kicker {${k.cost.total}}?` })) || 0); }
    return p.ai ? p.ai.chooseKicks(this, p, card, max) : 0;
  }
  async chooseX(p, card, sofar) {
    let max = 0; while (max < 20 && this.canPayCost(p, this.addCosts(sofar, { generic: (max + 1) * card.xCount, pips: {} }))) max++;
    if (p.human) { if (!this.hooks.humanNumber) return max; return Math.min(max, Math.max(0, +(await this.hooks.humanNumber({ p, card, min: 0, max, question: 'choose X' })) || 0)); }
    return p.ai ? p.ai.chooseX(this, p, card, max) : max;
  }
  /** a target for one mode of a modal spell, picked as it resolves */
  async modeTarget(p, sub, given) {
    const o = sub.oracle.toLowerCase();
    if (sub.roles.includes('counter')) { if (given && given.spell && counterHits(sub, given.spell.card)) return given; const s = [...this.stack].reverse().find(x => x.caster !== p && counterHits(sub, x.card)); return s ? { spell: s } : null; }
    if (sub.roles.includes('removal')) {
      const ok = /target (creature or planeswalker|creature)/.test(o) ? (b => b.card.isCreature || (/planeswalker/.test(o) && b.card.isPlaneswalker)) : /target artifact or enchantment/.test(o) ? (b => b.card.isArtifact || b.card.isEnchantment) : /target artifact/.test(o) ? (b => b.card.isArtifact) : /target enchantment/.test(o) ? (b => b.card.isEnchantment) : /target (nonland )?permanent/.test(o) ? (b => !b.card.isLand) : (b => b.card.isCreature);
      if (given && given.card && ok(given) && this.ownerOf(given)) { given.owner = this.ownerOf(given).i; return given; }
      if (p.ai) { const t = p.ai.bestTarget(this, p, ok); return t ? t.perm : null; }
      const pool = this.opponentsOf(p).flatMap(q => q.battlefield.filter(ok).map(b => b.card)); const pick = (await this.chooseFromList(p, sub, pool, 1, 'destroy'))[0];
      if (pick) for (const q of this.alive()) { const b = q.battlefield.find(b => b.card === pick); if (b) { b.owner = q.i; return b; } }
      return null;
    }
    if (sub.dmg && /target player|target opponent|any target/.test(o)) return given && given.life !== undefined ? given : await this.choosePlayer(p, sub, this.opponentsOf(p), `${sub.name}: which player?`);
    return null;
  }
  /** who controls this card right now (for "damage from a source an opponent controls") */
  cardController(card) {
    if (!card) return null;
    for (const q of this.players) if (q.battlefield.some(b => b.card === card || b.card.orig === card)) return q;
    const s = this.stack.find(o => o.card === card); if (s) return s.caster;
    return this.players.find(q => q.graveyard.includes(card) || q.hand.includes(card) || q.command.includes(card) || q.exile.includes(card)) || null;
  }
  tokenAmt(p, n, creature) { for (const b of p.battlefield) { const t = b.card.statics && b.card.statics.tokenMult; if (t && !b.neutral && (!t.creatureOnly || creature)) n *= t.mult; } return n; }
  counterAmt(p, n) { for (const b of p.battlefield) { const S = b.card.statics; if (S && S.counterPlus && !b.neutral) n += S.counterPlus; } for (const b of p.battlefield) { const S = b.card.statics; if (S && S.counterMult && !b.neutral) n *= S.counterMult; } return n; }
  dmgAmt(p, n, { combat = false, toOpp = true, red = false } = {}) {
    for (const b of p.battlefield) { const S = b.card.statics; if (!S || b.neutral) continue;
      if (S.dmgPlus && toOpp && (!S.dmgPlus.red || red)) n += S.dmgPlus.n;
      if (S.dmgMult && !(S.dmgMult.noncombat && combat) && (!S.dmgMult.oppOnly || toOpp)) n *= S.dmgMult.mult; }
    return n;
  }
  etbTimes(q, perm) { return q.battlefield.some(b => { const S = b.card.statics; return S && !b.neutral && (S.etbDouble === 'permanent' || (S.etbDouble && (perm.card.isCreature || perm.card.isArtifact))); }) ? 2 : 1; }
  /** pay {n} or let an opponent's trigger happen (Rhystic Study, Smothering Tithe, Esper Sentinel) */
  async payTax(p, src, n, why) {
    const cost = { generic: n, pips: { W: 0, U: 0, B: 0, R: 0, G: 0 }, total: n };
    if (!n || p.dead || !this.canPayCost(p, cost)) return false;
    let pay = false;
    if (p.human) pay = this.hooks.humanPayUnless ? !!(await this.hooks.humanPayUnless({ p, why, n, src, tax: true })) : false;
    else pay = p.ai ? p.ai.payTax(this, p, src, n) : false;
    if (pay) { this.payCost(p, cost); this.say(`pays {${n}} for ${src.name}`, p); }
    return pay;
  }
  async makeArtifactTokens(p, kind, n, tapped) {
    if (kind === 'treasure' && p.battlefield.some(b => b.card.statics && b.card.statics.treasurePlus && !b.neutral)) n += 1;
    if (['clue', 'food', 'treasure'].includes(kind) && !this._manu && p.battlefield.some(b => b.card.statics && b.card.statics.manufactor && !b.neutral)) { this._manu = true; try { for (const k of ['clue', 'food', 'treasure']) await this.makeArtifactTokens(p, k, n, tapped); } finally { this._manu = false; } return; }
    n = Math.min(this.tokenAmt(p, n, false), 16); if (n <= 0) return;
    const K = kind.charAt(0).toUpperCase() + kind.slice(1);
    const T = { treasure: { manaAb: { amount: 1, colors: ['W', 'U', 'B', 'R', 'G'], sac: true }, text: '{T}, Sacrifice this artifact: Add one mana of any color.' },
      clue: { abilities: [{ zone: 'battlefield', label: 'draw', cost: manaInfo('{2}'), sacSelf: true, speed: 'instant', ops: [{ op: 'draw', n: 1 }] }], text: '{2}, Sacrifice this artifact: Draw a card.' },
      food: { abilities: [{ zone: 'battlefield', label: 'gain 3', cost: manaInfo('{2}'), tap: true, sacSelf: true, speed: 'instant', ops: [{ op: 'gain', n: 3 }] }], text: '{2}, {T}, Sacrifice this artifact: You gain 3 life.' },
      blood: { abilities: [{ zone: 'battlefield', label: 'rummage', cost: manaInfo('{1}'), tap: true, sacSelf: true, discard: 1, speed: 'instant', ops: [{ op: 'draw', n: 1 }] }], text: '{1}, {T}, Discard a card, Sacrifice this artifact: Draw a card.' },
      gold: { manaAb: { amount: 1, colors: ['W', 'U', 'B', 'R', 'G'], sac: true }, text: 'Sacrifice this token: Add one mana of any color.' },
      powerstone: { manaAb: { amount: 1, colors: ['C'], artifactOnly: true }, text: "{T}: Add {C}. This mana can't be spent to cast a nonartifact spell." },
      map: { abilities: [{ zone: 'battlefield', label: 'explore', cost: manaInfo('{1}'), tap: true, sacSelf: true, speed: 'sorcery', ops: [{ op: 'counters', n: 1, to: 'target creature' }] }], text: '{1}, {T}, Sacrifice this artifact: Target creature you control explores.' } }[kind] || { text: '' };
    for (let k = 0; k < n; k++) p.battlefield.push({ id: UID++, tapped: !!tapped, card: { uid: UID++, name: K, type: 'Token Artifact — ' + K, oracle: T.text, isArtifact: true, token: true, kw: [], roles: [], colors: [], mana: manaInfo(''), cmc: 0, produces: [], triggers: [], abilities: T.abilities || [], manaAb: T.manaAb || null, statics: {}, anthems: [], reducers: [], img: '' }, tapped: !!tapped, summoning: false, counters: 0 });
    this.say(`— creates ${n} ${K} token${n > 1 ? 's' : ''}`, p); await this.emit({ type: 'tokens', p, n, card: { name: K } });
    for (const t of p.battlefield.slice(-n)) await this.permEntered(p, t);
    await this.tokenEvent(p);
  }
  async loreUp(p, pm) {
    const sg = (pm.card.orig || pm.card).saga || pm.card.saga; if (!sg) return;
    pm.lore = (pm.lore || 0) + 1;
    for (const ch of sg.ch.filter(c => c.nums.includes(pm.lore))) { this.say(`— ${pm.card.name}: chapter ${pm.lore}`, p); if (ch.ops.length) await this.runOps(p, ch.ops, pm.card, { perm: pm }); else if (/search your library for an artifact card with mana cost \{0\} or \{1\}, put it onto the battlefield/.test(ch.text)) await this.runOps(p, [{ op: 'tutorTo', filter: 'artifact', max: 1, dest: 'battlefield', n: 1 }], pm.card, { perm: pm }); }
    if (pm.lore >= sg.last && p.battlefield.includes(pm)) { this.say(`— ${pm.card.name} is sacrificed (final chapter)`, p); await this.sacrifice(p, pm); }
  }
  /** state-based action: creatures with 0 or less toughness die */
  async sba() { for (const q of this.alive()) for (const b of q.battlefield.filter(b => b.card.isCreature && this.toughOf(q, b) <= 0)) { this.say(`— ${b.card.name} dies (0 toughness)`, q); await this.destroy(q, b); } }
  chooseColor(p) { const n = {}; for (const c of [...p.library, ...p.hand, ...p.command, ...p.battlefield.map(b => b.card)]) for (const x of c.colors || []) n[x] = (n[x] || 0) + 1; return Object.entries(n).sort((a, z) => z[1] - a[1])[0]?.[0] || 'W'; }
  /** "As this enters, choose a creature type": the most common type among the player's creatures; the card is re-read with that type */
  chooseCreatureType(p) {
    const cnt = new Map(); const skip = new Set(['legendary', 'creature', 'artifact', 'enchantment', 'kindred', 'tribal', 'snow', 'basic', 'token', 'god', 'human']);
    for (const c of [...p.library, ...p.hand, ...p.graveyard, ...p.command, ...p.battlefield.map(b => b.card)]) { if (!c.isCreature || c.changeling) continue; const sub = (c.type.split('—')[1] || '').trim().toLowerCase(); for (const w of sub.split(/\s+/).filter(Boolean)) if (!skip.has(w)) cnt.set(w, (cnt.get(w) || 0) + 1); }
    const best = [...cnt].sort((a, b) => b[1] - a[1])[0]; return best ? best[0] : 'human';
  }
  /** "As this enchantment enters, choose Temur or Sultai." — keep only the chosen bullet's text */
  siegeCard(card, mode) {
    const lines = card.oracle.split('\n'); const keep = lines.filter(l => !/^As this \w+ enters, choose \w+ or \w+\.?$/i.test(l) && !/^• /.test(l)); const b = lines.find(l => new RegExp('^• ' + mode + ' — ', 'i').test(l));
    const t = tagCard({ name: card.name, type: card.type, oracle: [...keep, b ? b.replace(/^• \w+ — /, '') : ''].filter(Boolean).join('\n'), mana: card.manaCost, cmc: card.cmc, power: card.power, toughness: card.toughness, keywords: card.kw });
    t.img = card.img; t.orig = card; t.isCommander = false; t.siegeMode = mode; return t;
  }
  async chooseSiege(p, card) {
    const [a, b] = card.siege; const txt = m => ((card.oracle.split('\n').find(l => new RegExp('^• ' + m + ' — ', 'i').test(l)) || '').replace(/^• \w+ — /, ''));
    if (p.human && this.hooks.humanModes) { const modes = [a, b].map(m => ({ text: m + ' — ' + txt(m), card: { name: m } })); const r = await this.hooks.humanModes({ p, card, modes, min: 1, max: 1 }); const pick = r && r[0] && r[0].name; if (pick) return pick; }
    const score = m => { const t = txt(m).toLowerCase(); let v = 0; const cr = p.battlefield.filter(x => x.card.isCreature).length + p.hand.filter(c => c.isCreature).length;
      if (/creatures you control get/.test(t)) v += cr * 1.2; if (/play lands from your graveyard/.test(t)) v += 3 + p.graveyard.filter(c => c.isLand).length; if (/instant or sorcery/.test(t)) v += p.hand.concat(p.library.slice(-20)).filter(c => c.isInstant || c.isSorcery).length * 0.6; if (/upkeep, create/.test(t)) v += 4; if (/triggers an additional time/.test(t)) v += p.battlefield.reduce((s, x) => s + (x.card.triggers || []).filter(tr => tr.when === 'attack').length, 0) * 2; if (/draw a card/.test(t)) v += 3; return v; };
    return score(a) >= score(b) ? a : b;
  }
  chosenTypeCard(card, ty) {
    let o = card.oracle.replace(/As this (artifact|creature|enchantment|land) enters, choose a creature type\.\s*/i, '').replace(/^.*choose a creature type\.\s*/im, '');
    o = o.replace(/another creature you control of the chosen type/gi, `another ${ty} you control`).replace(/creature spells you cast of the chosen type/gi, `${ty} spells you cast`).replace(/creature spells of the chosen type/gi, `${ty} spells you cast`)
      .replace(/creatures you control of the chosen type/gi, `${ty}s you control`).replace(/other creatures of the chosen type you control/gi, `other ${ty}s you control`)
      .replace(/a creature spell of the chosen type/gi, `a ${ty} spell`).replace(/whenever a creature you control of the chosen type enters or attacks, (.+)/gi, (s, eff) => `Whenever ${ty} creature you control enters, ${eff}\nWhenever a ${ty} you control attacks, ${eff}`)
      .replace(/a creature you control of the chosen type/gi, `${ty} creature you control`).replace(/creature card of the chosen type/gi, `${ty} card`).replace(/the chosen type/gi, ty);
    const t = tagCard({ name: card.name, type: card.type, oracle: o, mana: card.manaCost, cmc: card.cmc, power: card.power, toughness: card.toughness, keywords: card.kw, loyalty: card.startLoyalty });
    t.img = card.img; t.orig = card; t.chosenType = ty; t.isCommander = false; return t;
  }
  /** a permanent card enters from anywhere: clones copy something, auras attach, "enters tapped" statics apply */
  /** Elesh Norn: permanents entering don't trigger abilities of her controller's opponents */
  etbSuppressed(q) { return this.opponentsOf(q).some(o => o.battlefield.some(b => b.card.statics && b.card.statics.noOppEtb && !b.neutral)); }
  async enterPerm(p, card, { tapped = false, summoning = null, target = null, quiet = false, x = 0, kicks = 0, isCopy = false } = {}) {
    if (isCopy) card = { ...card, uid: UID++, token: true, isCommander: false };
    const pm = { id: UID++, card, tapped, summoning: summoning == null ? card.isCreature : summoning, counters: 0, loyalty: card.isPlaneswalker ? (card.startLoyalty || 4) : 0 };
    if (card.choosesColor) { pm.chosenColor = this.chooseColor(p); this.say(`— ${card.name}: chooses ${{ W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' }[pm.chosenColor]}`, p); }
    if (card.siege) { const mode = await this.chooseSiege(p, card); pm.card = this.siegeCard(card, mode); this.say(`— ${card.name}: chooses ${mode}`, p); }
    if (/choose a creature type/i.test(card.oracle) && !card.isLand) { const ty = this.chooseCreatureType(p); pm.card = this.chosenTypeCard(card, ty); pm.chosenType = ty; this.say(`— ${card.name}: chooses ${ty}`, p);
      if (/each other creature you control of the chosen type enters with an additional \+1\/\+1 counter/i.test(card.oracle)) pm.mimicType = ty;
      if (/is the chosen type in addition to its other types/i.test(card.oracle)) pm.card.type += ' ' + ty.charAt(0).toUpperCase() + ty.slice(1);
      if (/enters with a fellowship counter on it for each creature you control of the chosen type/i.test(card.oracle)) { const n = p.battlefield.filter(b => b.card.isCreature && matchesFilter(b.card, ty)).length; pm.fellowship = n; pm.card.anthems = [{ other: false, filter: ty, pump: [n, n], kws: [] }]; this.say(`— ${n} fellowship counters`, p); } }
    if (/^as this artifact enters, choose artifact, creature, enchantment, instant, or sorcery/im.test(card.oracle)) { const n = {}; for (const c of [...p.library, ...p.hand]) for (const t of ['artifact', 'creature', 'enchantment', 'instant', 'sorcery']) if (c.type.toLowerCase().includes(t)) n[t] = (n[t] || 0) + 1; pm.chosenCardType = Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || 'creature'; this.say(`— ${card.name}: chooses ${pm.chosenCardType}`, p); }
    if (card.fabricate) { const servo = p.battlefield.filter(b => b.card.isCreature).length < 3 || !card.isCreature; if (servo) { await this.runOps(p, [{ op: 'tokens', n: card.fabricate, pt: [1, 1], kw: [], artifact: true }], { name: 'Servo' }, {}); } else pm.counters += this.counterAmt(p, card.fabricate); }
    if (card.echo) pm.echoPending = true;
    const S = card.statics || {};
    { const lo = card.oracle.toLowerCase(); let m;
      if (/this (?:creature|artifact) enters with x \+1\/\+1 counters on it/.test(lo)) pm.counters += this.counterAmt(p, x);
      if ((m = lo.match(/this (?:creature|artifact) enters with (a|two|three) \+1\/\+1 counters? on it/))) pm.counters += this.counterAmt(p, numOf(m[1]));
      if (/enters with a charge counter on it for each time it was kicked/.test(lo)) pm.charge = kicks;
      if ((m = lo.match(/enters with (a|two|three) (wish|hour|charge|quest|descent) counters? on it(?! for each)/))) pm[m[2]] = numOf(m[1]);
      if (card.isCreature) for (const b of p.battlefield) if (b.mimicType && b !== pm && matchesFilter(card, b.mimicType)) pm.counters += this.counterAmt(p, 1);
      pm.enteredTurn = this.turn; }
    if (S.etbTappedPerm) pm.tapped = true;
    for (const q of this.opponentsOf(p)) if (q.battlefield.some(b => { const s = b.card.statics; return s && s.oppEnterTapped && !b.neutral && (card.isCreature || (s.oppEnterTapped !== 'creatures' && card.isArtifact)); })) pm.tapped = true;
    if (card.mirrorClone) { const pool = this.allPerms(b => b.card.isCreature); const src = p.ai ? [...pool].sort((a, b) => p.ai.permBase(b) - p.ai.permBase(a))[0] : await this.pickPerm(p, card, pool, { dest: 'copy' }); if (src) { pm.revertCard = card; pm.revertTurn = this.turn; pm.card = { ...(src.card.orig || src.card), uid: UID++, isCommander: false, kw: [...((src.card.orig || src.card).kwBase || (src.card.orig || src.card).kw || []), 'haste'], kwBase: [...((src.card.orig || src.card).kwBase || (src.card.orig || src.card).kw || []), 'haste'], orig: card }; pm.summoning = false; this.say(`— ${card.name} becomes a copy of ${src.card.name} until end of turn`, p); } }
    if (card.flashSacIfInstant && !(this.players[this.active] === p && /main/.test(this.phase) && !this.stack.filter(o => o.card !== card).length)) pm.sacAtEnd = true;
    if (S.clone) {
      const pool = this.alive().flatMap(q => (S.clone.mine && q !== p) ? [] : q.battlefield.filter(b => b.card.isCreature || (/artifact/.test(S.clone.what) && b.card.isArtifact) || (/permanent/.test(S.clone.what) && !b.card.isLand)).filter(b => !(/nonlegendary/.test(S.clone.what) && b.card.isLegendary)));
      let src = null;
      if (pool.length) { if (p.human) { const pick = (await this.chooseFromList(p, card, pool.map(b => b.card), 1, 'copy'))[0]; src = pool.find(b => b.card === pick); } else if (p.ai) src = [...pool].sort((a, b) => p.ai.permBase(b) - p.ai.permBase(a))[0]; }
      if (src) { const base = src.card.orig || src.card; pm.card = { ...base, uid: UID++, isCommander: false, token: !!card.token, kwBase: null, kw: (base.kwBase || base.kw || []).slice(), orig: card }; pm.summoning = pm.card.isCreature; this.say(`— ${card.name} enters as a copy of ${base.name}`, p); }
    }
    if (/^imprint — when this artifact enters, you may exile a nonartifact, nonland card from your hand/im.test(card.oracle)) {
      const pool = p.hand.filter(c => !c.isLand && !c.isArtifact && c.colors.length);
      let pick = null; if (pool.length) { if (p.human) pick = (await this.chooseFromList(p, card, pool, 1, 'imprint'))[0]; else pick = [...pool].sort((a, b) => (p.ai.castValueRaw(this, p, a) - a.cmc) - (p.ai.castValueRaw(this, p, b) - b.cmc))[0]; }
      if (pick) { p.hand.splice(p.hand.indexOf(pick), 1); p.exile.push(pick); pm.card = { ...card, uid: UID++, manaAb: { amount: 1, colors: pick.colors.slice() }, orig: card }; this.say(`— imprints ${pick.name}`, p); }
      else pm.card = { ...card, uid: UID++, manaAb: null, orig: card };
    }
    if (/^imprint — when this artifact enters, you may exile an instant card with mana value 2 or less from your hand/im.test(card.oracle)) {
      const pool = p.hand.filter(c => c.isInstant && c.cmc <= 2);
      let pick = null; if (pool.length) pick = p.human ? (await this.chooseFromList(p, card, pool, 1, 'imprint'))[0] : [...pool].sort((a, b) => p.ai.castValueRaw(this, p, b) - p.ai.castValueRaw(this, p, a))[0];
      if (pick) { p.hand.splice(p.hand.indexOf(pick), 1); p.exile.push(pick); pm.imprinted = pick; this.say(`— imprints ${pick.name}`, p); }
    }
    if (/^if this artifact would enter, you may discard a land card instead/im.test(card.oracle)) {
      const pool = p.hand.filter(c => c.isLand); let d = null;
      if (pool.length) d = p.human ? (await this.chooseFromList(p, card, pool, 1, 'discard'))[0] : pool.sort((a, b) => a.produces.length - b.produces.length)[0];
      if (!d) { p.graveyard.push(card); this.say(`— ${card.name} goes to the graveyard (no land discarded)`, p); return null; }
      p.hand.splice(p.hand.indexOf(d), 1); p.graveyard.push(d); this.say(`— discards ${d.name} for ${card.name}`, p);
    }
    if (card.etbSuspect) pm.suspect = Math.max(0, ...this.alive().map(q => q.battlefield.filter(b => b.card.isCreature).length));
    p.battlefield.push(pm);
    if (card.livingWeapon) { const germ = { id: UID++, card: { uid: UID++, name: 'Phyrexian Germ', type: 'Token Creature — Phyrexian Germ', isCreature: true, power: 0, toughness: 0, kw: [], roles: [], colors: ['B'], mana: manaInfo(''), cmc: 0, token: true, oracle: '', statics: {}, triggers: [], abilities: [], anthems: [] }, tapped: false, summoning: true, counters: 0, enteredTurn: this.turn }; p.battlefield.push(germ); pm.attachedTo = germ.id; this.say(`— creates a 0/0 Germ and attaches ${card.name}`, p); }
    for (const q of this.opponentsOf(p)) if (!pm.tapped && (card.isCreature || card.isArtifact) && q.battlefield.some(b => b.card.statics && b.card.statics.conqueror && !b.neutral)) { const tapIt = p.ai ? (!card.isCreature || pm.summoning) && !card.manaAb : !!(this.hooks.humanMay && await this.hooks.humanMay({ p, card, question: 'tap it (otherwise the Conqueror\'s controller gets a 1/1 Vampire)?' })); if (tapIt) pm.tapped = true; else await this.runOps(q, [{ op: 'tokens', n: 1, pt: [1, 1], kw: ['lifelink'] }], { name: 'Vampire' }, {}); }
    if (S.enchant === 'player') { const o = p.ai ? this.opponentsOf(p).sort((a, b) => p.ai.threatOf(this, p, b) - p.ai.threatOf(this, p, a))[0] : await this.choosePlayer(p, card, this.opponentsOf(p), `${card.name}: enchant which player?`); pm.enchantedPlayer = o || this.opponentsOf(p)[0]; this.say(`— ${card.name} enchants ${pm.enchantedPlayer ? pm.enchantedPlayer.name : 'nobody'}`, p); return pm; }
    if (S.enchant === 'artifact you control') { const t = p.ai ? p.battlefield.filter(b => b.card.isArtifact).sort((a, b) => p.ai.permBase(b) - p.ai.permBase(a))[0] : await this.pickPerm(p, card, p.battlefield.filter(b => b.card.isArtifact)); if (!t) { p.battlefield.splice(p.battlefield.indexOf(pm), 1); p.graveyard.push(card); return null; } pm.attachedTo = t.id; this.say(`— ${card.name} enchants ${t.card.name}`, p); return pm; }
    if (S.enchant === 'creature card in a graveyard' || (card.reanimate && /it becomes an aura/i.test(card.oracle))) { pm.animateAura = true; return pm; }
    if (S.enchant && /creature/.test(S.enchant) && !S.auraBuff && !S.auraNeutralize) { const t = await this.pickPerm(p, card, p.battlefield.filter(b => b.card.isCreature || (/planeswalker/.test(S.enchant) && b.card.isPlaneswalker))); if (!t) { p.battlefield.splice(p.battlefield.indexOf(pm), 1); p.graveyard.push(card); this.say(`— ${card.name} has nothing to enchant`, p); return null; } pm.attachedTo = t.id; this.say(`— ${card.name} enchants ${t.card.name}`, p); return pm; }
    if (S.enchant && /creature/.test(S.enchant) && (S.auraBuff || S.auraNeutralize) && !card.reanimate) {
      let host = target && target.card && this.ownerOf(target) ? target : null;
      if (!host) { const pool = S.auraNeutralize ? this.opponentsOf(p).flatMap(q => q.battlefield.filter(b => b.card.isCreature)) : p.battlefield.filter(b => b.card.isCreature);
        if (pool.length) { if (p.human) { const pick = (await this.chooseFromList(p, card, pool.map(b => b.card), 1, 'enchant'))[0]; host = pool.find(b => b.card === pick); } else host = S.auraNeutralize ? [...pool].sort((a, b) => p.ai.permBase(b) - p.ai.permBase(a))[0] : p.ai.bestEquipTarget(this, p, pm); } }
      if (host) { pm.attachedTo = host.id; this.say(`— ${card.name} enchants ${host.card.name}`, p); }
      else { p.battlefield.splice(p.battlefield.indexOf(pm), 1); p.graveyard.push(card); this.say(`— ${card.name} has nothing to enchant`, p); return null; }
    }
    return pm;
  }
  targetName(t) { return !t ? '' : t.spell ? t.spell.card.name + ' (on the stack)' : t.card ? t.card.name : t.name; }
  ownerOf(perm) { return this.players.find(q => q.battlefield.includes(perm)) || null; }
  isUncounterable(obj) { return !!obj.card.uncounterable || !!obj.uncounterable || (obj.card.isCreature && obj.caster.battlefield.some(b => b.chosenType && /can't be countered/i.test(b.card.oracle) && matchesFilter(obj.card, b.chosenType))) || obj.caster.battlefield.some(b => (b.card.noCounter || []).some(f => matchesFilter(obj.card, f))); }
  /** protection from a colour stops targeting by spells of that colour */
  protectedFrom(t, card) { return !!(t && t.protColors && (card.colors || []).some(c => t.protColors.includes(c))); }
  /** is the object's target still legal as it tries to resolve? */
  targetLegal(obj) {
    const t = obj.target; if (!t) return true;
    if (t.spell) return this.stack.includes(t.spell);
    if (t.card) { const o = this.ownerOf(t); if (!o) return false; if (o !== obj.caster && ((t.protTurn === this.turn && !(o.stripTurn && o.stripTurn.turn === this.turn)) || t.card.kw.includes('hexproof') || t.card.kw.includes('shroud') || this.protectedFrom(t, obj.card))) return false; return true; }
    if (t.life !== undefined) return !t.dead;
    return true;
  }
  /** where a spell card goes when it leaves the stack (non-permanents after resolving, or anything countered / fizzled) */
  async leaveStack(obj) {
    if (obj.isMode) return;
    const { card, zone } = obj; const p = obj.owner || obj.caster;
    if (card.rebound && zone === 'hand' && !obj.countered && !obj.fizzled && !card.isCommander) { obj.caster.exile.push(card); (obj.caster.rebound = obj.caster.rebound || []).push(card); this.say(`— ${card.name} is exiled (rebound)`, obj.caster); return; }
    if (card.token) return;
    if (card.isCommander) { p.command.push(card); this.say(`— ${card.name} returns to the command zone`, p); }
    else if (zone === 'gy' && (obj.gyKind ? obj.gyExile : card.gyCast && card.gyCast.exileAfter)) { p.exile.push(card); this.say(`— ${card.name} is exiled`, p); }
    else p.graveyard.push(card);
  }
  /** spells of players who left the game leave the stack */
  purgeStack() { for (const o of [...this.stack]) if (o.caster.dead) { this.stack.splice(this.stack.indexOf(o), 1); this.say(`— ${o.card.name} leaves the stack (its controller left the game)`); } }
  async runStack(starter) {
    this.stackBusy = (this.stackBusy || 0) + 1;
    try {
      let first = starter, guard = 300;
      while (this.stack.length && !this.winner && guard-- > 0) {
        this.purgeStack(); if (!this.stack.length) break;
        if (first.dead) first = this.players[this.active].dead ? this.alive()[0] : this.players[this.active];
        if (!first) break;
        const actor = await this.stackPriority(first);
        if (actor) { first = actor; continue; } // something new on the stack: the player who acted gets priority again
        const obj = this.stack.pop();
        await this.emit({ type: 'resolving', obj, p: obj.caster, card: obj.card });
        await this.resolveObj(obj); await this.sba();
        first = this.players[this.active];
      }
    } finally { this.stackBusy--; }
  }
  stackSig() { return this.stack.map(o => o.id + ':' + (o.target && o.target.spell ? 's' + o.target.spell.id : o.target && o.target.card ? 'p' + o.target.id : o.target ? 'q' + o.target.i : '')).join(','); }
  /** what q could do with priority while the stack is not empty */
  stackOptions(q) {
    if (q.dead) return [];
    const out = [];
    for (const c of q.hand) {
      if (!this.canFlash(q, c) || !this.castMode(q, c, 'hand', { instant: true })) continue;
      if (c.roles.includes('counter') && !this.stack.some(o => o.caster !== q && counterHits(c, o.card) && !this.isUncounterable(o))) continue;
      if (c.redirect && !this.stack.some(o => o.target)) continue;
      out.push({ kind: 'cast', card: c, zone: 'hand' });
    }
    out.push(...this.gyCastOptions(q, { instant: true }), ...this.abilityOptions(q, { instant: true }));
    for (const b of q.battlefield) if (b.card.fetch && this.canActivate(q, b)) out.push({ kind: 'fetch', perm: b, card: b.card });
    if (this.stack.some(o => o.card.splitSecond)) return [];
    return out;
  }
  async stackPriority(first) {
    const order = [first, ...this.after(first)].filter(q => !q.dead);
    const sig = this.stackSig();
    for (const q of order) {
      if (this.winner) return null;
      const options = this.stackOptions(q); if (!options.length) continue;
      let act = null;
      if (q.human) { if (q.passedSig !== sig && this.hooks.humanPriority) { act = await this.hooks.humanPriority({ step: 'stack', active: this.players[this.active], options, stack: this.stack }); if (!act) q.passedSig = sig; } }
      else if (q.ai) act = q.ai.stackResponse(this, q, options);
      if (act) { const before = this.stack.length; const ok = await this.doAction(q, { ...act, instant: true }); if (ok || this.stack.length !== before) return q; }
    }
    return null;
  }
  async resolveObj(obj) {
    const { card, caster: p } = obj;
    if (obj.target && !this.targetLegal(obj)) {
      obj.fizzled = true; this.say(`— ${card.name} fizzles: ${obj.target.spell ? obj.target.spell.card.name + ' is no longer on the stack' : 'its target is no longer legal'}`, p);
      await this.emit({ type: 'fizzle', p, card, obj }); await this.leaveStack(obj); return;
    }
    obj.resolved = true;
    await this.resolve(obj);
  }
  /** legal new targets for a redirected spell, from the original caster's point of view */
  retargetCandidates(obj) {
    const c = obj.card, o = c.oracle.toLowerCase(), caster = obj.caster, out = [];
    if (c.roles.includes('counter')) { for (const s of this.stack) if (s !== obj && counterHits(c, s.card) && !(obj.target && s === obj.target.spell)) out.push({ spell: s }); return out; }
    const perms = this.alive().flatMap(q => q.battlefield.map(b => { b.owner = q.i; return b; })).filter(b => !(this.ownerOf(b) !== caster && (b.card.kw.includes('hexproof') || b.card.kw.includes('shroud'))));
    if (c.roles.includes('removal')) {
      const ok = /target (creature or planeswalker|creature)/.test(o) ? (b => b.card.isCreature || (/planeswalker/.test(o) && b.card.isPlaneswalker)) : /target artifact or enchantment/.test(o) ? (b => b.card.isArtifact || b.card.isEnchantment) : /target artifact/.test(o) ? (b => b.card.isArtifact) : /target enchantment/.test(o) ? (b => b.card.isEnchantment) : /target nonland permanent/.test(o) ? (b => !b.card.isLand) : /target permanent/.test(o) ? (b => true) : (b => b.card.isCreature);
      out.push(...perms.filter(ok));
    }
    if (c.dmg) { if (/any target|target creature/.test(o)) out.push(...perms.filter(b => b.card.isCreature && !out.includes(b))); if (/any target|target player|target opponent/.test(o)) out.push(...this.alive().filter(q => !(/opponent/.test(o) && q === caster))); }
    return out.filter(t => t !== obj.target);
  }
  async doRedirect(p, card, target) {
    const victim = target && target.spell; if (!victim || !this.stack.includes(victim) || !victim.target) { this.say(`— nothing to redirect`, p); return; }
    const cands = this.retargetCandidates(victim); if (!cands.length) { this.say(`— ${victim.card.name} has no other legal target`, p); return; }
    let nt = null;
    if (p.human) nt = this.hooks.humanRetarget ? await this.hooks.humanRetarget({ p, card, obj: victim, candidates: cands }) : null;
    else if (p.ai) nt = p.ai.chooseRetarget(this, p, victim, cands);
    if (!nt) { this.say(`— keeps ${victim.card.name}'s target`, p); return; }
    victim.target = nt; this.say(`— ${victim.card.name} now targets ${this.targetName(nt)}`, p);
    await this.emit({ type: 'retarget', p, obj: victim, target: nt });
  }
  async resolve(spell) {
    const { card, caster: p, target } = spell;
    if (spell.modes && spell.modes.length) {
      for (const sub of spell.modes) { if (p.dead || this.winner) break; await this.resolve({ card: sub, caster: p, target: await this.modeTarget(p, sub, target), zone: 'mode', isMode: true }); }
      await this.leaveStack(spell, 'resolved'); await this.emit({ type: 'resolve', p, card }); return;
    }
    if (card.redirect) { await this.doRedirect(p, card, target); await this.leaveStack(spell, 'resolved'); await this.emit({ type: 'resolve', p, card }); return; }
    // counterspell resolving against a spell on the stack
    if (card.roles.includes('counter') && target && target.spell) {
      const victim = target.spell;
      if (card.counter.unless && victim.caster && this.canPayCost(victim.caster, { generic: card.counter.unless, pips: { W: 0, U: 0, B: 0, R: 0, G: 0 }, total: card.counter.unless }) && await this.choosePayUnless(victim.caster, victim, card, card.counter.unless)) {
        this.payCost(victim.caster, { generic: card.counter.unless, pips: { W: 0, U: 0, B: 0, R: 0, G: 0 }, total: card.counter.unless });
        this.say(`pays {${card.counter.unless}} for ${card.name}`, victim.caster); await this.emit({ type: 'paid', p: victim.caster, n: card.counter.unless });
      } else if (this.isUncounterable(victim)) this.say(`— ${victim.card.name} can't be countered`, p);
      else { const i = this.stack.indexOf(victim); if (i >= 0) { this.stack.splice(i, 1); victim.countered = true; this.say(`— ${victim.card.name} is countered`, p); await this.emit({ type: 'countered', p: victim.caster, card: victim.card, obj: victim, by: card }); await this.leaveStack(victim, 'countered'); } }
      if (card.spellOps) await this.runOps(p, card.spellOps, card, { target });
      await this.leaveStack(spell, 'resolved'); await this.emit({ type: 'resolve', p, card }); return;
    }
    const perm = card.isCreature || card.isArtifact || card.isEnchantment || card.isPlaneswalker;
    if (card.roles.includes('wipe')) {
      await this.emit({ type: 'wipe', p, card });
      const hit = this.wipeHits(card, p); const exileOp = (card.spellOps || []).some(op => op.op === 'destroyAll' && op.how === 'exile' && /creature/.test(op.what || ''));
      if (!exileOp) for (const q of this.alive()) for (const b of q.battlefield.filter(b => b.card.isCreature && !b.card.kw.includes('indestructible') && b.protTurn !== this.turn && hit(b, q))) await this.destroy(q, b, true);
      if (!exileOp) this.say(hit.all ? `— board wiped` : `— destroys ${hit.desc}`, p);
      for (const q of this.alive()) if (q.battlefield.some(x => x.card.isCreature && x.protTurn === this.turn)) this.say(`— ${q.name}'s creatures survive (protected)`, p);
    } else if (card.roles.includes('removal') && target && target.card && !(card.statics && card.statics.enchant) && !(card.spellOps || []).some(o => ['shrinkTarget', 'dispatch', 'swine', 'oring', 'destroyUpTo', 'bounceSpellOrPerm'].includes(o.op))) {
      const owner = this.players[target.owner];
      if (!owner.battlefield.includes(target)) this.say(`— target is gone`, p);
      else if (target.protTurn === this.turn) this.say(`— ${target.card.name} is protected`, p);
      else if (target.card.kw.includes('indestructible') && !/exile|return/.test(card.oracle.toLowerCase())) this.say(`— ${target.card.name} is indestructible`, p);
      else {
        const o = card.oracle.toLowerCase();
        if (/to (its|their) owner's hand/.test(o) && !/exile/.test(o)) await this.bounce(owner, target, p);
        else if (/shuffles it into (its|their) library|on the bottom of (its|their) owner's library|on top of (its|their) owner's library/.test(o)) await this.tuck(owner, target, p, /on top/.test(o));
        else { const tough = this.toughOf(owner, target); await this.destroy(owner, target); if (/if a creature is destroyed this way, you gain life equal to its toughness/.test(o) && !owner.battlefield.includes(target)) await this.changeLife(p, tough, card); }
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
      const n = Math.min(this.tokenAmt(p, card.tokenCount, true), 16);
      for (let k = 0; k < n; k++) p.battlefield.push({ id: UID++, card: { uid: UID++, name: card.name + ' token', type: 'Token Creature', isCreature: true, power: card.tokenPT[0], toughness: card.tokenPT[1], kw: card.oracle.toLowerCase().includes('token with flying') ? ['flying'] : [], roles: [], mana: { total: 0, pips: {}, generic: 0 }, cmc: 0, token: true, colors: [], oracle: `${card.tokenPT[0]}/${card.tokenPT[1]} token created by ${card.name}` }, tapped: false, summoning: true, counters: 0 });
      await this.emit({ type: 'tokens', p, n, card });
      for (const t of p.battlefield.slice(-n)) await this.creatureEntered(p, t);
    }
    if (card.roles.includes('protect') && card.isInstant) this.doProtect(p, card);
    if (card.tutor) await this.doTutor(p, card);
    if (card.addendum && this.players[this.active] === p && /main/.test(this.phase)) await this.runOps(p, card.addendum, card, {});
    if (card.spellOps) await this.runOps(p, card.spellOps, card, { spell, x: spell.x, kicked: spell.kicked, gift: spell.gift, bargained: spell.bargained, target });
    if (card.gyHate) await this.doGyHate(p, card);
    if (card.reanimate && !(card.isEnchantment && (/aura/i.test(card.type) || /it becomes an aura/i.test(card.oracle)))) await this.doReanimate(p, card);
    if (!perm && card.roles.includes('pump')) p.pumpUntilEOT = (p.pumpUntilEOT || 0) + (card.pumpN || 1);
    if (!perm && card.roles.includes('extracombat')) p.extraCombat = true;
    let pm = null;
    if (perm && spell.alt === 'bestow') { pm = await this.enterPerm(p, card, { target }); if (pm) { const host = p.battlefield.filter(b => b.card.isCreature && b !== pm).sort((a, z) => (p.ai ? p.ai.permBase(z) - p.ai.permBase(a) : 0))[0]; if (host) { pm.attachedTo = host.id; pm.bestowed = true; this.say(`— ${card.name} is bestowed on ${host.card.name}`, p); } } }
    else if (perm) { pm = await this.enterPerm(p, card, { target, x: spell.x, kicks: spell.kicks, isCopy: spell.isCopy }); if (pm && spell.extraCounters) { pm.counters = (pm.counters || 0) + spell.extraCounters; this.say(`— ${card.name} enters with ${spell.extraCounters} extra +1/+1 counters`, p); } if (pm && spell.gyKind === 'escape') pm.escaped = true; if (pm && spell.gyKind === 'muldrotha') pm.fromGy = true; }
    else await this.leaveStack(spell, 'resolved');
    await this.emit({ type: 'resolve', p, card, perm: pm });
    if (pm && pm.card.etbFirst) await this.runOps(p, pm.card.etbFirst, pm.card, { perm: pm });
    if (pm && pm.card.etbOps && !this.etbSuppressed(p)) for (let k = this.etbTimes(p, pm); k > 0; k--) await this.runOps(p, pm.card.etbOps, pm.card, { perm: pm, x: spell.x, kicked: spell.kicked });
    if (pm && card.reanimate && card.isEnchantment && (/aura/i.test(card.type) || /it becomes an aura/i.test(card.oracle))) await this.doReanimate(p, card);
    if (pm && spell.alt === 'evoke') { this.say(`— ${card.name} is sacrificed (evoked)`, p); await this.sacrifice(p, pm); }
    if (pm && spell.alt === 'dash') { pm.dashed = true; pm.summoning = false; }
    if (pm && card.kicker && card.kicker.offspring && spell.kicks) await this.runOps(p, [{ op: 'tokenCopyOf', n: 1, pt: [1, 1] }], card, { perm: pm });
    if (pm) { await this.creatureEntered(p, pm); await this.permEntered(p, pm); }
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
  /** which creatures a sweeper actually hits: "destroy all creatures that entered this turn", "with power 4 or greater", "you don't control"... */
  wipeHits(card, caster) {
    const o = (card.oracle || '').toLowerCase(); let m; const tests = [], desc = [];
    if (/creatures that entered (the battlefield )?this turn/.test(o)) { tests.push(b => b.enteredTurn === this.turn); desc.push('creatures that entered this turn'); }
    if ((m = o.match(/(?:destroy|exile) all creatures with power (\d+) or (greater|less)/))) { const n = +m[1], ge = m[2] === 'greater'; tests.push((b, q) => ge ? this.powerOf(q, b) >= n : this.powerOf(q, b) <= n); desc.push(`creatures with power ${n} or ${m[2]}`); }
    if ((m = o.match(/(?:destroy|exile) all (?:creatures|nonland permanents) with mana value (\d+) or (greater|less)/))) { const n = +m[1], ge = m[2] === 'greater'; tests.push(b => ge ? (b.card.cmc || 0) >= n : (b.card.cmc || 0) <= n); desc.push(`creatures with mana value ${n} or ${m[2]}`); }
    if (/(?:destroy|exile) all (?:creatures|nonland permanents) (?:you don't control|your opponents control)|each creature your opponents control/.test(o)) { tests.push((b, q) => q !== caster); desc.push("opponents' creatures"); }
    if (/(?:destroy|exile) all non-?artifact creatures/.test(o)) { tests.push(b => !b.card.isArtifact); desc.push('nonartifact creatures'); }
    if (/(?:destroy|exile) all (?:tapped creatures)/.test(o)) { tests.push(b => b.tapped); desc.push('tapped creatures'); }
    const f = (b, q) => tests.every(t => t(b, q)); f.all = !tests.length; f.desc = desc.join(', '); return f;
  }
  threatTo(q, spell) {
    const c = spell.card;
    if (c.roles.includes('wipe')) { const hit = this.wipeHits(c, spell.caster); return q.battlefield.filter(b => b.card.isCreature && !b.card.kw.includes('indestructible') && b.protTurn !== this.turn && hit(b, q)); }
    if (c.roles.includes('removal') && spell.target && spell.target.card && q.battlefield.includes(spell.target) && spell.target.protTurn !== this.turn) return [spell.target];
    return [];
  }
  // ---------- triggers ----------
  async fireTriggers(p, when) {
    // battlefield triggers of the active player (and "each upkeep" triggers of everyone)
    for (const q of this.alive()) for (const b of [...q.battlefield]) for (const tr of b.card.triggers || []) {
      if (tr.when !== when || tr.zone !== 'battlefield' || !(q === p || tr.each)) continue;
      if (!q.battlefield.includes(b)) continue;
      if (tr.cond && !this.trigCond(q, b, tr)) continue;
      if (tr.may && !(await this.chooseMay(q, b.card, tr))) continue;
      this.say(`— ${b.card.name} triggers`, q); await this.emit({ type: 'trigger', p: q, card: b.card, perm: b });
      await this.runTrig(q, b, tr, {}, when);
    }
    if (when === 'upkeep') for (const q of this.opponentsOf(p)) for (const b of q.battlefield.filter(x => !x.neutral)) for (const tr of b.card.triggers || []) if (tr.when === 'oppUpkeep') { this.say(`— ${b.card.name} triggers`, q); await this.runTrig(q, b, tr, { active: p }); }
    // graveyard triggers (e.g. "at the beginning of your upkeep, if this card is in your graveyard...")
    for (const c of [...p.graveyard]) for (const tr of c.triggers || []) {
      if (tr.when !== when || tr.zone !== 'graveyard' || !p.graveyard.includes(c)) continue;
      if (tr.may && !(await this.chooseMay(p, c, tr))) continue;
      this.say(`— ${c.name} triggers from the graveyard`, p); await this.emit({ type: 'trigger', p, card: c });
      (this.trigOk()) && await this.runOps(p, tr.ops, c, {});
    }
  }
  async landfall(p, land) {
    await this.fireTriggers(p, 'landfall');
    for (const q of this.opponentsOf(p)) for (const b of q.battlefield.filter(x => !x.neutral)) for (const tr of b.card.triggers || []) if (tr.when === 'oppLand' && (!tr.moreLands || p.battlefield.filter(x => x.card.isLand).length > q.battlefield.filter(x => x.card.isLand).length)) await this.runTrig(q, b, tr, {});
  }
  /** extra copies of a triggered ability from Roaming Throne, Harmonic Prodigy, Annie Joins Up, Delney, Veyran, Ancient Greenwarden... */
  trigTimes(q, b, kind) {
    let n = 1; if (!b || !b.card) return 1;
    for (const x of q.battlefield) { const S = x.card.statics; if (!S || x.neutral) continue;
      if (S.trigDouble) { const t = S.trigDouble; if ((t.another && x === b) || !b.card.isCreature) {} else if (t.power2 ? this.powerOf(q, b) <= 2 : matchesFilter(b.card, t.filter === '__chosen__' ? x.chosenType || '' : t.filter)) n++; }
      if (S.castTrigDouble && kind === 'castIS') n++;
      if (S.landTrigDouble && kind === 'landfall') n++;
      if (S.echoes && !(b.card.colors || []).length && x !== b) n++; }
    return Math.min(n, 4);
  }
  trigCond(q, b, tr) {
    switch (tr.cond) {
      case 'artifact': return q.battlefield.some(x => x.card.isArtifact);
      case 'artifacts20': return q.battlefield.filter(x => x.card.isArtifact).length >= 20;
      case 'blessing': return !!q.blessing;
      case 'harnessed': return !!b.harnessed;
      case 'creatures4': return q.battlefield.filter(x => x.card.isCreature).length >= 4;
      case 'gainedLife': return q.gainedTurn === this.turn;
      case 'oppLost2': return this.opponentsOf(q).some(o => (o.lostTurn === this.turn ? o.lostThisTurn || 0 : 0) >= 2);
      case 'sevenNames': return new Set(q.battlefield.filter(x => x.card.isLand).map(x => x.card.name)).size >= 7;
    }
    return true;
  }
  async runTrig(q, b, tr, ctx = {}, kind = tr.when) {
    if (tr.cond && !this.trigCond(q, b, tr)) return;
    const times = this.trigTimes(q, b, kind);
    for (let k = 0; k < times && !q.dead && !this.winner; k++) { if (!this.trigOk()) return; await this.runOps(q, tr.ops, b.card || b, { perm: b.card ? b : null, ...ctx }); }
    this.lastTrig = { q, b, tr, ctx };
  }
  async deathTriggers(owner, perm) {
    const dead = perm.card;
    // the creature's own "when this dies" trigger
    for (const tr of dead.triggers || []) if (tr.when === 'dies' && (tr.zone === 'self' || tr.self)) {
      const times = owner.battlefield.some(b => b.card.doublesDeath) ? 2 : 1;
      const extra = this.trigTimes(owner, perm, 'dies');
      for (let k = 0; k < times * extra; k++) { this.say(`— ${dead.name} dies trigger${k ? ' (again)' : ''}`, owner); (this.trigOk()) && await this.runOps(owner, tr.ops, dead, { dead: perm, owner }); }
    }
    const isCre = perm.card.isCreature, wasAttacking = (this.curAttackers || []).includes(perm) && this.phase === 'combat';
    for (const q of this.alive()) for (const b of [...q.battlefield]) for (const tr of b.card.triggers || []) {
      if (tr.when !== 'dies' || tr.zone !== 'battlefield' || b === perm) continue;
      if (!isCre && !(tr.artifacts && perm.card.isArtifact)) continue;
      if (isCre && tr.artifacts && !tr.creaturesToo && !perm.card.isArtifact) continue;
      if (tr.equipped && b.attachedTo !== perm.id) continue;
      if (tr.enchantedDies && b.attachedTo !== perm.id) continue;
      if (tr.yours && q !== owner) continue;
      if (tr.opp && q === owner) continue;
      if (tr.attacking && !wasAttacking) continue;
      if (tr.filter && !matchesFilter(dead, tr.filter)) continue;
      if (tr.nontoken && dead.token) continue;
      if (b.neutral) continue;
      if (tr.oncePerTurn) { if (b.dieTurn === this.turn) continue; b.dieTurn = this.turn; }
      const times = (q.battlefield.some(x => x.card.doublesDeath) ? 2 : 1) * this.trigTimes(q, b, 'dies');
      for (let k = 0; k < times; k++) { this.say(`— ${b.card.name} triggers (${dead.name} died)${k ? ' again' : ''}`, q); await this.emit({ type: 'trigger', p: q, card: b.card, perm: b }); (this.trigOk()) && await this.runOps(q, tr.ops, b.card, { perm: b, dead: perm, owner }); }
    }
  }
  async chooseMay(p, card, tr) {
    if (p.human) return this.hooks.humanMay ? !!(await this.hooks.humanMay({ p, card, text: tr.ops.map(o => o.op).join(', ') })) : true;
    return true; // the AI takes beneficial optional triggers
  }
  // ---------- helpers for card-specific effects ----------
  /** pick a permanent: AI by value (opponents' for harmful effects, own otherwise), humans from a list */
  async pickPerm(p, src, pool, { harmful = false, dest = 'target' } = {}) {
    pool = pool.filter(b => !(harmful && this.ownerOf(b) !== p && (b.card.kw.includes('hexproof') || b.card.kw.includes('shroud'))));
    if (!pool.length) return null;
    let pick = null;
    if (p.human) { const c = (await this.chooseFromList(p, src, pool.map(b => b.card), 1, dest))[0]; pick = pool.find(b => b.card === c) || null; }
    else if (p.ai) pick = [...pool].sort((a, b) => harmful ? this.ownerOfVal(p, b) - this.ownerOfVal(p, a) : p.ai.permBase(b) - p.ai.permBase(a))[0];
    else pick = pool[0];
    if (pick) { const o = this.ownerOf(pick); if (o) pick.owner = o.i; }
    return pick;
  }
  ownerOfVal(p, b) { const o = this.ownerOf(b); return o && p.ai ? p.ai.permValue(b, o, this, p) : 0; }
  oppPerms(p, f) { return this.opponentsOf(p).flatMap(q => q.battlefield.filter(f)); }
  allPerms(f) { return this.alive().flatMap(q => q.battlefield.filter(f)); }
  /** re-read a permanent's card with different text (sagas gaining abilities, classes levelling up) */
  retag(card, oracle) {
    const base = card.orig || card;
    const t = tagCard({ name: card.name, type: card.type, oracle, mana: card.manaCost, cmc: card.cmc, power: card.power, toughness: card.toughness, keywords: card.kwBase || card.kw, loyalty: card.startLoyalty });
    t.img = card.img; t.orig = base; t.isCommander = false; t.token = card.token; if (card.classLevels) t.classLevels = card.classLevels; if (card.saga) t.saga = card.saga; return t;
  }
  classCard(perm, k) {
    const base = perm.card.orig || perm.card; const lv = base.classLevels || [];
    const text = [base.parseOracle || base.oracle, ...lv.filter(x => x.k <= k).flatMap(x => x.lines.filter(l => !/^when this class becomes level \d/i.test(l)))].join('\n');
    const t = this.retag(base, text); t.oracle = base.oracle; t.parseOracle = text;
    t.abilities = (t.abilities || []).concat(lv.filter(x => x.k > k).map(x => ({ zone: 'battlefield', label: 'level ' + x.k, cost: x.cost, speed: 'sorcery', ops: [{ op: 'levelUp', k: x.k }], levelReq: x.k - 1 })));
    return t;
  }
  /** cast a card that's already out of every zone (exiled / revealed) without paying its cost */
  async castFreeCard(p, card, owner = p) {
    if (card.isLand) { if (p.landsThisTurn < this.landLimit(p)) { p.landsThisTurn++; const [pm] = await this.landEnters(p, card); this.say(`— plays ${card.name}`, p); await this.emit({ type: 'land', p, card, perm: pm }); await this.landfall(p); return true; } owner.exile.push(card); return false; }
    let target = null;
    if (card.roles.includes('removal')) target = p.ai ? (p.ai.bestTarget(this, p, b => b.card.isCreature) || {}).perm || null : await this.pickPerm(p, card, this.oppPerms(p, b => b.card.isCreature), { harmful: true });
    if (card.roles.includes('removal') && !target) { owner.graveyard.push(card); this.say(`— ${card.name} has no target`, p); return false; }
    if (card.roles.includes('counter')) { owner.graveyard.push(card); return false; }
    p.hand.push(card); return this.cast(p, card, 'hand', target, { free: true, owner });
  }
  hideawayOk(q, perm) {
    const c = perm.hideawayCond;
    if (c === 'power10') return q.battlefield.filter(b => b.card.isCreature).reduce((s, b) => s + Math.max(0, this.powerOf(q, b)), 0) >= 10;
    if (c === 'attack3') return (q.attackedWithTurn === this.turn ? q.attackedWith || 0 : 0) >= 3;
    if (c === 'dealt7') return this.opponentsOf(q).some(o => (o.lostTurn === this.turn ? o.lostThisTurn || 0 : 0) >= 7);
    return true;
  }
  /** card into a player's "may play" exile list */
  allowFromExile(p, card, { free = false, until = 'turn', owner = p, anyColor = false } = {}) { (p.exileCast = p.exileCast || []).push({ card, free, owner, anyColor, turn: this.turn, pTurn: until === 'next' ? (p.turnCount || 0) + 1 : null, forever: until === 'forever' }); }
  /** discard a card (Necropotence exiles it; discard triggers fire) */
  async discardCard(p, c) {
    const i = p.hand.indexOf(c); if (i < 0) return; p.hand.splice(i, 1);
    if (p.battlefield.some(b => b.card.statics && b.card.statics.discardExile && !b.neutral)) p.exile.push(c); else p.graveyard.push(c);
    for (const b of p.battlefield.filter(x => !x.neutral)) for (const tr of b.card.triggers || []) if (tr.when === 'discard') await this.runTrig(p, b, tr, {});
  }
  /** an opponent searched their library: Archivist of Oghma triggers; Opposition Agent takes the cards */
  async onSearch(p, picks) {
    for (const q of this.opponentsOf(p)) for (const b of q.battlefield.filter(x => !x.neutral)) for (const tr of b.card.triggers || []) if (tr.when === 'oppSearch') await this.runTrig(q, b, tr, {});
    const agent = this.opponentsOf(p).find(q => q.battlefield.some(b => b.card.statics && b.card.statics.oppAgent && !b.neutral));
    if (agent && picks.length) { for (const c of picks) { p.exile.push(c); this.allowFromExile(agent, c, { until: 'forever', owner: p, anyColor: true }); } this.say(`— ${agent.name}'s Opposition Agent exiles ${picks.map(c => c.name).join(', ')}`, p); return []; }
    return picks;
  }
  async dealtDamage(owner, perm, n, src) {
    if (n <= 0 || !perm.card.taunter) return;
    const o = this.opponentsOf(owner); const q = owner.ai ? owner.ai.pickFace(this, owner) : o[0];
    if (q) { this.say(`— ${perm.card.name} deals ${n} damage to ${q.name}`, owner); await this.changeLife(q, -n, perm.card); }
  }
  /** pick X for an "X" on a permanent / ability from what's available */
  xFor(ctx) { return ctx && ctx.x != null ? ctx.x : 0; }
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
    for (let op of ops) {
      if (p.dead || this.winner) return;
      if (op.n && typeof op.n === 'object' && op.n.count && op.op === 'damage') op = { ...op, n: p.battlefield.filter(b => matchesFilter(b.card, op.n.count)).length };
      switch (op.op) {
        case 'mill': { const milled = p.library.splice(-Math.min(op.n, p.library.length)).reverse(); p.graveyard.push(...milled); this.say(`— mills ${milled.map(c => c.name).join(', ') || 'nothing'}`, p); await this.emit({ type: 'mill', p, cards: milled }); break; }
        case 'millOpp': { const vs = op.all ? this.alive() : op.each ? this.opponentsOf(p) : [await this.choosePlayer(p, src, this.opponentsOf(p), `${src.name}: which player mills ${op.n}?`)]; for (const q of vs.filter(Boolean)) { const milled = q.library.splice(-Math.min(op.n, q.library.length)).reverse(); q.graveyard.push(...milled); this.say(`— ${q.name} mills ${milled.map(c => c.name).join(', ')}`, p); await this.emit({ type: 'mill', p: q, cards: milled }); } break; }
        case 'draw': await this.draw(p, op.n); break;
        case 'gain': await this.changeLife(p, op.n, src); break;
        case 'lose': await this.changeLife(p, -op.n, src); break;
        case 'drain': { const vs = op.each ? this.opponentsOf(p) : [await this.choosePlayer(p, src, this.opponentsOf(p), `${src.name}: which player loses ${op.n} life?`)]; for (const q of vs.filter(Boolean)) await this.changeLife(q, -op.n, src); break; }
        case 'damage': {
          if (op.to === 'each opponent') { for (const q of this.opponentsOf(p)) await this.changeLife(q, -this.dmgAmt(p, op.n, { red: (src.colors || []).includes('R') }), src); break; }
          if (op.to === 'each creature') { for (const q of this.alive()) for (const b of q.battlefield.filter(b => b.card.isCreature && this.toughOf(q, b) <= op.n && b.protTurn !== this.turn)) await this.destroy(q, b); break; }
          const creatureOnly = /creature/.test(op.to); const combatOnly = /attacking or blocking/.test(op.to);
          let hit = null;
          if (combatOnly) { const pool = (this.curAttackers || []).filter(b => this.ownerOf(b) && this.ownerOf(b) !== p && this.phase === 'combat'); hit = p.ai ? pool.sort((a, b) => this.powerOf(this.ownerOf(b), b) - this.powerOf(this.ownerOf(a), a))[0] || null : await this.pickPerm(p, src, pool, { harmful: true }); if (hit) hit.owner = this.ownerOf(hit).i; if (!hit) break; }
          else if (p.ai) { const t = p.ai.bestTarget(this, p, b => b.card.isCreature && this.toughOf(this.ownerOf(b), b) <= op.n && !b.card.kw.includes('indestructible')); if (t && (creatureOnly || t.value >= 6)) hit = t.perm; }
          else if (p.human && creatureOnly) { const pool = this.opponentsOf(p).flatMap(q => q.battlefield.filter(b => b.card.isCreature).map(b => b.card)); const pick = (await this.chooseFromList(p, src, pool, 1, 'damage'))[0]; if (pick) for (const q of this.alive()) { const b = q.battlefield.find(b => b.card === pick); if (b) { hit = b; hit.owner = q.i; } } }
          if (hit) { const owner = this.players[hit.owner]; this.say(`— ${op.n} damage to ${hit.card.name}`, p); await this.dealtDamage(owner, hit, op.n, src); if (this.toughOf(owner, hit) <= op.n && hit.protTurn !== this.turn && !hit.card.kw.includes('indestructible')) await this.destroy(owner, hit); }
          else if (!creatureOnly) { const q = await this.choosePlayer(p, src, this.opponentsOf(p), `${src.name}: deal ${op.n} damage to which player?`); if (q) { this.say(`— ${op.n} damage to ${q.name}`, p); await this.changeLife(q, -op.n, src); } }
          break;
        }
        case 'tokens': { if (op.n && op.n.count) { const k = p.battlefield.filter(b => matchesFilter(b.card, op.n.count)).length; op = { ...op, n: k }; } const n0 = op.n === 'lands' ? p.battlefield.filter(b => b.card.isLand).length : op.n && op.n.power ? Math.max(0, this.powerOf(p, ctx.perm || { card: src })) : op.n && op.n.count ? 0 : op.n; const n = Math.min(this.tokenAmt(p, n0, true), 24); const made = []; for (let k = 0; k < n; k++) made.push({ id: UID++, card: { uid: UID++, name: op.types || (src.name + ' token'), type: (op.artifact ? 'Token Artifact Creature' : 'Token Creature') + (op.types ? ' — ' + op.types : ''), isCreature: true, isArtifact: !!op.artifact, power: op.pt[0], toughness: op.pt[1], kw: op.kw || [], roles: [], colors: op.tcolors || [], mana: manaInfo(''), cmc: 0, token: true, oracle: '', changeling: !!op.changeling, statics: op.scaling ? { selfPump: { p: 1, t: 1, per: 'artifact' } } : {}, triggers: [], abilities: [], anthems: [] }, tapped: !!op.tapped, summoning: true, counters: 0, enteredTurn: this.turn }); p.battlefield.push(...made); await this.emit({ type: 'tokens', p, n, card: src }); if (n) await this.tokenEvent(p); for (const t of made) await this.creatureEntered(p, t); break; }
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
          const mine = p.battlefield.filter(b => b.card.isCreature && b !== ctx.perm && (!ctx.equipFilter || (ctx.equipFilter === 'commander' ? b.card.isCommander : b.card.isLegendary))); if (!mine.length || !ctx.perm) break;
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
          if (op.thresholdBf && p.graveyard.filter(c => c !== src).length >= op.thresholdBf) { for (const c of picks) { const i = p.graveyard.indexOf(c); if (i < 0) continue; p.graveyard.splice(i, 1); const pm = await this.enterPerm(p, c); this.say(`— threshold: returns ${c.name} to the battlefield`, p); if (pm && c.etbOps) await this.runOps(p, c.etbOps, c, { perm: pm }); if (pm) await this.creatureEntered(p, pm); } break; }
          for (const c of picks) { const i = p.graveyard.indexOf(c); if (i >= 0) { p.graveyard.splice(i, 1); p.hand.push(c); } }
          this.say(picks.length ? `— returns ${picks.map(c => c.name).join(', ')} to hand` : '— returns nothing', p); await this.emit({ type: 'tutor', p, card: src, picks, dest: 'hand' }); break;
        }
        case 'gyToBf': { const pool = p.graveyard.filter(c => c.isCreature && c !== src && (op.max == null || c.cmc <= op.max)); const pick = (await this.chooseFromList(p, src, pool, 1, 'reanimate'))[0]; if (pick) { p.graveyard.splice(p.graveyard.indexOf(pick), 1); const pm = { id: UID++, card: pick, tapped: false, summoning: true, counters: 0 }; p.battlefield.push(pm); this.say(`— returns ${pick.name} to the battlefield`, p); await this.emit({ type: 'reanimate', p, card: pick, perm: pm, from: p }); if (pick.etbOps) await this.runOps(p, pick.etbOps, pick, { perm: pm }); await this.creatureEntered(p, pm); } break; }
        case 'selfToBf': { const i = p.graveyard.indexOf(src); if (i < 0) break; p.graveyard.splice(i, 1); const pm = { id: UID++, card: src, tapped: !!op.tapped, summoning: !op.haste && !src.kw.includes('haste'), counters: 0, unearth: !!op.unearth }; p.battlefield.push(pm); this.say(`— ${src.name} returns to the battlefield${op.unearth ? ' (unearthed)' : ''}`, p); await this.emit({ type: 'reanimate', p, card: src, perm: pm, from: p }); if (src.etbOps) await this.runOps(p, src.etbOps, src, { perm: pm }); await this.creatureEntered(p, pm); break; }
        case 'selfToHand': { const i = p.graveyard.indexOf(src); if (i < 0) break; p.graveyard.splice(i, 1); p.hand.push(src); this.say(`— ${src.name} returns to hand`, p); await this.emit({ type: 'tutor', p, card: src, picks: [src], dest: 'hand' }); break; }
        case 'artifactTokens': await this.makeArtifactTokens(p, op.kind, op.n, op.tapped); break;
        case 'landToBf': {
          for (let k = 0; k < op.n; k++) {
            const pool = p.library.filter(c => c.isLand && (!op.basic || /\bBasic\b/.test(c.type)) && (!op.types.length || op.types.some(t => c.type.toLowerCase().includes(t))));
            const pick = (await this.chooseFromList(p, src, pool, 1, 'battlefield'))[0]; if (!pick) break;
            p.library.splice(p.library.indexOf(pick), 1); const [pm] = await this.landEnters(p, pick, op.tapped);
            this.say(`— puts ${pick.name} onto the battlefield${pm.tapped ? ' tapped' : ''}`, p); await this.emit({ type: 'land', p, card: pick, perm: pm, fetched: true }); await this.landfall(p);
          }
          shuffle(p.library, this.rng); break;
        }
        case 'proliferate': { let n = 0; for (const b of p.battlefield) { if (b.counters > 0) { b.counters++; n++; } if (b.card.isPlaneswalker) { b.loyalty = (b.loyalty || 0) + 1; n++; } } this.say(`— proliferates (${n} permanent${n === 1 ? '' : 's'})`, p); break; }
        case 'wheel': { for (const q of this.alive()) { const k = op.n || q.hand.length; q.graveyard.push(...q.hand); q.hand = []; await this.draw(q, k); } this.say(`— every player discards their hand and draws ${op.n || 'that many'}`, p); break; }
        case 'drawEach': for (const q of this.alive()) await this.draw(q, op.n); break;
        case 'untapLands': { const ls = p.battlefield.filter(b => b.card.isLand && b.tapped).slice(0, op.n); for (const b of ls) b.tapped = false; this.say(`— untaps ${ls.length} land${ls.length === 1 ? '' : 's'}`, p); break; }
        case 'untapAll': { const ok = b => op.what === 'creatures' ? b.card.isCreature : op.what === 'artifacts' ? b.card.isArtifact : !b.card.isLand; for (const b of p.battlefield.filter(ok)) b.tapped = false; this.say(`— untaps all ${op.what}`, p); break; }
        case 'extraCombat': p.extraCombat = true; this.say('— gets an additional combat phase', p); break;
        case 'flicker': {
          const ok = b => op.what === 'creature' ? b.card.isCreature : op.what === 'artifact or creature' ? (b.card.isCreature || b.card.isArtifact) : !b.card.isLand;
          const pool = p.battlefield.filter(b => ok(b) && b !== ctx.perm); if (!pool.length) break;
          let v; if (p.human) { const pick = (await this.chooseFromList(p, src, pool.map(b => b.card), 1, 'flicker'))[0]; v = pool.find(b => b.card === pick); } else v = [...pool].sort((a, b) => ((b.card.etbOps ? 5 : 0) + (b.tapped ? 1 : 0)) - ((a.card.etbOps ? 5 : 0) + (a.tapped ? 1 : 0)))[0];
          if (!v) break; if (op.n > 1 && !ctx.flickerDepth) await this.runOps(p, [{ ...op, n: op.n - 1 }], src, { ...ctx, flickerDepth: 1, perm: v });
          const base = v.card.orig || v.card; p.battlefield.splice(p.battlefield.indexOf(v), 1); await this.emit({ type: 'destroy', owner: p, perm: v, quiet: true });
          if (v.card.token) { this.say(`— ${v.card.name} is exiled (tokens don't return)`, p); break; }
          const pm = await this.enterPerm(p, base, { summoning: base.isCreature }); this.say(`— flickers ${base.name}`, p); if (!pm) break;
          await this.emit({ type: 'resolve', p, card: base, perm: pm });
          if (pm.card.etbOps) for (let k = this.etbTimes(p, pm); k > 0; k--) await this.runOps(p, pm.card.etbOps, pm.card, { perm: pm });
          await this.creatureEntered(p, pm); break;
        }
        case 'impulse': { const top = p.library.splice(-Math.min(op.n, p.library.length)).reverse(); for (const c of top) { c.impulse = op.next ? { pTurn: (p.turnCount || 0) + 1 } : { turn: this.turn }; p.hand.push(c); } this.say(`— exiles ${top.map(c => c.name).join(', ') || 'nothing'} (may play ${op.next ? 'until the end of next turn' : 'this turn'})`, p); break; }
        case 'pumpAll': { const n = op.n === 'creatures' ? p.battlefield.filter(b => b.card.isCreature).length : op.n; p.pumpUntilEOT = (p.pumpUntilEOT || 0) + n; if (op.kws && op.kws.length) p.kwEOT = new Set([...(p.kwEOT || []), ...op.kws]); this.refreshStatics(); this.say(`— creatures get +${n}/+${n}${op.kws && op.kws.length ? ' and ' + op.kws.join(', ') : ''} this turn`, p); break; }
        case 'shrinkOpp': { for (const q of this.opponentsOf(p)) q.pumpUntilEOT = (q.pumpUntilEOT || 0) - op.n; this.say(`— opponents' creatures get -${op.n}/-${op.n} this turn`, p); await this.sba(); break; }
        case 'destroyAll': {
          const w = op.what, num = +((w.match(/\d+/) || [])[0] || 0);
          const ok = b => w === 'artifacts' ? b.card.isArtifact : w === 'enchantments' ? b.card.isEnchantment : w === 'planeswalkers' ? b.card.isPlaneswalker : !b.card.isCreature ? false : /mana value \d+ or less/.test(w) ? b.card.cmc <= num : /mana value \d+ or greater/.test(w) ? b.card.cmc >= num : /power \d+ or greater/.test(w) ? this.powerOf(this.ownerOf(b), b) >= num : w === 'nontoken creatures' ? !b.card.token : true;
          let n = 0; for (const q of this.alive()) for (const b of q.battlefield.filter(ok)) { if (b.protTurn === this.turn) continue; if (op.how === 'exile') { q.battlefield.splice(q.battlefield.indexOf(b), 1); await this.emit({ type: 'destroy', owner: q, perm: b, quiet: true }); const bc = b.card.orig || b.card; if (bc.isCommander) q.command.push(bc); else if (!b.card.token) q.exile.push(bc); n++; } else if (!b.card.kw.includes('indestructible')) { await this.destroy(q, b, true); n++; } }
          this.say(`— ${op.how === 'exile' ? 'exiles' : 'destroys'} all ${w} (${n})`, p); break;
        }
        case 'extraLandTurn': p.extraLandsTurn = (p.extraLandsTurn || 0) + 1; this.say('— may play an additional land this turn', p); break;
        case 'playerProt': p.prot = true; this.say('— gains protection from everything until their next turn', p); break;
        case 'gyToTop': { const pool = p.graveyard.filter(c => c !== src && matchesFilter(c, op.filter)); const pick = (await this.chooseFromList(p, src, pool, 1, 'top'))[0]; if (pick) { p.graveyard.splice(p.graveyard.indexOf(pick), 1); p.library.push(pick); this.say(`— puts ${pick.name} on top of the library`, p); } break; }
        case 'massReturn': {
          const ok = c => op.what === 'land' ? c.isLand : op.what === 'creature' ? c.isCreature : c.isArtifact;
          let pool = p.graveyard.filter(c => ok(c) && c !== src); if (op.n < 99) pool = await this.chooseFromList(p, src, pool, op.n, op.to === 'hand' ? 'gyhand' : 'reanimate');
          for (const c of pool) { const i = p.graveyard.indexOf(c); if (i < 0) continue; p.graveyard.splice(i, 1); if (op.to === 'hand') p.hand.push(c); else if (c.isLand) await this.landEnters(p, c, op.tapped); else { const pm = await this.enterPerm(p, c, { tapped: op.tapped }); if (pm) await this.creatureEntered(p, pm); } }
          this.say(`— returns ${pool.length} ${op.what} card${pool.length === 1 ? '' : 's'} to ${op.to === 'hand' ? 'hand' : 'the battlefield'}`, p); break;
        }
        case 'fog': this.fogTurn = this.turn; this.say('— combat damage will be prevented this turn', p); break;
        case 'drainX': { const n = ctx.x || 0; if (!n) break; const q = op.target ? await this.choosePlayer(p, src, this.opponentsOf(p), `${src.name}: which player loses ${n} life?`) : null; for (const v of q ? [q] : this.opponentsOf(p)) await this.changeLife(v, -n, src); break; }
        case 'gainX': if (ctx.x) await this.changeLife(p, ctx.x, src); break;
        case 'drawX': if (ctx.x) await this.draw(p, Math.min(ctx.x, 10)); break;
        case 'unblockable': { const mine = p.battlefield.filter(b => b.card.isCreature && !b.tapped); if (!mine.length) break; let t; if (p.human) { const pick = (await this.chooseFromList(p, src, mine.map(b => b.card), 1, 'unblockable'))[0]; t = mine.find(b => b.card === pick); } else t = [...mine].sort((a, b) => this.powerOf(p, b) - this.powerOf(p, a))[0]; if (t) { t.unblockTurn = this.turn; this.say(`— ${t.card.name} can't be blocked this turn`, p); } break; }
        case 'arrange': {
          const top = p.library.slice(-op.n).reverse(); if (!top.length) break;
          const lands = p.battlefield.filter(b => b.card.isLand).length, wantLand = lands < 4 && !p.hand.some(c => c.isLand);
          const score = c => c.isLand ? (wantLand ? 10 : -2) : (p.ai ? p.ai.castValueRaw(this, p, c) : c.cmc) - Math.max(0, c.cmc - lands - 1) * 2;
          if (op.shuffle && top.every(c => score(c) < 1)) { shuffle(p.library, this.rng); this.say('— looks at the top cards and shuffles', p); break; }
          const sorted = [...top].sort((a, b) => score(a) - score(b)); p.library.splice(-top.length, top.length, ...sorted);
          this.say(`— rearranges the top ${top.length} cards`, p); break;
        }
        case 'cmdToHand': { const c = p.command[0]; if (c) { p.command.splice(0, 1); p.hand.push(c); this.say(`— puts ${c.name} into hand from the command zone`, p); } break; }
        case 'freeCast': {
          const pool = p.hand.filter(c => !c.isLand && c.cmc <= op.max && c !== src); if (!pool.length) break;
          let pick; if (p.human) pick = (await this.chooseFromList(p, src, pool, 1, 'freecast'))[0]; else pick = [...pool].sort((a, b) => (p.ai.castValueRaw(this, p, b) + b.cmc) - (p.ai.castValueRaw(this, p, a) + a.cmc))[0];
          if (pick) { this.say(`— casts ${pick.name} without paying its mana cost`, p); await this.cast(p, pick, 'hand', p.ai && pick.roles.includes('removal') ? (p.ai.bestTarget(this, p, b => b.card.isCreature) || {}).perm || null : null, { free: true }); }
          break;
        }
        case 'bounceTarget': {
          const ok = b => op.what === 'creature' ? b.card.isCreature : op.what === 'artifact or creature' ? (b.card.isArtifact || b.card.isCreature) : op.what === 'artifact, creature, or enchantment' ? (b.card.isArtifact || b.card.isCreature || b.card.isEnchantment) : !b.card.isLand;
          let hit = null; if (p.ai) { const t = p.ai.bestTarget(this, p, ok); hit = t && t.perm; } else { const pool = this.opponentsOf(p).flatMap(q => q.battlefield.filter(ok).map(b => b.card)); const pick = (await this.chooseFromList(p, src, pool, 1, 'bounce'))[0]; if (pick) for (const q of this.alive()) { const b = q.battlefield.find(b => b.card === pick); if (b) hit = b; } }
          if (hit && hit.protTurn !== this.turn) await this.bounce(this.ownerOf(hit), hit, p); break;
        }
        case 'gyPermToBf': {
          const ok = c => !c.isLand && !c.isInstant && !c.isSorcery && c.cmc <= op.max && (op.what === 'permanent' || matchesFilter(c, op.what));
          const pool = p.graveyard.filter(c => ok(c) && c !== src); const pick = (await this.chooseFromList(p, src, pool, 1, 'reanimate'))[0];
          if (pick) { p.graveyard.splice(p.graveyard.indexOf(pick), 1); const pm = await this.enterPerm(p, pick); this.say(`— returns ${pick.name} to the battlefield`, p); if (pm) { await this.emit({ type: 'reanimate', p, card: pick, perm: pm, from: p }); if (pm.card.etbOps) await this.runOps(p, pm.card.etbOps, pm.card, { perm: pm }); await this.creatureEntered(p, pm); await this.permEntered(p, pm); } }
          break;
        }
        case 'amass': { let army = p.battlefield.find(b => b.card.army); if (!army) { army = { id: UID++, card: { uid: UID++, name: 'Orc Army', type: 'Token Creature — Orc Army', isCreature: true, power: 0, toughness: 0, kw: [], roles: [], colors: ['B'], mana: manaInfo(''), cmc: 0, token: true, army: true, oracle: '', triggers: [], abilities: [], statics: {}, anthems: [] }, tapped: false, summoning: true, counters: 0 }; p.battlefield.push(army); } army.counters = (army.counters || 0) + this.counterAmt(p, op.n); this.say(`— amasses ${op.n}`, p); break; }
        case 'payUntap': { if (ctx.perm && ctx.perm.tapped && await this.payTax(p, src, op.n, `${src.name}: pay {${op.n}} to untap it?`)) { ctx.perm.tapped = false; this.say(`— untaps ${src.name}`, p); } break; }
        case 'tappedHurts': if (ctx.perm && ctx.perm.tapped) await this.changeLife(p, -op.n, src); break;
        case 'millX': { const n = ctx.x || 0; if (!n) break; const q = await this.choosePlayer(p, src, this.opponentsOf(p), `${src.name}: which player mills ${n}?`); if (q) { const milled = q.library.splice(-Math.min(n, q.library.length)).reverse(); q.graveyard.push(...milled); this.milledHook(q, milled); this.say(`— ${q.name} mills ${milled.length}`, p); if (!q.library.length) this.say(`— ${q.name}'s library is empty`, p); } break; }
        case 'discard': for (let k = 0; k < op.n && p.hand.length; k++) { const d = p.ai ? p.ai.chooseDiscard(this, p) : (this.hooks.humanDiscard ? await this.hooks.humanDiscard(p) : p.hand[0]); if (!d) break; p.hand.splice(p.hand.indexOf(d), 1); p.graveyard.push(d); this.say(`— discards ${d.name}`, p); } break;
        case 'silence': if (op.noncreature) { p.silenceNCTurn = this.turn; this.say('— opponents can\'t cast noncreature spells this turn', p); break; } p.silenceTurn = this.turn; this.say('— opponents can\'t cast spells this turn', p); break;
        case 'livingDeath': {
          const back = new Map(); for (const q of this.alive()) { const cs = q.graveyard.filter(c => c.isCreature); q.graveyard = q.graveyard.filter(c => !c.isCreature); q.exile.push(...cs); back.set(q, cs); }
          for (const q of this.alive()) for (const b of q.battlefield.filter(b => b.card.isCreature)) await this.sacrifice(q, b);
          for (const [q, cs] of back) for (const c of cs) { const i = q.exile.indexOf(c); if (i < 0) continue; q.exile.splice(i, 1); const pm = await this.enterPerm(q, c); if (pm) await this.creatureEntered(q, pm); }
          this.say('— every creature in a graveyard trades places with every creature on the battlefield', p); break;
        }
        case 'riseDark': { let n = 0; for (const q of this.alive()) for (const c of q.graveyard.filter(c => c.isCreature)) { q.graveyard.splice(q.graveyard.indexOf(c), 1); const pm = await this.enterPerm(p, c); if (pm) { n++; await this.creatureEntered(p, pm); } } this.say(`— puts ${n} creature${n === 1 ? '' : 's'} from all graveyards onto the battlefield`, p); break; }
        case 'thoracle': { const dev = p.battlefield.reduce((s, b) => s + ((b.card.mana && b.card.mana.pips && b.card.mana.pips.U) || 0), 0); this.say(`— devotion to blue ${dev}, library ${p.library.length}`, p); if (p.library.length <= dev) { this.say(`— ${src.name}: wins the game`, p); for (const q of this.opponentsOf(p)) await this.kill(q, `${p.name}'s ${src.name}`); } break; }
        case 'bounceAttackers': { const at = (this.curAttackers || []).filter(b => this.ownerOf(b) && this.phase === 'combat'); for (const b of at) await this.bounce(this.ownerOf(b), b, p); this.say(`— returns ${at.length} attacking creature${at.length === 1 ? '' : 's'} to hand`, p); break; }
        case 'drawerLoses': if (ctx.other) await this.changeLife(ctx.other, -op.n, src); break;
        case 'activeDraws': { const a = this.players[this.active]; if (!a.dead) await this.draw(a, op.n); break; }
        case 'sylvan': { const keep = p.life > 24 ? 2 : p.life > 14 ? 1 : 0; if (!keep) break; await this.draw(p, keep); await this.changeLife(p, -4 * keep, src); this.say(`— draws ${keep} extra and pays ${4 * keep} life`, p); break; }
        case 'modal': {
          const modes = op.modes; let picks = [];
          const chosen = ctx.perm ? (ctx.perm.modeTurn === this.turn ? ctx.perm.modeChosen || [] : []) : [];
          const avail = op.pick === 'unchosen' ? modes.filter(m => !chosen.includes(m.text)) : modes;
          if (!avail.length) break;
          if (p.human && this.hooks.humanModes) { const sub = avail.map(m => ({ text: m.text, card: { uid: UID++, name: src.name, oracle: m.text } })); const r = await this.hooks.humanModes({ p, card: src, modes: sub, min: op.pick === 'upToOne' ? 0 : 1, max: op.pick === 'any' ? sub.length : 1 }); picks = (r || []).map(c => avail[sub.findIndex(s => s.card === c)]).filter(Boolean); }
          else if (p.ai) { const sc = avail.map(m => ({ m, v: p.ai.opsValue(this, p, m.ops, src) })).sort((a, b) => b.v - a.v); picks = op.pick === 'any' ? sc.filter(x => x.v > 0).map(x => x.m) : sc[0] && (sc[0].v > 0 || op.pick !== 'upToOne') ? [sc[0].m] : []; if (op.pick === 'any' && !picks.length && sc[0]) picks = [sc[0].m]; }
          if (ctx.perm && op.pick === 'unchosen') { if (ctx.perm.modeTurn !== this.turn) { ctx.perm.modeTurn = this.turn; ctx.perm.modeChosen = []; } ctx.perm.modeChosen.push(...picks.map(m => m.text)); }
          for (const m of picks) { this.say(`— ${src.name}: ${m.text}`, p); await this.runOps(p, m.ops, src, ctx); }
          break;
        }
        case 'gainText': { const pm = ctx.perm; if (!pm) break; const base = pm.card; const nc = this.retag(base, (base.parseOracle || base.oracle) + '\n' + op.text.charAt(0).toUpperCase() + op.text.slice(1)); nc.oracle = base.oracle; nc.parseOracle = (base.parseOracle || base.oracle) + '\n' + op.text; pm.card = nc; this.say(`— ${base.name} gains "${op.text}"`, p); break; }
        case 'levelUp': { const pm = ctx.perm; if (!pm) break; pm.level = op.k; pm.card = this.classCard(pm, op.k); this.say(`— ${src.name} becomes level ${op.k}`, p); const lv = (pm.card.orig || pm.card).classLevels.find(x => x.k === op.k); const on = lv && lv.lines.find(l => /^when this class becomes level \d, /i.test(l)); if (on) await this.runOps(p, parseOps(on.toLowerCase().replace(/^when this class becomes level \d, /, '')), pm.card, { perm: pm }); break; }
        case 'victimize': {
          const pool = p.graveyard.filter(c => c.isCreature && c !== src); if (!pool.length) break;
          const sacPool = p.battlefield.filter(b => b.card.isCreature); if (!sacPool.length) break;
          const picks = (await this.chooseFromList(p, src, pool, 2, 'reanimate')).slice(0, 2);
          const v = p.ai ? p.ai.chooseSacVictim(this, p, sacPool) : await this.pickPerm(p, src, sacPool, { dest: 'sacrifice' }); if (!v) break;
          this.say(`— sacrifices ${v.card.name}`, p); await this.sacrifice(p, v);
          for (const c of picks) { const i = p.graveyard.indexOf(c); if (i < 0) continue; p.graveyard.splice(i, 1); const pm = await this.enterPerm(p, c, { tapped: true }); this.say(`— returns ${c.name} tapped`, p); if (pm) { if (pm.card.etbOps) await this.runOps(p, pm.card.etbOps, pm.card, { perm: pm }); await this.creatureEntered(p, pm); } }
          break;
        }
        case 'bounceSpell': case 'bounceSpellOrPerm': {
          const sp = [...this.stack].reverse().find(o => o.caster !== p && !o.isCopy && o.card !== src);
          if (sp && (op.op === 'bounceSpell' || !p.ai || sp.card.cmc >= 3 || sp.card.roles.includes('removal') || sp.card.roles.includes('wipe'))) { this.stack.splice(this.stack.indexOf(sp), 1); if (sp.card.isCommander) sp.caster.command.push(sp.card); else if (!sp.isCopy) sp.caster.hand.push(sp.card); this.say(`— returns ${sp.card.name} to ${sp.caster.name}'s ${sp.card.isCommander ? 'command zone' : 'hand'}`, p); await this.emit({ type: 'countered', p: sp.caster, card: sp.card, obj: sp, by: src }); break; }
          if (op.op === 'bounceSpellOrPerm') { const t = await this.pickPerm(p, src, this.oppPerms(p, b => !b.card.isLand), { harmful: true, dest: 'bounce' }); if (t) await this.bounce(this.ownerOf(t), t, p); }
          break;
        }
        case 'etaliStorm': case 'etaliConquer': {
          const found = [];
          for (const q of this.alive()) { if (op.op === 'etaliStorm') { const c = q.library.pop(); if (c) { q.exile.push(c); found.push([q, c]); } } else { while (q.library.length) { const c = q.library.pop(); q.exile.push(c); if (!c.isLand) { found.push([q, c]); break; } } } }
          this.say(`— exiles ${found.map(([q, c]) => c.name).join(', ') || 'nothing'}`, p);
          for (const [q, c] of found) { if (c.isLand) continue; const i = q.exile.indexOf(c); if (i < 0) continue; q.exile.splice(i, 1); if (!(await this.castFreeCard(p, c, q))) {} }
          break;
        }
        case 'moveAllCounters': { const pm = ctx.perm; if (!pm || !(pm.counters > 0)) break; const t = await this.pickPerm(p, src, p.battlefield.filter(b => b.card.isCreature), { dest: 'counters' }); if (t) { t.counters = (t.counters || 0) + pm.counters; this.say(`— moves ${pm.counters} counters onto ${t.card.name}`, p); pm.counters = 0; } break; }
        case 'destroyUpTo': {
          const ok = b => op.what === 'artifact or enchantment' ? (b.card.isArtifact || b.card.isEnchantment) : /noncreature artifact or noncreature enchantment/.test(op.what) ? ((b.card.isArtifact || b.card.isEnchantment) && !b.card.isCreature) : !b.card.isLand;
          for (let k = 0; k < op.n; k++) { const t = await this.pickPerm(p, src, this.oppPerms(p, ok), { harmful: true, dest: op.exile ? 'exile' : 'destroy' }); if (!t) break; const o = this.ownerOf(t); if (op.exile) { o.battlefield.splice(o.battlefield.indexOf(t), 1); await this.emit({ type: 'destroy', owner: o, perm: t, quiet: true }); const bc = t.card.orig || t.card; if (bc.isCommander) o.command.push(bc); else if (!t.card.token) o.exile.push(bc); this.say(`— exiles ${t.card.name}`, p); await this.leftBattlefield(o, t); } else await this.destroy(o, t); }
          break;
        }
        case 'drawBoth': { await this.draw(p, 1); const q = await this.choosePlayer(p, src, this.opponentsOf(p), `${src.name}: which opponent draws?`); if (q) await this.draw(q, 1); break; }
        case 'becomeCopyGy': { const pm = ctx.perm; const types = new Set(p.graveyard.flatMap(c => ['Creature', 'Artifact', 'Enchantment', 'Land', 'Instant', 'Sorcery', 'Planeswalker'].filter(t => c.type.includes(t)))); if (!pm || types.size < 4) break; const pool = p.graveyard.filter(c => !c.isInstant && !c.isSorcery && !c.isLand); const c = (await this.chooseFromList(p, src, pool, 1, 'copy'))[0]; if (c) { pm.revertCard = pm.revertCard || pm.card; pm.revertTurn = this.turn; pm.card = { ...c, uid: UID++, orig: pm.revertCard.orig || pm.revertCard, isCommander: false }; this.say(`— ${src.name} becomes a copy of ${c.name} until end of turn`, p); } break; }
        case 'nextUncounterable': p.uncounterNext = this.turn; this.say('— the next spell this turn can\'t be countered', p); break;
        case 'nextImprovise': p.improviseNext = this.turn; break;
        case 'pact': (p.pacts = p.pacts || []).push({ cost: manaInfo(op.cost), turn: (p.turnCount || 0) + 1, src: src.name }); this.say(`— must pay ${op.cost} next upkeep or lose`, p); break;
        case 'dauthiPlay': { const pool = this.opponentsOf(p).flatMap(q => q.exile.filter(c => c.voidCounter).map(c => [q, c])); if (!pool.length) break; const pick = (await this.chooseFromList(p, src, pool.map(x => x[1]), 1, 'freecast'))[0]; const ent = pool.find(x => x[1] === pick); if (ent) { ent[0].exile.splice(ent[0].exile.indexOf(pick), 1); delete pick.voidCounter; this.say(`— plays ${pick.name} for free`, p); await this.castFreeCard(p, pick, ent[0]); } break; }
        case 'exileTop': { const c = p.library.pop(); if (c) { p.exile.push(c); this.say(`— exiles ${c.name} from the top of the library`, p); } break; }
        case 'forceAttack': for (const q of this.opponentsOf(p)) q.forceAttackTurn = this.turn; this.say('— opponents\' creatures must attack this turn', p); break;
        case 'dispatch': { const t = ctx.target && ctx.target.card ? ctx.target : await this.pickPerm(p, src, this.oppPerms(p, b => b.card.isCreature), { harmful: true }); if (!t) break; const o = this.ownerOf(t); if (!o) break; if (p.battlefield.filter(b => b.card.isArtifact).length >= 3) { o.battlefield.splice(o.battlefield.indexOf(t), 1); await this.emit({ type: 'destroy', owner: o, perm: t, quiet: true }); const bc = t.card.orig || t.card; if (bc.isCommander) o.command.push(bc); else if (!t.card.token) o.exile.push(bc); this.say(`— exiles ${t.card.name} (metalcraft)`, p); await this.leftBattlefield(o, t); } else { t.tapped = true; this.say(`— taps ${t.card.name}`, p); } break; }
        case 'ignition': { const mine = p.battlefield.filter(b => b.card.isCreature); const c = mine.length ? (p.ai ? [...mine].sort((a, b) => this.powerOf(p, b) - this.powerOf(p, a))[0] : await this.pickPerm(p, src, mine)) : null; if (!c) break; const n = this.powerOf(p, c); this.say(`— ${c.card.name} deals ${n} to each other creature and each opponent`, p); for (const q of this.alive()) for (const b of q.battlefield.filter(b => b.card.isCreature && b !== c)) { await this.dealtDamage(q, b, n, c.card); if (this.toughOf(q, b) <= n && !b.card.kw.includes('indestructible') && b.protTurn !== this.turn) await this.destroy(q, b); } for (const q of this.opponentsOf(p)) await this.changeLife(q, -n, c.card); break; }
        case 'protColor': { const mine = p.battlefield.filter(b => b.card.isCreature); const threat = [...this.stack].reverse().find(o => o.caster !== p && o.target && mine.includes(o.target)); const t = threat ? threat.target : await this.pickPerm(p, src, mine); if (!t) break; const col = threat ? (threat.card.colors[0] || 'W') : (this.opponentsOf(p).flatMap(q => q.battlefield.flatMap(b => b.card.colors || []))[0] || 'B'); t.protColor = { c: col, turn: this.turn }; this.say(`— ${t.card.name} gains protection from ${{ W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' }[col]}`, p); break; }
        case 'makeArtifact': { const t = await this.pickPerm(p, src, p.battlefield.filter(b => !b.card.isLand && !b.card.isArtifact)); if (t) { t.artifactTurn = this.turn; this.say(`— ${t.card.name} becomes an artifact this turn`, p); } break; }
        case 'valakut': { const lands = p.battlefield.filter(b => b.card.isLand).length; const away = p.human ? await this.chooseFromList(p, src, p.hand.filter(c => c !== src), p.hand.length, 'bottom') : p.hand.filter(c => c !== src && ((c.isLand && lands + p.hand.filter(x => x.isLand).length > 6) || (!c.isLand && c.cmc > lands + 2))); for (const c of away) { p.hand.splice(p.hand.indexOf(c), 1); p.library.unshift(c); } this.say(`— puts ${away.length} card${away.length === 1 ? '' : 's'} on the bottom and draws ${away.length + 1}`, p); await this.draw(p, away.length + 1); break; }
        case 'shrinkAll': { const n = op.n === 'X' ? this.xFor(ctx) : op.n; if (!n) break; for (const q of this.alive()) for (const b of q.battlefield.filter(b => b.card.isCreature)) { b.shrinkEOT = (b.shrinkTurn === this.turn ? b.shrinkEOT || 0 : 0) + n; b.shrinkTurn = this.turn; } this.say(`— every creature gets -${n}/-${n}`, p); await this.sba(); break; }
        case 'necro': { const c = p.library.pop(); if (!c) break; p.exile.push(c); (p.necro = p.necro || []).push(c); this.say('— exiles the top card face down (to hand at end step)', p); break; }
        case 'peekHand': this.say('— looks at an opponent\'s hand', p); break;
        case 'destroyLand': {
          const pool = this.oppPerms(p, b => b.card.isLand && (!op.nonbasic || !/\bBasic\b/.test(b.card.type)));
          const t = p.ai ? [...pool].sort((a, b) => ((b.card.landDyn || b.card.manaAmount > 1 || !/\bBasic\b/.test(b.card.type)) ? 2 : 0) + b.card.produces.length - ((a.card.landDyn || a.card.manaAmount > 1 || !/\bBasic\b/.test(a.card.type)) ? 2 : 0) - a.card.produces.length)[0] : await this.pickPerm(p, src, pool, { harmful: true, dest: 'destroy' });
          if (!t) break; const o = this.ownerOf(t); await this.destroy(o, t); this.say(`— destroys ${t.card.name}`, p);
          if (op.ghost || op.ruin) for (const q of op.ruin ? this.alive() : [o]) { const b = q.library.find(c => c.isLand && /\bBasic\b/.test(c.type)); if (b) { q.library.splice(q.library.indexOf(b), 1); const [pm] = await this.landEnters(q, b); this.say(`— ${q.name} fetches ${b.name}`, q); } shuffle(q.library, this.rng); }
          break;
        }
        case 'exileSpells': { const vs = this.stack.filter(o => o.caster !== p && o.card !== src); for (const o of vs) { if (this.isUncounterable(o)) continue; this.stack.splice(this.stack.indexOf(o), 1); if (o.card.isCommander) o.caster.command.push(o.card); else if (!o.isCopy) o.caster.exile.push(o.card); this.say(`— exiles ${o.card.name} from the stack`, p); await this.emit({ type: 'countered', p: o.caster, card: o.card, obj: o, by: src }); } break; }
        case 'maze': { const at = (this.curAttackers || []).filter(b => this.ownerOf(b) && this.ownerOf(b) !== p); const t = p.ai ? [...at].sort((a, b) => this.powerOf(this.ownerOf(b), b) - this.powerOf(this.ownerOf(a), a))[0] : await this.pickPerm(p, src, at); if (t) { t.tapped = false; t.mazeTurn = this.turn; this.say(`— ${t.card.name} is untapped; its combat damage is prevented`, p); } break; }
        case 'copyTokens': { const toks = p.battlefield.filter(b => b.card.token); const n = toks.length; for (const t of toks) p.battlefield.push({ id: UID++, card: { ...t.card, uid: UID++ }, tapped: false, summoning: true, counters: 0 }); this.say(`— copies ${n} token${n === 1 ? '' : 's'}`, p); await this.tokenEvent(p); for (const t of p.battlefield.slice(-n)) await this.creatureEntered(p, t); break; }
        case 'moveCounter': { const from = p.battlefield.filter(b => (b.counters || 0) > 0); const a = from.sort((x, y) => (y.counters || 0) - (x.counters || 0))[0]; const b = p.battlefield.filter(x => x.card.isCreature && x !== a).sort((x, y) => p.ai ? p.ai.permBase(y) - p.ai.permBase(x) : 0)[0]; if (a && b) { a.counters--; b.counters = (b.counters || 0) + 1; this.say(`— moves a counter from ${a.card.name} to ${b.card.name}`, p); } break; }
        case 'phaseOut': { const mine = p.battlefield.filter(b => b.card.isCreature); const threat = mine.find(b => this.stack.some(o => o.caster !== p && (o.target === b || o.card.roles.includes('wipe')))); const t = threat || (p.human ? await this.pickPerm(p, src, mine) : null); if (t) { t.protTurn = this.turn; t.phasedTurn = this.turn; this.say(`— ${t.card.name} phases out`, p); } break; }
        case 'putSelfBf': { const i = p.hand.indexOf(src); if (i < 0) break; p.hand.splice(i, 1); if (src.isLand) { const [pm] = await this.landEnters(p, src); this.say(`— puts ${src.name} onto the battlefield`, p); await this.landfall(p); } else await this.enterPerm(p, src); break; }
        case 'untapSelf': if (ctx.perm) { ctx.perm.tapped = false; this.say(`— untaps ${src.name}`, p); } break;
        case 'conduitCast': { if ((p.spellsThisTurn || 0) > 0) break; const pool = p.graveyard.filter(c => !c.isLand && !c.isInstant && !c.isSorcery && this.canPayCost(p, this.costOf(p, c, 'hand'))); const c = (await this.chooseFromList(p, src, pool, 1, 'freecast'))[0]; if (c) { p.graveyard.splice(p.graveyard.indexOf(c), 1); p.hand.push(c); p.noMoreSpellsTurn = this.turn; await this.cast(p, c, 'hand'); } break; }
        case 'emryCast': { const pool = p.graveyard.filter(c => c.isArtifact); const c = (await this.chooseFromList(p, src, pool, 1, 'freecast'))[0]; if (c) { p.graveyard.splice(p.graveyard.indexOf(c), 1); this.allowFromExile(p, c, { owner: p }); p.exile.push(c); this.say(`— may cast ${c.name} from the graveyard this turn`, p); } break; }
        case 'digBottom': { const top = p.library.splice(-Math.min(op.n, p.library.length)).reverse(); const pool = top.filter(c => !op.filter || matchesFilter(c, op.filter)); const picks = (await this.chooseFromList(p, src, pool, op.take || 1, 'dig')).slice(0, op.take || 1); for (const c of picks) p.hand.push(c); const rest = top.filter(c => !picks.includes(c)); p.library.unshift(...rest); this.say(`— looks at ${top.length}, takes ${picks.length ? (p.human ? picks.map(c => c.name).join(', ') : picks.length + ' card' + (picks.length > 1 ? 's' : '')) : 'nothing'}; the rest go to the bottom`, p); break; }
        case 'copyLand': { const pm = ctx.perm; const pool = this.allPerms(b => b.card.isLand && b !== pm); const t = p.ai ? [...pool].sort((a, b) => (b.card.landDyn ? 5 : 0) + (b.card.manaAmount || 1) - (a.card.landDyn ? 5 : 0) - (a.card.manaAmount || 1))[0] : await this.pickPerm(p, src, pool); if (pm && t) { pm.card = { ...t.card, uid: UID++, orig: pm.card.orig || pm.card, abilities: [...(t.card.abilities || []), ...((pm.card.orig || pm.card).abilities || []).filter(a => a.ops.some(o => o.op === 'copyLand'))] }; this.say(`— ${src.name} becomes a copy of ${t.card.name}`, p); } break; }
        case 'copyTrigger': { const lt = this.lastTrig; if (!lt || lt.q !== p) break; this.say(`— copies ${lt.b.card ? lt.b.card.name : 'a'} triggered ability`, p); await this.runOps(p, lt.tr.ops, lt.b.card || lt.b, { perm: lt.b.card ? lt.b : null, ...lt.ctx }); break; }
        case 'untapTarget': { const ok = op.what === 'legendary' ? (b => (b.card.isLegendary) && b.tapped) : op.what === 'creature' ? (b => b.card.isCreature && b.tapped) : (b => (b.card.isArtifact || b.card.isCreature) && b.tapped); const pool = p.battlefield.filter(ok); const t = p.ai ? pool.sort((a, b) => (srcAmt(b) - srcAmt(a)))[0] : await this.pickPerm(p, src, pool); function srcAmt(b) { return (b.card.manaAb ? b.card.manaAb.amount : 0) + (b.card.isLand ? b.card.manaAmount || 1 : 0); } if (t) { t.tapped = false; if (op.counter && t.card.isArtifact && t.card.isCreature) t.counters = (t.counters || 0) + this.counterAmt(p, 1); this.say(`— untaps ${t.card.name}`, p); } break; }
        case 'exileGyCard': { const pool = this.alive().flatMap(q => q.graveyard.filter(c => this.gyKind(c, op.what)).map(c => [q, c])); const pref = pool.find(([q]) => q !== p) || pool[0]; if (!pref) break; const [q, c] = pref; q.graveyard.splice(q.graveyard.indexOf(c), 1); q.exile.push(c); this.say(`— exiles ${c.name} from ${q.name}'s graveyard`, p); if (op.what === 'land') this.addMana(p, ['A']); break; }
        case 'adapt': if (ctx.perm && !(ctx.perm.counters > 0)) { ctx.perm.counters = this.counterAmt(p, op.n); this.say(`— adapts ${op.n}`, p); await this.countersPut(p, ctx.perm, op.n); } break;
        case 'hourSelf': { const pm = ctx.perm || p.battlefield.find(b => b.card === src); if (!pm) break; pm.hour = (pm.hour || 0) + 1; if (pm.hour >= 12) { const owner = this.ownerOf(pm) || p; owner.library.push(...owner.hand, ...owner.graveyard); owner.hand = []; owner.graveyard = []; shuffle(owner.library, this.rng); this.say(`— ${src.name} strikes twelve: shuffle hand and graveyard in, draw seven`, owner); await this.draw(owner, 7); const i = owner.battlefield.indexOf(pm); if (i >= 0) { owner.battlefield.splice(i, 1); owner.exile.push(pm.card.orig || pm.card); } } break; }
        case 'hideawayPlay': { const pm = ctx.perm; if (!pm || !pm.hideaway || !this.hideawayOk(p, pm)) break; const c = pm.hideaway; pm.hideaway = null; const i = p.exile.indexOf(c); if (i >= 0) p.exile.splice(i, 1); this.say(`— plays the hidden ${c.name} for free`, p); await this.castFreeCard(p, c, p); break; }
        case 'copySpell': {
          const pool = this.stack.filter(o => (o.card.isInstant || o.card.isSorcery) && o.card !== src); if (!pool.length) break;
          const o = p.ai ? [...pool].sort((a, b) => ((b.caster === p ? 3 : 0) + b.card.cmc) - ((a.caster === p ? 3 : 0) + a.card.cmc))[0] : (await this.chooseFromList(p, src, pool.map(x => x.card), 1, 'copy')).map(c => pool.find(x => x.card === c))[0];
          if (!o) break; let tgt = o.target;
          if (o.target && o.target.card && p.ai && this.ownerOf(o.target) === p) { const t = p.ai.bestTarget(this, p, b => b.card.isCreature); tgt = t ? t.perm : tgt; }
          this.stack.push({ id: UID++, kind: 'spell', card: o.card, caster: p, target: tgt, zone: 'copy', isMode: true, isCopy: true, x: o.x, modes: o.modes });
          this.say(`— copies ${o.card.name}`, p);
          if (op.bounce && !o.isCopy) { this.stack.splice(this.stack.indexOf(o), 1); if (o.card.isCommander) o.caster.command.push(o.card); else o.caster.hand.push(o.card); this.say(`— returns ${o.card.name} to ${o.caster.name}'s hand`, p); }
          break;
        }
        case 'copyCast': { const o = ctx.castObj; if (!o || o.isCopy) break; this.stack.push({ id: UID++, kind: 'spell', card: o.card, caster: p, target: o.target, zone: 'copy', isMode: true, isCopy: true, x: o.x, modes: o.modes }); this.say(`— copies ${o.card.name}`, p); break; }
        case 'fof': {
          const top = p.library.splice(-Math.min(5, p.library.length)).reverse(); if (!top.length) break;
          const opp = this.opponentsOf(p)[0]; const val = c => p.ai ? p.ai.castValueRaw(this, p, c) : c.cmc;
          const sorted = [...top].sort((a, b) => val(b) - val(a)); const pileA = [sorted[0]], pileB = sorted.slice(1);
          let take = pileB;
          if (p.human && this.hooks.humanMay) take = (await this.hooks.humanMay({ p, card: src, question: `take pile A (${pileA.map(c => c.name).join(', ')}) instead of pile B (${pileB.map(c => c.name).join(', ')})?` })) ? pileA : pileB;
          else take = val(pileA[0]) * 1.6 > pileB.reduce((s, c) => s + val(c), 0) ? pileA : pileB;
          for (const c of top) (take.includes(c) ? p.hand : p.graveyard).push(c);
          this.say(`— ${opp ? opp.name : 'an opponent'} splits ${top.map(c => c.name).join(', ')}; ${p.name} takes ${take.length} card${take.length > 1 ? 's' : ''}`, p); break;
        }
        case 'damageEach': { const n = op.n === 'creatures' ? this.allPerms(b => b.card.isCreature).length : op.n; this.say(`— ${n} damage to each creature`, p); for (const q of this.alive()) for (const b of q.battlefield.filter(b => b.card.isCreature)) { await this.dealtDamage(q, b, n, src); if (this.toughOf(q, b) <= n && !b.card.kw.includes('indestructible') && b.protTurn !== this.turn) await this.destroy(q, b); } break; }
        case 'oranRief': { const t = p.battlefield.filter(b => b.card.isCreature && (b.card.colors || []).includes('G') && b.enteredTurn === this.turn); for (const b of t) b.counters = (b.counters || 0) + this.counterAmt(p, 1); this.say(`— +1/+1 counter on ${t.length} creature${t.length === 1 ? '' : 's'}`, p); break; }
        case 'lili9': for (const q of this.opponentsOf(p)) { const keep = new Set(); for (const ty of ['isArtifact', 'isCreature', 'isEnchantment', 'isLand', 'isPlaneswalker']) { const pool = q.battlefield.filter(b => b.card[ty]); if (pool.length && ![...keep].some(b => b.card[ty])) keep.add(q.ai ? [...pool].sort((a, b) => q.ai.permBase(b) - q.ai.permBase(a))[0] : pool[0]); } for (const b of q.battlefield.filter(b => !keep.has(b))) await this.sacrifice(q, b); this.say(`— ${q.name} keeps ${keep.size} permanents`, p); } break;
        case 'fight': { const me = ctx.perm; if (!me) break; const t = await this.pickPerm(p, src, this.oppPerms(p, b => b.card.isCreature), { harmful: true }); if (!t) break; const o = this.ownerOf(t); const a = this.powerOf(p, me), d = this.powerOf(o, t); this.say(`— ${me.card.name} fights ${t.card.name}`, p); await this.dealtDamage(p, me, d, t.card); await this.dealtDamage(o, t, a, me.card); if (a >= this.toughOf(o, t) && !t.card.kw.includes('indestructible')) await this.destroy(o, t); if (d >= this.toughOf(p, me) && !me.card.kw.includes('indestructible')) await this.destroy(p, me); break; }
        case 'tutorAll': { const cs = p.library.filter(c => matchesFilter(c, op.filter)); for (const c of cs) { p.library.splice(p.library.indexOf(c), 1); await this.enterPerm(p, c); } shuffle(p.library, this.rng); this.say(`— puts ${cs.length} ${op.filter} card${cs.length === 1 ? '' : 's'} onto the battlefield`, p); break; }
        case 'mizzix': { const pool = p.graveyard.filter(c => (c.isInstant || c.isSorcery) && c !== src); const picks = ctx.overload ? pool : (await this.chooseFromList(p, src, pool, 1, 'freecast')); for (const c of picks) { p.graveyard.splice(p.graveyard.indexOf(c), 1); p.exile.push(c); const copy = { ...c, uid: UID++, token: true }; p.hand.push(copy); await this.cast(p, copy, 'hand', null, { free: true }); } break; }
        case 'tokenCopyOf': {
          let t = ctx.perm && op.n && ctx.perm.card.kicker && ctx.perm.card.kicker.offspring ? ctx.perm : null;
          if (!t) { const pool = op.any ? this.allPerms(b => b.card.isCreature) : p.battlefield.filter(b => op.what === 'token' ? b.card.token : op.what === 'artifact or creature' ? (b.card.isArtifact || b.card.isCreature) : b.card.isCreature); t = ctx.target && ctx.target.card ? ctx.target : await this.pickPerm(p, src, pool); }
          if (!t) break; const n = ctx.kicked && op.kickedN ? op.kickedN : op.n;
          for (let k = 0; k < Math.min(this.tokenAmt(p, n, t.card.isCreature), 16); k++) { const c = { ...(t.card.orig && !t.card.token ? t.card : t.card), uid: UID++, token: true, isCommander: false }; if (op.pt) { c.power = op.pt[0]; c.toughness = op.pt[1]; } const pm = { id: UID++, card: c, tapped: false, summoning: true, counters: 0, sacAtEnd: !!op.sacAtEnd }; if (op.sacAtEnd) pm.summoning = false; p.battlefield.push(pm); if (c.etbOps) await this.runOps(p, c.etbOps, c, { perm: pm }); await this.creatureEntered(p, pm); await this.permEntered(p, pm); }
          this.say(`— creates ${n > 1 ? n + ' tokens' : 'a token'} copying ${t.card.name}`, p); await this.tokenEvent(p); break;
        }
        case 'connive': { const n = op.n === 'died' ? (this.diedTurn === this.turn ? this.diedThisTurn || 0 : 0) : op.n; if (!n) break; const pm = op.n === 'died' ? (await this.pickPerm(p, src, p.battlefield.filter(b => b.card.isCreature))) : ctx.perm; await this.draw(p, n); let nl = 0; for (let k = 0; k < n && p.hand.length; k++) { const d = p.ai ? p.ai.chooseDiscard(this, p) : (this.hooks.humanDiscard ? await this.hooks.humanDiscard(p) : p.hand[0]); if (!d) break; if (!d.isLand) nl++; await this.discardCard(p, d); } if (pm && nl) { pm.counters = (pm.counters || 0) + this.counterAmt(p, nl); await this.countersPut(p, pm, nl); } this.say(`— connives ${n}`, p); break; }
        case 'harness': if (ctx.perm) { ctx.perm.harnessed = true; this.say(`— ${src.name} is harnessed`, p); } break;
        case 'copyArtifact': { const pm = ctx.perm; const pool = p.battlefield.filter(b => b.card.isArtifact && !b.card.token && b !== pm && this.canPayCost(p, { generic: b.card.cmc, pips: {}, total: b.card.cmc })); const t = await this.pickPerm(p, src, pool); if (pm && t) { this.payCost(p, { generic: t.card.cmc, pips: {}, total: t.card.cmc }); pm.card = { ...t.card, uid: UID++, orig: pm.card.orig || pm.card, isLand: true, produces: pm.card.produces, manaAmount: 1 }; this.say(`— ${src.name} becomes a copy of ${t.card.name}`, p); } break; }
        case 'swine': { const x = this.xFor(ctx); for (let k = 0; k < x; k++) { const t = await this.pickPerm(p, src, this.oppPerms(p, b => b.card.isCreature), { harmful: true }); if (!t) break; const o = this.ownerOf(t); o.battlefield.splice(o.battlefield.indexOf(t), 1); await this.emit({ type: 'destroy', owner: o, perm: t, quiet: true }); const bc = t.card.orig || t.card; if (bc.isCommander) o.command.push(bc); else if (!t.card.token) o.exile.push(bc); await this.leftBattlefield(o, t); await this.runOps(o, [{ op: 'tokens', n: 1, pt: [2, 2], kw: [] }], { name: 'Boar' }, {}); this.say(`— ${t.card.name} becomes a 2/2 Boar`, p); } break; }
        case 'breachMV': { for (const q of this.alive()) { const m = q.library.splice(-Math.min(10, q.library.length)); q.graveyard.push(...m); } for (const q of this.alive()) { const pool = q.graveyard.filter(c => c.isCreature || c.isPlaneswalker); const c = p.ai ? [...pool].sort((a, b) => p.ai.castValueRaw(this, p, b) - p.ai.castValueRaw(this, p, a))[0] : (await this.chooseFromList(p, src, pool, 1, 'reanimate'))[0]; if (c) { q.graveyard.splice(q.graveyard.indexOf(c), 1); const pm = await this.enterPerm(p, c); this.say(`— takes ${c.name} from ${q.name}'s graveyard`, p); if (pm) await this.creatureEntered(p, pm); } } break; }
        case 'expressive': { const top = p.library.splice(-Math.min(3, p.library.length)).reverse(); if (!top.length) break; const val = c => p.ai ? p.ai.castValue(this, p, c) : c.cmc; const s = [...top].sort((a, b) => val(b) - val(a)); const hand = s[0], ex = s[1], bot = s[2]; if (hand) p.hand.push(hand); if (ex) { p.exile.push(ex); this.allowFromExile(p, ex, { owner: p }); } if (bot) p.library.unshift(bot); this.say('— one to hand, one exiled to play this turn, one to the bottom', p); break; }
        case 'removeFromCombat': { const at = (this.curAttackers || []).filter(b => p.battlefield.includes(b)); const t = await this.pickPerm(p, src, at); if (t) { this.curAttackers.splice(this.curAttackers.indexOf(t), 1); t.removedTurn = this.turn; t.tapped = false; this.say(`— ${t.card.name} leaves combat and untaps`, p); } break; }
        case 'shrinkTarget': { let n = op.n === 'X' ? (ctx.x || 0) : op.n; if (op.morbid && this.diedTurn === this.turn) n = op.morbid; if (!n) break; const t = ctx.target && ctx.target.card ? ctx.target : await this.pickPerm(p, src, this.oppPerms(p, b => b.card.isCreature), { harmful: true }); if (!t) break; t.shrinkEOT = (t.shrinkTurn === this.turn ? t.shrinkEOT || 0 : 0) + n; t.shrinkTurn = this.turn; this.say(`— ${t.card.name} gets -${n}/-${n}`, p); await this.sba(); break; }
        case 'taintedPact': { const seen = new Set(); while (p.library.length) { const c = p.library.pop(); if (seen.has(c.name)) { p.exile.push(c); break; } seen.add(c.name); const want = p.human ? !!(this.hooks.humanMay && await this.hooks.humanMay({ p, card: src, question: `put ${c.name} into your hand?` })) : (!c.isLand && (p.ai.castValueRaw(this, p, c) >= 6 || c.roles.includes('wincon'))) || seen.size >= 6; if (want) { p.hand.push(c); this.say(`— takes ${p.human ? c.name : 'a card'}`, p); break; } p.exile.push(c); } break; }
        case 'goadAll': for (const q of this.opponentsOf(p)) for (const b of q.battlefield.filter(b => b.card.isCreature)) { b.goadedBy = p; b.goadUntil = (p.turnCount || 0) + 1; } this.say('— goads every creature it doesn\'t control', p); break;
        case 'promise': for (const q of this.alive()) { const cr = q.battlefield.filter(b => b.card.isCreature); if (!cr.length) continue; const keep = q.ai ? [...cr].sort((a, b) => q.ai.permBase(b) - q.ai.permBase(a))[0] : (await this.pickPerm(q, src, cr, { dest: 'keep' })) || cr[0]; keep.vowAgainst = p; for (const b of cr) if (b !== keep) await this.sacrifice(q, b); } this.say('— each player keeps one creature', p); break;
        case 'urzaImpulse': { shuffle(p.library, this.rng); const c = p.library.pop(); if (c) { p.exile.push(c); this.allowFromExile(p, c, { free: true, owner: p }); this.say(`— exiles ${c.name}; may play it free this turn`, p); } break; }
        case 'animateArtifacts': { const as = p.battlefield.filter(b => b.card.isArtifact && !b.card.isCreature); for (const b of as) { b.animBase = b.card; b.animTurn = this.turn; b.card = { ...b.card, isCreature: true, power: 4, toughness: 4, orig: b.card.orig || b.card }; b.summoning = false; } this.say(`— ${as.length} artifacts become 4/4 creatures this turn`, p); break; }
        case 'agadeem': { const x = this.xFor(ctx); const used = new Set(); const pool = p.graveyard.filter(c => c.isCreature && c.cmc <= x).sort((a, b) => b.cmc - a.cmc); for (const c of pool) { if (used.has(c.cmc)) continue; used.add(c.cmc); p.graveyard.splice(p.graveyard.indexOf(c), 1); const pm = await this.enterPerm(p, c); if (pm) await this.creatureEntered(p, pm); } this.say(`— returns ${used.size} creature${used.size === 1 ? '' : 's'}`, p); break; }
        case 'allIsDust': for (const q of this.alive()) for (const b of q.battlefield.filter(b => (b.card.colors || []).length)) await this.sacrifice(q, b); this.say('— every colored permanent is sacrificed', p); break;
        case 'eerie': { const mine = p.battlefield.filter(b => b.card.isCreature && (this.stack.some(o => o.caster !== p && (o.target === b || o.card.roles.includes('wipe'))) || (p.human && false))); const vs = p.ai ? mine : p.battlefield.filter(b => b.card.isCreature); for (const b of vs) { p.battlefield.splice(p.battlefield.indexOf(b), 1); await this.emit({ type: 'destroy', owner: p, perm: b, quiet: true }); if (b.card.token) continue; const c = b.card.orig || b.card; p.exile.push(c); (this.endReturns = this.endReturns || []).push({ p, card: c }); } this.say(`— exiles ${vs.length} creature${vs.length === 1 ? '' : 's'} until the end step`, p); break; }
        case 'mirrorEntity': { const x = this.xFor(ctx) || Math.max(0, this.availableMana(p)); if (!x) break; p.mirrorX = x; p.mirrorTurn = this.turn; this.say(`— creatures become ${x}/${x} this turn`, p); break; }
        case 'spellskite': { const pm = ctx.perm; const o = [...this.stack].reverse().find(s => s.caster !== p && s.target && s.target.card); if (pm && o) { o.target = pm; pm.owner = p.i; this.say(`— ${o.card.name} now targets ${src.name}`, p); } break; }
        case 'regenerate': { const t = await this.pickPerm(p, src, p.battlefield.filter(b => b.card.isCreature && (!op.filter || matchesFilter(b.card, op.filter)))); if (t) { t.regenTurn = this.turn; this.say(`— regeneration shield on ${t.card.name}`, p); } break; }
        case 'insight': { const t = await this.pickPerm(p, src, p.battlefield.filter(b => b.card.isCreature)); if (t) { t.insightTurn = this.turn; this.say(`— ${t.card.name}: draw a card for each combat damage it deals this turn`, p); } break; }
        case 'jace8': await this.draw(p, 7); if (!p.dead && !p.library.length) { this.say(`— ${src.name}: wins the game`, p); for (const q of this.opponentsOf(p)) await this.kill(q, `${p.name}'s ${src.name}`); } break;
        case 'putFromHand': { const pool = p.hand.filter(c => op.what === 'equipment' ? /equipment/i.test(c.type) : op.what === 'creature' ? c.isCreature : c.isArtifact); const c = (await this.chooseFromList(p, src, pool, 1, 'battlefield'))[0]; if (c) { p.hand.splice(p.hand.indexOf(c), 1); const pm = await this.enterPerm(p, c); this.say(`— puts ${c.name} onto the battlefield`, p); if (pm) { if (pm.card.etbOps) await this.runOps(p, pm.card.etbOps, pm.card, { perm: pm }); await this.creatureEntered(p, pm); await this.permEntered(p, pm); } } break; }
        case 'earthbend': { const lands = p.battlefield.filter(b => b.card.isLand && !b.card.isCreature); const t = lands.sort((a, b) => a.card.produces.length - b.card.produces.length)[0]; if (!t) break; t.card = { ...t.card, uid: UID++, isCreature: true, power: 0, toughness: 0, kw: [...(t.card.kw || []), 'haste'], orig: t.card.orig || t.card, earthbent: true }; t.counters = (t.counters || 0) + this.counterAmt(p, op.n); this.say(`— earthbends ${t.card.name}`, p); break; }
        case 'palm': p.palmTurn = this.turn; this.say('— the next damage from a source this turn is turned back', p); break;
        case 'darkCrystalReturn': { const pm = ctx.perm; const pool = (pm && pm.crystalExiled || []).filter(([q, c]) => q.exile.includes(c)); const pick = (await this.chooseFromList(p, src, pool.map(x => x[1]), 1, 'reanimate'))[0]; const ent = pool.find(x => x[1] === pick); if (ent) { ent[0].exile.splice(ent[0].exile.indexOf(pick), 1); const np = await this.enterPerm(p, pick, { tapped: true }); if (np) { np.counters += this.counterAmt(p, 2); await this.creatureEntered(p, np); } this.say(`— returns ${pick.name} under its control`, p); } break; }
        case 'blinkSelfEnd': { const pm = ctx.perm; if (!pm) break; p.battlefield.splice(p.battlefield.indexOf(pm), 1); await this.emit({ type: 'destroy', owner: p, perm: pm, quiet: true }); const c = pm.card.orig || pm.card; p.exile.push(c); (this.endReturns = this.endReturns || []).push({ p, card: c, tapped: true }); this.say(`— ${c.name} is exiled until the end step`, p); break; }
        case 'tyrite': { const t = await this.pickPerm(p, src, p.battlefield.filter(b => b.card.isCreature && b.card.isLegendary)); if (t) { t.godType = true; t.counters = (t.counters || 0) + this.counterAmt(p, 1); this.say(`— ${t.card.name} becomes a God`, p); } break; }
        case 'indestructibleCounter': { const t = await this.pickPerm(p, src, p.battlefield.filter(b => b.godType || /\bGod\b/.test(b.card.type))); if (t) { t.indestructibleCounter = true; this.say(`— indestructible counter on ${t.card.name}`, p); } break; }
        case 'tezzEmblem': p.tezzEmblem = true; this.say('— gets Tezzeret\'s emblem', p); break;
        case 'crackle': { const x = this.xFor(ctx); for (let k = 0; k < x; k++) { const t = p.ai ? p.ai.pickFace(this, p) : await this.choosePlayer(p, src, this.opponentsOf(p), `${src.name}: ${5 * x} damage to which player?`); if (t) { this.say(`— ${5 * x} damage to ${t.name}`, p); await this.changeLife(t, -this.dmgAmt(p, 5 * x, { red: true }), src); } } break; }
        case 'oring': { const pm = ctx.perm; for (const q of this.opponentsOf(p)) { const t = q.ai || p.ai ? (p.ai ? [...q.battlefield.filter(b => !b.card.isLand)].sort((a, b) => p.ai.permValue(b, q, this, p) - p.ai.permValue(a, q, this, p))[0] : null) : await this.pickPerm(p, src, q.battlefield.filter(b => !b.card.isLand), { harmful: true }); const tt = t || (p.human ? await this.pickPerm(p, src, q.battlefield.filter(b => !b.card.isLand), { harmful: true }) : null); if (!tt) continue; q.battlefield.splice(q.battlefield.indexOf(tt), 1); await this.emit({ type: 'destroy', owner: q, perm: tt, quiet: true }); const c = tt.card.orig || tt.card; if (tt.card.token) continue; if (c.isCommander) { q.command.push(c); continue; } q.exile.push(c); if (pm) (pm.oring = pm.oring || []).push({ card: c, owner: q }); this.say(`— exiles ${c.name} until ${src.name} leaves`, p); await this.leftBattlefield(q, tt); } break; }
        case 'powerAll': p.powerEOT = (p.powerTurn === this.turn ? p.powerEOT || 0 : 0) + op.n; p.powerTurn = this.turn; if (op.kw) p.kwEOT = new Set([...(p.kwEOT || []), op.kw]); this.refreshStatics(); this.say(`— creatures get +${op.n}/+0${op.kw ? ' and ' + op.kw : ''} this turn`, p); break;
        case 'pumpTypes': { const t = p.battlefield.filter(b => b.card.isCreature && op.types.some(ty => matchesFilter(b.card, ty))); for (const b of t) { b.tempPump = (b.tempTurn === this.turn ? b.tempPump || 0 : 0) + op.n; b.tempTurn = this.turn; if (op.tough === 0) this.toughAdj(b, -op.n); if (op.untap) b.tapped = false; } this.say(`— ${t.length} creature${t.length === 1 ? '' : 's'} get +${op.n}`, p); break; }
        case 'grantKw': { const t = await this.pickPerm(p, src, p.battlefield.filter(b => b.card.isCreature && b !== ctx.perm && (!op.filter || op.filter === 'creature' || (op.filter === 'commander' ? b.card.isCommander : b.card.isLegendary)))); if (t) { (t.kwTurn === this.turn ? t.kwT : (t.kwT = [])).push(op.kw); t.kwTurn = this.turn; this.refreshStatics(); } break; }
        case 'protectAll': { for (const b of p.battlefield) { b.protTurn = this.turn; if (op.indestructible || (op.giftIndestructible && ctx.gift)) b.indestructibleTurn = this.turn; } if (op.player) p.hexproofTurn = this.turn; this.say(`— ${op.indestructible || (op.giftIndestructible && ctx.gift) ? 'permanents gain hexproof and indestructible' : 'permanents gain hexproof'} this turn`, p); break; }
        case 'lifeLock': p.lifeLockTurn = this.turn; this.say('— life total can\'t change this turn', p); break;
        case 'protectOne': { const mine = p.battlefield.filter(b => !b.card.isLand && (!op.legendary || (b.card.isCreature && b.card.isLegendary))); const threat = [...this.stack].reverse().find(o => o.caster !== p && o.target && mine.includes(o.target)); const t = threat ? threat.target : await this.pickPerm(p, src, mine); if (t) { t.protTurn = this.turn; t.indestructibleTurn = this.turn; this.say(`— ${t.card.name} gains hexproof and indestructible`, p); } break; }
        case 'heistTreasure': p.heistTurn = this.turn; break;
        case 'tutorTo': {
          const pool = p.library.filter(c => (op.filter === 'card' || matchesFilter(c, op.filter)) && (op.max == null || c.cmc <= op.max) && (op.mvEq == null || c.cmc === op.mvEq)); let picks = (await this.chooseFromList(p, src, pool, op.n, op.dest === 'hand' ? 'hand' : 'battlefield')).slice(0, op.n);
          for (const c of picks) p.library.splice(p.library.indexOf(c), 1); shuffle(p.library, this.rng);
          picks = await this.onSearch(p, picks);
          for (const c of picks) { if (op.dest === 'hand') p.hand.push(c); else { const pm = c.isLand ? (await this.landEnters(p, c))[0] : await this.enterPerm(p, c); if (pm && !c.isLand) { if (pm.card.etbOps) await this.runOps(p, pm.card.etbOps, pm.card, { perm: pm }); await this.creatureEntered(p, pm); await this.permEntered(p, pm); } } }
          this.say(picks.length ? `— searches for ${op.dest === 'hand' && !p.human ? (picks.length > 1 ? picks.length + ' cards' : 'a card') : picks.map(c => c.name).join(', ')}` : '— searches and finds nothing', p); break;
        }
        case 'addMana': this.addMana(p, op.colors, !!op.eot || /main|end/.test(this.phase) && false); if (op.eot) for (const e of p.pool.slice(-op.colors.length)) e.eot = true; break;
        case 'addManaCharge': { const pm = ctx.perm; const n = pm ? pm.charge || 0 : 0; if (n) this.addMana(p, Array(n).fill(op.c)); break; }
        case 'highTide': this.highTideTurn = this.turn; this.say('— Islands make an extra {U} this turn', p); break;
        case 'loseOwner': if (ctx.owner) await this.changeLife(ctx.owner, -op.n, src); break;
        case 'chargeSelf': if (ctx.perm) ctx.perm.charge = (ctx.perm.charge || 0) + op.n; break;
        case 'returnLesserArtifact': { const dead = ctx.dead; const mv = dead ? dead.card.cmc : 99; const pool = p.graveyard.filter(c => c.isArtifact && c.cmc < mv && c !== (dead && dead.card)); const c = (await this.chooseFromList(p, src, pool, 1, 'gyhand'))[0]; if (c) { p.graveyard.splice(p.graveyard.indexOf(c), 1); p.hand.push(c); this.say(`— returns ${c.name} to hand`, p); } break; }
        case 'returnAsEnchantment': { const c = src.orig || src; const owner = ctx.owner || p; const i = owner.graveyard.indexOf(c); if (i < 0) break; owner.graveyard.splice(i, 1); const nc = { ...c, uid: UID++, isCreature: false, type: c.type.replace(/\s*Creature\b/, ''), orig: c }; await this.enterPerm(owner, nc); this.say(`— ${c.name} returns as an enchantment`, owner); break; }
        case 'returnEnchanted': { const dead = ctx.dead; if (!dead) break; const c = dead.card.orig || dead.card; const o = ctx.owner || p; const i = o.graveyard.indexOf(c); if (i < 0) break; o.graveyard.splice(i, 1); const pm = await this.enterPerm(p, c); this.say(`— ${c.name} returns to the battlefield`, p); if (pm) await this.creatureEntered(p, pm); break; }
        case 'returnTransformed': { const c = src.orig || src; const owner = ctx.owner || p; const i = owner.graveyard.indexOf(c); if (i < 0) break; owner.graveyard.splice(i, 1); const back = c.backFace || c.backLand; if (back) { const [pm] = back.isLand ? await this.landEnters(owner, back, true) : [await this.enterPerm(owner, back, { tapped: true })]; this.say(`— ${c.name} returns transformed`, owner); } else owner.graveyard.push(c); break; }
        case 'damageEnteredPower': { const e = ctx.entered; if (!e) break; const n = this.powerOf(ctx.enteredOwner || p, e); if (n <= 0) break; await this.runOps(p, [{ op: 'damage', n, to: 'any target' }], src, ctx); break; }
        case 'pumpEntered': { const e = ctx.entered; if (!e) break; e.tempPump = (e.tempTurn === this.turn ? e.tempPump || 0 : 0) + op.p; e.tempTurn = this.turn; if (op.p) this.toughAdj(e, -op.p); if (op.haste) e.summoning = false; break; }
        case 'attachEntered': { const e = ctx.entered; if (!e || !/equipment/i.test(e.card.type)) break; const t = p.ai ? p.ai.bestEquipTarget(this, p, e) : await this.pickPerm(p, src, p.battlefield.filter(b => b.card.isCreature)); if (t) { e.attachedTo = t.id; this.refreshStatics(); this.say(`— attaches ${e.card.name} to ${t.card.name}`, p); } break; }
        case 'loyaltySelf': if (ctx.perm) ctx.perm.loyalty = (ctx.perm.loyalty || 0) + op.n; break;
        case 'selvalaDraw': { const e = ctx.entered, o = ctx.enteredOwner; if (!e || !o) break; const pw = this.powerOf(o, e); if (this.allPerms(b => b.card.isCreature && b !== e).every(b => this.powerOf(this.ownerOf(b), b) < pw)) await this.draw(o, 1); break; }
        case 'selfPumpEOT': if (ctx.perm) { ctx.perm.tempPump = (ctx.perm.tempTurn === this.turn ? ctx.perm.tempPump || 0 : 0) + op.n; ctx.perm.tempTurn = this.turn; } break;
        case 'attackingTokens': { const per = op.perOpp ? this.opponentsOf(p) : [ctx.defender || this.opponentsOf(p)[0]]; const n = op.n || 1; const atk = ctx.atk; for (const d of per) for (let k = 0; k < Math.min(this.tokenAmt(p, n, true), 12); k++) { const t = { id: UID++, card: { uid: UID++, name: op.perOpp ? 'Human' : 'Warrior', type: 'Token Creature', isCreature: true, power: op.pt[0], toughness: op.pt[1], kw: [], roles: [], colors: [], mana: manaInfo(''), cmc: 0, token: true, oracle: '', triggers: [], abilities: [], statics: {}, anthems: [] }, tapped: true, summoning: false, counters: 0, sacAtEnd: !!op.sacAtEnd }; p.battlefield.push(t); if (atk && d && !d.dead) atk.push({ attacker: t, defender: d }); (this.curAttackers = this.curAttackers || []).push(t); } this.say(`— creates attacking tokens`, p); await this.tokenEvent(p); break; }
        case 'untapAttackers': for (const b of this.curAttackers || []) if (p.battlefield.includes(b)) { b.tapped = false; if (op.fs) { (b.kwTurn === this.turn ? b.kwT : (b.kwT = [])).push('first strike'); b.kwTurn = this.turn; } } this.refreshStatics(); break;
        case 'extraCombat': if (op.firstOnly && (p.combatsThisTurn || 0) > 1) break; p.extraCombat = (typeof p.extraCombat === 'number' ? p.extraCombat : p.extraCombat ? 1 : 0) + 1; this.say('— gets an additional combat phase', p); break;
        case 'exertCelebrant': { const pm = ctx.perm; if (!pm || pm.exertedTurn === this.turn) break; const others = p.battlefield.filter(b => b.card.isCreature && b !== pm); if (p.ai && others.length < 2) break; pm.exertedTurn = this.turn; pm.skipUntap = true; for (const b of others) b.tapped = false; p.extraCombat = (typeof p.extraCombat === 'number' ? p.extraCombat : p.extraCombat ? 1 : 0) + 1; this.say(`— exerts ${pm.card.name}: untaps others, extra combat`, p); break; }
        case 'battlesphere': { const pm = ctx.perm; if (!pm) break; const myr = p.battlefield.filter(b => b !== pm && b.card.isCreature && !b.tapped && /myr/i.test(b.card.type + ' ' + b.card.name) && !(this.curAttackers || []).includes(b)); for (const b of myr) b.tapped = true; const x = myr.length; if (!x) break; pm.tempPump = (pm.tempTurn === this.turn ? pm.tempPump || 0 : 0) + x; this.toughAdj(pm, -x); pm.tempTurn = this.turn; if (ctx.defender) await this.changeLife(ctx.defender, -x, src); this.say(`— taps ${x} Myr: +${x}/+0 and ${x} damage`, p); break; }
        case 'goreclaw': for (const b of p.battlefield.filter(b => b.card.isCreature && this.powerOf(p, b) >= 4)) { b.tempPump = (b.tempTurn === this.turn ? b.tempPump || 0 : 0) + 1; b.tempTurn = this.turn; (b.kwTurn === this.turn ? b.kwT : (b.kwT = [])).push('trample'); b.kwTurn = this.turn; } this.refreshStatics(); break;
        case 'animosity': { const a = ctx.attacker; if (!a) break; const n = (this.curAttackers || []).filter(b => b !== a && b.card.isCreature && sharesType(a.card, b.card)).length; function sharesType(x, y) { if (x.changeling || y.changeling) return true; const tx = (x.type.split('—')[1] || '').trim().split(/\s+/), ty = (y.type.split('—')[1] || '').trim().split(/\s+/); return tx.some(t => t && ty.includes(t)); } if (n) { a.tempPump = (a.tempTurn === this.turn ? a.tempPump || 0 : 0) + n; this.toughAdj(a, -n); a.tempTurn = this.turn; } break; }
        case 'questSelf': if (ctx.perm) ctx.perm.quest = (ctx.perm.quest || 0) + 1; break;
        case 'annihilator': { const d = ctx.defender; if (!d || d.dead) break; for (let k = 0; k < op.n && d.battlefield.length; k++) { const v = d.ai ? [...d.battlefield].sort((a, b) => d.ai.permBase(a) - d.ai.permBase(b))[0] : (await this.pickPerm(d, src, d.battlefield, { dest: 'sacrifice' })) || d.battlefield[0]; await this.sacrifice(d, v); } this.say(`— annihilator ${op.n}: ${d.name} sacrifices ${op.n} permanents`, p); break; }
        case 'pilfer': { const d = ctx.defender; if (!d) break; const c = d.library.pop(); if (!c) break; d.exile.push(c); if (!c.isLand) this.allowFromExile(p, c, { owner: d, anyColor: false }); this.say(`— exiles ${c.name} from ${d.name}'s library${c.isLand ? '' : ' (may cast it this turn)'}`, p); break; }
        case 'd20Treasure': { const n = 1 + Math.floor(this.rng() * 20); this.say(`— rolls ${n}`, p); await this.makeArtifactTokens(p, 'treasure', n); break; }
        case 'stealArtifacts': { const d = ctx.defender; if (!d) break; const as = d.battlefield.filter(b => b.card.isArtifact); for (const b of as) { d.battlefield.splice(d.battlefield.indexOf(b), 1); b.summoning = true; p.battlefield.push(b); } this.say(`— gains control of ${as.length} artifact${as.length === 1 ? '' : 's'}`, p); break; }
        case 'poisonDamage': { const d = ctx.defender; if (!d) break; d.poison = (d.poison || 0) + (ctx.dmg || 0); if (d.poison >= 10) await this.kill(d, '10 poison counters'); break; }
        case 'landFromHand': { const land = p.hand.find(c => c.isLand); if (land) { p.hand.splice(p.hand.indexOf(land), 1); const [pm] = await this.landEnters(p, land); this.say(`— puts ${land.name} onto the battlefield`, p); await this.landfall(p); } break; }
        case 'doublePT': for (const b of p.battlefield.filter(b => b.card.isCreature)) b.dblTurn = this.turn; this.say('— creatures double their power and toughness this turn', p); break;
        case 'activeSacrifices': { const q = ctx.active; if (!q || q === p) break; const pool = q.battlefield.filter(b => b.card.isCreature); if (!pool.length) break; const v = q.ai ? [...pool].sort((a, b) => q.ai.permBase(a) - q.ai.permBase(b))[0] : (await this.pickPerm(q, src, pool, { dest: 'sacrifice' })) || pool[0]; this.say(`— ${q.name} sacrifices ${v.card.name}`, p); await this.sacrifice(q, v); break; }
        case 'descent': { const pm = ctx.perm; if (!pm) break; pm.descent = (pm.descent || 0) + 2; const x = pm.descent; for (const q of this.alive()) { await this.makeArtifactTokens(q, 'treasure', x); await this.changeLife(q, -x, src); } break; }
        case 'landTax': { if (!this.opponentsOf(p).some(q => q.battlefield.filter(b => b.card.isLand).length > p.battlefield.filter(b => b.card.isLand).length)) break; const pool = p.library.filter(c => c.isLand && /\bBasic\b/.test(c.type)); let picks = (await this.chooseFromList(p, src, pool, 3, 'land')).slice(0, 3); for (const c of picks) p.library.splice(p.library.indexOf(c), 1); shuffle(p.library, this.rng); picks = await this.onSearch(p, picks); p.hand.push(...picks); this.say(`— finds ${picks.map(c => c.name).join(', ') || 'nothing'}`, p); break; }
        case 'winGame': this.say(`— ${src.name}: wins the game`, p); for (const q of this.opponentsOf(p)) await this.kill(q, `${p.name}'s ${src.name}`); break;
        case 'gitrogUpkeep': { const lands = p.battlefield.filter(b => b.card.isLand); const keep = p.ai ? lands.length >= 4 : (lands.length && this.hooks.humanMay ? await this.hooks.humanMay({ p, card: src, question: 'sacrifice a land to keep it?' }) : false); if (keep && lands.length) { const v = [...lands].sort((a, b) => (b.tapped - a.tapped) || (a.card.produces.length - b.card.produces.length))[0]; await this.sacrifice(p, v); } else if (ctx.perm) await this.sacrifice(p, ctx.perm); break; }
        case 'prophet': { const c = p.library.pop(); if (!c) break; p.hand.push(c); const x = c.cmc || 0; this.say(`— reveals ${c.name} (${x})`, p); if (x) { for (const q of this.opponentsOf(p)) await this.changeLife(q, -x, src); await this.changeLife(p, x, src); } break; }
        case 'spreadCounters': { const pm = ctx.perm; if (!pm || !(pm.counters > 1) || !p.ai) break; const t = p.ai.bestEquipTarget(this, p, pm); if (t && t !== pm) { const n = Math.floor(pm.counters / 2); pm.counters -= n; t.counters = (t.counters || 0) + n; this.say(`— moves ${n} counters to ${t.card.name}`, p); } break; }
        case 'mechanized': { const pm = ctx.perm; const host = pm && p.battlefield.find(b => b.id === pm.attachedTo); if (!host) break; p.battlefield.push({ id: UID++, card: { ...host.card, uid: UID++, token: true, isCommander: false }, tapped: false, summoning: true, counters: 0 }); const names = {}; for (const b of p.battlefield.filter(b => b.card.isArtifact)) names[b.card.name] = (names[b.card.name] || 0) + 1; if (Object.values(names).some(n => n >= 8)) { this.say(`— ${src.name}: wins the game`, p); for (const q of this.opponentsOf(p)) await this.kill(q, `${p.name}'s ${src.name}`); } break; }
        case 'transform': { const pm = ctx.perm; if (!pm) break; const base = pm.card.orig || pm.card; const back = base.backFace || base.backLand; if (!back) break; pm.card = { ...back, orig: base }; this.say(`— ${base.name} transforms into ${back.name}`, p); break; }
        case 'ocelotCopies': { if (!p.blessing) break; const t = p.battlefield.filter(b => b.card.token && b.enteredTurn === this.turn); for (const b of t) p.battlefield.push({ id: UID++, card: { ...b.card, uid: UID++ }, tapped: false, summoning: true, counters: 0, enteredTurn: this.turn }); if (t.length) this.say(`— copies ${t.length} token${t.length === 1 ? '' : 's'}`, p); break; }
        case 'discover': { const out = []; let hit = null; while (p.library.length) { const c = p.library.pop(); if (!c.isLand && c.cmc <= op.n) { hit = c; break; } out.push(c); } p.library.unshift(...out); if (!hit) break; this.say(`— discovers ${hit.name}`, p); if (!hit.roles.includes('counter')) await this.castFreeCard(p, hit, p); else p.hand.push(hit); break; }
        case 'sacSelf': if (ctx.perm && p.battlefield.includes(ctx.perm)) { this.say(`— sacrifices ${src.name}`, p); await this.sacrifice(p, ctx.perm); } break;
        case 'moraug': if (/main/.test(this.phase) && this.players[this.active] === p) { p.extraCombat = (typeof p.extraCombat === 'number' ? p.extraCombat : p.extraCombat ? 1 : 0) + 1; p.untapCombat = true; this.say('— additional combat phase (creatures untap)', p); } break;
        case 'doubleCounters': if (ctx.perm) { const n = ctx.perm.counters || 0; if (n > 0) { ctx.perm.counters += this.counterAmt(p, n); await this.countersPut(p, ctx.perm, n); } } break;
        case 'crew': { const pm = ctx.perm; if (!pm || pm.card.isCreature) break; pm.revertCard = pm.card; pm.revertTurn = this.turn; pm.card = { ...pm.card, isCreature: true, type: pm.card.type.replace('Artifact', 'Artifact Creature'), kwBase: (pm.card.kwBase || pm.card.kw || []).slice() }; pm.summoning = pm.enteredTurn === this.turn; this.refreshStatics(); this.say(`— ${pm.card.name} is crewed`, p); break; }
        case 'extraTurn': { const t = ctx.target && !ctx.target.card ? ctx.target : p; t.extraTurns = (t.extraTurns || 0) + 1; this.say(`— ${t.name} will take an extra turn`, p); break; }
        case 'copyLastAbility': { const l = p.lastCLAb; if (!l || l.turn !== this.turn) break; this.say(`— copies ${l.card.name}'s ability`, p); await this.runOps(p, l.ops, l.card, { perm: l.perm, x: l.x }); break; }
        case 'defExile': { const d = ctx.defender; if (!d || d.dead) break; for (let k = 0; k < op.n && d.battlefield.length; k++) { const v = d.ai ? [...d.battlefield].sort((a, b) => d.ai.permBase(a) - d.ai.permBase(b))[0] : (await this.pickPerm(d, src, d.battlefield, { dest: 'exile' })) || d.battlefield[0]; d.battlefield.splice(d.battlefield.indexOf(v), 1); await this.emit({ type: 'destroy', owner: d, perm: v, quiet: true }); if (!v.card.token) (v.card.isCommander ? d.command : d.exile).push(v.card.orig || v.card); this.say(`— ${d.name} exiles ${v.card.name}`, d); await this.leftBattlefield(d, v); } break; }
        case 'chargeX': { const pm = ctx.perm; if (pm) { pm.charge = (pm.charge || 0) + (ctx.x || 0); this.say(`— ${ctx.x || 0} charge counters (${pm.charge})`, p); } break; }
        case 'blastZone': { const n = (ctx.perm && ctx.perm.charge) || 0; for (const q of this.alive()) for (const b of q.battlefield.filter(b => !b.card.isLand && (b.card.cmc || 0) === n && !b.card.kw.includes('indestructible'))) await this.destroy(q, b); this.say(`— destroys each nonland permanent with mana value ${n}`, p); break; }
        case 'calamity': { const rev = p.hand.filter(c => c.isCreature && !(c.colors || []).length && c !== src).sort((a, b) => b.cmc - a.cmc); const pick = p.human && rev.length > 1 ? (await this.chooseFromList(p, src, rev, 1, 'reveal'))[0] || rev[0] : rev[0]; if (!pick) break; this.say(`— reveals ${pick.name} (mana value ${pick.cmc})`, p); for (const q of this.alive()) for (const b of q.battlefield.filter(b => (b.card.isCreature || b.card.isPlaneswalker) && (b.card.cmc || 0) < pick.cmc)) { q.battlefield.splice(q.battlefield.indexOf(b), 1); await this.emit({ type: 'destroy', owner: q, perm: b, quiet: true }); if (!b.card.token) ((b.card.orig || b.card).isCommander ? q.command : q.exile).push(b.card.orig || b.card); await this.leftBattlefield(q, b); } this.say(`— exiles each creature and planeswalker with mana value less than ${pick.cmc}`, p); break; }
        case 'levelerDestroy': { const pool = this.oppPerms(p, b => !b.card.isLand); const t = p.ai ? (p.ai.bestTarget(this, p, b => !b.card.isLand) || {}).perm : await this.pickPerm(p, src, pool, { harmful: true }); if (!t) break; const o = this.ownerOf(t); if (!o) break; await this.destroy(o, t); if (!o.battlefield.includes(t)) await this.makeArtifactTokens(o, 'powerstone', 1, true); break; }
        case 'tutorTopColorless7': { const pool = p.library.filter(c => c.isCreature && !(c.colors || []).length && c.cmc >= 7); const pick = p.ai ? [...pool].sort((a, b) => b.cmc - a.cmc)[0] : (await this.chooseFromList(p, src, pool, 1, 'top'))[0]; if (!pick) break; p.library.splice(p.library.indexOf(pick), 1); shuffle(p.library, this.rng); p.library.push(pick); this.say(`— puts ${pick.name} on top of their library`, p); break; }
        case 'exileEachOpp': { for (const q of this.opponentsOf(p)) { const pool = q.battlefield.filter(b => (b.card.cmc || 0) % 2 === op.parity && !b.card.isLand || ((b.card.cmc || 0) % 2 === op.parity && b.card.isLand && false)); const ok = q.battlefield.filter(b => (b.card.cmc || 0) % 2 === op.parity); const t = p.ai ? [...ok].sort((a, b) => p.ai.permBase(b) - p.ai.permBase(a))[0] : await this.pickPerm(p, src, ok, { harmful: true }); if (!t || t.protTurn === this.turn) continue; q.battlefield.splice(q.battlefield.indexOf(t), 1); await this.emit({ type: 'destroy', owner: q, perm: t, quiet: true }); if (!t.card.token) ((t.card.orig || t.card).isCommander ? q.command : q.exile).push(t.card.orig || t.card); this.say(`— exiles ${t.card.name}`, p); await this.leftBattlefield(q, t); } break; }
        case 'adamantReturnOdd': { const spent = ctx.spell ? ctx.spell.spentC || 0 : 0; if (spent < 3) { this.say('— adamant not met (fewer than three colorless mana spent)', p); break; } const pool = p.graveyard.filter(c => !c.isInstant && !c.isSorcery && (c.cmc || 0) % 2 === 1 && c !== src); const pick = p.ai ? [...pool].sort((a, b) => b.cmc - a.cmc)[0] : (await this.chooseFromList(p, src, pool, 1, 'reanimate'))[0]; if (!pick) break; p.graveyard.splice(p.graveyard.indexOf(pick), 1); const pm = pick.isLand ? (await this.landEnters(p, pick))[0] : await this.enterPerm(p, pick); this.say(`— adamant: returns ${pick.name}`, p); if (pm && pick.etbOps && !pick.isLand) await this.runOps(p, pick.etbOps, pick, { perm: pm }); if (pm && pick.isCreature) await this.creatureEntered(p, pm); break; }
        case 'copyCastAny': { const o = ctx.castObj || this.stack.slice().reverse().find(x => x.card === ctx.castCard); if (!o || o.isCopy) break; if (op.theirs && p.ai && p.ai.castValue(this, p, o.card) < 0) break; if (op.theirs && p.human && this.hooks.humanMay && !(await this.hooks.humanMay({ p, card: o.card, question: `copy ${o.card.name}?` }))) break;
          const permCard = o.card.isCreature || o.card.isArtifact || o.card.isEnchantment || o.card.isPlaneswalker;
          if (permCard) { const c = { ...o.card, uid: UID++, token: true, isCommander: false, kwBase: undefined, kw: [...(o.card.kwBase || o.card.kw || [])] }; const t = { id: UID++, card: c, tapped: false, summoning: !!c.isCreature, counters: 0, enteredTurn: this.turn, loyalty: c.isPlaneswalker ? (c.startLoyalty || 4) : 0 }; p.battlefield.push(t); this.say(`— copies ${o.card.name} (token)`, p); if (c.etbOps) await this.runOps(p, c.etbOps, c, { perm: t }); if (c.isCreature) await this.creatureEntered(p, t); await this.permEntered(p, t); await this.tokenEvent(p); }
          else { let tgt = o.target; if (o.target && o.target.card && p.ai && this.ownerOf(o.target) === p) { const tt = p.ai.bestTarget(this, p, b => b.card.isCreature); tgt = tt ? tt.perm : tgt; } this.stack.push({ id: UID++, kind: 'spell', card: o.card, caster: p, target: tgt, zone: 'copy', isMode: true, isCopy: true, x: o.x, modes: o.modes }); this.say(`— copies ${o.card.name}`, p); }
          break; }
        case 'homeward': { for (const q of this.players) for (const b of [...q.battlefield]) if (b.card.isCreature && b.owner != null && this.players[b.owner] && this.players[b.owner] !== q) { const o = this.players[b.owner]; q.battlefield.splice(q.battlefield.indexOf(b), 1); b.owner = null; b.summoning = true; o.battlefield.push(b); this.say(`— ${b.card.name} returns to ${o.name}`, p); } break; }
        case 'reshaper': { const c = p.library.pop(); if (!c) break; this.say(`— reveals ${c.name}`, p); const permy = !c.isInstant && !c.isSorcery; if (permy && c.cmc <= 3) { if (c.isLand) { await this.landEnters(p, c); } else { const pm = await this.enterPerm(p, c); if (pm && c.etbOps) await this.runOps(p, c.etbOps, c, { perm: pm }); if (pm && c.isCreature) await this.creatureEntered(p, pm); } this.say(`— puts ${c.name} onto the battlefield`, p); } else { p.hand.push(c); this.say(`— puts ${c.name} into hand`, p); } break; }
        case 'selfToHand': { const i = p.graveyard.indexOf(src); if (i >= 0) { p.graveyard.splice(i, 1); p.hand.push(src); this.say(`— returns ${src.name} to hand`, p); } break; }
        case 'mirageCopy': { const pm = ctx.perm; if (!pm) break; const pool = this.allPerms(b => b !== pm && (b.card.isArtifact || b.card.isCreature || b.card.isEnchantment || b.card.isLand)); const s = p.ai ? [...pool].sort((a, b) => p.ai.permBase(b) - p.ai.permBase(a))[0] : await this.pickPerm(p, src, pool, { dest: 'copy' }); if (!s) break; if (!pm.revertCard) { pm.revertCard = pm.card; } pm.revertTurn = this.turn; const base = s.card.orig || s.card; pm.card = { ...base, uid: UID++, isCommander: false, kwBase: [...(base.kwBase || base.kw || [])], kw: [...(base.kwBase || base.kw || [])] }; this.refreshStatics(); this.say(`— ${src.name} becomes a copy of ${base.name} until end of turn`, p); break; }
        case 'sanctum': { const pm = ctx.perm; if (!pm || !p.battlefield.includes(pm)) break; const pool = p.library.filter(c => c.isCreature && !(c.colors || []).length); if (!pool.length) break; const yes = p.human ? !!(this.hooks.humanMay && await this.hooks.humanMay({ p, card: src, question: 'sacrifice Sanctum of Ugin to search for a colorless creature?' })) : true; if (!yes) break; await this.sacrifice(p, pm); const pick = p.ai ? [...pool].sort((a, b) => b.cmc - a.cmc)[0] : (await this.chooseFromList(p, src, pool, 1, 'hand'))[0]; if (pick) { p.library.splice(p.library.indexOf(pick), 1); p.hand.push(pick); this.say(`— finds ${pick.name}`, p); } shuffle(p.library, this.rng); break; }
        case 'cicada': { const pm = ctx.perm; const x = ctx.castCard ? ctx.castCard.cmc || 0 : 0; if (!pm) break; pm.tempPump = (pm.tempTurn === this.turn ? pm.tempPump || 0 : 0) + x; pm.tempTurn = this.turn; this.toughAdj(pm, x); (pm.kwTurn === this.turn ? pm.kwT : (pm.kwT = [])).push('trample'); pm.kwTurn = this.turn; this.refreshStatics(); this.say(`— ${src.name} gets +${x}/+${x} and trample`, p); break; }
        case 'lifeBecomesHalfStart': { const target = Math.ceil(40 / 2); const d = target - p.life; if (d) await this.changeLife(p, d, src); this.say(`— life total becomes ${target}`, p); break; }
        case 'tksExile': { const q = await this.choosePlayer(p, src, this.opponentsOf(p).filter(o => o.hand.some(c => !c.isLand)), `${src.name}: whose hand?`); if (!q) break; const pool = q.hand.filter(c => !c.isLand); const pick = p.ai ? [...pool].sort((a, b) => p.ai.castValue(this, q, b) - p.ai.castValue(this, q, a))[0] : (await this.chooseFromList(p, src, pool, 1, 'exile'))[0]; if (!pick) break; q.hand.splice(q.hand.indexOf(pick), 1); q.exile.push(pick); this.say(`— ${q.name} reveals their hand; exiles ${pick.name}`, p); break; }
        case 'oppDraws': { const q = await this.choosePlayer(p, src, this.opponentsOf(p), `${src.name}: which opponent draws?`); if (q) await this.draw(q, op.n); break; }
        case 'uginX': { const pm = ctx.perm; const L = pm ? (pm.loyalty || 0) + 0 : 0; const val = x => { let s = 0; for (const q of this.alive()) for (const b of q.battlefield) if (!b.card.isLand && (b.card.colors || []).length && (b.card.cmc || 0) <= x) s += (q === p ? -1 : 1) * (p.ai ? p.ai.permBase(b) : 1); return s; }; let x = 0; if (p.human && this.hooks.humanNumber) x = Math.min(L, Math.max(0, +(await this.hooks.humanNumber({ p, card: src, min: 0, max: L, question: 'choose X (loyalty to remove)' })) || 0)); else { let best = -1e9; for (let k = 0; k <= L; k++) { const v = val(k) - k * 0.5; if (v > best) { best = v; x = k; } } } if (pm) pm.loyalty = L - x; for (const q of this.alive()) for (const b of q.battlefield.filter(b => !b.card.isLand && (b.card.colors || []).length && (b.card.cmc || 0) <= x)) { q.battlefield.splice(q.battlefield.indexOf(b), 1); await this.emit({ type: 'destroy', owner: q, perm: b, quiet: true }); if (!b.card.token) ((b.card.orig || b.card).isCommander ? q.command : q.exile).push(b.card.orig || b.card); await this.leftBattlefield(q, b); } this.say(`— −${x}: exiles each colored permanent with mana value ${x} or less`, p); break; }
        case 'exileTargets': { for (let k = 0; k < op.n; k++) { const pool = this.oppPerms(p, () => true); const t = p.ai ? (p.ai.bestTarget(this, p, () => true) || {}).perm : await this.pickPerm(p, src, pool, { harmful: true }); if (!t) break; const o = this.ownerOf(t); if (!o) break; o.battlefield.splice(o.battlefield.indexOf(t), 1); await this.emit({ type: 'destroy', owner: o, perm: t, quiet: true }); if (!t.card.token) ((t.card.orig || t.card).isCommander ? o.command : o.exile).push(t.card.orig || t.card); this.say(`— exiles ${t.card.name}`, p); await this.leftBattlefield(o, t); } break; }
        case 'defExileTop': { const d = ctx.defender; if (!d) break; const cs = d.library.splice(-Math.min(op.n, d.library.length)); d.exile.push(...cs); this.say(`— ${d.name} exiles the top ${cs.length} cards of their library`, p); break; }
        case 'blight': { const pool = this.oppPerms(p, b => b.card.isLand && !b.blight); const t = p.ai ? [...pool].sort((a, b) => (b.card.produces || []).filter(c => c !== 'C').length - (a.card.produces || []).filter(c => c !== 'C').length)[0] : await this.pickPerm(p, src, pool, { harmful: true }); if (!t) break; t.blight = true; this.say(`— blight counter on ${t.card.name}`, p); break; }
        case 'energy': p.energy = (p.energy || 0) + op.n; this.say(`— gets ${op.n} energy (${p.energy})`, p); break;
        case 'milledToBf': { const pool = (ctx.milled || []).filter(c => p.graveyard.includes(c) && (op.what === 'creature' ? c.isCreature : c.isLand)); const picks = op.all ? pool : pool.length ? [p.ai ? [...pool].sort((a, b) => b.cmc - a.cmc)[0] : (await this.chooseFromList(p, src, pool, 1, 'reanimate'))[0] || pool[0]] : []; for (const c of picks) { p.graveyard.splice(p.graveyard.indexOf(c), 1); if (c.isLand) { await this.landEnters(p, c, !!op.tapped); await this.landfall(p); } else { const pm = await this.enterPerm(p, c, { tapped: !!op.tapped }); if (pm && c.etbOps) await this.runOps(p, c.etbOps, c, { perm: pm }); if (pm) await this.creatureEntered(p, pm); } } if (picks.length) this.say(`— puts ${picks.map(c => c.name).join(', ')} onto the battlefield`, p); break; }
        case 'handAtEnd': (this.endToHand = this.endToHand || []).push({ card: src.orig || src }); break;
        case 'scarabUpkeep': { const x = p.battlefield.filter(b => b.card.isCreature && matchesFilter(b.card, 'zombie')).length; if (!x) break; for (const q of this.opponentsOf(p)) await this.changeLife(q, -x, src); await this.runOps(p, [{ op: 'scry', n: x }], src, ctx); break; }
        case 'scarabCopy': { const pool = this.alive().flatMap(q => q.graveyard.filter(c => c.isCreature)); if (!pool.length) break; const pick = p.ai ? [...pool].sort((a, b) => p.ai.permBase({ card: b }) - p.ai.permBase({ card: a }))[0] : (await this.chooseFromList(p, src, pool, 1, 'copy'))[0]; if (!pick) break; const own = this.alive().find(q => q.graveyard.includes(pick)); own.graveyard.splice(own.graveyard.indexOf(pick), 1); own.exile.push(pick); const c = { ...pick, uid: UID++, token: true, isCommander: false, power: 4, toughness: 4, colors: ['B'], type: pick.type.replace(/—.*$/, '').trim() + ' — Zombie', kwBase: undefined, kw: [...(pick.kwBase || pick.kw || [])] }; const t = { id: UID++, card: c, tapped: false, summoning: true, counters: 0, enteredTurn: this.turn }; p.battlefield.push(t); this.say(`— exiles ${pick.name} and makes a 4/4 Zombie copy`, p); if (c.etbOps) await this.runOps(p, c.etbOps, c, { perm: t }); await this.creatureEntered(p, t); await this.tokenEvent(p); break; }
        case 'sacUnlessEscaped': { const pm = ctx.perm; if (pm && !pm.escaped && p.battlefield.includes(pm)) { this.say(`— ${src.name} wasn't escaped, so it's sacrificed`, p); await this.sacrifice(p, pm); } break; }
        case 'gyToBfMV': { const pool = p.graveyard.filter(c => c.isCreature && c.cmc === (ctx.x || 0)); const pick = p.ai ? [...pool].sort((a, b) => p.ai.permBase({ card: b }) - p.ai.permBase({ card: a }))[0] : (await this.chooseFromList(p, src, pool, 1, 'reanimate'))[0]; if (!pick) break; p.graveyard.splice(p.graveyard.indexOf(pick), 1); const pm = await this.enterPerm(p, pick); this.say(`— returns ${pick.name} to the battlefield`, p); if (pm && pick.etbOps) await this.runOps(p, pick.etbOps, pick, { perm: pm }); if (pm) await this.creatureEntered(p, pm); break; }
          case 'stripProt': for (const q of this.opponentsOf(p)) q.stripTurn = { turn: this.turn, ind: !!op.indestructible }; this.refreshStatics(); this.say(`— opponents' permanents lose hexproof${op.indestructible ? ' and indestructible' : ''} this turn`, p); break;
        case 'grantAll': for (const b of p.battlefield.filter(b => b.card.isCreature)) { (b.kwTurn === this.turn ? b.kwT : (b.kwT = [])).push(...op.kws); b.kwTurn = this.turn; } this.refreshStatics(); this.say(`— creatures gain ${op.kws.join(' and ')} this turn`, p); break;
        case 'pumpTarget': { const n = op.n === 'X' ? (ctx.x || 0) : op.n; const t = await this.pickPerm(p, src, p.battlefield.filter(b => b.card.isCreature)); if (!t) break; t.tempPump = (t.tempTurn === this.turn ? t.tempPump || 0 : 0) + n; t.tempTurn = this.turn; this.toughAdj(t, -n); if (op.kw) { (t.kwTurn === this.turn ? t.kwT : (t.kwT = [])).push(op.kw); t.kwTurn = this.turn; } this.refreshStatics(); this.say(`— ${t.card.name} gets +${n}/+0${op.kw ? ' and ' + op.kw : ''}`, p); break; }
        case 'stampede': { const x = Math.max(0, ...p.battlefield.filter(b => b.card.isCreature).map(b => this.powerOf(p, b))); p.pumpUntilEOT = (p.pumpUntilEOT || 0) + x; p.kwEOT = new Set([...(p.kwEOT || []), 'trample']); this.refreshStatics(); this.say(`— creatures get +${x}/+${x} and trample`, p); break; }
        case 'flashTurn': p.flashTurn = op.sorcery ? { turn: (p.turnCount || 0) + 1, sorcery: true } : { turn: this.turn, game: true }; this.say(op.sorcery ? '— may cast sorceries as though they had flash until their next turn' : '— may cast spells as though they had flash this turn', p); break;
        case 'selfIndCounter': if (ctx.perm) { ctx.perm.indestructibleCounter = true; this.refreshStatics(); this.say(`— indestructible counter on ${src.name}`, p); } break;
        case 'emblem': (p.emblems = p.emblems || []).push({ pump: op.pump, kws: op.kws }); this.refreshStatics(); this.say('— gets an emblem', p); break;
        case 'palisade': { const ty = this.chooseCreatureType(p); for (const q of this.alive()) for (const b of q.battlefield.filter(b => b.card.isCreature && !matchesFilter(b.card, ty))) await this.bounce(q, b, p); this.say(`— returns every non-${ty} creature to hand`, p); break; }
        case 'bite': { const mine = p.battlefield.filter(b => b.card.isCreature); const me = mine.sort((a, b) => this.powerOf(p, b) - this.powerOf(p, a))[0]; const t = ctx.target && ctx.target.card ? ctx.target : (p.ai ? (p.ai.bestTarget(this, p, b => b.card.isCreature) || {}).perm : await this.pickPerm(p, src, this.oppPerms(p, b => b.card.isCreature), { harmful: true })); if (!me || !t) break; const o = this.ownerOf(t); if (!o) break; const n = this.powerOf(p, me), tt = this.toughOf(o, t); this.say(`— ${me.card.name} deals ${n} to ${t.card.name}`, p); await this.dealtDamage(o, t, n, me.card); if (n >= tt && !t.card.kw.includes('indestructible')) await this.destroy(o, t); if (op.trample && me.card.kw.includes('trample') && n > tt) await this.changeLife(o, -(n - tt), me.card); break; }
        case 'heraldTop': { const c = p.library[p.library.length - 1]; if (c && c.isCreature && matchesFilter(c, op.filter)) { p.library.pop(); p.hand.push(c); this.say(`— reveals ${c.name} and puts it into hand`, p); } break; }
        case 'helmCopy': { const pm = ctx.perm; const host = pm && p.battlefield.find(b => b.id === pm.attachedTo); if (!host) break; const c = { ...(host.card), uid: UID++, token: true, isCommander: false, isLegendary: false, type: host.card.type.replace(/Legendary\s*/, '') }; const t = { id: UID++, card: c, tapped: false, summoning: false, counters: 0, enteredTurn: this.turn }; p.battlefield.push(t); this.say(`— creates a hasty token copy of ${host.card.name}`, p); if (c.etbOps) await this.runOps(p, c.etbOps, c, { perm: t }); await this.creatureEntered(p, t); await this.tokenEvent(p); break; }
        case 'selfKw': if (ctx.perm) { (ctx.perm.kwTurn === this.turn ? ctx.perm.kwT : (ctx.perm.kwT = [])).push(op.kw); ctx.perm.kwTurn = this.turn; this.refreshStatics(); this.say(`— ${src.name} gains ${op.kw}`, p); } break;
        case 'castImprinted': { const pm = ctx.perm; if (!pm || !pm.imprinted) break; const copy = { ...pm.imprinted, uid: UID++, token: true }; this.say(`— casts a copy of ${copy.name}`, p); await this.castFreeCard(p, copy, p); break; }
        case 'station': { const pm = ctx.perm; if (!pm) break; const c = ctx.tapped; const n = c ? Math.max(0, this.powerOf(p, c)) : 0; pm.charge = (pm.charge || 0) + n; this.say(`— stations ${n} (${pm.charge} charge)`, p); break; }
        case 'nantuko': { const pm = ctx.perm; const host = pm && pm.bestowed && p.battlefield.find(b => b.id === pm.attachedTo); if (host && this.canPayCost(p, manaInfo('{1}{G}')) && (!p.ai || p.ai.permBase(host) >= 4)) { this.payCost(p, manaInfo('{1}{G}')); await this.runOps(p, [{ op: 'tokenCopyOf', n: 1 }], src, { target: host }); } else await this.runOps(p, [{ op: 'tokens', n: 1, pt: [1, 1], kw: [] }], { name: 'Insect' }, {}); break; }
        case 'counters': {
          let targets = [];
          if (op.to === 'this card' && ctx.perm) targets = [ctx.perm];
          else if (/each/.test(op.to)) targets = p.battlefield.filter(b => b.card.isCreature && !(/other/.test(op.to) && b === ctx.perm) && (!op.filter || matchesFilter(b.card, op.filter)));
          else { const mine = p.battlefield.filter(b => b.card.isCreature); targets = mine.length ? [p.ai ? mine.sort((a, b) => p.ai.permBase(b) - p.ai.permBase(a))[0] : (await this.chooseFromList(p, src, mine.map(b => b.card), 1, 'counters')).map(c => mine.find(b => b.card === c))[0]].filter(Boolean) : []; }
          if (op.to === 'target creature' && ctx.target && ctx.target.card && p.battlefield.includes(ctx.target)) targets = [ctx.target];
          const cn = this.counterAmt(p, op.n); for (const b of targets) { b.counters = (b.counters || 0) + cn; if (op.addKw) (b.kwPerm = b.kwPerm || []).push(op.addKw); await this.countersPut(p, b, cn); }
          if (targets.length) this.say(`— ${op.n} +1/+1 counter${op.n > 1 ? 's' : ''} on ${targets.length === 1 ? targets[0].card.name : targets.length + ' creatures'}`, p); break;
        }
        case 'scry': case 'surveil': {
          const top = p.library.slice(-op.n).reverse(); if (!top.length) break;
          const away = p.human ? await this.chooseFromList(p, src, top, top.length, op.op) : p.ai.chooseScry(this, p, top);
          for (const c of away) { p.library.splice(p.library.indexOf(c), 1); if (op.op === 'scry') p.library.unshift(c); else p.graveyard.push(c); }
          if (op.op === 'surveil' && away.length) this.milledHook(p, away);
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
    if (ab.tap) { const b = src; if (!b.id || b.tapped || (b.summoning && b.card.isCreature && !b.card.kw.includes('haste') && !q.battlefield.some(x => x.card.statics && x.card.statics.abilityHaste))) return false; }
    if (ab.life && q.life <= ab.life) return false;
    if (ab.loyalty != null) { if (!src.id || src.pwTurn === this.turn || (src.loyalty || 0) + ab.loyalty < 0) return false; if (ab.loyaltyX && !(src.loyalty > 0)) return false; }
    if (src.neutral) return false;
    if (ab.exileOthers && q.graveyard.filter(c => c !== card).length < ab.exileOthers) return false;
    if (ab.discard && q.hand.filter(c => c !== card).length < ab.discard) return false;
    if (ab.sacOther && !q.battlefield.some(b => b.card.isCreature && (ab.sacOther !== 'another' || b !== src))) return false;
    if (ab.sacCost && this.sacPool(q, ab.sacCost, src).length < (ab.sacCost.n === 'x' ? 1 : ab.sacCost.n)) return false;
    if (ab.removeCounter && !((src.counters || 0) >= ab.removeCounter)) return false;
    if (ab.removeKind && !((src[ab.removeKind] || 0) > 0)) return false;
    if (ab.ops.some(o => o.op === 'copyLastAbility') && !(q.lastCLAb && q.lastCLAb.turn === this.turn)) return false;
    if (ab.exileCreature && !q.battlefield.some(b => b.card.isCreature)) return false;
    if (ab.tapCreature && !q.battlefield.some(b => b.card.isCreature && !b.tapped && b !== src)) return false;
    if (ab.equipFilter && !q.battlefield.some(b => b.card.isCreature && (ab.equipFilter === 'commander' ? b.card.isCommander : b.card.isLegendary))) return false;
    if (ab.onlyYourTurn && this.players[this.active] !== q) return false;
    if (ab.energyX && !q.graveyard.some(c => c.isCreature && c.cmc <= (q.energy || 0))) return false;
    if (ab.crew) { if (src.card.isCreature) return false; const pw = q.battlefield.filter(b => b.card.isCreature && !b.tapped && b !== src).reduce((s, b) => s + Math.max(0, this.powerOf(q, b)), 0); if (pw < ab.crew) return false; }
    if (ab.levelReq != null && (src.level || 1) !== ab.levelReq) return false;
    if (ab.needHideaway && !(src.hideaway && this.hideawayOk(q, src))) return false;
    for (const op of ab.ops) { if (op.op === 'exileGyCard' && !this.alive().some(o => o.graveyard.some(c => this.gyKind(c, op.what)))) return false; if (op.op === 'untapSelf' && !src.tapped) return false; if (op.op === 'castImprinted' && !src.imprinted) return false; }
    if (ab.ops.some(o => o.op === 'attach') && !q.battlefield.some(b => b.card.isCreature)) return false;
    // something to do?
    for (const op of ab.ops) { if (op.op === 'gyToHand' && !q.graveyard.some(c => c !== card)) return false; if (op.op === 'gyToBf' && !q.graveyard.some(c => c.isCreature && c !== card)) return false; if (op.op === 'counters' && op.to === 'target creature' && !q.battlefield.some(b => b.card.isCreature)) return false; }
    const cost = this.abilityCost(q, card, ab, src);
    if (ab.tap) { const was = src.tapped; src.tapped = true; const ok = this.canPayCost(q, cost); src.tapped = was; return ok; }
    return this.canPayCost(q, cost);
  }
  /** an ability's mana cost after reducers (Training Grounds, legendary-creature discounts, equip {0}) */
  abilityCost(q, card, ab, src) {
    let c = ab.cost; const red = (n, min = 0) => { const k = Math.max(0, Math.min(n, c.generic, c.total - min)); if (k) c = { ...c, generic: c.generic - k, total: c.total - k }; };
    if (ab.legendReduce) red(q.battlefield.filter(b => b.card.isCreature && b.card.isLegendary).length);
    if (card.isCreature && src && src.id) for (const b of q.battlefield) { const n = b.card.statics && b.card.statics.creatureAbilityReduce; if (n && !b.neutral) red(n, 1); }
    if (ab.label === 'equip' && q.battlefield.some(b => b.card.statics && b.card.statics.equipZero) && q.battlefield.filter(b => b.card.isArtifact).length >= 3) red(99);
    if (ab.equipFilter === 'legendary' || ab.equipFilter === 'commander') {} // the cheaper equip is chosen when the target qualifies
    return c;
  }
  sacPool(q, sc, src) {
    const w = sc.what;
    return q.battlefield.filter(b => (!sc.another || b !== src) && (w === 'creature' ? b.card.isCreature : w === 'artifact or creature' ? (b.card.isArtifact || b.card.isCreature) : w === 'artifact' ? b.card.isArtifact : w === 'token' ? b.card.token : w === 'treasure' ? b.card.name === 'Treasure' : w === 'land' ? b.card.isLand : w === 'nonland' ? !b.card.isLand : /black creature/.test(w) ? b.card.isCreature && (b.card.colors || []).includes('B') : matchesFilter(b.card, w)));
  }
  gyKind(c, what) { return what === 'land' ? c.isLand : what === 'instant or sorcery' ? (c.isInstant || c.isSorcery) : what === 'creature' ? c.isCreature : what === 'artifact' ? c.isArtifact : true; }
  abilityOptions(q, { instant = false } = {}) {
    const out = [];
    for (const mv of q.battlefield.filter(b => /has all activated abilities of creatures you control that don't have the same name as this creature/i.test(b.card.oracle) && !b.neutral)) for (const b of q.battlefield) if (b.card.isCreature && b.card.name !== mv.card.name) (b.card.abilities || []).forEach((ab, ai) => { if (ab.zone === 'battlefield' && !ab.loyalty && this.canUseAbility(q, b.card, ab, mv, { instant })) out.push({ kind: 'ability', card: b.card, perm: mv, ab, ai, via: mv.card.name }); });
    const add = (card, perm, zone) => (card.abilities || []).forEach((ab, ai) => { if (ab.zone === zone && this.canUseAbility(q, card, ab, perm, { instant })) out.push({ kind: 'ability', card, perm, ab, ai }); });
    for (const b of q.battlefield) add(b.card, b, 'battlefield');
    for (const c of q.graveyard) add(c, null, 'graveyard');
    for (const c of q.hand) add(c, null, 'hand');
    return out;
  }
  gyCastOptions(q, { instant = false } = {}) { return q.graveyard.filter(c => this.gyGrant(q, c) && this.castMode(q, c, 'gy', { instant })).map(c => ({ kind: 'cast', card: c, zone: 'gy' })); }
  async activate(q, opt) {
    const { card, ab } = opt; const perm = opt.perm || (ab.zone === 'battlefield' ? q.battlefield.find(b => b.card === card) : null);
    if (!this.canUseAbility(q, card, ab, perm)) return false;
    if (ab.tap && perm) perm.tapped = true;
    if (ab.loyalty != null && perm) { perm.loyalty = (perm.loyalty || 0) + ab.loyalty; perm.pwTurn = this.turn; }
    let abCost = this.abilityCost(q, card, ab, perm);
    if (ab.xx) { let max = 0; while (max < 10 && this.canPayCost(q, this.addCosts(abCost, { generic: 2 * (max + 1), pips: {} }))) max++; let x = q.human ? (this.hooks.humanNumber ? Math.min(max, +(await this.hooks.humanNumber({ p: q, card, min: 0, max, question: 'choose X (pays {X}{X})' })) || 0) : max) : (q.ai.blastX ? Math.min(max, q.ai.blastX(this, q, perm)) : 0); opt.x = x; abCost = this.addCosts(abCost, { generic: 2 * x, pips: {} }); }
    if (ab.cost.x) { let max = 0; while (max < 20 && this.canPayCost(q, this.addCosts(abCost, { generic: max + 1, pips: {} }))) max++; const x = q.human ? (this.hooks.humanNumber ? Math.min(max, +(await this.hooks.humanNumber({ p: q, card, min: 0, max, question: 'choose X' })) || 0) : max) : max; opt.x = x; abCost = this.addCosts(abCost, { generic: x, pips: {} }); }
    this.payCost(q, abCost);
    if (ab.removeCounter && perm) perm.counters -= ab.removeCounter;
    let tapped = null; if (ab.tapCreature) { const pool = q.battlefield.filter(b => b.card.isCreature && !b.tapped && b !== perm); tapped = q.ai ? [...pool].sort((a, b) => this.powerOf(q, b) - this.powerOf(q, a))[0] : await this.pickPerm(q, card, pool, { dest: 'tap' }); if (tapped) tapped.tapped = true; }
    opt.tapped = tapped;
    if (ab.removeKind && perm) perm[ab.removeKind]--;
    if (ab.sacCost) { const pool = this.sacPool(q, ab.sacCost, perm); let n = ab.sacCost.n === 'x' ? (q.ai ? Math.min(pool.length, 3) : pool.length) : ab.sacCost.n; const vs = q.human && n < pool.length ? (await this.chooseFromList(q, card, pool.map(b => b.card), n, 'sacrifice')).map(c => pool.find(b => b.card === c)).filter(Boolean) : [...pool].sort((a, b) => (b.card.token - a.card.token) || (q.ai ? q.ai.permBase(a) - q.ai.permBase(b) : 0)).slice(0, n); opt.x = vs.length; for (const v of vs) { this.say(`sacrifices ${v.card.name}`, q); await this.sacrifice(q, v); } }
    if (ab.exileCreature) { const pool = q.battlefield.filter(b => b.card.isCreature); const v = [...pool].sort((a, b) => (b.card.token - a.card.token) || (q.ai ? q.ai.permBase(a) - q.ai.permBase(b) : 0))[0]; if (v) { q.battlefield.splice(q.battlefield.indexOf(v), 1); if (!v.card.token) q.exile.push(v.card.orig || v.card); this.say(`exiles ${v.card.name}`, q); await this.leftBattlefield(q, v); } }
    if (ab.life) await this.changeLife(q, -ab.life, card);
    if (ab.discard) for (let k = 0; k < ab.discard; k++) { const d = q.ai ? q.ai.chooseDiscard(this, q) : (this.hooks.humanDiscard ? await this.hooks.humanDiscard(q) : q.hand.find(c => c !== card)); if (d && d !== card && q.hand.includes(d)) { q.hand.splice(q.hand.indexOf(d), 1); q.graveyard.push(d); } }
    if (ab.sacOther) {
      const pool = q.battlefield.filter(b => b.card.isCreature && (ab.sacOther !== 'another' || b !== perm));
      let v = opt.victim && pool.includes(opt.victim) ? opt.victim : null;
      if (!v) { if (q.human) { const pick = (await this.chooseFromList(q, card, pool.map(b => b.card), 1, 'sacrifice'))[0]; v = pool.find(b => b.card === pick); } else v = q.ai ? q.ai.chooseSacVictim(this, q, pool) : pool[0]; }
      if (!v) return false;
      opt.x = this.powerOf(q, v); this.say(`sacrifices ${v.card.name} to ${card.name}`, q); await this.sacrifice(q, v);
    }
    if (ab.exileOthers) { const others = q.graveyard.filter(c => c !== card).sort((a, b) => a.cmc - b.cmc).slice(0, ab.exileOthers); for (const c of others) { q.graveyard.splice(q.graveyard.indexOf(c), 1); q.exile.push(c); } }
    if (ab.energyX) { const ok = q.graveyard.filter(c => c.isCreature && c.cmc <= (q.energy || 0)); let x; if (q.human && this.hooks.humanNumber) x = Math.min(q.energy || 0, Math.max(0, +(await this.hooks.humanNumber({ p: q, card, min: 0, max: q.energy || 0, question: 'pay how much energy (X)?' })) || 0)); else { const best = q.ai ? [...ok].sort((a, b) => q.ai.permBase({ card: b }) - q.ai.permBase({ card: a }))[0] : ok[0]; x = best ? best.cmc : 0; } q.energy = (q.energy || 0) - x; opt.x = x; }
    if (ab.crew && perm) { let need = ab.crew; const pool = q.battlefield.filter(b => b.card.isCreature && !b.tapped && b !== perm); let crew = []; if (q.human) { const picks = await this.chooseFromList(q, card, pool.map(b => b.card), pool.length, 'crew'); crew = pool.filter(b => picks.includes(b.card)); } else { for (const b of [...pool].sort((a, z) => ((z.summoning ? 1 : 0) - (a.summoning ? 1 : 0)) || (this.powerOf(q, a) - this.powerOf(q, z)))) { if (need <= 0) break; crew.push(b); need -= this.powerOf(q, b); } } if (crew.reduce((s, b) => s + this.powerOf(q, b), 0) < ab.crew) return false; for (const b of crew) b.tapped = true; this.say(`taps ${crew.map(b => b.card.name).join(', ')} to crew ${card.name}`, q); }
    await this.emit({ type: 'activate', p: q, perm, card });
    this.say(`activates ${card.name}${ab.label ? ' (' + ab.label + ')' : ''}`, q);
    // pay "this card" costs: sacrifice / exile / discard the source
    if (ab.sacSelf && perm) await this.sacrifice(q, perm);
    if (ab.exileSelf) { if (perm) { const i = q.battlefield.indexOf(perm); if (i >= 0) q.battlefield.splice(i, 1); if (!card.token) q.exile.push(card); await this.emit({ type: 'destroy', owner: q, perm, quiet: true }); } else { const i = q.graveyard.indexOf(card); if (i >= 0) { q.graveyard.splice(i, 1); q.exile.push(card); } } }
    if (ab.discardSelf) { const i = q.hand.indexOf(card); if (i >= 0) { q.hand.splice(i, 1); q.graveyard.push(card); } }
    if (ab.returnSelf && perm) await this.bounce(q, perm, q);
    await this.runOps(q, ab.ops, card, { perm, x: opt.x, tapped: opt.tapped, equipFilter: ab.equipFilter });
    if (!(card.colors || []).length && !ab.ops.some(o => o.op === 'copyLastAbility')) q.lastCLAb = { card, ops: ab.ops, perm, x: opt.x, turn: this.turn };
    if (!ab.ops.some(o => o.op === 'copyLastAbility' || o.op === 'crew') && q.battlefield.some(b => b.card.statics && b.card.statics.rings && !b.neutral)) { const two = { generic: 2, pips: { W: 0, U: 0, B: 0, R: 0, G: 0 }, total: 2 }; if (this.canPayCost(q, two) && (q.human ? !!(this.hooks.humanMay && await this.hooks.humanMay({ p: q, card: { name: 'Rings of Brighthearth' }, question: `pay {2} to copy ${card.name}'s ability?` })) : q.ai.abilityValue(this, q, opt) >= 2)) { this.payCost(q, two); this.say(`— Rings of Brighthearth copies ${card.name}'s ability`, q); await this.runOps(q, ab.ops, card, { perm, x: opt.x, tapped: opt.tapped }); } }
    if (ab.loyalty != null && perm && q.battlefield.includes(perm) && perm.loyalty <= 0) { this.say(`— ${card.name} has no loyalty left`, q); await this.destroy(q, perm); }
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
    picks = await this.onSearch(p, picks);
    const names = picks.map(c => c.name).join(', ');
    for (const c of picks) {
      if (t.dest === 'hand') p.hand.push(c);
      else if (t.dest === 'graveyard') p.graveyard.push(c);
      else if (t.dest === 'top') p.library.push(c); // top of library = end of the array
      else if (c.isLand) await this.landEnters(p, c);
      else p.battlefield.push({ id: UID++, card: c, tapped: false, summoning: c.isCreature, counters: 0, loyalty: c.isPlaneswalker ? (c.startLoyalty || 4) : 0 });
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
    const pm = { id: UID++, card: pick, tapped: false, summoning: true, counters: 0, enteredTurn: this.turn }; p.battlefield.push(pm);
    this.say(`— returns ${pick.name}${owner !== p ? ' from ' + owner.name + "'s graveyard" : ''} to the battlefield`, p);
    { const aura = p.battlefield.find(b => b.card === card && b.animateAura); if (aura) { aura.attachedTo = pm.id; aura.animateHost = pm.id; aura.animateAura = false; } }
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
    if ((perm.card.orig || perm.card).isCommander) owner.command.push(perm.card.orig || perm.card); else owner.hand.push(perm.card.orig || perm.card);
    this.say(`— ${perm.card.name} returns to ${owner.name}'s ${(perm.card.orig || perm.card).isCommander ? 'command zone' : 'hand'}`, by);
    await this.leftBattlefield(owner, perm);
  }
  async tuck(owner, perm, by, top) {
    const i = owner.battlefield.indexOf(perm); if (i < 0) return; await this.emit({ type: 'destroy', owner, perm, quiet: true }); owner.battlefield.splice(i, 1);
    if (perm.card.token) return;
    if ((perm.card.orig || perm.card).isCommander) { owner.command.push(perm.card.orig || perm.card); this.say(`— ${perm.card.name} goes to the command zone`, by); return; }
    if (top) owner.library.push(perm.card.orig || perm.card); else owner.library.splice(Math.floor(this.rng() * (owner.library.length + 1)), 0, perm.card.orig || perm.card);
    this.say(`— ${perm.card.name} goes into ${owner.name}'s library`, by);
    await this.leftBattlefield(owner, perm);
  }
  /** a creature entered: fire "whenever a creature enters" triggers everywhere */
  async creatureEntered(p, perm) {
    if (!perm || !perm.card.isCreature) return;
    for (const q of this.alive()) for (const b of [...q.battlefield]) for (const tr of b.card.triggers || []) {
      if (tr.when !== 'creatureEnters' || (tr.another && b === perm) || (tr.yours && q !== p) || (tr.opp && q === p) || !matchesFilter(perm.card, tr.filter) || b.neutral) continue;
      if (tr.stat) { const v = tr.stat.k === 'power' ? this.powerOf(p, perm) : perm.card.cmc; if (tr.stat.dir === 'greater' ? v < tr.stat.n : v > tr.stat.n) continue; }
      if (tr.withKw && !perm.card.kw.includes(tr.withKw)) continue;
      if (this.etbSuppressed(q)) continue;
      if (tr.oncePerTurn) { if (b.enterTurn === this.turn) continue; b.enterTurn = this.turn; }
      for (let k = this.etbTimes(q, perm) * this.trigTimes(q, b, 'enter'); k > 0; k--) (this.trigOk()) && await this.runOps(q, tr.ops, b.card, { perm: b, entered: perm, enteredOwner: p });
    }
  }
  async permEntered(p, perm) {
    if (!perm) return;
    for (const q of this.alive()) for (const b of q.battlefield.filter(x => !x.neutral)) for (const tr of b.card.triggers || []) {
      if (tr.when !== 'permEnters' || q !== p || (tr.another && b === perm)) continue;
      const c = perm.card; const ok = tr.filter === 'token' ? c.token : tr.filter === 'equipment' ? /equipment/i.test(c.type) : tr.filter === 'artifact' ? c.isArtifact : tr.filter === 'enchantment' ? c.isEnchantment : tr.filter === 'land' ? c.isLand : false;
      if (!ok || !this.trigOk() || this.etbSuppressed(q)) continue;
      if (tr.oncePerTurn) { if (b.enterTurn2 === this.turn) continue; b.enterTurn2 = this.turn; }
      if (tr.may && !(await this.chooseMay(q, b.card, tr))) continue;
      for (let k = this.etbTimes(q, perm) * this.trigTimes(q, b, 'enter'); k > 0; k--) await this.runOps(q, tr.ops, b.card, { perm: b, entered: perm });
    }
  }
  async cascade(p, card, n) {
    for (let k = 0; k < n && !p.dead; k++) { const out = []; let hit = null; while (p.library.length) { const c = p.library.pop(); if (!c.isLand && c.cmc < card.cmc) { hit = c; break; } out.push(c); }
      if (hit) { this.say(`— cascade reveals ${hit.name}`, p); const go = p.human ? (this.hooks.humanMay ? !!(await this.hooks.humanMay({ p, card: hit, question: `cast ${hit.name} without paying its mana cost (cascade)?` })) : true) : (!hit.roles.includes('counter') && p.ai.castValue(this, p, hit) > -2); if (go) await this.castFreeCard(p, hit, p); else out.push(hit); }
      shuffle(out, this.rng); p.library.unshift(...out); }
  }
  async castTriggers(p, card) {
    p.spellsThisTurn = (p.spellsThisTurn || 0) + 1;
    { const top = this.stack[this.stack.length - 1]; const zone = top && top.card === card ? top.zone : 'hand';
      if (card.isCreature) { if (p.grandN && p.grandTurn === this.turn && top && top.card === card) { top.extraCounters = (top.extraCounters || 0) + p.grandN; p.grandN = 0; } p.creatureSpellTurn = this.turn; }
      if (top && top.card === card && top.caster === p) { const tgt = top.target; top.__targetsMine = null; }
      let casc = card.cascadeN || 0; const S0 = q => p.battlefield.some(b => b.card.statics && b.card.statics[q] && !b.neutral);
      if (S0('zhulodok') && zone === 'hand' && !(card.colors || []).length && card.cmc >= 7) casc += 2;
      if (zone === 'exile' && S0('exileCascade') && p.exileCascTurn !== this.turn) { p.exileCascTurn = this.turn; casc++; }
      if (casc) await this.cascade(p, card, casc); }
    for (const q of this.alive()) for (const b of q.battlefield.filter(x => !x.neutral)) for (const tr of b.card.triggers || []) {
      if (!((tr.when === 'oppCast' && q !== p) || tr.when === 'anyCast') || !matchesFilter(card, tr.filter)) continue;
      if (tr.firstEach && p.spellsThisTurn !== 1) continue;
      if (tr.second && p.spellsThisTurn !== 2) continue;
      if (tr.tax) { const n = tr.tax === 'power' ? Math.max(0, this.powerOf(q, b)) : tr.tax; if (await this.payTax(p, b.card, n, `${b.card.name} (${q.name}): pay {${n}} or they get the trigger?`)) continue; }
      if (q.dead || !this.trigOk()) continue;
      this.say(`— ${b.card.name} triggers (${p.name} cast ${card.name})`, q); await this.emit({ type: 'trigger', p: q, card: b.card, perm: b });
      await this.runTrig(q, b, tr, { other: p, castCard: card });
    }
    for (const b of [...p.battlefield]) { const S = b.card.statics || {}; if (b.neutral) continue;
      if (S.prowess && !card.isCreature) { b.tempPump = (b.tempTurn === this.turn ? b.tempPump || 0 : 0) + 1; b.tempTurn = this.turn; }
      if (S.extort && !p.dead && await this.payTax(p, { name: b.card.name + ' (extort)' }, 1, `${b.card.name}: pay {1} to extort (each opponent loses 1, you gain that much)?`)) { let n = 0; for (const q of this.opponentsOf(p)) { await this.changeLife(q, -1, b.card); n++; } await this.changeLife(p, n, b.card); } }
    for (const b of [...p.battlefield]) for (const tr of b.card.triggers || []) {
      if (tr.when !== 'cast' || b.neutral) continue;
      if (tr.filter === '__chosen__' ? !(b.chosenType && matchesFilter(card, b.chosenType)) : !matchesFilter(card, tr.filter)) continue;
      if (tr.mvMin && card.cmc < tr.mvMin) continue;
      if (tr.spentGtPower) { const top = this.stack[this.stack.length - 1]; const spent = top && top.card === card ? top.spent : card.cmc; if (!(spent > this.powerOf(p, b))) continue; }
      this.say(`— ${b.card.name} triggers (cast ${card.name})`, p); await this.emit({ type: 'trigger', p, card: b.card, perm: b });
      await this.runTrig(p, b, tr, { castCard: card, castObj: this.stack[this.stack.length - 1] }, card.isInstant || card.isSorcery ? 'castIS' : 'cast');
    }
    if (card.castSelfOps) await this.runOps(p, card.castSelfOps, card, {});
  }
  async attackTriggers(p, atk) {
    if (atk.length === 1) { const n = p.battlefield.filter(b => b.card.statics && b.card.statics.exalted && !b.neutral).length; if (n) { const a = atk[0].attacker; a.tempPump = (a.tempTurn === this.turn ? a.tempPump || 0 : 0) + n; a.tempTurn = this.turn; this.say(`— exalted ×${n}: ${a.card.name} gets +${n}/+${n}`, p); } }
    for (const a of atk) a.attacker.attacksThisTurn = (a.attacker.attackTurn === this.turn ? a.attacker.attacksThisTurn || 0 : 0) + 1, a.attacker.attackTurn = this.turn;
    for (const b of [...p.battlefield]) for (const tr of b.card.triggers || []) {
      if (tr.when !== 'attack' || b.neutral) continue;
      let who = [];
      if (tr.who === 'this card') who = atk.filter(a => a.attacker === b);
      else if (tr.who === 'equipped creature' || tr.who === 'enchanted creature') who = atk.filter(a => a.attacker.id === b.attachedTo);
      else if (tr.who === 'one or more creatures you control' || tr.who === 'you') who = atk.slice(0, 1);
      else who = atk.slice();
      if (tr.attackerFilter) who = who.filter(a => matchesFilter(a.attacker.card, tr.attackerFilter));
      if (tr.firstEachTurn) { if (b.firstAtkTurn === this.turn) who = []; else if (who.length) b.firstAtkTurn = this.turn; }
      const twice = p.battlefield.some(x => x.card.statics && x.card.statics.attackTrigDouble && !x.neutral) ? 2 : 1;
      for (const a of who) for (let k = 0; k < twice; k++) { this.say(`— ${b.card.name} attack trigger`, p); await this.runTrig(p, b, tr, { attacker: a.attacker, defender: a.defender, atk }); }
    }
    // defenders: Mangara / Trouble in Pairs ("attacks you with two or more creatures"), curses on the attacked player
    for (const d of new Set(atk.map(a => a.defender))) {
      const n = atk.filter(a => a.defender === d).length;
      if (n >= 2) for (const b of d.battlefield.filter(x => !x.neutral)) for (const tr of b.card.triggers || []) if (tr.when === 'attackedBy2') await this.runTrig(d, b, tr, {});
      for (const q of this.alive()) for (const b of q.battlefield.filter(x => x.enchantedPlayer === d && !x.neutral)) for (const tr of b.card.triggers || []) if (tr.when === 'enchantedAttacked') { await this.runTrig(q, b, tr, {}); if (p !== q) await this.runOps(p, tr.ops, b.card, {}); }
    }
  }
  async combatDamageTriggers(p, attacker) {
    for (const b of [...p.battlefield]) for (const tr of b.card.triggers || []) {
      if (tr.when !== 'combatDamage' || b.neutral) continue;
      const hit = tr.who === 'this card' ? b === attacker : (tr.who === 'equipped creature' || tr.who === 'enchanted creature') ? b.attachedTo === attacker.id : true;
      if (!hit) continue;
      if (tr.artifactOnly && !attacker.card.isArtifact) continue;
      if (tr.pumpedOnly && !(this.powerOf(p, attacker) > attacker.card.power)) continue;
      if (tr.who === 'one or more creatures you control' && this._cdOnce && this._cdOnce.has(b)) continue;
      (this._cdOnce = this._cdOnce || new Set()).add(b);
      this.say(`— ${b.card.name} combat damage trigger`, p); await this.runTrig(p, b, tr, { attacker, defender: this._cdDefender, dmg: this._cdDmg, x: this._cdDmg });
    }
  }
  async destroy(owner, perm, quiet) {
    if (!owner.battlefield.includes(perm)) return;
    if (perm.regenTurn === this.turn) { perm.regenTurn = null; perm.tapped = true; this.say(`— ${perm.card.name} regenerates`, owner); return; }
    { const umbra = owner.battlefield.find(b => b.attachedTo === perm.id && b.card.statics && b.card.statics.umbra); if (umbra) { this.say(`— ${umbra.card.name} is destroyed instead (umbra armor)`, owner); await this.destroy(owner, umbra); return; } }
    if (perm.card.isCreature) { if (this.diedTurn !== this.turn) { this.diedTurn = this.turn; this.diedThisTurn = 0; } this.diedThisTurn++; }
    if (perm.card.isCreature && !perm.card.token) { const dc = this.opponentsOf(owner).map(q => [q, q.battlefield.find(b => b.card.darkCrystal && !b.neutral)]).find(x => x[1]); if (dc) { const [q, crystal] = dc; await this.emit({ type: 'destroy', owner, perm, quiet: true }); owner.battlefield.splice(owner.battlefield.indexOf(perm), 1); const c = perm.card.orig || perm.card; if (c.isCommander) owner.command.push(c); else { owner.exile.push(c); (crystal.crystalExiled = crystal.crystalExiled || []).push([owner, c]); } this.say(`— ${c.name} is exiled instead (${crystal.card.name}); ${q.name} gains 2`, q); await this.changeLife(q, 2, crystal.card); await this.leftBattlefield(owner, perm); return; } }
    await this.emit({ type: 'destroy', owner, perm, quiet });
    const i = owner.battlefield.indexOf(perm); if (i < 0) return; owner.battlefield.splice(i, 1);
    if ((perm.card.orig || perm.card).isCommander) { owner.command.push(perm.card.orig || perm.card); this.say(`— ${perm.card.name} returns to the command zone`, owner); }
    else if (perm.unearth) owner.exile.push(perm.card.orig || perm.card);
    else if (!perm.card.token) owner.graveyard.push(perm.card.orig || perm.card);
    if (perm.card.isCreature || perm.card.isArtifact) await this.deathTriggers(owner, perm);
    await this.leftBattlefield(owner, perm);
  }
  // ---------- activated abilities: fetchlands ----------
  fetchTargets(p, perm) {
    const f = perm.card.fetch; if (!f) return [];
    return p.library.filter(c => c.isLand && (f.any ? true : f.basic ? /\bBasic\b/.test(c.type) && (!f.types.length || f.types.some(t => c.type.includes(t))) : f.types.some(t => c.type.includes(t))));
  }
  fetchCost(f) { const pips = f.pips || { W: 0, U: 0, B: 0, R: 0, G: 0 }; return { generic: f.generic || 0, pips, total: (f.generic || 0) + Object.values(pips).reduce((a, b) => a + b, 0) }; }
  canActivate(p, perm) {
    const f = perm.card.fetch; if (!f || perm.tapped || !p.battlefield.includes(perm) || p.life <= f.life) return false;
    if (f.generic || f.pips) { perm.tapped = true; const okPay = this.canPayCost(p, this.fetchCost(f)); perm.tapped = false; if (!okPay) return false; }
    return true;
  }
  async activateFetch(p, perm, choice) {
    if (!this.canActivate(p, perm)) return false;
    const f = perm.card.fetch; perm.tapped = true;
    if (f.generic || f.pips) this.payCost(p, this.fetchCost(f));
    await this.emit({ type: 'activate', p, perm, card: perm.card });
    await this.sacrifice(p, perm);
    if (f.life) await this.changeLife(p, -f.life, perm.card);
    if (p.dead) return true;
    const pool = this.fetchTargets(p, perm);
    let picks = choice ? [].concat(choice) : p.ai ? p.ai.chooseFetch(this, p, pool, f.count) : (this.hooks.humanChooseFetch && pool.length ? [].concat(await this.hooks.humanChooseFetch(p, perm.card, pool, f.count) || []) : []);
    const landsNow = p.battlefield.filter(b => b.card.isLand).length;
    picks = picks.slice(0, f.count).filter(c => p.library.includes(c));
    if (f.shareType && picks.length) { const ty = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'].find(t => picks[0].type.includes(t)); picks = [picks[0], ...pool.filter(c => c !== picks[0] && ty && c.type.includes(ty)).slice(0, f.count - 1)]; }
    if (f.pair) { const out = []; for (const ty of f.pair) { const c = (picks.find(x => x.type.includes(ty) && !out.includes(x)) || pool.find(x => x.type.includes(ty) && !out.includes(x))); if (c) out.push(c); } picks = out; }
    for (const c of picks) p.library.splice(p.library.indexOf(c), 1);
    picks = await this.onSearch(p, picks);
    for (const land of picks) {
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
    if (perm.card.isCreature) { if (this.diedTurn !== this.turn) { this.diedTurn = this.turn; this.diedThisTurn = 0; } this.diedThisTurn++; }
    await this.emit({ type: 'destroy', owner, perm, quiet: true });
    const i = owner.battlefield.indexOf(perm); if (i >= 0) owner.battlefield.splice(i, 1);
    if ((perm.card.orig || perm.card).isCommander) { owner.command.push(perm.card.orig || perm.card); this.say(`— ${perm.card.name} returns to the command zone`, owner); }
    else if (!perm.card.token) owner.graveyard.push(perm.card.orig || perm.card);
    if (perm.card.isCreature || perm.card.isArtifact) await this.deathTriggers(owner, perm);
    await this.sacTriggers(owner, perm);
    if (!perm.card.token) { const thief = this.opponentsOf(owner).find(q => q.battlefield.some(b => b.card.statics && b.card.statics.betrays && !b.neutral)); const c = perm.card.orig || perm.card; if (thief && owner.graveyard.includes(c)) { owner.graveyard.splice(owner.graveyard.indexOf(c), 1); const pm = await this.enterPerm(thief, c); if (pm) pm.owner = this.players.indexOf(owner); this.say(`— ${thief.name} puts ${c.name} onto the battlefield under their control (It That Betrays)`, thief); if (pm && c.etbOps) await this.runOps(thief, c.etbOps, c, { perm: pm }); if (pm && c.isCreature) await this.creatureEntered(thief, pm); } }
    await this.leftBattlefield(owner, perm);
  }
  async sacTriggers(owner, perm) {
    for (const q of this.alive()) for (const b of q.battlefield.filter(x => !x.neutral && x !== perm)) for (const tr of b.card.triggers || []) {
      if (tr.when !== 'sacrifice' || (!tr.any && q !== owner)) continue;
      if (tr.clue && perm.card.name !== 'Clue') continue;
      if (!this.trigOk()) return;
      this.say(`— ${b.card.name} triggers (${perm.card.name} was sacrificed)`, q); await this.runTrig(q, b, tr, {});
    }
    if (perm.card.token) await this.tokenEvent(owner);
  }
  async tokenEvent(p) { for (const b of p.battlefield.filter(x => !x.neutral)) for (const tr of b.card.triggers || []) if (tr.when === 'tokenEvent') await this.runTrig(p, b, tr, {}); }
  /** a permanent left the battlefield (any way): Ozolith counters, token-leaves triggers, Animate Dead, O-ring style effects */
  async leftBattlefield(owner, perm) {
    if (perm.card.ltbOps && !owner.dead) await this.runOps(owner, perm.card.ltbOps, perm.card, { perm });
    if ((perm.counters || 0) > 0 && !perm.card.token) { const yuna = owner.battlefield.find(b => b.card.statics && b.card.statics.yunaCounters && !b.neutral && b !== perm); const gone = !owner.battlefield.includes(perm) && owner.graveyard.includes(perm.card.orig || perm.card); if (yuna && gone) await this.runOps(owner, [{ op: 'counters', n: perm.counters, to: 'target creature' }], yuna.card, { perm: yuna }); }
    if (perm.card.token) for (const b of owner.battlefield.filter(x => !x.neutral)) for (const tr of b.card.triggers || []) if (tr.when === 'tokenLeaves') await this.runTrig(owner, b, tr, {});
    if (perm.card.isCreature && (perm.counters || 0) > 0) { const oz = owner.battlefield.find(b => /whenever a creature you control leaves the battlefield, if it had counters on it, put those counters on/i.test(b.card.oracle) && !b.neutral); if (oz) { oz.counters = (oz.counters || 0) + perm.counters; this.say(`— ${perm.counters} counters move to ${oz.card.name}`, owner); } }
    if (perm.animateHost != null) { for (const q of this.alive()) { const host = q.battlefield.find(b => b.id === perm.animateHost); if (host) { this.say(`— ${host.card.name} is sacrificed (${perm.card.name} left)`, q); await this.sacrifice(q, host); } } }
    if (perm.oring && perm.oring.length) { for (const { card, owner: o } of perm.oring) { const i = o.exile.indexOf(card); if (i >= 0) { o.exile.splice(i, 1); const pm = await this.enterPerm(o, card); this.say(`— ${card.name} returns (${perm.card.name} left)`, o); if (pm) await this.creatureEntered(o, pm); } } perm.oring = []; }
  }
  // ---------- priority ----------
  /** everything `q` could legally do right now outside their own main phase */
  legalActions(q) {
    if (q.dead) return [];
    const out = [];
    for (const c of q.hand) if (this.canFlash(q, c) && !c.roles.includes('counter') && this.castMode(q, c, 'hand', { instant: true })) out.push({ kind: 'cast', card: c });
    for (const b of q.battlefield) if (b.card.fetch && this.canActivate(q, b)) out.push({ kind: 'fetch', perm: b, card: b.card });
    out.push(...this.gyCastOptions(q, { instant: true }), ...this.abilityOptions(q, { instant: true }));
    return out;
  }
  /** one priority pass for a step: active player first, then turn order; ends when everyone passes in a row */
  async priorityRound(step, active, ctx = {}) {
    this.emptyPools(); this.step = step; await this.emit({ type: 'step', step, p: active });
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
    if (a.unblockTurn === this.turn) return false;
    { const bo0 = this.ownerOf(b); if (bo0 && b.card.cmc % 2 === 0 && this.opponentsOf(bo0).some(q => q.battlefield.some(x => x.card.statics && x.card.statics.winnowBlock && !x.neutral))) return false; }
    const ao = this.ownerOf(a), bo = this.ownerOf(b), aS = a.card.statics || {};
    if (a.protColors && (b.card.colors || []).some(c => a.protColors.includes(c))) return false;
    if (aS.landwalk && bo && bo.battlefield.some(x => x.card.isLand && x.card.type.toLowerCase().includes(aS.landwalk))) return false;
    if (aS.protType && matchesFilter(b.card, aS.protType)) return false;
    if (ao) for (const x of ao.battlefield) { const S = x.card.statics; if (!S || x.neutral) continue;
      if (S.lambholt && bo && this.powerOf(bo, b) < this.powerOf(ao, x)) return false;
      if (S.delney && this.powerOf(ao, a) <= 2 && bo && this.powerOf(bo, b) >= 3) return false;
      if (S.counterUnblockable && (a.counters || 0) > 0) return false; }
    const k = a.card.kw;
    if (k.includes('unblockable') || k.includes('shadow') || k.includes('horsemanship') || k.includes('menace')) return false; // only single blocks are modelled, so menace can't be blocked
    if (k.includes('flying') && !(b.card.kw.includes('flying') || b.card.kw.includes('reach'))) return false;
    if (k.includes('fear') && !(b.card.isArtifact || (b.card.colors || []).includes('B'))) return false;
    if (k.includes('intimidate') && !(b.card.isArtifact || (b.card.colors || []).some(c => (a.card.colors || []).includes(c)))) return false;
    if (k.includes('skulk') && ao && bo && this.powerOf(bo, b) > this.powerOf(ao, a)) return false;
    return true;
  }
  tempPump(b) { return b.tempTurn === this.turn ? b.tempPump || 0 : 0; }
  toughAdj(b, n) { if (b.tempToughTurn !== this.turn) { b.tempToughTurn = this.turn; b.tempTough = 0; } b.tempTough += n; }
  powerOf(p, b) {
    let base = b.neutral ? (Array.isArray(b.neutral) ? b.neutral[0] : 0) : b.card.power;
    if (p && p.mirrorTurn === this.turn && b.card.isCreature) base = p.mirrorX;
    let v = this.tempPump(b) + base + (b.counters || 0) + (b.spump ? b.spump[0] : 0) + (b.card.isCreature && p ? (p.pumpUntilEOT || 0) + (p.powerTurn === this.turn ? p.powerEOT || 0 : 0) : 0) - (b.shrinkTurn === this.turn ? b.shrinkEOT || 0 : 0);
    return b.dblTurn === this.turn ? v * 2 : v;
  }
  toughOf(p, b) {
    let base = b.neutral ? (Array.isArray(b.neutral) ? b.neutral[1] : 1) : b.card.toughness;
    if (p && p.mirrorTurn === this.turn && b.card.isCreature) base = p.mirrorX;
    let v = this.tempPump(b) + (b.tempToughTurn === this.turn ? b.tempTough || 0 : 0) + base + (b.counters || 0) + (b.spump ? b.spump[1] : 0) + (b.card.isCreature && p ? (p.pumpUntilEOT || 0) : 0) - (b.shrinkTurn === this.turn ? b.shrinkEOT || 0 : 0);
    return b.dblTurn === this.turn ? v * 2 : v;
  }
  async countersPut(p, perm, n) {
    if (!n || !perm) return;
    for (const b of p.battlefield.filter(x => !x.neutral)) for (const tr of b.card.triggers || []) {
      if (tr.when !== 'countersPut' || (tr.selfOnly && b !== perm) || (!tr.selfOnly && !perm.card.isCreature)) continue;
      if (tr.oncePerTurn) { if (b.cpTurn === this.turn) continue; b.cpTurn = this.turn; }
      await this.runTrig(p, b, tr, { x: n });
    }
  }
  canAttackWith(p, b) { if (b.dashed && b.card.isCreature && !b.tapped && b.neutral !== 'land' && !b.pacified && !b.card.kw.includes('defender')) return true; return b.card.isCreature && b.neutral !== 'land' && !b.pacified && !b.tapped && (!b.summoning || b.card.kw.includes('haste')) && !b.card.kw.includes('defender'); }
  /** assignments: [{attacker: perm, defender: player}] */
  async declareAttack(p, assignments) { return this.combatPhase(p, assignments); }
  /** one attacker vs one blocker: first-strike and regular damage steps, deathtouch, trample, lifelink, indestructible */
  async fightCombat(p, attacker, defender, blocker, pending) {
    const has = (b, k) => b.card.kw.includes(k); const kaldraOf = (q, b) => q.battlefield.some(e => e.attachedTo === b.id && e.card.equip && e.card.equip.exileDamaged);
    const aFS = has(attacker, 'first strike') || has(attacker, 'double strike'), bFS = has(blocker, 'first strike') || has(blocker, 'double strike');
    const aDS = has(attacker, 'double strike'), bDS = has(blocker, 'double strike');
    let aGone = false, bGone = false; attacker.cDmg = 0; blocker.cDmg = 0;
    const kill = async (q, b, exileIt) => { if (!q.battlefield.includes(b)) return; if (exileIt) { q.battlefield.splice(q.battlefield.indexOf(b), 1); await this.emit({ type: 'destroy', owner: q, perm: b, quiet: true }); if (!b.card.token) ((b.card.orig || b.card).isCommander ? q.command : q.exile).push(b.card.orig || b.card); this.say(`— ${b.card.name} is exiled`, q); await this.leftBattlefield(q, b); } else await this.destroy(q, b); };
    const step = async first => {
      const aHits = !aGone && p.battlefield.includes(attacker) && (first ? aFS : (!aFS || aDS)); const bHits = !bGone && defender.battlefield.includes(blocker) && (first ? bFS : (!bFS || bDS));
      if (!aHits && !bHits) return;
      let toB = 0, toPlayer = 0, toA = 0;
      if (aHits) { const pw = Math.max(0, this.powerOf(p, attacker)); if (bGone || !defender.battlefield.includes(blocker)) { if (has(attacker, 'trample')) toPlayer = pw; } else if (has(attacker, 'trample')) { const lethal = has(attacker, 'deathtouch') ? 1 : Math.max(0, this.toughOf(defender, blocker) - blocker.cDmg); toB = Math.min(pw, lethal); toPlayer = pw - toB; } else toB = pw; }
      if (bHits) toA = Math.max(0, this.powerOf(defender, blocker));
      if (toB) { blocker.cDmg += toB; await this.dealtDamage(defender, blocker, toB, attacker.card); }
      if (toA) { attacker.cDmg += toA; await this.dealtDamage(p, attacker, toA, blocker.card); }
      if (toPlayer) pending.push({ defender, dmg: toPlayer, attacker });
      if (has(attacker, 'lifelink') && toB) await this.changeLife(p, toB, attacker.card);
      if (has(blocker, 'lifelink') && toA) await this.changeLife(defender, toA, blocker.card);
      const bDies = toB > 0 && defender.battlefield.includes(blocker) && (blocker.cDmg >= this.toughOf(defender, blocker) || has(attacker, 'deathtouch') || kaldraOf(p, attacker)) && (!has(blocker, 'indestructible') || kaldraOf(p, attacker));
      const aDies = toA > 0 && p.battlefield.includes(attacker) && (attacker.cDmg >= this.toughOf(p, attacker) || has(blocker, 'deathtouch') || kaldraOf(defender, blocker)) && (!has(attacker, 'indestructible') || kaldraOf(defender, blocker));
      if (bDies) { this.say(`— ${blocker.card.name} dies`, defender); bGone = true; await kill(defender, blocker, kaldraOf(p, attacker)); }
      if (aDies) { this.say(`— ${attacker.card.name} dies`, p); aGone = true; await kill(p, attacker, kaldraOf(defender, blocker)); }
    };
    if (aFS || bFS) await step(true);
    await step(false);
  }
  async combatPhase(p, assignments) {
    if (!(assignments || []).length) return;
    this.phase = 'combat';
    await this.priorityRound('beginCombat', p);
    let atk = assignments.filter(a => p.battlefield.includes(a.attacker) && this.canAttackWith(p, a.attacker) && !a.defender.dead && a.attacker.vowAgainst !== a.defender);
    // forced attacks: "attacks each combat if able", goad, Bident of Thassa
    { const opps = this.opponentsOf(p);
      for (const b of p.battlefield.filter(b => this.canAttackWith(p, b) && !atk.some(a => a.attacker === b))) {
        const goaded = b.goadedBy && !b.goadedBy.dead && (b.goadedBy.turnCount || 0) < (b.goadUntil || 0);
        const must = (b.card.statics && b.card.statics.mustAttack) || goaded || p.forceAttackTurn === this.turn;
        if (!must) continue;
        const pool = opps.filter(q => !(goaded && q === b.goadedBy && opps.length > 1) && b.vowAgainst !== q); const d = pool[0]; if (d) atk.push({ attacker: b, defender: d });
      }
      for (const a of atk) { const g = a.attacker.goadedBy; if (g && !g.dead && (g.turnCount || 0) < (a.attacker.goadUntil || 0) && a.defender === g && opps.length > 1) a.defender = opps.find(q => q !== g) || a.defender; } }
    // Ghostly Prison / Propaganda / Sphere of Safety
    { let budget = this.availableMana(p), due = 0; const kept = [];
      for (const a of atk) { const t = a.defender.battlefield.reduce((s, b) => { const x = b.card.statics && !b.neutral && b.card.statics.attackTax; return s + (!x ? 0 : x === 'enchantments' ? a.defender.battlefield.filter(e => e.card.isEnchantment).length : x); }, 0); if (t > budget) continue; budget -= t; due += t; kept.push(a); }
      if (kept.length < atk.length) this.say(`— ${atk.length - kept.length} attacker${atk.length - kept.length > 1 ? 's' : ''} can't pay the attack tax`, p);
      if (due) { this.payCost(p, { generic: due, pips: { W: 0, U: 0, B: 0, R: 0, G: 0 }, total: due }); this.say(`pays {${due}} to attack`, p); }
      atk = kept; }
    if (!atk.length) { this.phase = 'main2'; return; }
    for (const a of atk) if (!a.attacker.card.kw.includes('vigilance')) a.attacker.tapped = true;
    p.combatsThisTurn = (p.combatTurn === this.turn ? p.combatsThisTurn || 0 : 0) + 1; p.combatTurn = this.turn;
    if (p.attackedWithTurn !== this.turn) { p.attackedWithTurn = this.turn; p.attackedWith = 0; } p.attackedWith += atk.length;
    await this.emit({ type: 'attack', p, assignments: atk });
    this.say(`attacks: ${atk.map(a => `${a.attacker.card.name} → ${a.defender.name}`).join(', ')}`, p);
    this.curAttackers = atk.map(a => a.attacker); await this.attackTriggers(p, atk); this._cdOnce = new Set();
    await this.priorityRound('declareAttackers', p, { attacks: atk });
    const defenders = [...new Set(atk.map(a => a.defender))];
    // blocks
    const live = atk.filter(a => p.battlefield.includes(a.attacker) && !a.defender.dead);
    const blocks = new Map(); // attacker perm -> blocker perm
    for (const d of defenders) {
      if (d.dead) continue;
      const onMe = live.filter(a => a.defender === d);
      if (!onMe.length) continue;
      const myBlockers = d.battlefield.filter(b => b.card.isCreature && !b.tapped && b.neutral !== 'land' && !b.pacified && !(b.card.statics && b.card.statics.cantBlock));
      if (!myBlockers.length) continue;
      let chosen = new Map();
      if (d.human && this.hooks.humanBlocks) chosen = await this.hooks.humanBlocks({ defender: d, attacker: p, attacks: onMe, blockers: myBlockers, game: this }) || new Map();
      else if (d.ai) chosen = d.ai.chooseBlocks(this, d, p, onMe, myBlockers);
      for (const [a, b] of chosen) if (b && this.canBlock(b, a) && myBlockers.includes(b)) blocks.set(a, b);
    }
    if (blocks.size || live.length) await this.priorityRound('declareBlockers', p, { attacks: live, blocks });
    if (this.fogTurn === this.turn) { this.say('— all combat damage is prevented this turn'); this.phase = 'main2'; await this.emit({ type: 'combatEnd', p }); return; }
    // damage
    const pending = []; const killQ = [];
    for (const { attacker, defender } of live) {
      if (!p.battlefield.includes(attacker) || attacker.removedTurn === this.turn) continue;
      if (attacker.mazeTurn === this.turn) { this.say(`— ${attacker.card.name}'s combat damage is prevented`, p); continue; }
      const pw = this.powerOf(p, attacker); const blocker = blocks.get(attacker);
      if (blocker && defender.battlefield.includes(blocker)) {
        await this.emit({ type: 'block', p, attacker, blocker, defender });
        this.say(`${blocker.card.name} blocks ${attacker.card.name}`, defender);
        await this.fightCombat(p, attacker, defender, blocker, pending);
      } else {
        const dmg = this.dmgAmt(p, attacker.card.kw.includes('double strike') ? pw * 2 : pw, { combat: true, red: (attacker.card.colors || []).includes('R') });
        if (dmg > 0) pending.push({ defender, dmg, attacker });
      }
    }
    for (const h of pending) {
      if (h.defender.dead) continue;
      await this.emit({ type: 'hit', p, attacker: h.attacker, defender: h.defender, dmg: h.dmg });
      this.say(`${h.attacker.card.name} hits ${h.defender.name} for ${h.dmg}`, p);
      if (h.attacker.card.kw.includes('lifelink')) await this.changeLife(p, h.dmg, h.attacker.card);
      if (p.heistTurn === this.turn) await this.makeArtifactTokens(p, 'treasure', 1, true);
      if (h.attacker.cleaver) await this.makeArtifactTokens(p, 'treasure', h.dmg);
      if (h.attacker.card.isCommander) { h.defender.cmdDamage[p.i] = (h.defender.cmdDamage[p.i] || 0) + h.dmg; if (h.defender.cmdDamage[p.i] >= 21) killQ.push([h.defender, `21 commander damage from ${h.attacker.card.name}`]); }
      await this.changeLife(h.defender, -h.dmg, h.attacker.card);
      this._cdDefender = h.defender; this._cdDmg = h.dmg;
      if (h.attacker.insightTurn === this.turn) await this.draw(p, Math.min(h.dmg, 10));
      if (h.attacker.card.kw.includes('infect') || h.attacker.card.kw.includes('toxic')) { h.defender.poison = (h.defender.poison || 0) + h.dmg; if (h.defender.poison >= 10) killQ.push([h.defender, '10 poison counters']); }
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
    p.landsThisTurn = 0; p.pumpUntilEOT = 0; p.extraCombat = false; p.extraLandsTurn = 0; p.prot = false; p.turnCount = (p.turnCount || 0) + 1; this.phase = 'untap'; this.step = 'untap';
    for (const q of this.players) q.spellsThisTurn = 0; this.spellsThisTurnAll = 0;
    for (const b of p.battlefield) { if (!(b.card.statics && b.card.statics.noUntap) && !b.skipUntap) b.tapped = false; b.skipUntap = false; b.summoning = false; if (b.echoPending) { b.echoPending = false; b.echoDue = true; } }
    for (const q of this.opponentsOf(p)) for (const b of q.battlefield) if (b.card.untapOthers) b.tapped = false;
    // Seedborn Muse / Unwinding Clock: untap during other players' untap steps
    for (const q of this.opponentsOf(p)) { const sb = q.battlefield.filter(b => b.card.statics && b.card.statics.seedborn && !b.neutral).map(b => b.card.statics.seedborn); if (sb.length) for (const b of q.battlefield) if ((sb.includes('all') || b.card.isArtifact) && !(b.card.statics && b.card.statics.noUntap)) b.tapped = false; }
    this.say(`— turn ${this.turn} —`, p);
    await this.emit({ type: 'turn', p });
  }
  /** undo support: a deep copy of the whole table (everything but hooks/rng), restorable in place so live references to the game, its player list and players stay valid */
  snapshot() {
    const memo = new Map(), skip = new Set(['hooks', 'rng']);
    const cl = o => { if (o === null || typeof o !== 'object') return o; if (memo.has(o)) return memo.get(o);
      if (Array.isArray(o)) { const a = []; memo.set(o, a); for (const v of o) a.push(cl(v)); return a; }
      if (o instanceof Map) { const m = new Map(); memo.set(o, m); for (const [k, v] of o) m.set(cl(k), cl(v)); return m; }
      if (o instanceof Set) { const s = new Set(); memo.set(o, s); for (const v of o) s.add(cl(v)); return s; }
      const c = Object.create(Object.getPrototypeOf(o)); memo.set(o, c); for (const k of Object.keys(o)) if (!(o === this && skip.has(k))) c[k] = cl(o[k]); return c; };
    const g = cl(this); return { g, players: g.players, people: g.players.slice() };
  }
  restore(snap) {
    const anchors = [[snap.g, this], [snap.players, this.players], ...snap.people.map((sp, i) => [sp, this.players[i]])];
    const memo = new Map(anchors);
    const cl = o => { if (o === null || typeof o !== 'object') return o; if (memo.has(o)) return memo.get(o);
      if (Array.isArray(o)) { const a = []; memo.set(o, a); for (const v of o) a.push(cl(v)); return a; }
      if (o instanceof Map) { const m = new Map(); memo.set(o, m); for (const [k, v] of o) m.set(cl(k), cl(v)); return m; }
      if (o instanceof Set) { const s = new Set(); memo.set(o, s); for (const v of o) s.add(cl(v)); return s; }
      const c = Object.create(Object.getPrototypeOf(o)); memo.set(o, c); for (const k of Object.keys(o)) c[k] = cl(o[k]); return c; };
    for (const [src, dst] of anchors) {
      if (Array.isArray(src)) { dst.length = 0; for (const v of src) dst.push(cl(v)); continue; }
      for (const k of Object.keys(dst)) if (!(dst === this && (k === 'hooks' || k === 'rng'))) delete dst[k];
      for (const k of Object.keys(src)) dst[k] = cl(src[k]);
    }
  }
  async takeTurn(p) {
    await this.beginTurn(p); if (p.dead || this.winner) return;
    this.phase = 'upkeep';
    for (const pc of (p.pacts || []).filter(x => x.turn <= (p.turnCount || 0))) { p.pacts.splice(p.pacts.indexOf(pc), 1); if (this.canPayCost(p, pc.cost)) { this.payCost(p, pc.cost); this.say(`pays for ${pc.src}`, p); } else { await this.kill(p, `couldn't pay for ${pc.src}`); return; } }
    for (const b of p.battlefield.filter(b => b.card.echo && b.echoDue)) { b.echoDue = false; if (!(await this.payTax(p, b.card, b.card.echo.total, `${b.card.name}: pay echo {${b.card.echo.total}} or sacrifice it?`))) { this.say(`— sacrifices ${b.card.name} (echo unpaid)`, p); await this.sacrifice(p, b); } }
    for (const c of (p.rebound || []).splice(0)) { const i = p.exile.indexOf(c); if (i < 0) continue; p.exile.splice(i, 1); const go = p.human ? !!(this.hooks.humanMay && await this.hooks.humanMay({ p, card: c, question: 'cast it again from exile (rebound)?' })) : true; if (go) { this.say(`— casts ${c.name} from exile (rebound)`, p); await this.castFreeCard(p, c, p); } else p.graveyard.push(c); }
    for (const b of p.battlefield.filter(b => b.card.statics && b.card.statics.cumulative)) { b.age = (b.age || 0) + 1; const n = b.card.statics.cumulative * b.age; if (!(await this.payTax(p, b.card, n, `${b.card.name}: pay cumulative upkeep {${n}} or sacrifice it?`))) { this.say(`— sacrifices ${b.card.name} (cumulative upkeep {${n}} unpaid)`, p); await this.sacrifice(p, b); } }
    await this.fireTriggers(p, 'upkeep'); if (p.dead || this.winner) return;
    await this.priorityRound('upkeep', p); if (p.dead || this.winner) return;
    this.phase = 'draw'; if (this.turn > 1 && !p.battlefield.some(b => b.card.statics && b.card.statics.skipDraw && !b.neutral)) await this.draw(p, 1); if (p.dead || this.winner) return;
    for (const b of p.battlefield.filter(b => b.card.saga && !b.neutral)) await this.loreUp(p, b);
    await this.fireTriggers(p, 'drawStep'); if (p.dead || this.winner) return;
    await this.priorityRound('draw', p); if (p.dead || this.winner) return;
    this.phase = 'main1'; this.step = 'main1'; await this.emit({ type: 'step', step: 'main1', p });
    await this.fireTriggers(p, 'main1'); if (p.dead || this.winner) return;
    let plan;
    if (p.human && this.hooks.humanTurn) plan = await this.hooks.humanTurn(p, 'main1', this);
    else { await p.ai.mainPhase(this, p, false); plan = { action: 'attack', assignments: p.ai.chooseAttacks(this, p) }; }
    let attacked = false;
    if (!this.winner && !p.dead) { this.phase = 'combat'; await this.fireTriggers(p, 'combatStart'); for (const q of this.alive()) for (const b of q.battlefield.filter(x => !x.neutral)) for (const tr of b.card.triggers || []) if (tr.when === 'eachCombat') await this.runTrig(q, b, tr, {}); if (p.dead || this.winner) return; }
    for (let n = 0; n < 6 && plan && plan.action === 'attack' && !this.winner && !p.dead; n++) {
      if (plan.assignments && plan.assignments.length) { await this.combatPhase(p, plan.assignments); attacked = true; }
      if (!p.extraCombat || this.winner || p.dead) break;
      p.extraCombat = typeof p.extraCombat === 'number' && p.extraCombat > 1 ? p.extraCombat - 1 : false; for (const b of p.battlefield) if (b.card.isCreature) b.tapped = false; p.untapCombat = false;
      plan = p.human ? await this.hooks.humanTurn(p, 'combat2', this) : { action: 'attack', assignments: p.ai.chooseAttacks(this, p) };
    }
    if (this.winner || p.dead) return;
    this.phase = 'main2'; this.step = 'main2'; await this.emit({ type: 'step', step: 'main2', p });
    if (p.human && this.hooks.humanTurn) { if (plan && plan.action !== 'end') await this.hooks.humanTurn(p, 'main2', this); }
    else await p.ai.mainPhase(this, p, true);
    if (this.winner || p.dead) return;
    this.phase = 'end';
    for (const r of (this.endToHand || []).splice(0)) { const o = this.players.find(q => q.graveyard.includes(r.card)); if (!o) continue; o.graveyard.splice(o.graveyard.indexOf(r.card), 1); o.hand.push(r.card); this.say(`— ${r.card.name} returns to ${o.name}'s hand`, o); }
    for (const r of (this.endReturns || []).splice(0)) { const i = r.p.exile.indexOf(r.card); if (i < 0) continue; r.p.exile.splice(i, 1); const pm = await this.enterPerm(r.p, r.card, { tapped: !!r.tapped }); this.say(`— ${r.card.name} returns to the battlefield`, r.p); if (pm) { if (pm.card.etbOps) await this.runOps(r.p, pm.card.etbOps, pm.card, { perm: pm }); await this.creatureEntered(r.p, pm); } }
    if (p.necro && p.necro.length) { const cs = p.necro.splice(0); for (const c of cs) { const i = p.exile.indexOf(c); if (i >= 0) { p.exile.splice(i, 1); p.hand.push(c); } } this.say(`— puts ${cs.length} card${cs.length === 1 ? '' : 's'} into hand (Necropotence)`, p); }
    await this.fireTriggers(p, 'end'); if (p.dead || this.winner) return;
    await this.priorityRound('end', p);
  }
  async cleanup(p) {
    for (const q of this.players) if (q.exileCast) q.exileCast = q.exileCast.filter(e => e.forever || (e.pTurn != null ? !(q === p && (q.turnCount || 0) >= e.pTurn) : e.turn !== this.turn) );
    // "until end of turn" impulse draws expire
    for (const q of this.players) for (const c of q.hand.filter(c => c.impulse && ((c.impulse.turn != null && c.impulse.turn === this.turn) || (c.impulse.pTurn != null && q === p && q.turnCount >= c.impulse.pTurn)))) { q.hand.splice(q.hand.indexOf(c), 1); delete c.impulse; q.exile.push(c); this.say(`— ${c.name} stays exiled (not played in time)`, q); }
    for (const q of this.players) { if (q !== p) q.pumpUntilEOT = 0; q.kwEOT = null; }
    this.emptyPools(true);
    const noMax = p.battlefield.some(b => b.card.statics && b.card.statics.noMaxHand);
    while (!noMax && p.hand.length > 7) { const c = p.ai ? p.ai.chooseDiscard(this, p) : (this.hooks.humanDiscard ? await this.hooks.humanDiscard(p) : p.hand[0]); this.say(`discards ${c.name}`, p); await this.discardCard(p, c); }
    p.pumpUntilEOT = 0;
    for (const q of this.players) for (const b of q.battlefield.filter(b => b.dashed)) { await this.bounce(q, b, q); }
    for (const q of this.players) for (const b of q.battlefield.filter(b => b.sacAtEnd)) { this.say(`— ${b.card.name} is sacrificed (end of turn)`, q); await this.sacrifice(q, b); }
    for (const b of p.battlefield.filter(b => b.unearth)) { p.battlefield.splice(p.battlefield.indexOf(b), 1); p.exile.push(b.card); this.say(`— ${b.card.name} is exiled (unearth)`, p); }
  }
  nextPlayer() { let n = this.active; do { n = (n + 1) % this.players.length; } while (this.players[n].dead && this.alive().length > 1); this.active = n; return this.players[n]; }
  /** full game loop. Human turns are driven by hooks (humanTurn / humanPriority / humanBlocks / humanChooseFetch). */
  async pregame() {
    for (const p of this.players) for (const c of [...p.hand]) {
      const o = c.oracle.toLowerCase();
      if (/if this card is in your opening hand, you may begin the game with it on the battlefield/.test(o)) { p.hand.splice(p.hand.indexOf(c), 1); await this.enterPerm(p, c); this.say(`begins the game with ${c.name} on the battlefield`, p); }
      else if (/if this card is in your opening hand and you're not the starting player, you may begin the game with/.test(o) && p !== this.players[this.active] && p.hand.length > 1) { p.hand.splice(p.hand.indexOf(c), 1); const [pm] = await this.landEnters(p, c); pm.luck = true; const ex = p.ai ? p.ai.chooseDiscard(this, p) : p.hand.filter(x => !x.isLand).sort((a, b) => b.cmc - a.cmc)[0] || p.hand[0]; if (ex) { p.hand.splice(p.hand.indexOf(ex), 1); p.exile.push(ex); } this.say(`begins the game with ${c.name} on the battlefield${ex ? ' (exiles ' + ex.name + ')' : ''}`, p); }
    }
  }
  async run() {
    let safety = 0;
    if (!this.pregameDone) { this.pregameDone = true; await this.pregame(); }
    while (!this.winner && safety++ < 600) {
      const p = this.players[this.active];
      if (!p.dead) { await this.takeTurn(p); if (!p.dead && !this.winner) await this.cleanup(p); }
      if (this.alive().length <= 1) { if (!this.winner && this.alive().length) { this.winner = this.alive()[0]; await this.emit({ type: 'win', p: this.winner }); } break; }
      if (!p.dead && (p.extraTurns || 0) > 0) { p.extraTurns--; this.say('takes an extra turn', p); continue; }
      this.nextPlayer();
    }
    return this.winner;
  }
}

// ============================== AI ==============================
// difficulty: 'casual' | 'focused' | 'cutthroat'
class AI {
  constructor(level = 'focused', rng = Math.random) { this.expert = level === 'expert'; this.level = this.expert ? 'focused' : level; /* self-play: Focused's core beat Cutthroat's with real decks */ this.rng = rng; }
  popW() { return this.expert ? 0.5 : { casual: 0, focused: 0.4, cutthroat: 0.6 }[this.level]; }
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
    if (c.spellOps) v += c.spellOps.filter(op => !['gyToHand', 'dig', 'drain', 'landToHand'].includes(op.op)).reduce((s, op) => s + this.opsValue(game, me, [op], c) - 0.5, 0);
    if (c.spellOps) for (const op of c.spellOps) v += op.op === 'gyToHand' ? (me.graveyard.length ? Math.max(...me.graveyard.map(x => this.castValueRaw(game, me, x))) * 0.6 : -10) : op.op === 'dig' ? 2 : op.op === 'drain' ? op.n * 1.2 : op.op === 'landToHand' ? 1.5 : 0.5; // no effect we model: don't cast it blindly
    if (c.roles.includes('ramp')) v += game.round <= 4 ? 6 : 1;
    if (c.roles.includes('draw')) v += me.hand.length <= 3 ? 5 : 2;
    if (c.roles.includes('wipe')) { const hit = game.wipeHits(c, me); const bp = q => q.battlefield.filter(b => b.card.isCreature && hit(b, q) && !b.card.kw.includes('indestructible')).reduce((s, b) => s + game.powerOf(q, b), 0); const oppPower = opps.reduce((s, q) => s + bp(q), 0); const myPower = bp(me);
      v += hit.all ? ((oppPower >= myPower * 2 + 6 || opps.some(q => bp(q) >= me.life)) ? 10 : -12) : (oppPower > myPower && oppPower >= 3 ? 4 + oppPower - myPower : -12); }
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
    const lands = me.hand.filter(c => c.isLand);
    if (!lands.length) { // a modal double-faced card's land back, when the front can't be cast soon anyway
      const md = me.hand.filter(c => c.backLand).sort((a, b) => b.cmc - a.cmc);
      const have = me.battlefield.filter(b => b.card.isLand).length;
      return md.find(c => have < 4 || c.cmc > have + 1) || null;
    }
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
      for (let k = 0; k < 2 && me.landsThisTurn < game.landLimit(me); k++) { const top = me.library[me.library.length - 1]; const ex = (me.exileCast || []).find(e => e.card.isLand); const gyl = game.canLandFromGy(me) ? me.graveyard.find(c => c.isLand) : null; const pick = top && top.isLand && game.topPerm(me, top) ? top : ex ? ex.card : gyl; if (!pick || !(await game.playLand(me, pick))) break; }
      // crack fetches now only if the mana matters this turn; otherwise hold them for the end step before my turn
      for (const b of [...me.battlefield]) if (b.card.fetch && game.canActivate(me, b) && me.life > b.card.fetch.life + 2 && game.fetchTargets(me, b).length && this.needManaNow(game, me)) await game.activateFetch(me, b);
    }
    let guard = 12; const skip = new Set();
    while (guard-- > 0 && !game.winner && !me.dead) {
      const reserve = this.reserveFor(game, me);
      const options = [];
      for (const c of me.hand) if (!skip.has(c) && game.castMode(me, c, 'hand') && (second || !this.expert || !this.params().seq || this.combatRelevant(game, me, c))) options.push({ c, v: this.castValue(game, me, c), zone: 'hand' });
      for (const c of me.command) if (game.castMode(me, c, 'cmd') && (second || !this.expert || !this.params().seq || this.combatRelevant(game, me, c) || !me.battlefield.some(b => b.card.isCreature))) options.push({ c, v: this.castValue(game, me, c) + (this.level === 'casual' ? 6 : this.expert ? this.params().cmdBonus : 4) - me.cmdTax, zone: 'cmd' });
      for (const c of me.graveyard) if (!skip.has(c) && game.gyGrant(me, c) && game.castMode(me, c, 'gy')) options.push({ c, v: this.castValue(game, me, c) + (c.gyCast ? 0.5 : -0.5), zone: 'gy' });
      for (const e of me.exileCast || []) if (!skip.has(e.card) && !e.card.isLand && game.castMode(me, e.card, 'exile')) options.push({ c: e.card, v: this.castValue(game, me, e.card) + 1, zone: 'exile' });
      { const top = me.library[me.library.length - 1]; if (top && !skip.has(top) && !top.isLand && game.castMode(me, top, 'top')) options.push({ c: top, v: this.castValue(game, me, top) + 1, zone: 'top' }); }
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
  /** Blast Zone: charge it up to the mana value that hurts opponents most */
  blastTarget(game, me) { let best = null, bv = 5; for (let k = 0; k <= 8; k++) { let s = 0; for (const q of game.alive()) for (const b of q.battlefield) if (!b.card.isLand && (b.card.cmc || 0) === k) s += (q === me ? -1 : 1) * this.permBase(b); if (s > bv) { bv = s; best = k; } } return best; }
  blastX(game, me, perm) { const t = this.blastTarget(game, me); if (t == null || !perm) return 0; return Math.max(0, t - (perm.charge || 0)); }
  abilityValue(game, me, opt) {
    const { card, ab, perm } = opt; let v = 0;
    if (ab.xx) { const t = this.blastTarget(game, me); return t != null && perm && t > (perm.charge || 0) ? 3.5 : -5; }
    if (ab.ops.some(o => o.op === 'blastZone')) { const t = this.blastTarget(game, me); return t != null && perm && t === (perm.charge || 0) ? 10 : -8; }
    if (ab.ops.some(o => o.op === 'uginX')) return 6;
    if (ab.ops.some(o => o.op === 'homeward')) return game.players.some(q => q !== me && q.battlefield.some(b => b.card.isCreature && b.owner === game.players.indexOf(me))) ? 8 : -6;
    if (ab.ops.some(o => o.op === 'mirageCopy')) return game.players[game.active] === me && game.phase === 'main1' ? 2 : -3;
    if (ab.ops.some(o => o.op === 'copyLastAbility')) return 4;
    if (ab.crew) { const vp = card.power || 0; const pool = me.battlefield.filter(b => b.card.isCreature && !b.tapped && b !== perm); const sick = pool.filter(b => b.summoning).reduce((s, b) => s + game.powerOf(me, b), 0); const cheapest = pool.map(b => game.powerOf(me, b)).sort((a, b) => a - b); let used = 0, k = 0; while (used < ab.crew && k < cheapest.length) used += cheapest[k++]; return game.players[game.active] === me && game.phase === 'main1' && (sick >= ab.crew || vp >= used + 2) ? 3 + vp * 0.3 : -6; }
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
      else if (op.op === 'necro') v += me.life > 14 && me.hand.length < 6 && /end/.test(game.phase) ? 3 : -1;
      else if (op.op === 'levelUp') v += 4;
      else if (op.op === 'untapSelf') v += perm && perm.card.manaAb ? perm.card.manaAb.amount - ab.cost.total : -1;
      else if (op.op === 'exileGyCard') v += op.what === 'land' ? 0 : 2.5;
      else if (op.op === 'hideawayPlay') v += 8;
      else if (op.op === 'unblockable') v += /main1|combat/.test(game.phase) || game.phase === 'main1' ? 2 : -2;
      else if (op.op === 'copyTrigger') v += game.lastTrig && game.lastTrig.q === me ? this.opsValue(game, me, game.lastTrig.tr.ops) : -3;
      else if (op.op === 'fight') { const t = this.bestTarget(game, me, b => b.card.isCreature); v += t ? 3 : -5; }
      else if (op.op === 'station') v += perm && (perm.charge || 0) < 12 ? 3 : -2;
      else if (op.op === 'adapt') v += perm && !(perm.counters > 0) ? 4 : -9;
      else if (op.op === 'harness') v += 4;
      else if (op.op === 'destroyLand') { const best = game.opponentsOf(me).flatMap(q => q.battlefield.filter(b => b.card.isLand && (b.card.landDyn || b.card.manaAmount > 1))); v += best.length ? 4 : -5; }
      else if (op.op === 'protColor' || op.op === 'maze' || op.op === 'spellskite' || op.op === 'removeFromCombat' || op.op === 'regenerate' || op.op === 'phaseOut' || op.op === 'blinkSelfEnd' || op.op === 'moveCounter' || op.op === 'makeArtifact' || op.op === 'copyLand' || op.op === 'copyArtifact' || op.op === 'becomeCopyGy') v += -1;
      else if (op.op === 'mirrorEntity') v += game.availableMana(me) >= 4 && me.battlefield.filter(b => b.card.isCreature).length >= 3 && game.phase === 'main1' ? 6 : -2;
      else if (!['gyToHand', 'draw', 'landToHand', 'selfToBf', 'tokenCopy', 'gyToBf', 'tokens', 'gain', 'drain', 'damage', 'counters', 'destroy', 'scry', 'surveil', 'dig', 'attach', 'edict', 'bounceAllOpp'].includes(op.op)) v += this.opsValue(game, me, [op], card) - 0.3;
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
  /** priority while the stack has things on it: counter any object (not just the top), redirect, protect, or sacrifice in response */
  stackResponse(game, me, options) {
    options = options.filter(o => !(o.card && o.card.spellOps && o.card.spellOps.some(x => x.op === 'pact')) || (me.battlefield.filter(b => b.card.isLand).length >= 6 && me.battlefield.filter(b => b.card.isLand && b.card.produces.includes('U')).length >= 2));
    { const threat = [...game.stack].reverse().find(o => o.caster !== me && o.target && o.target.card && me.battlefield.includes(o.target) && (o.card.roles.includes('removal') || o.card.dmg));
      if (threat) { const prot = options.find(o => o.kind === 'ability' && o.ab.ops.some(x => ['protColor', 'spellskite', 'protectOne', 'blinkSelfEnd', 'regenerate'].includes(x.op)) && (!o.ab.ops.some(x => x.op === 'blinkSelfEnd') || o.perm === threat.target)); if (prot && this.permBase(threat.target) >= 3) return prot; } }
    const fresh = game.stack.filter(o => !(o.seen && o.seen.has(me.i)));
    for (const o of fresh) (o.seen = o.seen || new Set()).add(me.i);
    if (!fresh.length) return null;
    const castable = options.filter(o => o.kind === 'cast').map(o => o.card);
    const counters = castable.filter(c => c.roles.includes('counter'));
    // 1) counterspells, newest object first; counter-wars are handled by chooseCounter
    for (const obj of [...fresh].reverse()) {
      if (obj.caster === me || game.isUncounterable(obj)) continue;
      if (game.stack.some(s => s.caster === me && s.target && s.target.spell === obj)) continue; // already countering it
      const hits = counters.filter(c => counterHits(c, obj.card)); if (!hits.length) continue;
      const c = this.chooseCounter(game, me, obj, hits, game.stack.indexOf(obj)); if (c) return { kind: 'cast', card: c, zone: 'hand', target: { spell: obj } };
    }
    // 2) redirect something aimed at me, my permanents or my spells
    const redirects = castable.filter(c => c.redirect);
    if (redirects.length) for (const obj of [...fresh].reverse()) {
      if (obj.caster === me || !obj.target) continue;
      const t = obj.target, aimedAtMe = t === me || (t.card && game.ownerOf(t) === me) || (t.spell && t.spell.caster === me);
      if (!aimedAtMe) continue;
      const value = t.spell ? this.castValueRaw(game, me, t.spell.card) : t.card ? this.permBase(t) + 2 : (obj.card.dmg || 0);
      if (value < (this.level === 'casual' ? 6 : 3)) continue;
      if (!game.retargetCandidates(obj).length) continue;
      return { kind: 'cast', card: [...redirects].sort((a, b) => (game.castMode(me, b, 'hand', { instant: true }) === 'free') - (game.castMode(me, a, 'hand', { instant: true }) === 'free') || a.mana.total - b.mana.total)[0], zone: 'hand', target: { spell: obj } };
    }
    // 3) protection, or sacrificing the creature in response to removal
    for (const obj of fresh) {
      if (obj.caster === me) continue;
      const threatened = game.threatTo(me, obj); if (!threatened.length) continue;
      const protects = castable.filter(c => c.roles.includes('protect') && c.isInstant);
      const pr = protects.length ? this.chooseProtect(game, me, obj, protects, threatened) : null; if (pr) return { kind: 'cast', card: pr, zone: 'hand' };
      if ((this.level === 'cutthroat' || this.expert) && threatened.length === 1 && threatened[0].card.isCreature && !threatened[0].card.isCommander) {
        const outlet = options.find(o => o.kind === 'ability' && o.ab.sacOther); if (outlet) return { ...outlet, victim: threatened[0] };
      }
    }
    return null;
  }
  /** a redirect resolving: pick the new target that helps me most */
  chooseRetarget(game, me, obj, cands) {
    const opps = new Set(game.opponentsOf(me));
    const c = obj.card;
    if (c.roles.includes('counter')) { const s = cands.filter(t => t.spell && t.spell.caster !== me).sort((a, b) => this.spellThreat(game, me, b.spell) - this.spellThreat(game, me, a.spell))[0]; return s || null; }
    const perms = cands.filter(t => t.card && opps.has(game.ownerOf(t))).sort((a, b) => this.permValue(b, game.ownerOf(b), game, me) - this.permValue(a, game.ownerOf(a), game, me));
    const players = cands.filter(t => t.life !== undefined && opps.has(t)).sort((a, b) => this.threatOf(game, me, b) - this.threatOf(game, me, a));
    if (c.dmg && players.length && (!perms.length || players[0].life <= c.dmg)) return players[0];
    return perms[0] || players[0] || null;
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
  params() { return this._params || (this._params = Object.assign({ crackFrac: 0.3, sideShare: 0.25, removalScale: 1, counterAdj: 0, reserve: 1, wipe: 1, seq: 0, mull: 0, cmdBonus: 4, lateRound: 10, target: 'threat', lifeW: 0.5, home: 'base', spread: 1, chumpLife: 8 }, AI.tuning || {})); }
  bestEquipTarget(game, me, eq) {
    const mine = me.battlefield.filter(b => b.card.isCreature);
    const score = b => game.powerOf(me, b) + (b.card.kw.some(k => EVASIVE.includes(k)) ? 3 : 0) + (b.card.isCommander ? 2 : 0) - (b.summoning && !b.card.kw.includes('haste') ? 2 : 0) - (b.card.roles.includes('ramp') ? 3 : 0);
    const best = [...mine].sort((a, b) => score(b) - score(a))[0];
    return best && best.id !== eq.attachedTo ? best : null;
  }
  /** rough value of running some ops for `me` (modal triggers, unknown spells) */
  opsValue(game, me, ops, src) {
    let v = 0; const opps = game.opponentsOf(me);
    for (const op of ops || []) switch (op.op) {
      case 'draw': v += 2.5 * (op.n || 1); break;
      case 'drawX': v += 3; break;
      case 'lose': v -= (op.n || 1) * (me.life < 15 ? 1 : 0.4); break;
      case 'gain': v += (op.n || 1) * (me.life < 20 ? 0.5 : 0.2); break;
      case 'drain': v += (op.n || 1) * (op.each ? opps.length : 1) * 0.9; break;
      case 'gyToBfMV': v += 6; break;
      case 'scarabCopy': v += game.alive().some(q => q.graveyard.some(c => c.isCreature)) ? 6 : -5; break;
      case 'damage': v += typeof op.n === 'number' ? op.n * 0.8 : 2; break;
      case 'tokens': v += (typeof op.n === 'number' ? op.n : 2) * ((op.pt || [1, 1])[0] + (op.pt || [1, 1])[1]) / 2; break;
      case 'artifactTokens': v += (op.n || 1) * (op.kind === 'treasure' ? 1.5 : op.kind === 'clue' ? 1.8 : 1); break;
      case 'counters': v += (op.n || 1) * (/each/.test(op.to || '') ? Math.max(1, me.battlefield.filter(b => b.card.isCreature).length) : 1) * 1.2; break;
      case 'destroy': case 'destroyUpTo': case 'bounceTarget': { const t = this.bestTarget(game, me, b => !b.card.isLand); v += t ? Math.min(8, t.value * 0.6) : -3; break; }
      case 'bounceSpell': case 'bounceSpellOrPerm': v += game.stack.some(o => o.caster !== me) ? 4 : (op.op === 'bounceSpellOrPerm' ? 2 : -5); break;
      case 'untapAll': case 'extraCombat': v += me.battlefield.filter(b => b.card.isCreature).length; break;
      case 'scry': case 'surveil': v += 0.5 * (op.n || 1); break;
      case 'gyToHand': v += me.graveyard.length ? 3 : -3; break;
      case 'landToHand': case 'landToBf': v += 2; break;
      case 'addMana': v += 0.5; break;
      default: v += 0.5;
    }
    return v;
  }
  wantsDredge(game, me, card) { return me.graveyard.filter(c => c.isLand).length >= 2 || card.cmc <= 2 && me.library.length > 30; }
  chooseAlt(game, me, card, alts, canNormal) {
    for (const a of alts) {
      if (a.kind === 'dash' && /main/.test(game.phase) && game.players[game.active] === me && !card.kw.includes('haste')) return a;
      if (a.kind === 'evoke' && !canNormal) return a;
      if (a.kind === 'bestow') { if (me.battlefield.some(b => b.card.isCreature && (b.card.isCommander || this.permBase(b) >= 6))) return a; continue; }
      if (a.kind === 'cheap') return a;
      if (a.kind === 'life' && (!canNormal || me.life > 25)) return a;
      if ((a.kind === 'sacCreature' || a.kind === 'pitch') && !canNormal) return a;
    }
    return null;
  }
  chooseKicks(game, me, card, max) { if (card.kicker.offspring) return game.availableMana(me) >= card.cmc + card.kicker.cost.total + 1 ? 1 : 0; if (card.kicker.multi) return Math.min(max, 3); return max; }
  chooseX(game, me, card, max) { return Math.min(max, 12); }
  chooseGift(game, me, card, target) { if (/indestructible/.test(card.oracle.toLowerCase())) return game.stack.some(o => o.caster !== me && o.card.roles.includes('wipe')); if (/nonland permanent/.test(card.oracle.toLowerCase())) return !!(target && target.card && !target.card.isCreature); return false; }
  /** modal spells: the best-valued modes */
  chooseModes(game, me, card, subs, min, max) {
    const sc = subs.map(s => ({ s, v: this.castValueRaw(game, me, s) + (s.roles.includes('removal') && !game.opponentsOf(me).some(q => q.battlefield.some(b => !b.card.isLand)) ? -20 : 0) + (s.roles.includes('counter') && !game.stack.some(o => o.caster !== me) ? -20 : 0) })).sort((a, b) => b.v - a.v);
    const out = sc.filter((x, i) => i < min || x.v > 0).slice(0, max).map(x => x.s);
    return out.length >= min ? out : sc.slice(0, min).map(x => x.s);
  }
  /** Rhystic Study / Smothering Tithe tax: pay with mana that would go unused anyway */
  payTax(game, me, src, n) {
    const spare = game.availableMana(me) - n;
    if (spare < 0) return false;
    if (src && src.statics && src.statics.cumulative && n > 3) return false;
    if (this.level === 'casual') return spare >= 2;
    const myMain = game.players[game.active] === me && /main/.test(game.phase);
    return myMain ? spare >= Math.max(1, this.reserveFor(game, me) || 0) : true;
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
    for (const c of [...pool].sort((a, b) => score(b) - score(a))) { if (out.length >= n) break; if (!out.includes(c)) out.push(c); }
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
    if (this.expert && this.params().mull) { const ramp = hand.filter(c => !c.isLand && c.cmc <= 2 && (c.manaAb || c.roles.includes('ramp'))).length; if (lands === 2) return ramp >= 1 || cheap >= 3; return lands >= 3 && lands <= 5 && (cheap >= 1 || ramp >= 1); }
    return lands >= 2 && lands <= 5 && cheap >= 1;
  }
  bottomChoice(hand, n) {
    const lands = hand.filter(c => c.isLand), spells = hand.filter(c => !c.isLand).sort((a, b) => b.cmc - a.cmc);
    const out = []; while (out.length < n) { if (lands.length > 4) out.push(lands.pop()); else if (spells.length) out.push(spells.shift()); else out.push(lands.pop()); } return out;
  }
}

/** rules check: which lines of a card's text the engine models.
 *  ok      — a hand-written handler (HANDLED) or keyword covers the line
 *  generic — the general text parser produced an effect, but the line carries a condition/qualifier the parser may have dropped
 *  missing — nothing in the engine reacts to the line */
const COND_RE = /\bif\b|\bas long as\b|\bunless\b|\bonly\b|\bthat entered\b|\bwith (power|toughness|mana value)\b|\bfor each\b|\bwhere x\b|\bexcept\b|\bother than\b|\bthis way\b|\binstead\b|\bequal to\b|\bthe first\b|\bthe second\b|\bdoesn't\b|\bcan't\b|\bnon[a-z]+\b|\bduring\b|\beach (opponent|player)\b|\bthat (player|creature|card)\b|\byou don't control\b|\bopponents? control\b|\bchosen\b|\brandom\b|\bgreatest\b|\bleast\b|\bthreshold|\bdelirium|\bmetalcraft|\bmorbid|\braid|\bferocious|\bspell mastery|\bcoven|\bdescend/;
/** cards with a behavioural test in the engine's test suite (their conditions are checked by a test, not just parsed) */
const TESTED = new Set(["Adeline, Resplendent Cathar", "Agadeem's Awakening", "All Is Dust", "Ancient Copper Dragon", "Ancient Tomb", "Animate Dead", "Arcane Lighthouse", "Archivist of Oghma", "Ashnod's Altar", "Aurelia, the Warleader", "Beseech the Mirror", "Birgi, God of Storytelling", "Black Market Connections", "Blackblade Reforged", "Blasphemous Edict", "Blighted Woodland", "Blightsteel Colossus", "Bloodghast", "Borne Upon a Wind", "Breach the Multiverse", "Brotherhood Regalia", "Burgeoning", "Chain Reaction", "Champion's Helm", "Chandra's Ignition", "Changeling Outcast", "Charismatic Conqueror", "Chromatic Lantern", "Chrome Mox", "City of Traitors", "Collective Resistance", "Colossus Hammer", "Combat Celebrant", "Commander's Plate", "Coruscation Mage", "Crashing Drawbridge", "Cruel Celebrant", "Crypt Ghast", "Curse of Opulence", "Curse of the Swine", "Cursed Mirror", "Darksteel Mutation", "Dauthi Voidwalker", "Dawn's Truce", "Deathrite Shaman", "Desperate Ritual", "Dimir Aqueduct", "Dimir Signet", "Dispatch", "Doubling Season", "Dread Return", "Eerie Interlude", "Elesh Norn, Mother of Machines", "Elspeth, Sun's Champion", "Emergence Zone", "Enduring Vitality", "Ephemerate", "Esper Sentinel", "Etali, Primal Conqueror", "Etali, Primal Storm", "Evendo, Waking Haven", "Everflowing Chalice", "Expressive Iteration", "Exquisite Blood", "Fact or Fiction", "Faeburrow Elder", "Faerie Mastermind", "Felidar Retreat", "Field of the Dead", "Force of Despair", "Gemstone Caverns", "Ghostly Prison", "Goblin Anarchomancer", "Goldspan Dragon", "Grand Abolisher", "Grasp of Fate", "Great Train Heist", "Greater Good", "Grim Monolith", "Growing Rites of Itlimoc", "Heliod, Sun-Crowned", "Hellkite Tyrant", "Helm of the Host", "Herald's Horn", "High Tide", "Hullbreaker Horror", "Into the Flood Maw", "Isochron Scepter", "Kami of Whispered Hopes", "Kardur, Doomscourge", "Karmic Guide", "Kessig Wolf Run", "Kindred Discovery", "Kozilek, Butcher of Truth", "Krosan Grip", "Krosan Verge", "Laboratory Maniac", "Land Tax", "Leyline of Anticipation", "Liliana, Dreadhorde General", "Lion's Eye Diamond", "Living Death", "Lotho, Corrupt Shirriff", "Lotus Cobra", "Lotus Petal", "Mana Vault", "Marionette Apprentice", "Marvin, Murderous Mimic", "Massacre Wurm", "Maze of Ith", "Mechanized Production", "Midnight Clock", "Mindbreak Trap", "Mirari's Wake", "Mirkwood Bats", "Mirror Entity", "Monastery Swiftspear", "Mondrak, Glory Dominus", "Mosswort Bridge", "Mother of Runes", "Mulldrifter", "Myriad Landscape", "Mystic Forge", "Mystic Remora", "Mystic Sanctuary", "Narset's Reversal", "Narset, Parter of Veils", "Necromancy", "Necropotence", "Noxious Gearhulk", "Nykthos, Shrine to Nyx", "Ojer Taq, Deepest Foundation", "Omniscience", "Opposition Agent", "Overwhelming Stampede", "Pact of Negation", "Patchwork Banner", "Plaza of Heroes", "Plumb the Forbidden", "Prairie Stream", "Prismari Command", "Professional Face-Breaker", "Psychosis Crawler", "Ragavan, Nimble Pilferer", "Raise the Alarm", "Raise the Palisade", "Ram Through", "Rancor", "Reckless Fireweaver", "Reprieve", "Restoration Magic", "Rhystic Study", "Rite of Replication", "Roaming Throne", "Sanguine Bond", "Scrap Trawler", "Second Harvest", "Seedborn Muse", "Selvala, Heart of the Wilds", "Serra Ascendant", "Shadowspear", "Shatterskull Smashing // Shatterskull, the Hammer Pass", "Sheoldred, Whispering One", "Shizo, Death's Storehouse", "Simian Spirit Guide", "Smothering Tithe", "Solphim, Mayhem Dominus", "Soul Warden", "Spellskite", "Spelunking", "Strip Mine", "Sun Titan", "Tainted Pact", "Talon Gates of Madara", "Tear Asunder", "Teferi's Ageless Insight", "Teferi, Time Raveler", "The Fire Crystal", "The Gitrog Monster", "The Meathook Massacre", "The Ozolith", "The Reaver Cleaver", "The Wind Crystal", "Thespian's Stage", "Three Steps Ahead", "Tireless Tracker", "Toski, Bearer of Secrets", "Toxic Deluge", "Tragic Slip", "Treasure Cruise", "Unbreakable Formation", "Underworld Breach", "Unnatural Growth", "Up the Beanstalk", "Urborg, Tomb of Yawgmoth", "Urza's Cave", "Urza's Incubator", "Urza's Saga", "Valakut Awakening", "Valley Floodcaller", "Vanquisher's Banner", "Vault of the Archangel", "Vesuva", "Victimize", "Village Rites", "Vito, Thorn of the Dusk Rose", "Voice of Victory", "Walking Ballista", "Warstorm Surge", "Wear", "Wheel of Fortune", "Whispersilk Cloak", "Witch's Clinic", "Wizard Class", "Xorn", "Yahenni, Undying Partisan"]);
function auditCard(c) {
  const sig = (t, spell) => { const S = t.statics ? Object.keys(t.statics).length : 0; return (t.triggers || []).length + (t.abilities || []).length + (t.etbOps ? 1 : 0) + (t.gyCast ? 1 : 0) + ((t.spellOps || []).length) + (!t.isLand && t.manaAb ? 1 : 0) + S + (t.anthems || []).length + (t.equip ? 1 : 0) + (t.reducers || []).length + (t.extraLands || 0) + (t.kw || []).length + (t.fetch ? 1 : 0) + (t.etbCond || t.etbTapped || t.shock || t.reveal ? 1 : 0) + (t.isLand && !(t.produces.length === 1 && t.produces[0] === 'C') ? 1 : 0) + (t.isLand && t.manaAmount > 1 ? 1 : 0) + (t.tutor ? 1 : 0) + (t.reanimate ? 1 : 0) + (t.gyHate ? 1 : 0) + (t.counter && t.counter.hits ? 1 : 0) + (t.modes ? 1 : 0) + (t.noCounter ? 1 : 0) + (t.uncounterable ? 1 : 0) + (t.freeCmd ? 1 : 0) + (t.redirect ? 1 : 0) + (t.doublesDeath ? 1 : 0) + (t.mirrorClone ? 1 : 0) + (t.addendum ? 1 : 0) + (spell ? ((t.tokenCount ? 1 : 0) + (t.dmg ? 1 : 0) + (t.drawN ? 1 : 0) + (t.gainN ? 1 : 0) + (t.pumpN ? 1 : 0) + t.roles.length) : 0); };
  const strip = l => l.replace(/\([^)]*\)/g, '').trim();
  const front = (c.oracle || '').split('\n//\n')[0]; const spell = /Instant|Sorcery/.test((c.type || '').split(' // ')[0]);
  const f = tagCard(c); const base = sig(tagCard({ ...c, oracle: '' }), spell); const full = sig(f, spell);
  const name = (c.name || '').toLowerCase().split(' // ')[0];
  const lines = front.split('\n').map(strip).filter(l => l && !/can be your commander|^partner|^companion|^choose a background|^friends forever|^doctor's companion/i.test(l));
  const out = [];
  for (const l of lines) { const L = l.toLowerCase(); const Lg = L.split(name).join('this card'); let st = 'missing';
    if (HANDLED.some(r => r.test(L) || r.test(Lg))) st = 'ok';
    else if (f.modes && (/^•/.test(l) || /^choose /i.test(l))) st = 'ok';
    else if (f.isLand && /^\{t\}: add /.test(L) && f.produces.length) st = 'ok';
    else if (L.replace(/\.$/, '').split(/,\s*/).every(p => (f.kw || []).includes(p) || (p === 'flash' && f.flash))) st = 'ok';
    else { const t = tagCard({ ...c, oracle: l }); const without = sig(tagCard({ ...c, oracle: front.split('\n').filter(x => strip(x) !== l).join('\n') }), spell); const inContext = without < full;
      if ((inContext && sig(t, spell) > base) || (f.roles.includes('removal') && /^when .+ enters, (you may )?(destroy|exile|return) (up to one )?(another )?target/.test(L)) || (f.counter && f.counter.free && /rather than pay this spell's mana cost/.test(L))) st = COND_RE.test(L.replace(/^(if|when|whenever|at) [^,]*,\s*/, m => /^if/.test(m) ? m : '')) ? 'generic' : 'ok'; }
    out.push({ line: l, status: st }); }
  if (c.oracle && c.oracle.includes('\n//\n') && /Land/.test((c.type || '').split(' // ')[1] || '') && !f.backLand && !f.backFace) out.push({ line: '[back face land]', status: 'missing' });
  if (TESTED.has(c.name) || TESTED.has((c.name || '').split(' // ')[0])) for (const x of out) if (x.status === 'generic') x.status = 'tested';
  return { name: c.name, lines: out, missing: out.filter(x => x.status === 'missing').length, generic: out.filter(x => x.status === 'generic').length };
}
root.Goldfish = { auditCard, TESTED, HANDLED, Game, AI, buildDeck, tagCard, setPopularity, manaInfo, counterHits, shuffle, mulberry, EVASIVE };
})(typeof window !== 'undefined' ? window : globalThis);
