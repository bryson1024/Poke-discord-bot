# A Special variant is a box copy that counts as a normal copy

Until now a Variant was normal or shiny everywhere: the derived counts (`pokemon[id] = { normal, shiny }`, kept since ADR 0001 so the previous release can still read a record), the training keys, the team normalizers, the sprite folders and the dashboard. The Squirtle Squad Leader is the first **Special variant**, a one-of-a-kind Squirtle a player wins from the Squirtle Squad with its own look, stats and moves. We store it as an ordinary box copy whose record carries `variant: "squad-leader"`, and in the derived counts it counts as one more normal copy. Code that has to tell it apart from a plain Squirtle reads the box.

## Considered options

- **A third derived count** (`pokemon[7]["squad-leader"]`). Rejected. The previous release and every species-level reader (Pokédex completion, achievements, line pruning) know only `normal` and `shiny`. A player whose only Squirtle is the Leader would have a line with both counts at 0, which pruning deletes, and a rollback would drop the copy.
- **Its own species id** (a number past the National Pokédex). Rejected. The Leader has to count as Squirtle in the Pokédex, and every species table (battle data, the sprite manifest, `pokemonData.json`) would need a fake entry.
- **A box copy counted as normal** (chosen). The previous release sees a plain Squirtle with the same EXP, and species-level readers need no change. Training is keyed by the exact Variant (`7:squad-leader`), so a plain Squirtle's Level never follows the Leader's.

## Consequences

- Every place that picks or counts copies of one Variant must read the box (`copiesOf`, `ownedCount`, `ownsVariant` in `services/box.js`), never `pokemon[id].normal`. Those places are the donate, feed, gift, evolve and shiny-craft guards, team ownership checks, TM teaching, and the dashboard's copy rows, which carry the Variant at index 8.
- Rollback: an untrained Leader keeps its `variant` field through the previous release, which shows it as a plain Squirtle and could donate, gift or evolve it while rolled back. A TM-trained Leader loses more. The previous release quarantines its customized-copy record as an unknown variant, so its TM moves don't come back on roll-forward.
- A new Special variant needs a catalog entry in `data/pokedex/special-variants.json`, its sprites in `public/sprites/pokemon/special/{normal,grayscale}/`, and its name in `public/spriteconfig.js` (`tests/specialVariants.test.js` fails until the two lists match). An entry with `ownable: false` is a look for a computer-run Trainer's Pokémon, such as the Squad members' round shades, and no player can own it.
