#!/usr/bin/env python3
"""Builds data/combos.json: every Commander-legal two-card infinite or win combo from
Commander Spellbook's public bulk export (https://json.commanderspellbook.com/variants.json.gz).
Row: [card A, card B, mana value needed (or null), result, Spellbook id, Spellbook bracket tag]."""
import gzip, json, sys, urllib.request
SRC = 'https://json.commanderspellbook.com/variants.json.gz'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'data/combos.json'

def load(path):
    if path:
        op = gzip.open if path.endswith('.gz') else open
        with op(path, 'rt', encoding='utf8') as f: return json.load(f)
    req = urllib.request.Request(SRC, headers={'User-Agent': 'upgrade-radar combo index (github.com/Emilymeichanje/upgrade-radar)'})
    with urllib.request.urlopen(req, timeout=300) as r: return json.loads(gzip.decompress(r.read()))

def main():
    doc = load(sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] != '-' else None)
    variants = doc['variants'] if isinstance(doc, dict) else doc
    rows, seen = [], set()
    for v in variants:
        if v.get('requires'): continue                      # needs a "any card that…" template: can't match by name
        if (v.get('legalities') or {}).get('commander') is False: continue
        uses = v.get('uses') or []
        if sum(u.get('quantity') or 1 for u in uses) != 2 or len(uses) != 2: continue
        feats = [(p.get('feature') or {}) for p in v.get('produces') or []]
        relevant = [f['name'] for f in feats if f.get('status') == 'S' or 'infinite' in f.get('name', '').lower() or 'win the game' in f.get('name', '').lower()]
        if not relevant: continue
        a, b = sorted(u['card']['name'] for u in uses)
        key = (a, b)
        if key in seen: continue
        seen.add(key)
        rows.append([a, b, v.get('manaValueNeeded'), ' + '.join(relevant[:2]), v.get('id'), v.get('bracketTag')])
    rows.sort()
    out = {'source': SRC, 'timestamp': doc.get('timestamp') if isinstance(doc, dict) else None, 'n': len(rows), 'c': rows}
    with open(OUT, 'w', encoding='utf8') as f: json.dump(out, f, separators=(',', ':'), ensure_ascii=False)
    print(f'{len(rows)} two-card combos from {len(variants)} variants -> {OUT}')
    if len(rows) < 500: sys.exit('suspiciously few combos; not publishing')

main()
