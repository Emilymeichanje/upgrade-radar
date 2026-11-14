#!/usr/bin/env python3
"""Rebuild data/cards.json from Scryfall's bulk "oracle cards" file: every paper card's rules text plus the id its pictures
are filed under. The app uses it whenever a device cannot reach Scryfall's API, so a game never depends on that API answering.
Row: [name, mana, type, oracle, cmc, power, toughness, scryfall_id, extra]; extra holds only what a card has:
  l loyalty · ci colour identity · m2/p2/t2/l2 back-face mana, power, toughness, loyalty · b 1 when the back face has its own picture.
A failed download leaves the old file untouched; rows the bulk file does not have are kept.
BULK_FILE=path reads a local copy instead of downloading (used by the tests)."""
import json, os, sys, datetime, urllib.request
P = 'data/cards.json'
UA = {'User-Agent': 'mtg-dashboard-cards/1.0', 'Accept': 'application/json'}
SKIP_LAYOUT = {'token', 'double_faced_token', 'emblem', 'art_series', 'planar', 'scheme', 'vanguard', 'augment', 'host'}
SKIP_SETTYPE = {'memorabilia', 'token', 'minigame'}

def get(url, timeout=120):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout)

def load_bulk():
    if os.environ.get('BULK_FILE'):
        return json.load(open(os.environ['BULK_FILE'], encoding='utf-8'))
    meta = json.load(get('https://api.scryfall.com/bulk-data/oracle-cards'))
    return json.load(get(meta['download_uri'], 600))

def row(c):
    faces = c.get('card_faces') or []
    f = faces[0] if faces else {}
    f2 = faces[1] if len(faces) > 1 else {}
    oracle = c.get('oracle_text') or '\n//\n'.join(x.get('oracle_text') or '' for x in faces)
    x = {}
    loy = c.get('loyalty', f.get('loyalty'))
    if loy is not None: x['l'] = loy
    if c.get('color_identity'): x['ci'] = ''.join(c['color_identity'])
    if not c.get('mana_cost') and f2.get('mana_cost'): x['m2'] = f2['mana_cost']
    if f2.get('power') is not None: x['p2'] = f2['power']
    if f2.get('toughness') is not None: x['t2'] = f2['toughness']
    if f2.get('loyalty') is not None: x['l2'] = f2['loyalty']
    if (f2.get('image_uris') or {}).get('small'): x['b'] = 1
    has_img = bool((c.get('image_uris') or {}).get('small') or (f.get('image_uris') or {}).get('small'))
    r = [c['name'], c.get('mana_cost') or f.get('mana_cost') or '', c.get('type_line') or f.get('type_line') or '', oracle,
         c.get('cmc') or 0, c.get('power', f.get('power')), c.get('toughness', f.get('toughness')), c['id'] if has_img else '']
    if x: r.append(x)
    return r

def main():
    old = json.load(open(P, encoding='utf-8')) if os.path.exists(P) else {'cards': []}
    try:
        bulk = load_bulk()
    except Exception as e:
        print('bulk download failed, keeping the old file:', e, file=sys.stderr); return 0
    rows = {}
    for c in bulk:
        if c.get('object') != 'card' or c.get('layout') in SKIP_LAYOUT or c.get('set_type') in SKIP_SETTYPE: continue
        if 'paper' not in (c.get('games') or ['paper']): continue
        if not c.get('name') or not c.get('id'): continue
        rows[c['name'].lower()] = row(c)
    if len(rows) < 20000 and not os.environ.get('BULK_FILE'):
        print(f'only {len(rows)} cards in the bulk file — refusing to overwrite', file=sys.stderr); return 0
    kept = 0
    for r in old.get('cards') or []:
        if r and r[0].lower() not in rows: rows[r[0].lower()] = r; kept += 1
    out = {'note': 'Every paper card: rules text and the Scryfall id its pictures are filed under. Used when a device cannot reach the Scryfall API. Rebuilt weekly by scripts/build-cards.py.',
           'date': datetime.date.today().isoformat(), 'v': 2, 'cards': sorted(rows.values(), key=lambda r: r[0])}
    json.dump(out, open(P, 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
    print(f'{len(out["cards"])} cards written ({kept} kept from the old file), {os.path.getsize(P) // 1024} KB')
    return 0

if __name__ == '__main__':
    sys.exit(main())
