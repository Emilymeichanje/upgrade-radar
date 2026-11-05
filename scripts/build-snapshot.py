#!/usr/bin/env python3
"""Refresh data/snapshot.json from EDHREC's public JSON (same fields the app reads live).
Keeps the old entry for any commander whose fetch fails, so a bad run never empties the file."""
import json, time, urllib.request, datetime, sys
P = 'data/snapshot.json'
snap = json.load(open(P))
ok = fail = 0
for c in snap['commanders']:
    slug = c.get('edh') or c['slug']
    try:
        req = urllib.request.Request(f'https://json.edhrec.com/pages/commanders/{slug}.json', headers={'User-Agent': 'mtg-dashboard-snapshot/1.0'})
        j = json.load(urllib.request.urlopen(req, timeout=30))
        jd = (j.get('container') or j).get('json_dict') or j
        lists = {}
        for L in jd.get('cardlists') or []:
            lists[L['tag']] = [{'n': v['name'], 's': round(float(v.get('synergy') or 0), 3), 'd': v.get('num_decks') or 0,
                                'p': v.get('potential_decks') or 1, 'l': round(float(v.get('lift') or 0), 2),
                                'z': round(float(v.get('trend_zscore') or 0), 2)} for v in L.get('cardviews') or []]
        if lists:
            c['lists'] = lists
            nd = (jd.get('card') or {}).get('num_decks')
            if nd: c['decks'] = nd
            ok += 1
        else:
            fail += 1
    except Exception as e:
        print('skip', slug, e, file=sys.stderr); fail += 1
    time.sleep(0.6)
print(f'updated {ok}, kept old {fail}')
if ok:
    snap['date'] = datetime.date.today().isoformat()
    json.dump(snap, open(P, 'w'), separators=(',', ':'), ensure_ascii=False)
