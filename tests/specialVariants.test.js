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
import { canRemoveCopies, removeCopies, canTransformCopy, createTrainedCopy, normalizeCustomPokemon } from "../services/ownership.js";
import { donateOne, bulkDonate } from "../utils/bulkDonate.js";
import { giftPokemon } from "../commands/gift.js";
import { teachOptions, teachTm } from "../services/tmTeaching.js";
import { isOnTeam } from "../services/box.js";
import { readFileSync } from "fs";
import { normalizeTeam } from "../utils/teamNormalize.js";
import { prepareTeamSelection, normalizeDisplayedTeam } from "../services/megaTeam.js";
import * as battleTeam from "../services/battleTeam.js";
import { prepareShowcaseSelection, normalizeShowcase } from "../services/showcaseTeam.js";
import { parseTeamCopy, applyTeamCopy } from "../services/teamCopy.js";
import { normalizeEquipment, teamSlots } from "../services/heldItems.js";

const pokemonData = JSON.parse(readFileSync(new URL("../pokemonData.json", import.meta.url), "utf8"));
const economy = {
  ccByTier: { common: 250, uncommon: 500, rare: 1000, epic: 2500, legendary: 5000, mythic: 10000 },
  shinyDustByTier: { common: 4, uncommon: 7, rare: 12, epic: 18, legendary: 22, mythic: 30 },
  normalDustChanceByTier: { common: [{ chance: 1, dust: 1 }] },
  normalDustWeeklyCap: 8,
  rollDust: () => 0,
};
/** 2 plain Squirtle (Lv 5, Lv 30) and the Leader (Lv 25). */
function squad() {
  const u = { cc: 0 };
  const p5 = plain(u, 5);
  const p30 = plain(u, 30);
  const leader = grantSpecial(u, "squad-leader").uid;
  return { u, p5, p30, leader };
}

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

