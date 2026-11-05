# HANDOVER — MTG Dashboard / Playtest Engine

Read this first in any new session. It is the memory of the project; the chat is not.
Keep it current: **every deploy updates the "Current state" and "Open items" sections and commits them in the same push.**

## 1. What this is

A static web app (GitHub Pages) for the owner's Magic: The Gathering Commander decks:

- **Deck tracker / upgrade radar** — `index.html` (prices in SGD, bracket sorting, deck lists).
- **Playtest module** — a 4-player Commander goldfish/AI engine the owner plays against, mostly on a phone.
  - `playtest.js` — rules engine + AI (~7.5k lines). Oracle text is parsed into ops at load (`parseOps`, `tagAbilities`); `Game` runs turns, stack, combat, mana, zones, triggers.
  - `playtest-ui.js` — table UI (`GoldfishUI`): prompts, zoom, sound/music, arena FX, token art, mobile layout, save/resume, log export.
  - `index.html` — app shell: playtest setup (deck pick, sort, Resume/Discard banner), hash routing (`#playtest/game`), version pins.
- Repo: `Emilymeichanje/upgrade-radar` (public). Deploy = push to `main`; GitHub Pages workflow publishes in ~1 min.

## 2. The owner's standing rules (non‑negotiable)

1. **"All cards and spells must work as what is written on them."** Fidelity to oracle text beats convenience. If an interaction isn't modelled, model it; don't approximate silently.
2. **"Don't spend anything."** No Lovable credits, no paid services. Everything is static files + free GitHub Pages + Scryfall's free API (token art, cached).
3. The owner plays real games, **exports the history log**, pastes it in, and asks "study this game and fix accordingly." That log is the primary bug source. Treat every line as evidence; verify against the card's oracle text before calling anything a bug — several "bugs" so far were correct rulings (see §7).
4. Mobile first: Samsung S25 Ultra, Chrome/DuckDuckGo, viewport 384×719 CSS px @2.81×. Portrait and landscape both matter.

### Reply persona the owner requires (from their preferences)
Advisor, not assistant. First sentence must challenge an assumption or expose a gap. Tag claims `[Certain]` / `[Likely]` / `[Guessing]`. Lead with the uncomfortable truth. No warm‑ups. Banned: "Great question", "You're absolutely right", "That makes a lot of sense", "Absolutely", "Definitely". Disagree with structure ("I disagree because… instead… the risk is…"). Don't fold to pushback without new information.

## 3. Current state

- **Deployed: v75** (2026‑11‑05). Version pins live in `index.html`: `playtest.js?v=N`, `playtest-ui.js?v=N`, `engine:'vN'` — bump all three on every deploy:
  `sed -i 's/playtest\.js?v=74/playtest.js?v=75/; s/playtest-ui\.js?v=74/playtest-ui.js?v=75/; s/engine:'"'"'v74'"'"'/engine:'"'"'v75'"'"'/' index.html`
