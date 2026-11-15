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
import { readFileSync, existsSync } from "fs";
import { normalizeTeam } from "../utils/teamNormalize.js";
import { prepareTeamSelection, normalizeDisplayedTeam } from "../services/megaTeam.js";
import * as battleTeam from "../services/battleTeam.js";
import { prepareShowcaseSelection, normalizeShowcase } from "../services/showcaseTeam.js";
import { parseTeamCopy, applyTeamCopy } from "../services/teamCopy.js";
import { normalizeEquipment, teamSlots } from "../services/heldItems.js";
import { buildTeam, withoutMegaStats, withMegaStats } from "../utils/battle/runBattle.js";
import { buildMon } from "../utils/battle/sim.js";
import { computeStats } from "../utils/battle/stats.js";
import { learnableMoves, chosenMoves, saveMoveset } from "../services/movesets.js";
import * as battleRender from "../utils/battle/render.js";
import { runChallenge } from "../utils/challenge/runChallenge.js";
import { createNewUser } from "../utils/userSchema.js";
import { expMembers } from "../utils/render/expCard.js";
import { GifReader } from "omggif";
import { spriteFileFor, loadStaticSprite } from "../utils/render/sprites.js";
import { pokemonSpritePath } from "../utils/sprites.js";
import { flattenTrainerSprites } from "../utils/dataLoader.js";
import { slotView, buildShowcaseView } from "../utils/render/teamView.js";
import { pokemonDetail } from "../services/pokemonDetail.js";
import { sightingView } from "../utils/render/catchCard.js";
import * as copyRowsModule from "../services/copyRows.js";
import { duplicateRows, multiSelectBlock } from "../public/picker-pokemon/bulkRules.js";
import { copiesOf as dashboardCopiesOf, trainedCopies as dashboardTrained } from "../public/picker-pokemon/copyChoice.js";
import { pokemonSprite as recordSprite } from "../public/battlerecords/records.js";
import * as publicSprites from "../public/spriteconfig.js";
import { levelsForUser } from "../utils/training.js";
import { powersFromLevels } from "../utils/battle/power.js";
import * as adminChanges from "../services/adminChanges.js";
import { validateMoveset } from "../services/movesets.js";

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