section("protections");
{
  const { u, leader } = squad();
  const r = donateOne({ user: u, pokeId: 7, variant: "normal", pokemonData, economy, isOnTeam, uid: leader });
  assertEqual(r.code ?? r.reason ?? r.error, "special", "donating the Leader by uid is refused as special");
  assertTrue(!!u.box[leader], "the Leader is still owned");
  assertEqual(canRemoveCopies(u, { id: 7, variant: "squad-leader", n: 1 }).code, "special", "removing the Special variant is refused");
  const admin = removeCopies(u, { id: 7, variant: "squad-leader", n: 1, uids: [leader], allowTeam: true });
  assertTrue(admin.ok && !u.box[leader], "admin tools can still remove the Leader");
}
{
  const { u, p5, p30, leader } = squad();
  const res = bulkDonate({ user: u, mode: "duplicates", items: [{ pokeId: 7, variant: "normal", count: 1 }], pokemonData, economy, isOnTeam });
  assertTrue(!!u.box[leader], "bulk donate duplicates keeps the Leader");
  assertTrue(!u.box[p5] && !!u.box[p30], "bulk donate duplicates takes the Lv 5 plain copy and keeps the best");
  assertTrue(res.ok !== false, "bulk donate succeeded");
}
{
  const { u, p30, leader } = squad();
  const evolve = canTransformCopy(u, { from: { id: 7, variant: "normal" }, to: { id: 8, variant: "normal" } });
  assertEqual(evolve.uid, p30, "evolving with no copy named takes the Lv 30 plain copy, never the Leader");
  assertEqual(canTransformCopy(u, { from: { id: 7, variant: "normal" }, to: { id: 8, variant: "normal" }, uid: leader }).code, "special", "evolving the Leader by uid is refused");
  assertEqual(canTransformCopy(u, { from: { id: 7, variant: "squad-leader" }, to: { id: 8, variant: "squad-leader" } }).code, "special", "evolving the Special variant is refused");
  const shiny = canTransformCopy(u, { from: { id: 7, variant: "normal" }, to: { id: 7, variant: "shiny" } });
  assertEqual(shiny.uid, p30, "making one shiny with no copy named takes a plain copy");
  assertEqual(canTransformCopy(u, { from: { id: 7, variant: "normal" }, to: { id: 7, variant: "shiny" }, uid: leader }).code, "special", "making the Leader shiny is refused");
}
{
  // Only the Leader owned, no copy named: say why, not "you don't own that Pokémon".
  const u = { cc: 0 };
  grantSpecial(u, "squad-leader");
  const evolve = canTransformCopy(u, { from: { id: 7, variant: "normal" }, to: { id: 8, variant: "normal" } });
  assertEqual([evolve.code, /kept for good/.test(evolve.error)], ["special", true], "evolving Squirtle with only the Leader says it's kept for good");
  const shiny = canTransformCopy(u, { from: { id: 7, variant: "normal" }, to: { id: 7, variant: "shiny" } });
  assertEqual(shiny.code, "special", "making Squirtle shiny with only the Leader says it's kept for good");
  assertEqual(canTransformCopy(u, { from: { id: 4, variant: "normal" }, to: { id: 5, variant: "normal" } }).code, "not_owned", "an unowned species is still not_owned");
}
{
  const sender = { cc: 0 };
  grantSpecial(sender, "squad-leader");
  const recipient = { cc: 0 };
  const g = giftPokemon(sender, recipient, "7", "Squirtle", 1);
  assertTrue(g?.ok === false || typeof g === "string", "gifting Squirtle with only the Leader owned is refused");
  assertTrue(/Squirtle Squad Leader is kept for good/.test(g), "the refusal names the Leader, not the last-copy rule");
  // With the Leader and a shiny, the derived normal count (1) covers the
  // amount, so only the kept-for-good check can explain the refusal.
  assertEqual(Object.keys(sender.box).length, 1, "the sender keeps the Leader");
  addCopy(sender, 7, "shiny");
  const g2 = giftPokemon(sender, recipient, "7", "Squirtle", 1);
  assertTrue(/Squirtle Squad Leader is kept for good/.test(g2) && !/TM-trained/.test(g2), "with a shiny owned, the refusal still names the Leader");
  assertEqual(Object.keys(sender.box).length, 2, "the sender keeps the Leader and the shiny");
  const s2 = { cc: 0 };
  plain(s2, 12);
  grantSpecial(s2, "squad-leader");
  const r2 = { cc: 0 };
  giftPokemon(s2, r2, "7", "Squirtle", 1);
  const got = Object.values(r2.box ?? {});
  assertEqual(got.length, 1, "with a plain copy owned, one Squirtle is gifted");
  assertEqual(got[0]?.variant, undefined, "the gifted copy is a plain Squirtle, not the Leader");
  assertEqual(Object.values(s2.box).map((r) => r.variant), ["squad-leader"], "the sender keeps the Leader");
}
{
  const { u, leader } = squad();
  const t = createTrainedCopy(u, 7, "squad-leader", 1, leader);
  assertTrue(t.ok && u.customPokemon[leader]?.variant === "squad-leader", "the Leader can become a TM-trained copy");
  normalizeCustomPokemon(u);
  assertEqual(u.customPokemon?.[leader]?.variant, "squad-leader", "normalizeCustomPokemon keeps a trained Leader record");
  normalizeBox(u);
  assertEqual(u.box[leader]?.variant, "squad-leader", "the trained Leader's box record keeps its Special variant");
}
{
  // A player who owns only the Leader: its copy counts under normal, so a
  // normal-or-shiny coercion would find no copy to teach.
  const u = { cc: 0 };
  const leader = grantSpecial(u, "squad-leader").uid;
  const env = { TM_ENABLED: "1" };
  const o = teachOptions(u, { speciesId: 7, variant: "squad-leader" }, { env });
  assertEqual([o.ok, o.variant], [true, "squad-leader"], "TM options open for the Leader's own Variant");
  assertEqual(o.targets.map((t) => t.count), [1], "the untrained Leader is the one copy to teach");
  createTrainedCopy(u, 7, "squad-leader", 1, leader);
  const o2 = teachOptions(u, { speciesId: 7, variant: "squad-leader" }, { env });
  assertEqual(o2.targets.map((t) => t.uid), [leader], "once trained, the Leader is listed by its uid");
  const n = teachOptions(u, { speciesId: 7, variant: "normal" }, { env });
  assertEqual(n.targets?.length ?? 0, 0, "plain Squirtle options never list the Leader");
}
{
  // A real TM teach to the Leader by uid (Ice Beam: TM-compatible, not one of its extra moves).
  const u = { cc: 0, items: { tm_icebeam: 1 } };
  const leader = grantSpecial(u, "squad-leader").uid;
  const r = teachTm(u, { item: "tm_icebeam", pokeId: 7, variant: "squad-leader", uid: leader, expect: {}, equip: {} }, { env: { TM_ENABLED: "1" } });
  assertTrue(r.ok && r.uid === leader, "a TM is taught to the Leader named by uid");
  assertEqual([u.customPokemon?.[leader]?.variant, u.customPokemon?.[leader]?.tmMoves, u.items.tm_icebeam], ["squad-leader", ["icebeam"], 0], "the trained Leader keeps its Special variant; the TM is spent");
  normalizeCustomPokemon(u);
  normalizeBox(u);
  assertEqual([u.customPokemon?.[leader]?.variant, u.box[leader]?.variant], ["squad-leader", "squad-leader"], "normalizing keeps the trained Leader as the Leader");
}

