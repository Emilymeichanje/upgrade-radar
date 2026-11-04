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

- **Deployed: v64** (2026‑11‑04). Version pins live in `index.html`: `playtest.js?v=N`, `playtest-ui.js?v=N`, `engine:'vN'` — bump all three on every deploy:
  `sed -i 's/playtest\.js?v=63/playtest.js?v=64/; s/playtest-ui\.js?v=63/playtest-ui.js?v=64/; s/engine:'"'"'v63'"'"'/engine:'"'"'v64'"'"'/' index.html`
- v64 (b10): split attacks (target buttons pick where the *next* clicks go; clicking an assigned creature with another target selected moves it; "All creatures → X"); own triggers stop once per source per turn + "Pass my triggers this turn" chip (Shared Animosity ×18); Karmic Guide double-reanimate (ETB reanimators now resolve only via their trigger); permanents whose `removal` role comes from a later trigger (Summoner's Sending, Surly Badgersaur) no longer prompt for / apply a cast target — guard is in `needsTarget` (UI) and the generic removal branch in `resolve` (engine), allowing "when … enters … target" (Reflector Mage); graveyard/exile viewer: click `gy N` / `exile N` on any seat (exile shows which permanent holds a card).
- v63 (b10): **the hang, solved.** `act()` set `busy=true` then called `render()` *outside* its try/finally; a render exception (here `optLabel` reading `card.gyCast.kind` for a graveyard-castable card granted by `gyGrant`, not `gyCast`) left `busy` stuck → "Resolving…" forever. Now: render is wrapped (`render()`→`_render()` with a visible red banner + diag on failure), the pre-action render is inside try, gy-cast labels use `gyGrant`. Also: Sagas now get their lore counter on entering via `enterPerm` (was only in `landEnters`, so every Saga ran a chapter late); chapter parses for Restoration of Eiganjo (basic-Plains tutor, "you may discard… when you do", "exile this Saga, then return transformed"); generic block triggers (`when:'blocks'`, fired after blockers declared); Staff of the Storyteller's remove-a-story-counter cost reads kind counters (`perm.ck`).
- v62 (b10): parser double-pushed `damage … any target` when the subject was "it/this creature" — every such pinger dealt 2× (Mayhem Devil etc.); station thresholds are now generic (`N+ |` marker scopes following lines: `thr` on abilities/triggers, gated in `refreshStatics`/`canUseAbility`; Hearthhull's 8+ drain fired at 5 charge); token copies with changed P/T carry `card.altered` and a green badge in the UI (Astral Dragon's "Currency Converter" 3/3 Dragons confused the owner); pumpTypes log no longer prints "0 creatures get +0".
- v61 (batch **b10**): Deification prompts the human for a planeswalker type (new UI `humanChoice`/`humanChooseType` hooks → `choice` prompt); Ghost Vacuum / 'exile target card from a graveyard' lets the human pick from every graveyard (search prompt with owner labels); 'target attacking or blocking creature' abilities (Gideon's Memorial) only offered while something is attacking/blocking; Export log always visible, works while the UI is busy, and carries a `state:` line (phase, busy/prompt/mode, stack) plus captured JS errors/rejections — ask for this export whenever a game hangs.
- v60: AI never sacrifices its own sac outlet when another body exists (Carrion Feeder); life‑aware modal choice ("choose one or more", Black Market Connections) so AI doesn't pay itself to death; Darkness Crystal + commander log message.
- Engine code is organised in **batch regions**: `// ==== fixes bN (parse|ops|ai|methods) ====` … `// ---- end bN`. Current batch is **b10**. New work goes in a new `b11` region (or the matching b9 region if it's a direct follow‑up). Never edit inside an older batch region unless fixing that batch's own bug.

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
- **Replay from log** (owner asked 2026‑11‑04): the .txt log cannot be replayed (no seed, no decklists, no hidden info, no decision stream). Feasible design: record a replay file = seed + deck lists + every human decision (hooks already funnel through `ask()`/`humanTurn`/`humanBlocks`), then a replay mode that feeds those answers back. Medium effort; not started.
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