section("battle");
{
  const { u, p30, leader } = squad();
  u.displayedPokemon = [{ id: 7, variant: "squad-leader", uid: leader }, { id: 7, variant: "normal", uid: p30 }];
  const team = buildTeam(u, { env: {} });
  const m = team[0];
  assertEqual([m?.speciesId, m?.variant, m?.name, m?.level, m?.copyUid], [7, "squad-leader", "Squirtle Squad Leader", 25, leader], "buildTeam builds the Leader as itself");
  assertEqual(m?.battleProfile?.baseStats, LEADER_STATS, "the Leader fights with its catalog base stats");
  assertEqual(buildMon(m).atk, computeStats(LEADER_STATS, 25).atk, "buildMon uses the Leader's stats");
  assertEqual(team[1]?.battleProfile, undefined, "plain Squirtle has no battle profile");
  const saved = withoutMegaStats(team);
  assertEqual(withMegaStats(saved)[0]?.battleProfile?.baseStats, LEADER_STATS, "withMegaStats restores the Leader's profile on a saved team");
}
{
  const u = { cc: 0 };
  const leader = grantSpecial(u, "squad-leader").uid;
  u.displayedPokemon = [{ id: 7, variant: "squad-leader", uid: leader }];
  assertEqual(buildTeam(u, { env: {} }).map((m) => m.copyUid), [leader], "buildTeam keeps a Leader-only team");
}
{
  const { u, p30, leader } = squad();
  const ids = (list) => list.map((x) => x.id);
  const leaderMoves = learnableMoves(u, 7, "squad-leader", { uid: leader });
  assertEqual(leaderMoves.filter((x) => x.source === "special").map((x) => x.id).sort(), ["aquajet", "surf"], "the Leader can learn Aqua Jet and Surf");
  const plainMoves = learnableMoves(u, 7, "normal", { uid: p30 });
  assertTrue(!plainMoves.some((x) => x.source === "special") && !ids(plainMoves).includes("aquajet"), "a plain Squirtle never gets the Leader's moves");
  const first = getSpecies(7).levelMoves[0][1];
  const saved = saveMoveset(u, { team: "display", pokeId: 7, variant: "squad-leader", moves: ["surf", first], uid: leader });
  assertTrue(saved.ok, "a moveset with Surf saves for the Leader");
  assertEqual(chosenMoves(u, "display", 7, "squad-leader", { uid: leader }), ["surf", first], "chosenMoves keeps Surf for the Leader");
  assertEqual(saveMoveset(u, { team: "display", pokeId: 7, variant: "normal", moves: ["surf"], uid: p30 }).code, "not_learned", "a plain Squirtle can't equip Surf");
}
{
  const ref = battleRender.spriteRef;
  assertEqual(ref?.({ speciesId: 7, variant: "squad-leader" }, false), { dir: "special/grayscale", file: "squad-leader" }, "special fainted sprite path");
  assertEqual(ref?.({ speciesId: 7, variant: "squad-leader" }, true), { dir: "special/normal", file: "squad-leader" }, "special live sprite path");
  assertEqual(ref?.({ speciesId: 7, variant: "squad-member" }, true), { dir: "special/normal", file: "squad-member" }, "a Squad member foe uses its own look");
  assertEqual(ref?.({ speciesId: 7, variant: "squad-member" }, false), { dir: "special/grayscale", file: "squad-member" }, "a fainted Squad member is grayscale");
  assertEqual(ref?.({ speciesId: 7, variant: "shiny" }, true), { dir: "shiny", file: 7 }, "a shiny member keeps its folder");
  assertEqual(ref?.({ speciesId: 7, variant: "normal" }, false), { dir: "grayscale", file: 7 }, "a fainted plain member is grayscale");
  assertEqual(ref?.({ speciesId: 9, variant: "normal", megaForm: "blastoise-mega" }, true), { dir: "mega/normal", file: "blastoise-mega" }, "a Mega keeps its Mega sprite path");
}
{
  // Challenges: the Leader on the Casual team earns EXP like any member.
  const u = createNewUser("A", "Trainer A");
  const leader = grantSpecial(u, "squad-leader").uid;
  u.displayedPokemon = [{ id: 7, variant: "squad-leader", uid: leader }];
  const before = u.box[leader].exp;
  const r = runChallenge({ trainerData: { A: u }, userId: "A", key: "brock", seed: 1, now: new Date("2026-11-09T12:00:00Z") });
  assertTrue(r.ok, "the Leader can take on a Challenge");
  assertTrue(u.box[leader].exp > before, "the Leader earns Challenge EXP");
}
{
  const { u } = squad();
  const [row] = expMembers([{ key: "7:squad-leader", name: "Squirtle Squad Leader", fromLevel: 25, toLevel: 26, gained: 100 }], u);
  assertEqual([row.name, row.variant, row.shiny, typeof row.expFrac], ["Squirtle Squad Leader", "squad-leader", false, "number"], "the EXP card shows the Leader by name with its own EXP bar");
}

