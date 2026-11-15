// ==========================================================
// tests/specialVariants.test.js: Special variants (the Squirtle Squad
// Leader) from catalog to box, protections, teams, battles and sprites.
// docs/superpowers/specs/2026-11-14-squirtle-squad-design.md
// ==========================================================

import { assertTrue, assertEqual, section, finish } from "./harness.js";
import {
  SPECIAL_VARIANTS, isSpecialVariant, isSpriteVariant, specialVariant, normalizeVariant, countKey,
  specialBattleProfile, specialExtraMoves, specialSpriteFile, VARIANT_KEYS,
} from "../utils/specialVariants.js";
import { getSpecies, getMove } from "../utils/battle/data.js";
import {
  grantSpecial, ownedCount, isSpecialCopy, variantOf, copiesOf, spareCopies, canFeed, adoptCopy, normalizeBox, addCopy, DEX_NORMAL,
} from "../services/box.js";
import { expForLevel, levelForExp } from "../utils/training.js";

const LEADER_STATS = { hp: 66, atk: 72, def: 97, spa: 75, spd: 96, spe: 64 };
const plain = (u, level) => addCopy(u, 7, "normal", { exp: expForLevel(level) }).uid;

section("catalog");
{
  assertEqual(normalizeVariant("squad-leader"), "squad-leader", "an ownable Special variant stays itself");
  assertEqual(normalizeVariant("squad-member"), "normal", "the NPC-only member look is never an owned variant");
  assertEqual(normalizeVariant("golden"), "normal", "unknown variants fall back to normal");
  assertEqual(normalizeVariant("shiny"), "shiny", "shiny stays shiny");
  assertEqual(normalizeVariant(undefined), "normal", "missing variant is normal");
  assertEqual(countKey("squad-leader"), "normal", "a Special copy counts under normal");
  assertEqual(countKey("shiny"), "shiny", "shiny counts under shiny");
  assertEqual(isSpecialVariant("squad-leader"), true, "squad-leader is ownable");
  assertEqual(isSpecialVariant("squad-member"), false, "squad-member is not ownable");
  assertEqual(isSpriteVariant("squad-member"), true, "squad-member still has sprites");
  assertEqual(isSpriteVariant("normal"), false, "normal is not a Special sprite variant");

  const p = specialBattleProfile("squad-leader");
  assertEqual(p.baseStats, LEADER_STATS, "leader base stats are Squirtle's spread scaled to 470");
  assertEqual(Object.values(p.baseStats).reduce((a, b) => a + b, 0), 470, "leader base stat total is 470");
  assertEqual(p.types, getSpecies(7).types, "leader keeps Squirtle's types");
  assertEqual(p.name, "Squirtle Squad Leader", "profile carries the catalog name");
  assertEqual(specialBattleProfile("squad-member"), null, "the member look has no battle profile (fights as Squirtle)");
  assertEqual(specialBattleProfile("normal"), null, "normal has no profile");

  assertEqual(specialExtraMoves("squad-leader"), ["aquajet", "surf"], "leader's extra moves");
  assertTrue(specialExtraMoves("squad-leader").every((m) => getMove(m)), "extra moves exist in the battle data");
  assertEqual(specialExtraMoves("normal"), [], "no extra moves for normal");

  assertEqual(specialSpriteFile("squad-leader", "grayscale"), "special/grayscale/squad-leader.gif", "grayscale twin path");
  assertEqual(specialSpriteFile("squad-leader", "normal"), "special/normal/squad-leader.gif", "live sprite path");
  assertEqual(specialSpriteFile("squad-member", "squad-member"), "special/normal/squad-member.gif", "any non-grayscale folder is the live sprite");
  assertEqual(specialSpriteFile("normal", "normal"), null, "no Special sprite for normal");

  assertEqual(VARIANT_KEYS, ["normal", "shiny", "squad-leader"], "variant keys");
  for (const [key, e] of Object.entries(SPECIAL_VARIANTS)) {
    if (!e.ownable) continue;
    assertTrue(Number.isInteger(e.species) && typeof e.name === "string" && e.baseStats && Number.isInteger(e.startLevel), `${key} has species, name, baseStats, startLevel`);
  }
  assertEqual(specialVariant("squad-leader").startLevel, 25, "the Leader starts at Lv 25");
  assertEqual(specialVariant("nope"), null, "unknown key → null");
  assertTrue(Object.isFrozen(SPECIAL_VARIANTS), "catalog is frozen");
}

