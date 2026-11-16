// ==========================================================
// tests/box.test.js: individual copies + permanent Pokédex
// (services/box.js, docs/adr/0001-individual-copies-and-permanent-pokedex.md)
// ==========================================================

import { assertTrue, assertEqual, section, finish } from "./harness.js";
import {
  normalizeBox, copiesOf, addCopy, canUseRareCandy, applyRareCandy, rareCandyExpFor, dexMask, registeredIds,
  mergeDex, isOnTeam, copyTraining, addCopyExp, DEX_NORMAL, DEX_SHINY,
} from "../services/box.js";
import { removeCopies, transformCopy, wipeCollection } from "../services/ownership.js";
import { grantCatch, expForLevel, levelForExp, getTraining } from "../utils/training.js";
import { giftPokemon } from "../commands/gift.js";

const clone = (o) => JSON.parse(JSON.stringify(o));

// Pidgey (16) x4 at Lv 30 shared, one on the Display team; Charmander (4) x1
// shiny; Bulbasaur (1) x2 with one trained copy and no team slot.
function legacy() {
  return {
    pokemon: { 16: { normal: 4, shiny: 0 }, 4: { normal: 0, shiny: 1 }, 1: { normal: 2, shiny: 0 } },
    training: { "16:normal": { exp: expForLevel(30) + 5 }, "4:shiny": { exp: expForLevel(12) }, "1:normal": { exp: expForLevel(20) } },
    customPokemon: { c_TTTTTTTTTT: { uid: "c_TTTTTTTTTT", speciesId: 1, variant: "normal", rev: 2, tmMoves: ["solarbeam"], history: [], createdAt: 1 } },
    displayedPokemon: [{ id: 16, variant: "normal" }],
    battleTeam: [{ id: 16, variant: "normal" }, { id: 4, variant: "shiny" }],
  };
}

section("migration: counts become copies");
{
  const u = legacy();
  const res = normalizeBox(u, { rand: () => 0 });
  assertTrue(res.migrated, "first run migrates");
  const pidgey = copiesOf(u, 16, "normal");
  assertEqual(pidgey.length, 4, "4 Pidgey copies");
  assertEqual(pidgey[0].exp, expForLevel(30) + 5, "the team copy keeps the exact shared EXP");
  assertTrue(pidgey.slice(1).every((c) => c.level <= 30), "re-rolled copies never exceed the old Level");
  assertEqual(u.displayedPokemon[0].uid, pidgey[0].uid, "Display slot points at the keeper");
  assertEqual(u.battleTeam[0].uid, pidgey[0].uid, "Battle slot points at the same keeper copy");
  assertEqual(copiesOf(u, 4, "shiny")[0].level, 12, "single copy keeps its Level");
  const bulba = copiesOf(u, 1, "normal");
  assertEqual(bulba.length, 2, "2 Bulbasaur copies");
  assertTrue(bulba.some((c) => c.uid === "c_TTTTTTTTTT" && c.level === 20), "trained copy keeps its uid and Level");
  assertTrue(bulba.some((c) => c.uid !== "c_TTTTTTTTTT" && c.level <= 20), "the plain Bulbasaur re-rolled (no team slot, a trained keeper exists)");
  assertEqual(u.pokemon[16].normal, 4, "derived counts unchanged");
  assertEqual(u.training["16:normal"].exp, expForLevel(30) + 5, "derived training = best copy");
  assertEqual(dexMask(u, 16), DEX_NORMAL, "Pidgey registered");
  assertEqual(dexMask(u, 4), DEX_SHINY, "Charmander registered shiny only");
  const again = clone(u);
  assertTrue(!normalizeBox(again).changed, "idempotent");
}

section("catches: each copy rolls its own Level; NEW = first registration");
{
  const u = { pokemon: {} };
  const a = grantCatch(u, 25, "normal", () => 0);
  assertTrue(a.isNew && !a.isNewShiny, "first Pikachu is NEW");
  const b = grantCatch(u, 25, "normal", () => 0.5);
  assertTrue(!b.isNew, "second is not new");
  assertEqual(b.expGained, 0, "duplicates add no EXP any more");
  assertEqual(copiesOf(u, 25, "normal").length, 2, "two separate copies");
  const c = grantCatch(u, 25, "shiny", () => 0);
  assertTrue(!c.isNew && c.isNewShiny, "first shiny: NEW shiny, not new species");
  assertEqual(dexMask(u, 25), DEX_NORMAL | DEX_SHINY, "both bits");
}