section("sprites");
{
  const P = (rel) => new URL(`../${rel}`, import.meta.url);
  const gifs = ["normal", "grayscale"].flatMap((f) => ["squad-leader", "squad-member"].map((k) => `public/sprites/pokemon/special/${f}/${k}.gif`));
  const files = [...gifs, "public/sprites/trainers_2/squirtlesquadleader.png"];
  assertEqual(files.filter((f) => !existsSync(P(f))), [], "the Special sprites and the Squad's trainer sprite are installed");
  for (const f of gifs.filter((g) => existsSync(P(g)))) {
    const r = new GifReader(readFileSync(P(f)));
    const frames = [...Array(r.numFrames()).keys()];
    assertTrue(frames.length > 1 && frames.every((i) => r.frameInfo(i).disposal !== 3), `${f} is animated and uses no GIF disposal 3`);
    if (f.includes("/grayscale/")) {
      const px = new Uint8Array(r.width * r.height * 4);
      r.decodeAndBlitFrameRGBA(0, px);
      let gray = true;
      for (let i = 0; i < px.length; i += 4) if (px[i + 3] && (px[i] !== px[i + 1] || px[i + 1] !== px[i + 2])) { gray = false; break; }
      assertTrue(gray, `${f} is grayscale`);
    }
  }
  assertTrue(spriteFileFor(7, "squad-leader")?.endsWith("special/normal/squad-leader.gif"), "spriteFileFor finds the Leader's sprite");
  assertEqual(pokemonSpritePath(7, "squad-leader"), "/public/sprites/pokemon/special/normal/squad-leader.gif", "pokemonSpritePath finds the Leader's sprite");
  assertTrue((await loadStaticSprite(7, "squad-leader")) != null, "loadStaticSprite loads the Leader's sprite, not the placeholder");
  const catalog = JSON.parse(readFileSync(P("trainerSprites.json"), "utf8"));
  assertTrue(!JSON.stringify(catalog).toLowerCase().includes("squirtlesquadleader"), "the Squad's trainer sprite is not in trainerSprites.json");
  assertTrue(!JSON.stringify(flattenTrainerSprites(catalog)).toLowerCase().includes("squirtlesquadleader"), "nor among the trainer sprites anyone can own");
}
{
  const { u, p5, p30, leader } = squad();
  const v = slotView(u, { speciesId: 7, variant: "squad-leader", level: 25, copyUid: leader }, 0);
  assertEqual([v.name, v.variant, v.stats], ["Squirtle Squad Leader", "squad-leader", computeStats(LEADER_STATS, 25)], "slotView names the Leader and shows its stats");
  u.showcaseTeam = [{ id: 7, variant: "squad-leader", uid: leader }];
  assertEqual(buildShowcaseView(u).slots.map((s) => [s.name, s.variant]), [["Squirtle Squad Leader", "squad-leader"]], "the Showcase image shows the Leader");

  const { body } = pokemonDetail(u, 7);
  assertEqual([body.owned.normal, body.owned["squad-leader"]], [2, 1], "the detail counts the Leader apart from plain Squirtle");
  const L = body.copies["squad-leader"];
  assertEqual([L?.count, L?.name, L?.sprite, L?.level, L?.stats], [1, "Squirtle Squad Leader", "/public/sprites/pokemon/special/normal/squad-leader.gif", 25, computeStats(LEADER_STATS, 25)], "the Leader is its own entry with its name, sprite and stats at its Level");
  assertEqual(L?.stats50, computeStats(LEADER_STATS, 50), "the Leader's Lv 50 stats use its own base stats");
  assertEqual([body.copies.normal.count, body.copies.normal.each.map((c) => c.uid).sort()], [2, [p5, p30].sort()], "plain Squirtle's entry lists only plain copies");
  assertTrue(L?.learnable?.some((m) => m.id === "surf" && m.source === "special"), "the Leader's entry lists its own moves");
}
{
  const s = sightingView({ id: 7, variant: "squad-leader" });
  assertEqual([s.name, s.variant, s.shiny], ["Squirtle Squad Leader", "squad-leader", false], "a broadcast sighting card shows the Leader");
}

