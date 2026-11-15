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

const LEADER_STATS = { hp: 66, atk: 72, def: 97, spa: 75, spd: 96, spe: 64 };

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

finish();
