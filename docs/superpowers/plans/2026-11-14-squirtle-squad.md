# Squirtle Squad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Squirtle Squad, a rare Trainer encounter, and its prize, the Squirtle Squad Leader, the first Special variant.

**Architecture:** A Special variant is a box copy whose record carries `variant: "<key>"` (`{ id: 7, variant: "squad-leader", exp, at }`). One catalog (`data/pokedex/special-variants.json`, read by `utils/specialVariants.js`) gives its name, base stats, extra moves and start Level. Derived counts stay two-way: `user.pokemon[id].normal` counts every non-shiny copy, Special ones included, so the Pokédex, achievements and the previous release keep working unchanged. Code that must tell a Special copy apart (teams, battles, sprites, protections) reads the box. The Squad is a fixed party built in `utils/encounter/squad.js`, picked by a seeded 1-in-100 roll when a Trainer spots a player, fought through the existing `fightEncounter`.

**Tech Stack:** Node ES modules, discord.js, @napi-rs/canvas, the repo's `run-tests.js` harness (`tests/harness.js`: `section`, `assertTrue`, `assertEqual`, `finish`), vanilla JS dashboard under `public/`.

**Spec:** `docs/superpowers/specs/2026-11-14-squirtle-squad-design.md` (glossary: `CONTEXT.md`).

## Global Constraints