section("dashboard");
{
  const rowsOf = (u) => copyRowsModule.copyRows?.(u) ?? [];
  const { u, p5, p30, leader } = squad();
  u.displayedPokemon = [{ id: 7, variant: "squad-leader", uid: leader }];
  normalizeBox(u);
  const rows = rowsOf(u);
  const byUid = Object.fromEntries(rows.map((r) => [r[0], r]));
  assertEqual(byUid[leader]?.slice(1, 9), [7, 0, 25, u.box[leader].at ?? 0, 0, 1, u.box[leader].exp, "squad-leader"], "the Leader's copy row: index 8 is its Special variant");
  assertEqual([byUid[p5]?.[8], byUid[p30]?.[8], byUid[p30]?.length], [null, null, 9], "plain rows carry null at index 8");

  const pokemonData = JSON.parse(readFileSync(new URL("../pokemonData.json", import.meta.url), "utf8"));
  const dupes = duplicateRows(u.pokemon, pokemonData, {}, rows);
  assertEqual(dupes.map((d) => [d.pokeId, d.variant, d.uids]), [[7, "normal", [p5]]], "Donate Duplicates keeps the best plain Squirtle and never offers the Leader");
  const v = { cc: 0 };
  plain(v, 5);
  grantSpecial(v, "squad-leader");
  normalizeBox(v);
  assertEqual(duplicateRows(v.pokemon, pokemonData, {}, rowsOf(v)), [], "a plain Squirtle beside the Leader is not a duplicate");
  const w = { cc: 0 };
  grantSpecial(w, "squad-leader");
  normalizeBox(w);
  const ms = (x) => multiSelectBlock(7, { pokemon: x.pokemon, pokemonData, savedTeam: [], trained: {}, copies: rowsOf(x) });
  assertEqual(ms(w)?.title, "🔒 Kept for Good", "Multi-select can't take the Leader");
  assertEqual(ms(v), null, "with a plain Squirtle beside it, Multi-select can take the plain one");

  const data = { copies: rows, trained: { [`7:squad-leader`]: [{ uid: leader, rev: 1, tmMoves: [] }] } };
  assertEqual(dashboardCopiesOf(data, 7, "normal").map((c) => c.uid).sort(), [p5, p30].sort(), "the copy chooser's plain Squirtle never lists the Leader");
  assertEqual(dashboardCopiesOf(data, 7, "squad-leader").map((c) => c.uid), [leader], "the Leader is its own line in the chooser");
  assertEqual(dashboardTrained(data, 7, "squad-leader").map((c) => c.uid), [leader], "trained copies are read under the Leader's key");

  const levels = levelsForUser(u);
  assertEqual([levels["7:normal"], levels["7:squad-leader"]], [30, 25], "levels list the Leader's line apart from plain Squirtle");
  const s25 = computeStats(LEADER_STATS, 25);
  assertEqual(powersFromLevels({ "7:squad-leader": 25 })["7:squad-leader"], s25.hp + s25.atk + s25.def + s25.spa + s25.spd + s25.spe, "the Leader's Power uses its own stats");
}
{
  assertEqual(recordSprite({ speciesId: 7, variant: "squad-leader" }), "/public/sprites/pokemon/special/normal/squad-leader.gif", "Battle Records show the Leader's sprite");
  assertEqual(recordSprite({ speciesId: 7, variant: "squad-member" }), "/public/sprites/pokemon/special/normal/squad-member.gif", "and a Squad member's look");
  assertEqual(recordSprite({ speciesId: 7, variant: "shiny" }), "/public/sprites/pokemon/shiny/7.gif", "other sprites are unchanged");
  const names = Object.fromEntries(Object.entries(SPECIAL_VARIANTS).map(([k, e]) => [k, e.name]));
  assertEqual(publicSprites.SPECIAL_NAMES, names, "the dashboard's Special variant names match the catalog");
  assertEqual(publicSprites.specialSprite?.("squad-leader", "grayscale"), "/public/sprites/pokemon/special/grayscale/squad-leader.gif", "specialSprite builds the grayscale path");
  assertEqual([publicSprites.rowVariant?.(["c", 7, 0, 1, 0, 0, 0, 0, "squad-leader"]), publicSprites.rowVariant?.(["c", 7, 1, 1, 0, 0, 0, 0, null]), publicSprites.rowVariant?.(["c", 7, 0, 1, 0, 0, 0, 0])], ["squad-leader", "shiny", "normal"], "rowVariant reads a copy row's Variant (older 8-field rows too)");
}