section("box");
{
  const u = {};
  const g = grantSpecial(u, "squad-leader", { at: 1 });
  assertEqual(g.granted, true, "first grant adds the Leader");
  const rec = u.box[g.uid];
  assertEqual({ id: rec.id, variant: rec.variant, shiny: rec.shiny }, { id: 7, variant: "squad-leader", shiny: undefined }, "box record is a Squirtle with the Special variant");
  assertEqual(levelForExp(rec.exp), 25, "the Leader starts at Lv 25");
  assertEqual(variantOf(rec), "squad-leader", "variantOf reads the Special variant");
  assertEqual(u.pokemon[7].normal, 1, "derived count: the Leader counts under normal");
  assertTrue((u.pokedex[7] & DEX_NORMAL) !== 0, "registers Squirtle like a normal copy");
  assertEqual(ownedCount(u, 7, "squad-leader"), 1, "owns one Leader");
  assertEqual(ownedCount(u, 7, "normal"), 0, "owns no plain Squirtle");
  assertEqual(isSpecialCopy(u, g.uid), true, "isSpecialCopy");
  const again = grantSpecial(u, "squad-leader", { at: 2 });
  assertEqual(again, { granted: false, uid: g.uid }, "a second grant gives nothing and names the existing copy");
  assertEqual(Object.keys(u.box).length, 1, "still one copy");
}
{
  // only-squirtle-is-leader survives two normalizes
  const u = {};
  const { uid } = grantSpecial(u, "squad-leader");
  u.displayedPokemon = [{ id: 7, variant: "squad-leader", uid }];
  normalizeBox(u);
  normalizeBox(u);
  assertEqual(u.box[uid]?.variant, "squad-leader", "only-squirtle-is-leader survives two normalizes: record kept");
  assertEqual(u.displayedPokemon[0].uid, uid, "only-squirtle-is-leader survives two normalizes: slot keeps its uid");
  assertEqual(u.pokemon[7].normal, 1, "only-squirtle-is-leader survives two normalizes: count kept");
}
{
  // The previous release reads a record without `shiny` as normal: counts must match that.
  const u = {};
  plain(u, 5);
  plain(u, 30);
  grantSpecial(u, "squad-leader");
  assertEqual(u.pokemon[7].normal, Object.values(u.box).filter((r) => !r.shiny).length, "rollback counts: normal counts every non-shiny record");
  const res = normalizeBox(u);
  assertEqual([res.added, res.removed], [0, 0], "rollback counts: a normalize adds and removes nothing");
}
{
  // A plain Squirtle slot never gets the Leader as a stand-in.
  const u = {};
  grantSpecial(u, "squad-leader");
  u.displayedPokemon = [{ id: 7, variant: "normal" }];
  u.battleTeam = [{ id: 7, variant: "normal" }];
  normalizeBox(u);
  assertEqual("uid" in u.displayedPokemon[0], false, "a normal Squirtle slot with only the Leader owned gets no uid");
  assertEqual("uid" in u.battleTeam[0], false, "nor does a Ranked one");
}
{
  const u = {};
  const p30 = plain(u, 30);
  const { uid: leader } = grantSpecial(u, "squad-leader");
  assertEqual(copiesOf(u, 7, "normal").map((c) => c.uid), [p30], "copiesOf normal excludes the Leader");
  assertEqual(copiesOf(u, 7, "squad-leader").map((c) => c.uid), [leader], "copiesOf squad-leader is only the Leader");
  assertEqual(spareCopies(u, 7, "normal").map((c) => c.uid), [p30], "spareCopies never offers the Leader, even with the lowest EXP");
  assertEqual(canFeed(u, { from: leader, to: p30 }).code, "special", "the Leader can't be fed");
  assertEqual(canFeed(u, { from: p30, to: leader }).code, "special", "nothing can be fed to the Leader");
  let threw = false;
  try { adoptCopy(u, { rec: u.box[leader] }); } catch { threw = true; }
  assertTrue(threw, "adoptCopy refuses a Special record (a Gift never carries one)");
}

finish();
