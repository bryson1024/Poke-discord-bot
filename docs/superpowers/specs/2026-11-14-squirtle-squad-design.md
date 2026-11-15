# Squirtle Squad: locked design (grill-with-docs synthesis)

Branch: `feature/squirtle-squad` (from `origin/master` c588fca4). Glossary: `CONTEXT.md` (Variant, Special variant, Squirtle Squad, Trainer encounter, Prize money, Ranked team, Ace Trainer).

Values marked "decided" were chosen in the design session on 2026-11-14; they are design goals, not measurements. Values from existing code cite where they live. Win rates come from `tools/squad-winrate.mjs` (see Measured). Quantities nobody has measured yet are listed under Open checks with no figure.

## What it is

The Squirtle Squad is the rarest **Trainer encounter**: the Squirtle Squad Leader, in pointed shades, spots the player while they chat, with its squad of round-shaded Squirtle behind it. Beating it gives the player the Squirtle Squad Leader, the first **Special variant**: a one-of-a-kind Variant of Squirtle with its own look, stats and moves. It opens the way for more Special variants later (a Surfing Pikachu, for example).

## Spotting

- 1 in every 100 Trainer encounters is the Squad instead of a regular Trainer (decided). Everything that gates or counts an encounter applies unchanged: the 1.5% roll per message that misses the catch roll, at most 8 a UTC day, 30 minutes apart (`ENCOUNTER`, `utils/battle/tuning.js:92-108`), the `spotBlock` refusals, and live-event encounter-rate scaling.
- Players who already have the Leader still meet the Squad (decided). For them it is a rematch with no prize.
- The card is the regular encounter card: the Leader's trainer sprite with the "!" bubble (`drawAlertBubble`, `utils/render/primitives.js:367`), one Poké Ball per Squad member, and "Battle with Casual" / "Battle with Ranked" / "Run" for 2 minutes (`answerMs`), answered only by the spotted player.

## The Squad

- Six Pokémon in this order (decided): the Leader at Lv 100, then five Squirtle Squad members at Lv 25. Regular Trainers sort weakest first; the Squad does not.
- The Leader fights with the Special variant's base stats and moves (below) and a fight-only 1.7× stat boost (decided 2026-11-14 from Measured), passed as `statMult` the way Challenge opponents get `CHALLENGE.statBoost` (`utils/challenge/runChallenge.js:86-88`). The Special variant a player wins never gets that boost.
- Members are regular Squirtle (base stats, automatic moves) shown in the round-shades sprite. The round-shades look is NPC-only, not a Special variant.
- The Squad's Levels are fixed and never follow the player's team. No Ace, tier band or surprise roll applies.
- No Underdog surge (`surge: null`, as every encounter).

## Outcome

- Win, not owning the Leader: the player gets the Squirtle Squad Leader Special variant (one copy, Lv 25) and the rare channel gets a post ("@player beat the Squirtle Squad and won the Squirtle Squad Leader!"), the way rare catches are broadcast (`broadcastReward`).
- Win, already owning it: no prize.
- Lose or Run (or let the 2 minutes lapse): costs nothing. There is no Prize money either way.
- EXP: as any Trainer encounter (`applyGains` with `teamExp`), owners included.
- A Fight record is saved as for any encounter (`encounterRecord`).

## Card text (decided)