section("Pokédex never drops");
{
  const u = { pokemon: {} };
  grantCatch(u, 7, "normal");
  const r = removeCopies(u, { id: 7, variant: "normal", n: 1 });
  assertTrue(r.ok, "donated the last Squirtle");
  assertTrue(!u.pokemon[7], "no copies left");
  assertEqual(dexMask(u, 7), DEX_NORMAL, "still registered");
  assertEqual(registeredIds(u).length, 1, "1 registered species");
  assertEqual(mergeDex(u, { 7: 2, 8: 1, 0: 3, x: 1 }), 2, "backfill merge adds new bits only, ignores junk");
  assertEqual(dexMask(u, 7), 3, "union");
  wipeCollection(u);
  assertEqual(registeredIds(u).length, 0, "/resetuser clears the Pokédex");
}

section("Rare Candy");
{
  const u = { pokemon: {} };
  const a = addCopy(u, 16, "normal", { exp: expForLevel(10) });
  const step = expForLevel(11) - expForLevel(10);
  const gap = (lv) => expForLevel(lv + 1) - expForLevel(lv);
  assertEqual(rareCandyExpFor(10), step, "below Lv 30: a full Level");
  assertEqual(rareCandyExpFor(29), gap(29), "Lv 29: still a full Level");
  assertEqual(rareCandyExpFor(30), Math.floor(gap(30) * 0.5), "Lv 30-49: half");
  assertEqual(rareCandyExpFor(50), Math.floor(gap(50) * 0.25), "Lv 50-79: a quarter");
  assertEqual(rareCandyExpFor(79), Math.floor(gap(79) * 0.25), "Lv 79: still a quarter");
  assertEqual(rareCandyExpFor(80), Math.floor(gap(80) * 0.125), "Lv 80+: an eighth");
  assertEqual(rareCandyExpFor(100), 0, "nothing at the top Level");

  const r = applyRareCandy(u, { uid: a.uid, qty: 2 });
  assertTrue(r.ok, "two candies ok");
  assertEqual(r.used, 2, "both used");
  assertEqual(r.fromLevel, 10, "from Lv 10");
  assertEqual(r.toLevel, 12, "a full Level each below Lv 30");
  assertEqual(r.gained, rareCandyExpFor(10) + rareCandyExpFor(11), "each candy worked out at the Level reached");
  assertEqual(copiesOf(u, 16, "normal").length, 1, "no copy used up");

  assertEqual(canUseRareCandy(u, { uid: a.uid, qty: 5, have: 3 }).code, "not_enough", "can't use more than owned");
  assertEqual(canUseRareCandy(u, { uid: a.uid, qty: 0 }).code, "bad_request", "qty must be at least 1");
  assertEqual(canUseRareCandy(u, { uid: "nope", qty: 1 }).code, "unknown_copy", "unknown copy");

  const top = addCopy(u, 16, "normal", { exp: expForLevel(99) + 1 });
  const capped = canUseRareCandy(u, { uid: top.uid, qty: 50 });
  assertTrue(capped.ok && capped.used === 9, "stops at the top Level: unneeded candies are not used");
  applyRareCandy(u, { uid: top.uid, qty: 50 });
  assertEqual(canUseRareCandy(u, { uid: top.uid, qty: 1 }).code, "max_level", "max Level refused");

  // Team copies can take candy too.
  u.displayedPokemon = [{ id: 16, variant: "normal", uid: a.uid }];
  assertTrue(canUseRareCandy(u, { uid: a.uid, qty: 1 }).ok, "a team copy can take a Rare Candy");
}

section("duplicate catch gives a Rare Candy");
{
  const u = { pokemon: {}, items: {} };
  const first = grantCatch(u, 25, "normal");
  assertEqual(first.rareCandy, 0, "first catch: no candy");
  assertEqual(u.items.rare_candy ?? 0, 0, "bag empty");
  const shiny = grantCatch(u, 25, "shiny");
  assertEqual(shiny.rareCandy, 0, "first shiny: no candy (NEW SHINY)");
  const dup = grantCatch(u, 25, "normal");
  assertEqual(dup.rareCandy, 1, "duplicate: one candy");
  grantCatch(u, 25, "shiny");
  assertEqual(u.items.rare_candy, 2, "shiny duplicate: one more");
  assertEqual(copiesOf(u, 25, "normal").length, 2, "the duplicate still adds a copy");
}

