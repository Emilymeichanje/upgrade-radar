#!/usr/bin/env bash
# Test runner for the playtest engine. Usage:
#   bash tests/run.sh            # engine suites (fast, ~1 min)
#   bash tests/run.sh bench      # + two 40-game AI benches (~1 min)
#   bash tests/run.sh ui         # Playwright UI tests (needs chromium via playwright)
#   bash tests/run.sh all
cd "$(dirname "$0")"
ENGINE="f1 f2 f3 f4 f5 f6 f7 f8 f9 f10 f11 f12 f13 f14 f15 f16 f17 f18 f19 f20 f21 c1 c2 c3 c4 fod t1 cv1 cv2 cv3 cv4 cv5 cv6 cv7 cv8 c5 cz_run logchk wild_run ice_run aang_run combo_run feeder"
UI="ui10 ui11 ui12 ui13 ui14 ui15 ui16 undo blkui mus setchk dash dash2 ptsort res mob2 mob3"
bad=0
engine(){ for f in $ENGINE; do [ -f $f.js ] || continue; r=$(node $f.js 2>&1 | tail -1); case "$r" in *"0 failed"*|*"ALL PASS"*) ;; *) bad=1; echo "== $f: $r"; node $f.js 2>&1 | grep -E "FAIL|CRASH|Error" | head -5;; esac; done; echo "engine suites done"; }
bench(){ node bench/gapbench.js 2>&1 | tail -1; node bench/gapbench7.js 2>&1 | tail -1; echo "(want hangs:0 errs:0)"; }
ui(){ ( cd .. && python3 -m http.server 8765 >/dev/null 2>&1 & echo $! > /tmp/pt-srv.pid ); sleep 1
  for f in $UI; do [ -f ui/$f.js ] || continue; out=$(node ui/$f.js 2>&1); echo "$out" | grep -q FAIL && { bad=1; echo "== $f"; echo "$out" | grep FAIL; }; done
  kill $(cat /tmp/pt-srv.pid) 2>/dev/null; echo "ui suites done (ui9/ui15 can be flaky under load; rerun solo)"; }
case "${1:-engine}" in engine) engine;; bench) engine; bench;; ui) ui;; all) engine; bench; ui;; esac
exit $bad