- Headline: "You've crossed paths with the Squirtle Squad"
- The Squad's line: "Squirtle! Squirt squirtle!"
- Prize: "???"
- Player wins and gets the Leader: "The Squirtle Squad Leader has joined your party."
- The Squad wins: "Squirtle squirt!" (default; not reviewed)
- Owner wins: needs a line (open; the "joined your party" line doesn't apply)

## The Squirtle Squad Leader (Special variant)

- One per player (decided). A Special variant is never shiny and can't be crafted shiny.
- Registers Squirtle (#7) in the player's Pokédex the same way a normal copy does; nothing separate is recorded for the Special variant (decided).
- Base stats: Squirtle's spread scaled to a total of 470 (decided; Squirtle 314, Wartortle 405, Blastoise 530, summed from `battleData.json` `species["7"|"8"|"9"].baseStats`). Rounded: HP 66, Atk 72, Def 97, SpA 75, SpD 96, Spe 64 (printed by `node tools/squad-winrate.mjs`). Water type. Cuteness 8, Squirtle's (`data/battle/cuteness.json`).
- Moves: Squirtle's level-up moves plus Aqua Jet and Surf, both from Lv 1 (decided; both are in `battleData.json` `moves`; no regular Squirtle learns either by Level). In the Squad fight the Leader carries Surf, Hydro Pump, Aqua Tail and Bite.
- Starts at Lv 25 (decided), then levels like any copy.
- Can join the Showcase team and Casual team, not the Ranked team (decided), so it never fights Ranked or Wager battles. It can fight Challenges and Trainer encounters when the player picks their Casual team.
- Kept for good (decided): it can't be donated, fed, gifted, evolved or crafted shiny. Admin tools can still remove it.
- A normal Squirtle and the Leader can sit on the same team: they are different Variants (Casual and Ranked teams hold each Pokémon + Variant once).

## Data (outline for the plan)

- The Leader is a box copy of species 7 whose Variant is the Special variant (key to be named in the plan), with its own EXP, keyed like any copy. Today Variant is binary everywhere: `variantOf` (`services/box.js:34`), `normalizeTeam` coerces anything but "shiny" to "normal" (`utils/teamNormalize.js`), `pokemon[id] = {normal, shiny}`, line pruning when both counts are 0 (`services/ownership.js:78`, `services/box.js:185`), ghost-slot removal (`services/megaTeam.js:56-83`), sprite folders `normal|shiny|grayscale`, and the dashboard's hard-coded sprite paths. Each must accept the Special variant.
- Auto-pick paths (evolve, bulk donate, `/gift`, and anything else that picks a copy when no uid is given) must skip the Leader, the way they skip Trained copies. `/gift`'s `adoptCopy` rebuilds a record from id, shiny, exp and at only, so it would drop the Variant: the Leader must never reach it.
- The Special variant's stats and moves live in one hand-written catalog (one entry now), read through a `battleProfile` like Mega forms (`megaBattleProfile`, `utils/megas.js`), so `battleData.json` regeneration can't erase them.
- Trainer sprite: today every renderable class sprite is also an ownable, purchasable trainer sprite (`flattenTrainerSprites`, `utils/dataLoader.js:145-180`). The Leader's must be renderable for the card without ever being sold, recruited or granted (decided at the sprite stage: "It won't exist as an unlockable trainer sprite").
- Assets: `tools/squirtle-squad-sprites/` holds the approved Leader battle GIF (`squirtle-squad.gif`), member GIF (`squirtle-squad-member.gif`), the 34 px trainer sprite (`squirtle-squad-leader.png`) and their generators. Grayscale twins of both GIFs (the battle renderer draws fainted Pokémon from `grayscale/`) and any static card sprites still need making.

## Measured

`node tools/squad-winrate.mjs 400 [--leader-mult=…]`: 400 teams per Level of six random final-stage evolutions (358 species) with automatic movesets, no held items, Megas or TM moves, against the Squad with the real simulator. Player win rate:

| Leader in the fight | Lv 50 | Lv 60 | Lv 70 | Lv 80 | Lv 90 | Lv 100 |
|---|---|---|---|---|---|---|
| 470 total, no boost | 5.0% | 46.5% | 93.5% | 99.3% | 100% | 100% |
| ×1.6 | 0% | 0% | 2.5% | 21.0% | 60.3% | 89.3% |
| ×1.7 (decided) | 0% | 0% | 1.3% | 10.8% | 46.0% | 76.3% |
| ×1.8 | 0% | 0% | 0.5% | 7.0% | 31.8% | 62.5% |

Putting the Leader last instead of first (`--leader-last=1`, 300 teams) and raising the members to Lv 60 or 75 (`--member-level`, 300 teams) left Lv 90 teams at 100%.

Design target (decided): teams at Lv 90 and up win about half the time.

## Open checks

- Win rate against real players' Casual teams (chosen species, held items, Megas, TM moves). Why: the stand-in teams are weaker than chosen ones, so real win rates run higher. Measure: extend `tools/squad-winrate.mjs` to read Casual teams from a trainerData snapshot.
- Squad frequency per player per week. Why: decides how "rare" feels. Measure: `tools/balance-report.mjs`-style model of the encounter roll × 1/100, or the `encounter` events in the event log after release.

## Defaults chosen without a question (change before the plan if wrong)

- The Leader can learn TMs and hold items like any copy.
- Owners' rematches earn EXP.
- "joined your party": the glossary avoids "party" for Team, and the Leader goes to the Collection, not onto a team. Keep the line as written (it's game flavor) or reword.

## Manual test plan

On a local test branch, set `ENCOUNTER.chance` to 1, `gapMs` to 0, and the Squad share to 1 (the way `local/temp-edits` overrides caps).

1. Chat in a test channel until a card posts. It shows the Leader's trainer sprite with the "!" bubble, the headline, "Squirtle! Squirt squirtle!", six Poké Balls and "Prize: ???".
2. Click a button from a second account: nothing happens.
3. Press Run: the card shrinks to the ran line; CC is unchanged.
4. Next card: pick a weak Casual team and battle. The Leader leads off with the leader sprite, the members follow with the round-shades sprite, fainted ones show grayscale. You lose; CC unchanged.
5. With a Lv 100 team, battle and win. The card shows "The Squirtle Squad Leader has joined your party."; the rare channel gets the post; the private EXP card arrives.
6. Dashboard Collection: the Leader appears with its own sprite at Lv 25; Squirtle is Registered; the Pokédex count went up only if Squirtle was new.
7. Put the Leader on the Casual team next to a normal Squirtle: allowed. Try the Ranked team: refused. Showcase: allowed.
8. Try to donate, feed, evolve and shiny-craft the Leader: each refused. Bulk-donate Squirtle duplicates and evolve a Squirtle with no copy chosen: the Leader is never the one picked.
9. `/inspectpokemon` (or the dashboard detail): stats match 470 spread at its Level; moves include Aqua Jet and Surf.
10. Casual battle with the Leader on the team: its battle sprite is the Leader GIF; fainted, it shows its grayscale twin.
11. Meet the Squad again and win: no prize, no rare-channel post, the owner line shows.
12. Battle Records page: replay the Squad fight; Leader and member sprites show correctly.
13. Restart the bot with a card open, then click it: the stale line, as for any encounter.
14. Restart the bot and reload the dashboard: the Leader is still in the box and on the Casual team.

## Not included

- More Special variants (Surfing Pikachu and others) beyond the catalog shape.
- A brand-new signature move.
- Shiny Special variants.
- Evolving the Leader.
- The Squad's trainer sprite as an ownable trainer sprite.
- Admin granting of Special variants.