section("final review");
{
  // A Leader-only player never owns a plain Squirtle: no ghost slot, team save or moveset.
  const u = {};
  grantSpecial(u, "squad-leader");
  normalizeBox(u);
  u.displayedPokemon = [{ id: 7, variant: "normal" }];
  u.battleTeam = [{ id: 7, variant: "normal" }];
  normalizeDisplayedTeam(u);
  battleTeam.normalizeBattleTeam(u);
  assertEqual([u.displayedPokemon, u.battleTeam], [[], []], "a plain Squirtle slot with only the Leader owned is removed at load");
  assertEqual(battleTeam.prepareBattleTeamSelection(u, [{ id: 7, variant: "normal" }]).code, "unowned", "a Ranked save of a plain Squirtle the player doesn't own is refused");
  assertEqual(prepareTeamSelection(u, [{ id: 7, variant: "normal" }]).code, "unowned", "so is a Casual save");
  assertEqual(buildTeam(u, { env: {}, team: [{ id: 7, variant: "normal" }] }), [], "buildTeam fields no plain Squirtle");
  assertEqual(validateMoveset(u, 7, "normal", [getSpecies(7).levelMoves[0][1]]).code, "unowned", "and no plain Squirtle moveset saves");
}
{
  // Rollback round trip: what the previous release leaves behind (it reads every Variant but shiny as normal).
  // 1. Its shared training record follows its best "normal" copy, the Leader: no free EXP for a plain copy.
  const u = { cc: 0 };
  const p10 = plain(u, 10);
  const { uid: leader } = grantSpecial(u, "squad-leader");
  u.box[leader].exp = expForLevel(80);
  u.training["7:normal"] = { exp: expForLevel(80) };
  normalizeBox(u);
  assertEqual([u.box[p10].exp, u.box[leader].exp], [expForLevel(10), expForLevel(80)], "a rollback's shared Level never lifts a plain copy to the Leader's EXP");
}
{
  // 2. It saves the Leader's slot as { variant: "normal", uid: <Leader> }: Casual and Showcase get the Leader back, Ranked doesn't.
  const { u, p30, leader } = squad();
  const coerced = () => [{ id: 7, variant: "normal", uid: leader }];
  u.displayedPokemon = coerced();
  u.showcaseTeam = coerced();
  u.battleTeam = coerced();
  normalizeDisplayedTeam(u);
  battleTeam.normalizeBattleTeam(u);
  normalizeBox(u);
  normalizeShowcase(u);
  assertEqual(u.displayedPokemon.map((s) => [s.variant, s.uid]), [["squad-leader", leader]], "the Casual team gets the Leader back after a rollback");
  assertEqual(u.showcaseTeam.map((s) => [s.variant, s.uid]), [["squad-leader", leader]], "so does the Showcase");
  assertEqual(u.battleTeam.map((s) => [s.variant, s.uid]), [["normal", p30]], "the Ranked slot becomes a plain Squirtle");
  const only = {};
  const { uid: solo } = grantSpecial(only, "squad-leader");
  only.displayedPokemon = [{ id: 7, variant: "normal", uid: solo }];
  only.battleTeam = [{ id: 7, variant: "normal", uid: solo }];
  normalizeDisplayedTeam(only);
  battleTeam.normalizeBattleTeam(only);
  normalizeBox(only);
  assertEqual([only.displayedPokemon.map((s) => [s.variant, s.uid]), only.battleTeam], [[["squad-leader", solo]], []], "Leader only: back on the Casual team, off the Ranked team");
}
{
  // 3. A shiny craft of the Leader there leaves { variant, shiny: true }: a plain shiny Squirtle now, never a second copy.
  const u = { cc: 0, pokemon: { 7: { normal: 0, shiny: 1 } } };
  u.box = { c_AAAAAAAAAA: { id: 7, variant: "squad-leader", shiny: true, exp: expForLevel(25) } };
  normalizeBox(u);
  assertEqual([Object.keys(u.box).length, u.box.c_AAAAAAAAAA?.shiny, "variant" in (u.box.c_AAAAAAAAAA ?? {}), u.pokemon[7]?.shiny], [1, true, false, 1], "a Leader crafted shiny under the previous release is one shiny Squirtle");
  // 4. An evolution there leaves { id: 8, variant }: a plain Wartortle, and a win can grant a new Leader.
  const w = { cc: 0, pokemon: { 8: { normal: 1, shiny: 0 } } };
  w.box = { c_BBBBBBBBBB: { id: 8, variant: "squad-leader", exp: expForLevel(25) } };
  normalizeBox(w);
  assertEqual(["variant" in w.box.c_BBBBBBBBBB, Object.keys(w.box).length], [false, 1], "a Leader evolved under the previous release is a plain Wartortle");
  assertEqual(grantSpecial(w, "squad-leader").granted, true, "and the player can win a Leader again");
}
{
  // Admin tools can remove the Leader (spec), never grant it.
  const { u, leader } = squad();
  u.displayedPokemon = [{ id: 7, variant: "squad-leader", uid: leader }];
  const parsed = adminChanges.parseChange({ kind: "pokemon", op: "remove", speciesId: 7, variant: "squad-leader", amount: 1 });
  assertEqual(parsed.change?.variant, "squad-leader", "an admin removal can name the Leader");
  const r = adminChanges.applyChange(u, parsed.change);
  assertTrue(r.ok && !u.box[leader], "the admin removal takes the Leader");
  assertEqual([u.displayedPokemon.length, u.pokemon[7]?.normal], [0, 2], "its Casual slot clears; both plain Squirtle stay");
  assertTrue(/Squirtle Squad Leader/.test(r.summary ?? ""), "the summary names the Leader");
  assertEqual(adminChanges.parseChange({ kind: "pokemon", op: "add", speciesId: 7, variant: "squad-leader", amount: 1 }).ok, false, "an admin can't grant a Special variant");
  const only = {};
  grantSpecial(only, "squad-leader");
  normalizeBox(only);
  const plainRemove = adminChanges.applyChange(only, adminChanges.parseChange({ kind: "pokemon", op: "remove", speciesId: 7, variant: "normal", amount: 1 }).change);
  assertTrue(!plainRemove.ok && /They have 0/.test(plainRemove.error), "removing a plain Squirtle from a Leader-only player says they have none");
  const rows = adminChanges.pokemonRows?.(squad().u) ?? [];
  assertEqual(rows.map((x) => [x.variant, x.name, x.count, x.copies.length]), [["normal", "Squirtle", 2, 2], ["squad-leader", "Squirtle Squad Leader", 1, 1]], "the admin player view lists the Leader on its own row");
}

finish();