- v75: loyalty sources now go through `counterAmt` (Doubling Season / Lae'zel): `loyaltyOther` (Guff end step), `oneMoreCounter` (Ichormoon Gauntlet — also stopped double-firing All Will Be One on creatures), `loyaltyAll`, `empowerJace`. **Chandra, Legacy of Fire**: end-step damage and +1 mana use X = planeswalkers you control (`b13_pwX`; damage was 0, mana was one {R}). **Teferi, Time Raveler −3** bounces before drawing (matters with Teferi Hero's emblem). **AI threat**: `threatOf` adds `walkerThreat` = loyalty×0.5 + emblems×10 + (3+ walkers ? count×2), scaled by w.engines. Bench `node tests/bench/sfthreat.js 16 7` (Tam deck vs 3 random expert decks; deck names in tests/fixtures/twodecks.json): attack share into Tam 0.32 → 0.38, median first attack round 5 → 5 — early pressure is limited by the AI not attacking into bigger blockers, which is correct play.
- v74: **Pyroblast / Red Elemental Blast / Hydroblast** colour conditions (`card.counter.color` checked in `counterHits` and at resolution — "if it's blue" does nothing otherwise; `card.rmColor` checked in `targetOk` for the destroy mode). They used to counter/destroy anything. **Commodore Guff** end step (`loyaltyOther`) excludes the source card — "another" walker; it was putting the counter on Guff. **Touch single-pick search** is tap-then-confirm (`this.touch && P.n===1`, not scry/surveil): owner's Sisay pick landed on the neighbouring tile; couldn't reproduce the mis-tap itself (likely a layout shift). Tests: walkers.js b13 block, tests/ui/touchpick.js.
- Data freshness (2026‑11‑05): **New cards** tab query is `(legal:commander OR date>today)` — Scryfall marks preview cards `not_legal` until release, which hid 294 of 311 Star Trek (`trk`, out 2026‑11‑13) cards; rows with a future date get a "preview — out <date>" badge. **↻ Refresh data** button in the status bar clears `S.live`/`S.scry`, refetches snapshot + EDHREC with `cache:'no-cache'` (`S.fresh`), re-renders. EDHREC live (json.edhrec.com) is CORS-open and fetched per deck each session; EDHREC picks only show cards EDHREC has deck data for, so a set appears there days/weeks after release. `scripts/build-snapshot.py` + `.github/workflows/snapshot.yml` (Mon/Thu, or Run workflow) refresh `data/snapshot.json`, keeping old entries on fetch failure.
- v73: walker audit of the Tam deck (dump each walker's Oracle line next to its parsed ops — do this for any new deck). Fixed dropped clauses: **Commodore Guff −3** (`b13_guff`: draw X too), **Dihada −3** (`b13_dihada`: reveal 4, legendaries to hand, rest to GY, Treasure each), **Jace, Multiverse Architect +1** (`b13_handToTop` with `bottom`), **Tamiyo, Field Researcher +1** (`b13_tamiyo1` marks `perm.b13Tam=[{p,until:turnCount}]`; `b13_tamiyo(perm)` draws — hooked into combatDamageTriggers and both block-damage paths), **Wrenn and Realmbreaker −2** (`b13_millTake`), **Nicol Bolas −4** (`b13_oppAny` → `b13_dmgOppAny`: opponent / their creature / their walker). Known gap left: Chandra, Awakened Inferno −X's "exile instead of dying" rider.
- v72: **Aminatou +1** now draws then puts a card from hand on top (`b13_handToTop`; the second half was dropped, making it pure card advantage). Human gets a search prompt with dest `handtop` and `must: true` (no Skip button); AI uses chooseDiscard; AI value −0.8. Lesson: grep every walker's parsed `abilities[].ops` against its Oracle line — two dropped clauses (Ugin −10, Aminatou +1) were found only by the owner.
- v71: **All Will Be One** now triggers on every counter you put via proliferate — opponents' permanents, players' poison/energy/experience, charge/lore/other kinds — once per object for that object's total (`b12_prolifOne`; `countersPut(p, perm, n, { noAwbo })` avoids double-firing). **Scry/Surveil 1**: the search prompt no longer resolves on tap for dest scry/surveil; it toggles and always shows a "Keep it on top" / "Done — N to the …" button. **Dawn Charm** (any modal card whose only counter role comes from one mode) is now offered in priority windows — `legalActions` used to drop every card with role `counter`. `castFreeCard`: a failed free cast returns the card to exile (was left in hand); modal counter cards aren't binned. Jace AoT −8 could not be reproduced as broken — Karn's Temporal Sundering free-casts fine in an engine test; the log shows the owner picked Loyal Tutor. Ask for a screenshot if it recurs. Tests: tests/ui/tam.js (b13 block).
- v70 (b13 entries live in the b12 parse table + ops): second Tam log (played on v68). **Ugin −10** now puts up to seven permanent cards from hand onto the battlefield (`b13_putPerms`; the clause had been silently dropped — the owner discarded Dihada/Chandra/Sisay at cleanup). **Teferi, Hero of Dominaria +1** untaps up to two lands at the *next end step* (`untapLands` with `atEnd` → `this.endUntaps`, processed in takeTurn's end phase), not immediately. UI: Attack button does nothing (and ends the game) when `g.winner` is set or there are no opponents; the attack badge guards against an undefined defender (that was the `reading 'pw'` render crash — user pressed Attack after already winning). The stuck-after-win itself was the v69 act() fix.
- v69 (still b12): from the owner's Tam game log — **Sisay, Weatherlight Captain** activation now parses (`b12_sisay`: legendary permanent with MV < her power; was unparsed so the button never lit); `matchesFilter` accepts comma lists like "noncreature, nonland card" (Narset, Parter of Veils was offering lands); **All Will Be One** human branch is a choice of opponent / their creature / their planeswalker (was player-only); **proliferate** is now a human picker over every permanent with counters or lore on any side plus pseudo-cards for players' poison/energy/experience (`b12_prolifCands`/`b12_prolifGood`/`b12_prolifOne`; AI picks own stuff + opponents' poison/stun; poison 10 kills); UI `act()` calls endTurn when `g.winner` is set mid-action, so a win on your own turn (e.g. poison) shows the end screen — the engine had already declared the winner. Tests: tests/walkers.js (v69 block), tests/ui/tam.js.
- v68 (batch **b12**): full audit of the owner's **Tam** deck (saved under slug `atraxa-praetors-voice`; commander Tam, the Possibility) and **Terra** deck (`terra-magical-adept`). Real Oracle text in `tests/fixtures/tamterra.json` + `pw8.json`. **The card auditor skips Saga chapter lines** — always check `card.saga.ch[].ops` for empties (that's how 17 dead chapters hid). Fixed: Final Fantasy chapter names ("Lightning —") stripped before parsing; Elspeth Conquers Death I–III, The Eldest Reborn II/III, Valigarmanda I + II–IV ({R} per lore + cast exiled spell with any-type mana via `exileCast`), Fenrir II/III, Good King Mog II/III/IV, Kujata I–III, Primal Odin II ("that player loses the game") and III, Shiva I–III (stun), Titan III, Valefor I–IV, Awaken the Honored Dead III (was returning two), Mending of Dominaria I–III, Clash of the Eikons modes (lore put/remove, fight), Liliana Vess −2. Walkers: entering loyalty now goes through `counterAmt` (Lae'zel +1, Doubling Season ×2, after Oath of Gideon/Spark Double additions) and counts for All Will Be One; Compleated (−2 per Phyrexian symbol paid with life); Deepglow Skate's added counters go through `counterAmt`; Brokers Ascendancy loyalty half; emblems as `p.b12_emblems` (Chandra ToD castBurn — was a one-off 5 damage, Teferi Hero drawExile, Tamiyo freeCast); Ugin −X honours chosen X and the AI won't spend Ugin's last loyalty for a marginal sweep. Rulings encoded: Doubling Season does not double + loyalty costs; Lae'zel does; Narci gains X once. Tests: tests/sagas3.js, tests/walkers.js. Alternate-name printings (Hope's Aero Magic etc.) already resolve via `ALIAS` in index.html.
- v67 (b11): **Terra, Magical Adept // Esper Terra loop.** Parse: Esper Terra I–III → `b11_copyEnch` (token copy of a nonlegendary enchantment, haste, sac at your next end step; a Saga copy enters with 1 + up to 3 lore counters at once via `b11_loreAdd`, so its chapters trigger together and the controller orders them — "sacrifice Reflections" first); IV → ten mana + `b11_exileFront` (token: gone; card: returns front face up). The Apprentice's Folly I/II → `b11_follyCopy` (nontoken creature, name rule enforced on target and resolution, nonlegendary hasty Reflection), III → `b11_sacReflections`. When a nonlegendary Esper Terra would copy a nonlegendary Esper Terra (the Commander Spellbook loop), `b11_esperInfinite` declares it: ∞ WUBRG mana and enough hasty flying Esper Terra token copies to be lethal (they attack through normal combat; ETB payoffs fire per token). Combo bar / AI: `b11_esperCombo` (Terra front + a Folly-style Saga, ready when Trance is payable; `b11_runEsper` activates Trance for real under `shortcutting`). Other Spellbook enablers (Spark Double, Mirrormade, Estrid's Invocation, Copy Enchantment, Mirror Room, Ember Island Production, Yenna, Dominion Saboteur) trigger the same loop once they produce a nonlegendary Esper Terra copy, but their own copy effects have not been verified card by card. Test: tests/terra.js.
- v66 (batch **b11**): **infinite combos.** Engine: `b11_manaLoops` (any permanent whose `{N}: untap` costs less than it produces after Kinnan/Monument/etc. bonuses → infinite mana of the colours it makes; any colour only with an `allTypes` converter like Chromatic Orrery), `b11_citadelTop` (Citadel + Top + Aetherflux recognised by behaviour; `b11_runCitadelTop` executes the real loop as a rule-727 shortcut, then 50 damage per opponent), Commander Spellbook 2-card combos via `Goldfish.setCombos` (app passes rows whose pieces are in the table's decks; classed win/mana/value from the result text). `availableCombos(p)`, `declareCombo(p,id)` (exec-routed → replays), `p.infMana` = virtual `kind:'inf'` mana source (99) until end of turn. AI declares ready win/mana combos at the start of each main phase. Human priority is skipped while `this.shortcutting`. UI: combo bar (Go infinite / Win with combo), ∞ pips, Settings "Infinite combos" on/off; recordings and saves carry the combo list. Card fixes: Sensei's Divining Top now puts itself on top after drawing; activated abilities honour a permanent target passed at activation (`ctxA.target`); Aminatou −1 honours its target and the AI prefers flickering an already-activated planeswalker. Verified correct (tests/combo4.js): Forsaken Monument (already `cBonus`), Kinnan, Basalt Monolith, Oath + Aminatou + God-Pharaoh (3 Bolas activations/turn, finite), Aragorn (own spells only; one trigger per colour).
- v65 (b10): **Replays module** (nav tab `#replays`, `openReplays()` in index.html). Every game since v65 is recorded: seed + `uidBase` + raw card lists + popularity subset + every human decision. Recording lives in `playtest-ui.js` (`recEnc`/`recDec`, `Replays` IndexedDB store `pt-replays`, cap 200, `Table.rec`, `Table.exec()` for direct UI→engine calls, hook wrappers in the Table constructor). Answers are encoded by reference (card uid `$c`, perm id `$p` + owner stamp `$o`, seat `$pl`, stack index `$s`, hook-argument element `$ai`). Playback: `GoldfishUI.replay(el, rec)` swaps human hooks for `rpNext`, paces on game events (`gate()`; Play/Pause/Step/speed), and reports desync explicitly. Determinism prerequisites added to the engine: AIs share the game RNG; `mulberry` exposes `.st` so undo (`snapshot/restore`) and save/resume (`serializeState` now stores `rngS` + `uid`) rewind it; `Goldfish.uid.get/set`. Old .txt logs can be uploaded as **log-only** entries (viewable, not playable). Tests: `ui/rec.js [seed]` (record→store→replay line-for-line; swept seeds 1–11), `ui/recres.js` (interrupt→resume→replay), `ui/replays.js` (page). Also fixed: station-threshold parser no longer strips `N+ | {T}: Add…` (Eternity Elevator); engine derives a removal target's owner when the table didn't stamp it.
- v64 (b10): split attacks (target buttons pick where the *next* clicks go; clicking an assigned creature with another target selected moves it; "All creatures → X"); own triggers stop once per source per turn + "Pass my triggers this turn" chip (Shared Animosity ×18); Karmic Guide double-reanimate (ETB reanimators now resolve only via their trigger); permanents whose `removal` role comes from a later trigger (Summoner's Sending, Surly Badgersaur) no longer prompt for / apply a cast target — guard is in `needsTarget` (UI) and the generic removal branch in `resolve` (engine), allowing "when … enters … target" (Reflector Mage); graveyard/exile viewer: click `gy N` / `exile N` on any seat (exile shows which permanent holds a card).
- v63 (b10): **the hang, solved.** `act()` set `busy=true` then called `render()` *outside* its try/finally; a render exception (here `optLabel` reading `card.gyCast.kind` for a graveyard-castable card granted by `gyGrant`, not `gyCast`) left `busy` stuck → "Resolving…" forever. Now: render is wrapped (`render()`→`_render()` with a visible red banner + diag on failure), the pre-action render is inside try, gy-cast labels use `gyGrant`. Also: Sagas now get their lore counter on entering via `enterPerm` (was only in `landEnters`, so every Saga ran a chapter late); chapter parses for Restoration of Eiganjo (basic-Plains tutor, "you may discard… when you do", "exile this Saga, then return transformed"); generic block triggers (`when:'blocks'`, fired after blockers declared); Staff of the Storyteller's remove-a-story-counter cost reads kind counters (`perm.ck`).
- v62 (b10): parser double-pushed `damage … any target` when the subject was "it/this creature" — every such pinger dealt 2× (Mayhem Devil etc.); station thresholds are now generic (`N+ |` marker scopes following lines: `thr` on abilities/triggers, gated in `refreshStatics`/`canUseAbility`; Hearthhull's 8+ drain fired at 5 charge); token copies with changed P/T carry `card.altered` and a green badge in the UI (Astral Dragon's "Currency Converter" 3/3 Dragons confused the owner); pumpTypes log no longer prints "0 creatures get +0".
- v61 (batch **b10**): Deification prompts the human for a planeswalker type (new UI `humanChoice`/`humanChooseType` hooks → `choice` prompt); Ghost Vacuum / 'exile target card from a graveyard' lets the human pick from every graveyard (search prompt with owner labels); 'target attacking or blocking creature' abilities (Gideon's Memorial) only offered while something is attacking/blocking; Export log always visible, works while the UI is busy, and carries a `state:` line (phase, busy/prompt/mode, stack) plus captured JS errors/rejections — ask for this export whenever a game hangs.
- v60: AI never sacrifices its own sac outlet when another body exists (Carrion Feeder); life‑aware modal choice ("choose one or more", Black Market Connections) so AI doesn't pay itself to death; Darkness Crystal + commander log message.
- Engine code is organised in **batch regions**: `// ==== fixes bN (parse|ops|ai|methods) ====` … `// ---- end bN`. Current batch is **b12**. New work goes in a new `b13` region. Any new direct UI→engine call must go through `Table.exec()` and any new human hook must be in the `hooks` object, or replays will desync (or the matching b9 region if it's a direct follow‑up). Never edit inside an older batch region unless fixing that batch's own bug.

## 4. Workflow (do it this way; it is known to work)

```bash
git clone https://github.com/Emilymeichanje/upgrade-radar  # or gh repo clone
cd upgrade-radar
bash tests/run.sh          # engine suites, ~1 min — must print only "engine suites done"
bash tests/run.sh bench    # + two 40-game AI benches — want hangs:0 errs:0
bash tests/run.sh ui       # Playwright UI tests (chromium must be available to playwright)
```

Per change:
1. Reproduce from the log with a tiny script (pattern: `tests/feeder.js`, `tests/logchk.js` — build a `Game` with stub decks, `enterPerm` the cards by name from `tests/fixtures/gap*.json`, drive one phase, assert).
2. Fix in a batch region. `node --check playtest.js`.
3. `bash tests/run.sh bench` clean. If UI touched: `bash tests/run.sh ui`.
4. Bump version pins, commit, push, wait for Pages:
   ```bash
   git -c user.name=Claude -c user.email=noreply@anthropic.com commit -am "vN: …"
   git push origin HEAD
   gh api "repos/Emilymeichanje/upgrade-radar/actions/runs?per_page=1" --jq '.workflow_runs[0]|.status+" "+(.conclusion//"")'
   ```
5. Update §3 and §6 of this file in the same commit.

Report to the owner per the persona: what was wrong, what was correct‑but‑looked‑wrong, what was fixed, what's still open.

### Pitfalls already paid for
- Never `pkill -f "http.server"` — it killed the agent's own shell. The runner uses a PID file.
- Don't hand‑merge large edits by character offset; apply with small Python `str.replace` patches asserting `count == 1` (see commit history).
- `ui9`/`ui15` are flaky only when the whole UI suite runs under load; rerun solo before calling them failures.
- Scryfall rate limits: token art lookups are cached in `localStorage`; tests stub `api.scryfall.com` with a 404 route.
- Card fixture dumps: `tests/fixtures/gap1..7.json` rows are `[id, name, mana, type, oracle, cmc, power, toughness]`. `tests/dcx.js` dumps how the parser reads a card — run it first when a card misbehaves.

## 5. Engine map (where to look)

| Area | Where |
|---|---|
| Oracle → ops parsing | `parseOps`, `tagAbilities`, helpers `TR/ETB/ST/AB`; batch parse regions |
| Op execution | `Game.runOpsCore` (big `switch (op.op)`) |
| Turn / phases / combat | `takeTurn`, `combatPhase`, `b9_beginExtraCombat`, `b9_combatUntaps` |
| Mana | `manaSrcs`, `manaPlan`, `payCost(p,cost,forcedPlan)`, `tapForMana`/`manualSrcs` (manual tapping), `phyAlts` (Phyrexian) |
| Casting | `castMode`, `altOptions`, `putOnStack`, `resolve`, `redirectable` |
| Modal / targets | `case 'modal'` (AI branch is life‑aware), `modeTarget`, `modeHasTarget` |
| Zones | `destroy`/`sacrifice`/`bounce`/`tuck`/`exilePerm` → `toZone(owner,card,zone,{top})` + `cmdZoneInstead` (rule 903.9) |
| Save / resume | `serializeState`, `Game.fromSaved`, `hooks.save`; UI `savedGame/resume/clearSaved`, `guardBack` |
| AI | class `AI`: `keep` (mulligans), `mainPhase`, `useAbilities`, `abilityValue`, `chooseModes`, `chooseAlt`, `chooseSacVictim`, `deathPayoff`, `opsValue`, removal‑response logic (~`threatTo`) |
| Ability legality | `canUseAbility` (incl. "activate only if attacking/blocking", once‑per‑turn, speed) |
| UI prompts | `playtest-ui.js`: `shouldStop` (smart stops), block prompt (`P.sel`, order‑agnostic), `abilityOptions` rendering, `logText`/`exportLog` |
| Mobile | sticky paged opponent strip + pager, landscape two‑column, dock, hand toggle, Cast‑commander chip, `zoom` on `.gt` |

## 6. Open items / backlog

- Hang class is closed (v63). If "Resolving…" ever sticks again: export log → `errors:` block → if empty, the engine is awaiting a hook; if a stack trace, it's a render/UI crash (now shown as a red banner instead of freezing).

- **Offered, not built:** "repeat until I stop" button for loop abilities (Malcolm + Buccaneer style combos).
- Replays: a recording made on an older engine may desync after rules changes (the replayer says so and stops). Possible later: "jump to turn N" (needs fast-forward with delay 0 then pause), size reduction (each recording carries ~4×100 card texts, ~200–300 KB).
- Goblin Army / Halvar double‑strike damage totals from the v59 log were plausible but not replay‑verified.
- Opportunities the owner has hinted at: sac‑outlet discipline for the Avacyn deck is now priced correctly; watch the next Avacyn log to confirm fodder choices.
- Keep an eye on: AI modal choices elsewhere that pay life/sacrifice (same class of bug as BMC).

## 7. Rulings already confirmed correct (don't "fix" these again)

- Azog's amass going to an opponent — card text.
- Commander‑damage wins existed before; only the badge was missing (now added).
- Swords to Plowshares was castable (needed the target prompt); Exotic Orchard colours come from opponents' lands.
- Airbender's Ascension quest counter was legitimate.
- Phil Coulson ability was legal (click target).
- Sisay 78/116 life totals correct (Bayek double strike).
- Carrion Feeder sacrificing itself *in response to exile* is correct play and intentionally kept.
- Oath of Teferi + Aminatou + Nicol Bolas, God-Pharaoh is a value engine, not an infinite: three Bolas activations per turn.
- Astral Dragon copying an opponent's Currency Converter → two 3/3 flying Dragons *named* Currency Converter attacking: correct; Swords naming "Currency Converter" is correct.
- Cursed Mirror copying Firion, then being equipped and attacking as "Firion": correct.
- Firion's token copy of a legendary Equipment dies to the legend rule; the AI keeps the original: correct.

## 8. How the owner tests

Plays a full game on the phone (often as Witherbloom, Éowyn, Avacyn, Aang, Sisay decks), taps **Export log** (share sheet on phone), pastes the `.txt` into chat. The log header has the engine version and seat list; turns are `== turn N ==` markers. Compare every suspicious line against oracle text in `tests/fixtures/gap*.json` (or Scryfall) before concluding.

## 9. Starting a new session — checklist

1. Clone repo, read this file end to end.
2. `bash tests/run.sh bench` — confirm green before touching anything.
3. Read the owner's message; if it has a log, analyse it against §7 first.
4. Work in a new batch region; test; bump; deploy; update this file; report in persona.