section("teams");
{
  const slots = normalizeTeam([{ id: 7, variant: "normal" }, { id: 7, variant: "squad-leader" }]);
  assertEqual(slots.map((s) => s.variant), ["normal", "squad-leader"], "a team holds plain Squirtle and the Leader as two slots");
}
{
  const { u, p30, leader } = squad();
  const casual = prepareTeamSelection(u, [{ id: 7, variant: "normal", uid: p30 }, { id: 7, variant: "squad-leader", uid: leader }]);
  assertTrue(casual.ok, "a Casual team with the Leader saves");
  assertEqual(casual.team?.map((s) => [s.variant, s.uid]), [["normal", p30], ["squad-leader", leader]], "the Casual team keeps the Leader's uid");
  assertEqual(prepareTeamSelection(u, [{ id: 7, variant: "normal", uid: leader }]).code, "unknown_copy", "a plain Squirtle slot can't name the Leader");

  const show = prepareShowcaseSelection(u, [{ id: 7, variant: "squad-leader", uid: leader }, { id: 7, variant: "normal" }]);
  assertTrue(show.ok, "a Showcase with the Leader saves");
  assertEqual(show.team?.[0]?.uid, leader, "the Showcase keeps the Leader's uid");
  assertTrue(show.team?.[1]?.uid && show.team[1].uid !== leader, "a plain Squirtle Showcase slot gets a plain copy");
  assertEqual(prepareShowcaseSelection(u, [{ id: 7, variant: "normal", uid: leader }]).code, "unknown_copy", "a plain Showcase slot can't name the Leader");

  const ranked = battleTeam.prepareBattleTeamSelection(u, [{ id: 7, variant: "normal", uid: p30 }, { id: 7, variant: "squad-leader", uid: leader }]);
  assertEqual([ranked.code, ranked.error], ["special_ranked", "The Squirtle Squad Leader can't join the Ranked team."], "a Ranked team with the Leader is refused");
}
{
  // Load-time: a stored Ranked team holding the Leader loses that slot; the Casual team keeps it.
  const { u, p30, leader } = squad();
  const both = () => [{ id: 7, variant: "normal", uid: p30 }, { id: 7, variant: "squad-leader", uid: leader }];
  u.displayedPokemon = both();
  u.battleTeam = both();
  battleTeam.normalizeBattleTeam(u);
  assertEqual(u.battleTeam.map((s) => s.uid), [p30], "load-time trim drops Special slots from battleTeam");
  normalizeDisplayedTeam(u);
  assertEqual(u.displayedPokemon.map((s) => [s.variant, s.uid]), [["normal", p30], ["squad-leader", leader]], "the Casual team keeps the Leader at load");
  u.battleTeam = both();
  assertEqual([battleTeam.trimSpecialFromBattleTeam?.(u), battleTeam.trimSpecialFromBattleTeam?.(u)], [true, false], "trimSpecialFromBattleTeam reports a change once");
}
{
  // Ghost-slot filter: only the Leader owned (its count sits under normal).
  const u = { cc: 0 };
  const leader = grantSpecial(u, "squad-leader").uid;
  u.displayedPokemon = [{ id: 7, variant: "squad-leader", uid: leader }];
  u.showcaseTeam = [{ id: 7, variant: "squad-leader", uid: leader }];
  normalizeDisplayedTeam(u);
  assertEqual(u.displayedPokemon.map((s) => [s.variant, s.uid]), [["squad-leader", leader]], "the ghost-slot filter keeps a Leader-only slot");
  normalizeBox(u);
  assertEqual(u.displayedPokemon.map((s) => s.uid), [leader], "normalizeBox keeps the slot on the Leader");
  normalizeShowcase(u);
  assertEqual(u.showcaseTeam.map((s) => [s.variant, s.uid]), [["squad-leader", leader]], "the Showcase keeps a Leader-only slot");
}
{
  const parsed = parseTeamCopy({ copyFrom: "display", copiedKeys: ["7:squad-leader"] }, "battle");
  assertTrue(parsed.ok && parsed.copy?.keys?.[0] === "7:squad-leader", "teamCopy accepts a Special variant key");
  const { u, p30, leader } = squad();
  const done = applyTeamCopy(u, { from: "battle", to: "display", keys: ["7:squad-leader"] }, [{ id: 7, variant: "normal", uid: p30 }, { id: 7, variant: "squad-leader", uid: leader }]);
  assertEqual(done, ["7:squad-leader"], "a copied Leader key matches the Leader's slot");
}
{
  const { u, p30, leader } = squad();
  u.items = { leftovers: 1 };
  u.displayedPokemon = [{ id: 7, variant: "normal", uid: p30 }, { id: 7, variant: "squad-leader", uid: leader }];
  u.equipment = { rev: 0, teams: { display: { [`u:${leader}`]: "leftovers" } } };
  assertEqual(teamSlots(u, "display").map((s) => s.variant), ["normal", "squad-leader"], "held-item team slots keep the Leader beside plain Squirtle");
  normalizeEquipment(u);
  assertEqual(u.equipment?.teams?.display?.[`u:${leader}`], "leftovers", "a held item on the Leader survives normalizeEquipment");
}

finish();
