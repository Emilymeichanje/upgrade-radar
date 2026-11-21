// Dead-line audit: which rules-text lines on a card change NOTHING in how the engine tags it,
// and are not read at run time from card.oracle either. A line found here is text the game ignores.
// usage: node scripts/audit-dead-lines.js [owner|all] [nameRegex] > report
const fs = require('fs'), path = require('path'); const root = path.join(__dirname, '..');
require(path.join(root, 'playtest.js')); const { tagCard } = Goldfish;
const j = require(path.join(root, 'data/cards.json'));
const scope = process.argv[2] || 'owner', nameRe = process.argv[3] ? new RegExp(process.argv[3], 'i') : null;
let own = null; if (scope === 'owner') { const ow = require(path.join(root, 'tests/fixtures/owner.json')); own = new Set(ow.map(r => r[1])); }
const src = fs.readFileSync(path.join(root, 'playtest.js'), 'utf8');
// regexes the engine applies to a card's oracle text while the game runs
const RT = []; for (const ln of src.split('\n')) { if (!/\boracle\b/.test(ln)) continue; const re = /(\/(?![*\/ ])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^\/\\\n\[])+\/[gimsuy]*)\s*\.test\(|\.(?:match|replace|search)\(\s*(\/(?![*\/ ])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^\/\\\n\[])+\/[gimsuy]*)/g; let m; while ((m = re.exec(ln))) { try { const r = eval(m[1] || m[2]); if (r instanceof RegExp && r.source.length > 8) RT.push(r); } catch (e) {} } }
const raw = r => { const x = r[8] || {}; return { name: r[0], mana: r[1], type: r[2], oracle: r[3] || '', cmc: r[4], power: r[5] ?? undefined, toughness: r[6] ?? undefined, mana2: x.m2, power2: x.p2, toughness2: x.t2, loyalty: x.l, loyalty2: x.l2 }; };
const sig = c => { const seen = new WeakSet(); return JSON.stringify(c, (k, v) => { if (k === 'uid' || k === 'oracle' || k === 'img' || k === 'img2' || k === 'id' || k === 'text' || k === 'orig' || k === 'mdfcOf') return undefined; if (typeof v === 'function') return 'fn'; if (v && typeof v === 'object') { if (seen.has(v)) return '[seen]'; seen.add(v); } return v; }); };
const out = []; let cards = 0, lines = 0, errs = 0;
for (const r of j.cards) {
  if (own && !own.has(r[0])) continue; if (nameRe && !nameRe.test(r[0])) continue; cards++;
  const base = raw(r), L = base.oracle.split('\n'); let s0; try { s0 = sig(tagCard({ ...base })); } catch (e) { errs++; out.push({ card: r[0], line: 'TAG ERROR ' + e.message }); continue; }
  for (let i = 0; i < L.length; i++) { const l = L[i].trim(); if (!l || l === '//' || /^\([^()]*\)$/.test(l)) continue; lines++;
    const without = L.filter((_, k) => k !== i).join('\n'); let s1; try { s1 = sig(tagCard({ ...base, oracle: without })); } catch (e) { continue; }
    if (s1 !== s0) continue;
    if (/^• \w+ — /.test(l) && /^As this \w+ enters, choose \w+ or \w+\./mi.test(base.oracle)) { /* a Siege's modes are tagged when it enters: judge the mode text on its own */ try { const one = tagCard({ ...base, oracle: l.replace(/^• \w+ — /, '') }), none = tagCard({ ...base, oracle: '' }); const live = c => (c.triggers || []).some(t => (t.ops || []).length) || Object.keys(c.statics || {}).length || (c.abilities || []).length || (c.anthems || []).length; if (sig(one) !== sig(none) && live(one)) continue; } catch (e) {} }
    const bare = l.replace(/ ?\([^()]*\)/g, '').trim(); if (!bare) continue;
    const hit = RT.find(re => { re.lastIndex = 0; if (re.test(l)) return true; re.lastIndex = 0; if (!re.test(base.oracle)) return false; re.lastIndex = 0; return !re.test(without); });
    out.push({ card: r[0], type: r[2], line: bare, rt: hit ? hit.source.slice(0, 60) : null }); // rt = a run-time text check that matches this line (may or may not be what implements it)
  }
}
console.error(`${cards} cards, ${lines} lines, ${out.length} dead lines on ${new Set(out.map(o => o.card)).size} cards, ${errs} tag errors, ${RT.length} run-time text checks`);
console.log(JSON.stringify(out, null, 0).replace(/\},\{/g, '},\n{'));