section("removal: lowest spare first, team copies locked, admin may take them");
{
  const u = { pokemon: {} };
  const hi = addCopy(u, 19, "normal", { exp: expForLevel(40) });
  const mid = addCopy(u, 19, "normal", { exp: expForLevel(20) });
  const lo = addCopy(u, 19, "normal", { exp: expForLevel(3) });
  u.battleTeam = [{ id: 19, variant: "normal", uid: hi.uid }];
  const r = removeCopies(u, { id: 19, variant: "normal", n: 1 });
  assertEqual(r.removed[0].uid, lo.uid, "auto-pick = lowest Level spare");
  const r2 = removeCopies(u, { id: 19, variant: "normal", n: 2 });
  assertEqual(r2.code, "on_team", "won't take the team copy");
  assertEqual(copiesOf(u, 19, "normal").length, 2, "nothing changed on refusal");
  const r3 = removeCopies(u, { id: 19, variant: "normal", n: 1, uids: [hi.uid] });
  assertEqual(r3.code, "on_team", "a picked team copy is refused too");
  const r4 = removeCopies(u, { id: 19, variant: "normal", n: 2, allowTeam: true });
  assertTrue(r4.ok, "admin removal may take team copies");
  assertTrue(!u.battleTeam[0].uid, "the slot no longer names a copy");
  void mid;
}

section("evolve: the chosen copy moves, slot follows, Level kept");
{
  const u = { pokemon: {} };
  const a = addCopy(u, 4, "normal", { exp: expForLevel(36) });
  addCopy(u, 4, "normal", { exp: expForLevel(5) });
  u.battleTeam = [{ id: 4, variant: "normal", uid: a.uid }];
  const r = transformCopy(u, { from: { id: 4, variant: "normal" }, to: { id: 5, variant: "normal" }, uid: a.uid });
  assertTrue(r.ok && r.uid === a.uid, "evolved the team copy");
  assertTrue(r.newSpecies, "Charmeleon newly registered");
  assertEqual(u.battleTeam[0].id, 5, "slot follows to Charmeleon");
  assertEqual(copyTraining(u, a.uid).level, 36, "Level kept");
  assertEqual(copiesOf(u, 4, "normal").length, 1, "the other Charmander stays");
  assertEqual(dexMask(u, 4), DEX_NORMAL, "Charmander still registered");
}

section("battle EXP goes to one copy; derived Level = best copy");
{
  const u = { pokemon: {} };
  const a = addCopy(u, 133, "normal", { exp: expForLevel(10) });
  const b = addCopy(u, 133, "normal", { exp: expForLevel(20) });
  addCopyExp(u, a.uid, expForLevel(30) - expForLevel(10));
  assertEqual(copyTraining(u, a.uid).level, 30, "a leveled");
  assertEqual(copyTraining(u, b.uid).level, 20, "b untouched");
  assertEqual(getTraining(u, 133, "normal").level, 30, "line Level = best copy");
}

section("gift: the same Pokémon arrives");
{
  const s = { pokemon: {} };
  const r = { pokemon: {} };
  addCopy(s, 16, "normal", { exp: expForLevel(9), at: 111 });
  addCopy(s, 16, "normal", { exp: expForLevel(25) });
  const err = giftPokemon(s, r, "16", "Pidgey", 1);
  assertEqual(err, null, "gift ok");
  const got = copiesOf(r, 16, "normal");
  assertEqual(got.length, 1, "recipient has one");
  assertEqual(got[0].level, 9, "lowest spare was sent, Level kept");
  assertEqual(got[0].at, 111, "caught-on time kept");
  assertEqual(dexMask(r, 16), DEX_NORMAL, "registers for the recipient");
}

section("rollback window: counts changed by an older release reconcile");
{
  const u = { pokemon: {} };
  addCopy(u, 16, "normal", { exp: expForLevel(30) });
  const keep = addCopy(u, 16, "normal", { exp: expForLevel(2) });
  u.displayedPokemon = [{ id: 16, variant: "normal", uid: keep.uid }];
  // old code: +2 caught, shared Level raised
  u.pokemon[16].normal = 4;
  normalizeBox(u);
  assertEqual(copiesOf(u, 16, "normal").length, 4, "added the 2 missing copies");
  // old code: donated down to 1
  u.pokemon[16].normal = 1;
  normalizeBox(u);
  const left = copiesOf(u, 16, "normal");
  assertEqual(left.length, 1, "removed spares first");
  assertEqual(left[0].uid, keep.uid, "the team copy survived");
  assertTrue(isOnTeam(u, keep.uid), "still on the team");
  // old code: a battle raised the shared Level
  u.training["16:normal"] = { exp: expForLevel(50) };
  normalizeBox(u);
  assertEqual(copiesOf(u, 16, "normal")[0].level, 50, "a shared Level raised by an older release lands on the best copy");
  void levelForExp;
}

finish();