- Variant keys: `"normal"`, `"shiny"`, and the catalog's keys. Ownable Special variant now: `squad-leader`. NPC-only look: `squad-member` (renders only; never owned, never on a team).
- Squad share: 1 in 100 Trainer encounters (`ENCOUNTER.squadShare = 0.01`).
- Squad party, in order: `squad-leader` at Lv 100 with `statMult: 1.7` and moves `["surf", "hydropump", "aquatail", "bite"]`, then five `squad-member` Squirtle at Lv 25 with automatic moves.
- Leader base stats: `{ hp: 66, atk: 72, def: 97, spa: 75, spd: 96, spe: 64 }` (Squirtle's spread scaled to 470). Extra moves: `aquajet`, `surf`, learnable from Lv 1. Start Level 25. Types: Squirtle's. Cuteness: Squirtle's (8).
- Squad Prize money: 0 both ways. Win while not owning the Leader: grant one Leader copy and post to the rare channel. Win while owning it: nothing.
- Card copy, verbatim: heading `You've crossed paths with the Squirtle Squad`; intro line `Squirtle! Squirt squirtle!`; prize `???`; win-and-granted result `The Squirtle Squad Leader has joined your party.`; Squad-wins line `Squirtle squirt!`; Squad-loses line `Squirtle...`; owner-win result `The Squirtle Squad salutes you!` (the last two are defaults, flagged in the spec).
- The Leader: one per player; never shiny; can't be donated, fed, gifted, evolved or shiny-crafted; Showcase and Casual teams only, never the Ranked team. It can learn TMs and hold items like any copy.
- Squad trainer sprite: `public/sprites/trainers_2/squirtlesquadleader.png`, never listed in `trainerSprites.json` (never sold, recruited or granted).
- Special sprites live under `public/sprites/pokemon/special/{normal,grayscale}/<key>.gif`, never under `mega/` (`tests/megaSprites.test.js` counts that folder).
- American English in copy, comments and docs.

## Review Focus

- A player whose only Squirtle is the Leader saves, restarts and reloads: the Leader stays in the box and on the Casual team (Task 2 test `only-squirtle-is-leader survives two normalizes`).
- A Ranked team saved with the Leader before this code (or by a stale dashboard) loads without it (Task 4 test `load-time trim drops Special slots from battleTeam`).
- Bulk "donate duplicates" of Squirtle, evolve and shiny-craft with no copy named never pick the Leader even when it is the lowest or highest Level (Task 3 tests).
- A fainted Leader in a battle image shows its own grayscale sprite, not grayscale Squirtle (Task 5 test `special fainted sprite path`).
- Two Squad wins in a row: the second grants nothing and posts nothing (Task 7 test `owner win grants nothing`).

---

### Task 1: Special variant catalog

**Files:**
- Create: `data/pokedex/special-variants.json`, `utils/specialVariants.js`
- Test: `tests/specialVariants.test.js`

**Interfaces:**
- Produces (all from `utils/specialVariants.js`):
  - `SPECIAL_VARIANTS` (frozen `{ [key]: { species, name, ownable, baseStats?, extraMoves?, startLevel? } }`)
  - `isSpecialVariant(v: string): boolean` (ownable catalog key)
  - `isSpriteVariant(v: string): boolean` (any catalog key)
  - `specialVariant(v): entry | null`
  - `normalizeVariant(v): "normal" | "shiny" | <ownable key>` (replaces every "anything but shiny is normal" coercion)
  - `countKey(v): "normal" | "shiny"` (shiny stays shiny; everything else counts as normal)
  - `specialBattleProfile(v): { baseStats, types, name } | null` (types from `getSpecies(species).types`)
  - `specialExtraMoves(v): string[]`
  - `specialSpriteFile(v, folder): string | null` → `special/normal/<key>.gif`, or `special/grayscale/<key>.gif` when `folder === "grayscale"`, for any sprite variant
  - `VARIANT_KEYS: string[]` (`["normal", "shiny", ...ownable keys]`)

- [ ] **Step 1: Write the failing test** `tests/specialVariants.test.js`, section "catalog": `normalizeVariant("squad-leader") === "squad-leader"`, `normalizeVariant("squad-member") === "normal"`, `normalizeVariant("golden") === "normal"`, `normalizeVariant("shiny") === "shiny"`; `countKey("squad-leader") === "normal"`; `isSpecialVariant("squad-member") === false`, `isSpriteVariant("squad-member") === true`; `specialBattleProfile("squad-leader").baseStats` deep-equals the Global Constraints stats and sums to 470; `.types` equals `getSpecies(7).types`; `specialExtraMoves("squad-leader")` equals `["aquajet", "surf"]` and each passes `getMove`; `specialSpriteFile("squad-leader", "grayscale") === "special/grayscale/squad-leader.gif"`; every ownable entry has `species`, `name`, `baseStats`, `startLevel`.
- [ ] **Step 2: Run** `TRAINERDATA_DIR=$(mktemp -d) node tests/specialVariants.test.js` → FAIL (module missing).
- [ ] **Step 3: Implement** the JSON (Global Constraints values; a `note` field saying it is hand-written and not regenerated) and the module (reads the JSON once with `readFileSync`, freezes it).
- [ ] **Step 4: Run** the test → PASS.
- [ ] **Step 5: Commit** `feat: Special variant catalog (squad-leader, squad-member look)`.

### Task 2: Box model knows Special variants

**Files:**
- Modify: `services/box.js` (`VARIANTS` :32, `variantOf` :34, `normV` :35, `bitOf` :36, `copiesOf` :119, `spareCopies` :164, `syncLine` :171, `addCopy` :192, `adoptCopy` :230, `canFeed` :262, `normalizeBox` :302)
- Test: `tests/specialVariants.test.js` (section "box")

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces (from `services/box.js`):
  - `variantOf(rec)` (now exported): `rec.variant` when `isSpecialVariant(rec.variant)`, else shiny/normal.
  - `ownedCount(user, id, variant): number` = `copiesOf(user, id, variant).length` (exact variant, read from the box).
  - `grantSpecial(user, key, { at = Date.now() } = {}): { granted: boolean, uid: string | null }`: adds one copy at `expForLevel(startLevel)` with `variant: key`, registers the species (normal bit); returns `{ granted: false, uid: <existing> }` when the player already has one.
  - `isSpecialCopy(user, uid): boolean`.

Rules for the implementer:
- `copiesOf(user, 7, "normal")` excludes Special copies; `copiesOf(user, 7, "squad-leader")` returns only them.
- `syncLine` writes `user.pokemon[id][countKey(v)]` = count of copies whose `countKey(variantOf(rec))` matches (so `normal` includes Special copies), `training[trainingKey(id, countKey)]` from the best of those, and also `training[trainingKey(id, v)]` for a Special `v`. The prune rule (:185) is unchanged.
- `normalizeBox` reconciles want/have per count key (`have` = copies with that count key), and its removal order never includes a Special copy. Team-slot repair (step 4) matches the slot's exact variant, so a `normal` slot never gets the Leader and a `squad-leader` slot never gets a plain Squirtle.
- `spareCopies` never returns a Special copy. `canFeed` refuses when either copy is Special (`code: "special"`, "The Squirtle Squad Leader can't be fed or fed to.", using the catalog name). `adoptCopy` throws on a Special record.

- [ ] **Step 1: Write failing tests** (section "box"):
  - `grantSpecial` on an empty user → `granted: true`, box record `{ id: 7, variant: "squad-leader" }` at Lv 25, `pokemon[7].normal === 1`, `pokedex[7] & DEX_NORMAL`, `ownedCount(u, 7, "squad-leader") === 1`, `ownedCount(u, 7, "normal") === 0`; a second call → `granted: false`, still one copy.
  - `only-squirtle-is-leader survives two normalizes`: user with only the Leader on `displayedPokemon` `[{ id: 7, variant: "squad-leader", uid }]`, run `normalizeBox` twice → record and slot uid unchanged, `pokemon[7].normal === 1`.
  - Rollback counts: a user with 2 plain Squirtle + the Leader has `pokemon[7].normal === 3`; deleting `pokemon[7]` and running `normalizeBox` rebuilds 3 and removes nothing.
  - A `normal` Squirtle slot with no uid, when only the Leader exists, ends with no uid.
  - `spareCopies(u, 7, "normal")` excludes the Leader even when it has the lowest EXP; `canFeed` both ways → `code: "special"`; `adoptCopy({ rec: leaderRec })` throws.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** per the rules above.
- [ ] **Step 4: Run** `tests/specialVariants.test.js`, `tests/box.test.js`, `tests/ownership.test.js`, `tests/twoCopiesTeam.test.js` → PASS.
- [ ] **Step 5: Commit** `feat: box copies can be a Special variant`.

### Task 3: Protections in every destructive flow

**Files:**
- Modify: `services/ownership.js` (`VARIANTS` :42, `checkNamedPlain` :109, `canRemoveCopies` :127, `canTransformCopy` :179, transform auto-pick :200, `transformCopy` :210-214, `slotBoxUid` :245, `slotCopyUid` :282, `normalizeCustomPokemon` :323, `createTrainedCopy` :408, `carryCopyUids` :444/:453), `utils/bulkDonate.js` (:35, :64, :97-178, `donateOne` :206-246), `services/gameplay.js` (evolve :181-265, convert :270-315, feed :330-353), `commands/gift.js` (:31-48), `services/tmTeaching.js` (:34, :52, :135-137)
- Test: `tests/specialVariants.test.js` (section "protections"), existing `tests/bulkDonate.test.js`, `tests/gameplayRoutes.test.js`, `tests/gift.test.js`

**Interfaces:**
- Consumes: `isSpecialCopy`, `variantOf`, `normalizeVariant`.
- Produces: refusal shape `{ ok: false, code: "special", error: "<catalog name> can't be <donated|fed|evolved|made shiny|gifted>." }` from every check that names a Special copy or variant.

- [ ] **Step 1: Write failing tests**: user with 2 plain Squirtle (Lv 5, Lv 30) + the Leader (Lv 25):
  - `donateOne` naming the Leader's uid → `code: "special"`; bulk duplicates mode on Squirtle removes exactly the Lv 5 plain copy and keeps the Leader.
  - Evolve Squirtle with no uid → evolves the Lv 30 plain copy (never the Leader); naming the Leader → `code: "special"`. Same two checks for convert-to-shiny.
  - `giftPokemon` of Squirtle with only the Leader owned → refused like "not enough"; with plain copies, the gifted record has no `variant`.
  - Teaching a TM to the Leader by uid succeeds and creates a `customPokemon` record with `variant: "squad-leader"` that `normalizeCustomPokemon` keeps.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**: every uid-named path refuses Special copies; every auto-pick already goes through `spareCopies` (Task 2) or is changed to; count-based availability checks (`gift.js:32-41`, `gameplay.js:293`, bulk multiselect totals) count `spareCopies`/`copiesOf` instead of `pokemon[id].normal`; `normalizeCustomPokemon` accepts `VARIANT_KEYS`; admin remove stays allowed.
- [ ] **Step 4: Run** the new section plus `bulkDonate`, `bulkRules`, `gameplayRoutes`, `gift`, `tmTeaching`, `customCopies`, `mutationGuard` → PASS.
- [ ] **Step 5: Commit** `feat: the Squirtle Squad Leader can't be donated, fed, gifted, evolved or made shiny`.

### Task 4: Teams accept the Leader (not Ranked)

**Files:**
- Modify: `utils/teamNormalize.js` (:3, :17, :34-37), `utils/economyRules.js` `toTeamObj` (:13-22), `services/megaTeam.js` (:69, :77-81, :96, :138-146, :187-191), `services/battleTeam.js` (:46-57, :105-125), `services/showcaseTeam.js` (:25-30, :84), `services/teamCopy.js` (`KEY` :15, :41), `services/heldItems.js` (:49-55, :116-118), `bot_final.js` (inline `normalizeDisplayedPokemon` :1611-1660, `/api/set-pokemon-team` :2537-2627, `normalizeBattleTeam` call order)
- Test: `tests/specialVariants.test.js` (section "teams"), existing `tests/battleTeam.test.js`, `tests/showcaseTeam.test.js`, `tests/teamCopy.test.js`, `tests/heldItems.test.js`, `tests/megaPersistence.test.js`

**Interfaces:**
- Consumes: `normalizeVariant`, `ownedCount`, `isSpecialVariant`.
- Produces: `trimSpecialFromBattleTeam(user): boolean` in `services/battleTeam.js` (load-time, beside `trimBattleTeamMythics`); Ranked save refusal `{ code: "special_ranked", error: "The Squirtle Squad Leader can't join the Ranked team." }` (catalog name).

- [ ] **Step 1: Write failing tests**:
  - `normalizeTeam([{ id: 7, variant: "normal" }, { id: 7, variant: "squad-leader" }])` keeps both slots.
  - Casual and Showcase saves with the Leader succeed and keep its uid; a Ranked save with it → `special_ranked`.
  - `load-time trim drops Special slots from battleTeam`: a stored `battleTeam` holding the Leader loses that slot after `normalizeUserSchema`; the Casual team keeps it.
  - The ghost-slot filter keeps a Leader slot when only the Leader is owned (no plain Squirtle).
  - `teamCopy` accepts `copiedKeys: ["7:squad-leader"]`; a held item keyed `u:<leaderUid>` survives `normalizeEquipment`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**: replace each binary coercion with `normalizeVariant`; variant-ownership checks use `ownedCount` (species-level checks keep reading counts); Ranked refuses and trims Special variants.
- [ ] **Step 4: Run** the new section plus the listed suites → PASS.
- [ ] **Step 5: Commit** `feat: the Leader joins Showcase and Casual teams, never Ranked`.

### Task 5: Battles use the Leader's stats, moves and sprites

**Files:**
- Modify: `utils/battle/runBattle.js` (`bestCopyUid` :44, `buildTeam` :76-98, `withoutMegaStats`/`withMegaStats` :106-113), `services/movesets.js` (:33-34, `learnableMoves` :60-74, :98, :136), `utils/challenge/runChallenge.js` (`owns` :158), `utils/battle/render.js` (`loadAnimatedSprite` :133-136, `load` :441-449), `utils/render/expCard.js` (:27-38)
- Test: `tests/specialVariants.test.js` (section "battle"), existing `tests/runBattle.test.js`, `tests/movesets.test.js`, `tests/battleRender.test.js`, `tests/megaBattle.test.js`

**Interfaces:**
- Consumes: `specialBattleProfile`, `specialExtraMoves`, `specialSpriteFile`, `isSpriteVariant`, `ownedCount`.
- Produces: a built member for a Leader slot = `{ speciesId: 7, variant: "squad-leader", name: "Squirtle Squad Leader", level, copyUid, battleProfile, moves? }`; `spriteRef(member, alive): { dir, file }` in `utils/battle/render.js` (Special: `special/normal|grayscale`, `<key>`; Mega: as today; else `<variant|grayscale>`, `<speciesId>`).

- [ ] **Step 1: Write failing tests**:
  - `buildTeam` for a Casual team with the Leader → member has the catalog `battleProfile` and name; `buildMon(member).atk` equals `computeStats(leaderStats, 25).atk`.
  - `withMegaStats(withoutMegaStats(team))` restores the Leader's profile.
  - `learnableMoves(user, 7, "squad-leader", { uid })` at Lv 25 includes `aquajet` and `surf` with `source: "special"`; a plain Squirtle's never does; `chosenMoves` keeps `surf` for the Leader.
  - `special fainted sprite path`: `spriteRef({ speciesId: 7, variant: "squad-leader" }, false)` → `{ dir: "special/grayscale", file: "squad-leader" }`; alive → `special/normal`; a `squad-member` foe likewise.
  - Challenges: the Leader on the Casual team earns EXP (`runChallenge` `owns`).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** (Leader profile attached only when no Mega profile applies; auto moves stay Squirtle's level-up rule).
- [ ] **Step 4: Run** the new section plus the listed suites → PASS.
- [ ] **Step 5: Commit** `feat: the Leader battles with its own stats, moves and sprites`.

### Task 6: Sprites on cards, embeds and the trainer sprite

**Files:**
- Create: `public/sprites/pokemon/special/normal/squad-leader.gif` (from `tools/squirtle-squad-sprites/squirtle-squad.gif`), `public/sprites/pokemon/special/normal/squad-member.gif` (from `squirtle-squad-member.gif`), their grayscale twins in `public/sprites/pokemon/special/grayscale/` (made the way `tools/import-sprites.mjs` makes `grayscale/`), `public/sprites/trainers_2/squirtlesquadleader.png` (from `squirtle-squad-leader.png`) and `public/sprites/trainers_2/grayscale/squirtlesquadleader.png`
- Modify: `utils/render/sprites.js` (`spriteFileFor` :84-91), `utils/sprites.js` (`pokemonSpritePath` :22-31), `utils/render/teamView.js` (`slotView` :45-73: catalog name and profile stats), `utils/broadcastReward.js` (:101-102), `services/pokemonDetail.js` (:32-35, :77, :85-125: the Leader's copy listed as its own entry with the catalog name, Special sprite and profile stats, not under normal)
- Test: `tests/specialVariants.test.js` (section "sprites")

**Interfaces:**
- Consumes: `specialSpriteFile`, `specialVariant`, `specialBattleProfile`.
- Produces: `loadStaticSprite(7, "squad-leader")` and `pokemonSpritePath(7, "squad-leader")` resolve to the Special file.

- [ ] **Step 1: Write failing tests**: all six asset files exist; each Special GIF decodes with `omggif` and uses no disposal 3 (the `battleRender` rule); `spriteFileFor(7, "squad-leader")` ends in `special/normal/squad-leader.gif`; `loadStaticSprite(7, "squad-leader")` is not the placeholder; `squirtlesquadleader.png` is absent from every `trainerSprites.json` entry and from `flattenTrainerSprites(...)`; `slotView` of a Leader slot names "Squirtle Squad Leader"; the Pokémon detail for Squirtle lists the Leader separately from normal copies, with the profile stats at its Level.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**: copy the assets, make the grayscale twins, add a Special branch in front of the manifest lookup in both sprite resolvers.
- [ ] **Step 4: Run** the new section plus `assets`, `catalog`, `megaSprites`, `spriteLoops`, `teamView`-using suites (`showteamRender`, `pokemonDetail`) → PASS.
- [ ] **Step 5: Commit** `feat: Squirtle Squad sprites`.

### Task 7: The Squirtle Squad encounter

**Files:**
- Create: `utils/encounter/squad.js`
- Modify: `utils/battle/tuning.js` (`ENCOUNTER.squadShare: 0.01`, `SQUAD = { leaderLevel: 100, memberLevel: 25, members: 5, statMult: 1.7, leaderMoves: [...] }`), `utils/encounter/service.js` (`maybeSpot` trainer choice, `cardMessage`, `expMessage` caption, `battle` broadcast), `utils/encounter/runEncounter.js` (`fightEncounter` foes and grant), `utils/render/encounterCard.js` (`encounterCardView`, `encounterAltText`, `drawStakes`), `utils/battle/playback.js` (`encounterSummary`), `bot_final.js:1233` (inject `announce`)
- Test: `tests/squadEncounter.test.js`; existing `tests/encounterFlow.test.js`, `tests/encounterCard.test.js`, `tests/runEncounter.test.js`, `tests/encounterGenerate.test.js`

**Interfaces:**
- Consumes: Tasks 1-6; `grantSpecial`, `specialBattleProfile`.
- Produces (from `utils/encounter/squad.js`):
  - `SQUAD_CLASS_KEY = "squirtlesquad"`, `SQUAD_TEXT` (the Global Constraints copy).
  - `squadFromSeed(seed: number): boolean` = `createRng(seed ^ 0x5eed5).next() < ENCOUNTER.squadShare`, so both picks of one card agree and replays match.
  - `squadTrainer(): Trainer` = `{ classKey: "squirtlesquad", squad: true, title: "Squirtle Squad", name: "Leader", spriteFile: "squirtlesquadleader.png", tier: "squad", surprise: false, prize: 0, party: [leader, ...members], lines: { intro, lost: "Squirtle...", won: "Squirtle squirt!" } }`, where party members carry `{ speciesId, level, variant, name, moves?, statMult? }`.
- `fightEncounter` builds foes from party members' own `variant`, `name`, `moves`, `statMult`, plus `battleProfile` from `specialBattleProfile(variant)`; other Trainers' foes are unchanged. On a Squad win it calls `grantSpecial(user, "squad-leader", { at })` and returns `special: { key, granted }`.
- `createEncounterService({ ..., announce = async () => {} })`: called with `{ userId, displayName, channel }` when `outcome.special?.granted`; bot_final wires it to `broadcastReward(client, { user, type: "pokemon", item: { id: 7, name: "Squirtle Squad Leader", rarity: "rare", variant: "squad-leader" }, source: "Squirtle Squad", originChannel })`.

- [ ] **Step 1: Write failing tests** `tests/squadEncounter.test.js`:
  - `squadFromSeed(1) === false` (the flow tests' seed); scanning seeds 1..20000 finds a share between 0.5% and 1.5%.
  - `squadTrainer().party` matches the Global Constraints exactly (order, Levels, variants, leader `statMult` and moves).
  - `encounterCardView` for the Squad → `heading === "You've crossed paths with the Squirtle Squad"`, `line === "Squirtle! Squirt squirtle!"`, stakes text `"???"`; alt text contains `???` and no `CC`.
  - `fightEncounter` vs the Squad with a Lv 100 team of strong species (fixed seed that wins) → `won`, `special.granted === true`, the Leader is in the box at Lv 25, CC unchanged; with a Lv 5 team (loses) → CC unchanged, no Leader.
  - `owner win grants nothing`: a second win → `special.granted === false`, still one Leader; the service's `announce` is called only on the first win.
  - `encounterSummary` lines: granted win ends with `The Squirtle Squad Leader has joined your party.`; owner win ends with `The Squirtle Squad salutes you!`; neither mentions CC; the EXP caption never says "You paid".
  - Service: with a seed where `squadFromSeed` is true, both picks' trainers are the Squad; with seed 1 the existing flow is unchanged.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** (live-event Prize multiplier note hidden for the Squad; spotted log records `classKey: "squirtlesquad"`).
- [ ] **Step 4: Run** the new test plus the four encounter suites and `fightRecords` → PASS.
- [ ] **Step 5: Commit** `feat: the Squirtle Squad Trainer encounter`.

### Task 8: Dashboard shows and places the Leader

**Files:**
- Modify: `bot_final.js` `copyRows` (:46-53: append index 8 = Special key or `null`), `public/spriteconfig.js` (add `specialSprite(key, folder = "normal")`), `public/teams/script.js` (:48, :86-107, :173-223, :190/:339 Ranked block, :612, :837, :934), `public/picker-pokemon/script.js` (tile sprite :779-822, `boxTileLocked` :751-760, sprite paths), `public/picker-pokemon/copyChoice.js` (:50-59), `public/picker-pokemon/bulkRules.js` (:62-64), `public/overview/script.js` (:37-46), `public/battlerecords/records.js` (:21-23, :73), `public/picker-pokemon/detail.js` (:140)
- Test: `tests/specialVariants.test.js` (section "dashboard"), existing `tests/bulkRules.test.js`, `tests/dashboardFoundation.test.js`, `tests/battleRecordsPage.test.js`

**Interfaces:**
- Consumes: `copyRows` index 8; `specialSprite`.
- Produces: a Leader tile and team slot use `specialSprite("squad-leader")`; its slot posts `{ id: 7, variant: "squad-leader", uid }`; its Collection tile disables Donate, Feed, Evolve and Make shiny with the reason "Kept for good"; the Ranked editor refuses it with the server's message.

- [ ] **Step 1: Write failing tests**: `copyRows` for a user with the Leader → its row's index 8 is `"squad-leader"`, plain rows `null`, indexes 0-7 unchanged; `bulkRules` duplicates logic over rows never offers the Leader; the battle records page's sprite helper maps `{ id: 7, variant: "squad-leader" }` to `/public/sprites/pokemon/special/normal/squad-leader.gif`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the new section plus the listed suites → PASS.
- [ ] **Step 5: Commit** `feat: dashboard shows and places the Squirtle Squad Leader`.

### Task 9: Docs and full run

**Files:**
- Modify: `README.md` (`## Trainer encounters` :92-100, Teams and moves :50, the Collection section, tests list :271-279)
- Create: `docs/adr/0002-special-variants.md` (the decision to make Special variants a box Variant counted under normal in derived counts, and why: rollback safety and unchanged species-level readers)
- Keep: `tools/squirtle-squad-sprites/` (the approved sources and generators; README line on how to rebuild) and `tools/squad-winrate.mjs` (README line under tuning)

- [ ] **Step 1:** Update the README sections, then grep the README and root docs for `normal or shiny`, `variant`, `Prize money` and fix stale lines.
- [ ] **Step 2:** Write ADR 0002 in `docs/adr/0001`'s format.
- [ ] **Step 3: Run** `npm run test:safe` → all suites pass.
- [ ] **Step 4: Run** `node tools/squad-winrate.mjs 400 --leader-mult=1.7` → Lv 90 between 40% and 52% (the spec's 46.0%, same seeds).
- [ ] **Step 5: Commit** `docs: Squirtle Squad and Special variants`.

## Manual steps

- `npm ci` in the worktree before Task 1 (it has no `node_modules`).
- Deploy as usual; no data migration (the box keeps reading old records the same way).
- The manual test plan in the spec, on a local test branch with `ENCOUNTER.chance = 1`, `gapMs = 0`, `squadShare = 1`.
