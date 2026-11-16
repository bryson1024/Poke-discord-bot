// ==========================================================
// tests/kyuremFusion.test.js — Black/White Kyurem (utils/fusions.js,
// services/fusionTeam.js): unlock by ownership, the team rule, storage
// clean-up with a notice, battle profile (fail-closed), sprites, Showdown set.
// Synthetic players only.
// ==========================================================

import fs from "fs";
import { assertTrue, assertEqual, section, finish } from "./harness.js";

const F = await import("../utils/fusions.js");
const { prepareTeamSelection, normalizeDisplayedTeam } = await import("../services/megaTeam.js");
const { prepareBattleTeamSelection, normalizeBattleTeam } = await import("../services/battleTeam.js");
const { prepareShowcaseSelection } = await import("../services/showcaseTeam.js");
const { fusionView } = await import("../services/fusionTeam.js");
const { buildTeam, buildBattleTeam, withMegaStats, withoutMegaStats } = await import("../utils/battle/runBattle.js");
const { memberSet } = await import("../utils/battle/showdown/sets.js");
const { buildMon } = await import("../utils/battle/sim.js");
const { spriteFileFor } = await import("../utils/render/sprites.js");
const { getAbility } = await import("../utils/battle/abilities.js");
const { normalizeTeam } = await import("../utils/teamNormalize.js");
const { normalizeBox } = await import("../services/box.js");

const ON = { KYUREM_FUSION_ENABLED: "1" };
const OFF = {};
const clone = (o) => JSON.parse(JSON.stringify(o));
// 646 Kyurem (normal + shiny), 644 Zekrom, 643 Reshiram, 6 Charizard, 25 Pikachu.
const player = (extra = {}) => ({
  id: "400000000000000646",
  name: "Fusion Tester",
  pokemon: { 646: { normal: 1, shiny: 1 }, 644: { normal: 1, shiny: 0 }, 6: { normal: 1, shiny: 0 }, 25: { normal: 1, shiny: 0 }, ...extra },
  displayedPokemon: [{ id: 6, variant: "normal" }],
});
const BLACK = { id: 646, variant: "normal", form: "kyurem-black" };

section("catalogue");
{
  assertEqual(F.fusionsOfSpecies(646).length, 2, "two Kyurem fusion forms");
  const b = F.getFusion("kyurem-black"), w = F.getFusion("kyurem-white");
  assertEqual(b.partner, 644, "Black Kyurem's partner is Zekrom");
  assertEqual(w.partner, 643, "White Kyurem's partner is Reshiram");
  assertEqual(b.baseStats.atk, 170, "Black Kyurem Atk 170 (@pkmn/dex Kyurem-Black)");
  assertEqual(w.baseStats.spa, 170, "White Kyurem SpA 170 (@pkmn/dex Kyurem-White)");
  assertEqual(b.ability, "Teravolt", "Black Kyurem: Teravolt");
  assertEqual(w.ability, "Turboblaze", "White Kyurem: Turboblaze");
  const total = (s) => Object.values(s).reduce((a, v) => a + v, 0);
  assertEqual(total(b.baseStats), 700, "Black Kyurem BST 700");
  assertEqual(total(w.baseStats), 700, "White Kyurem BST 700");
  assertTrue(getAbility("Teravolt")?.moldBreaker && getAbility("Turboblaze")?.moldBreaker, "legacy sim models both as Mold Breaker");
  for (const v of ["normal", "shiny", "grayscale"]) {
    for (const f of F.allFusions()) { // Kyurem and Necrozma forms
      const file = spriteFileFor(f.spriteId, v);
      assertTrue(file && fs.existsSync(new URL(`../public/${file}`, import.meta.url)), `${f.name} ${v} sprite exists (${file})`);
    }
  }
}

section("unlock: owning Kyurem + partner, nothing used up");
{
  const u = player();
  assertTrue(F.fusionUnlocked(u, "kyurem-black", "normal"), "Kyurem + Zekrom → Black Kyurem");
  assertTrue(F.fusionUnlocked(u, "kyurem-black", "shiny"), "shiny Kyurem + any Zekrom → shiny Black Kyurem");
  assertTrue(!F.fusionUnlocked(u, "kyurem-white", "normal"), "no Reshiram → no White Kyurem");
  const noKyurem = player({ 646: { normal: 0, shiny: 0 } });
  assertTrue(!F.fusionUnlocked(noKyurem, "kyurem-black", "normal"), "no Kyurem → nothing");
  const before = clone(u.pokemon);
  prepareTeamSelection(u, [BLACK], { env: ON });
  assertEqual(JSON.stringify(u.pokemon), JSON.stringify(before), "choosing a form uses nothing up");
  assertEqual(fusionView(u, { env: OFF }).enabled, false, "dashboard view off when switched off");
  const v = fusionView(u, { env: ON });
  assertTrue(v.enabled && v.forms.find((f) => f.id === "kyurem-black").unlocked.normal && !v.forms.find((f) => f.id === "kyurem-white").unlocked.normal, "dashboard view lists unlocked forms per line");
}

section("team save (Casual / Ranked)");
{
  const u = player({ 643: { normal: 1, shiny: 0 } });
  const off = prepareTeamSelection(u, [BLACK], { env: OFF });
  assertEqual(off.code, "fusion_disabled", "switched off → refused");
  const ok = prepareTeamSelection(u, [BLACK, { id: 6, variant: "normal" }], { env: ON });
  assertTrue(ok.ok && ok.team[0].form === "kyurem-black", "Black Kyurem saves on Casual");
  assertEqual(prepareTeamSelection(u, [{ ...BLACK, form: "kyurem-red" }], { env: ON }).code, "bad_form", "malformed form refused");
  assertEqual(prepareTeamSelection(u, [{ id: 6, variant: "normal", form: "kyurem-black" }], { env: ON }).code, "wrong_species", "form on another species refused");
  const locked = player({ 644: { normal: 0, shiny: 0 } });
  assertEqual(prepareTeamSelection(locked, [BLACK], { env: ON }).code, "fusion_locked", "partner not owned → refused");
  for (const [other, label] of [[{ id: 644, variant: "normal" }, "Zekrom"], [{ id: 643, variant: "normal" }, "Reshiram"], [{ id: 646, variant: "shiny" }, "another Kyurem"], [{ id: 646, variant: "shiny", form: "kyurem-white" }, "White Kyurem"]]) {
    const r = prepareTeamSelection(u, [BLACK, other], { env: ON });
    assertEqual(r.code, "fusion_team_rule", `Black Kyurem + ${label} refused`);
    const r2 = prepareTeamSelection(u, [other, BLACK], { env: ON });
    assertEqual(r2.code, "fusion_team_rule", `${label} + Black Kyurem refused (either order)`);
  }
  assertTrue(prepareTeamSelection(u, [{ id: 646, variant: "normal" }, { id: 644, variant: "normal" }, { id: 643, variant: "normal" }], { env: ON }).ok, "plain Kyurem + Zekrom + Reshiram still fine (no fused slot)");
  const ranked = prepareBattleTeamSelection(u, [BLACK, { id: 6, variant: "normal" }], { env: ON });
  assertTrue(ranked.ok && ranked.team[0].form === "kyurem-black", "Black Kyurem saves on Ranked");
  assertEqual(prepareBattleTeamSelection(u, [BLACK, { id: 644, variant: "normal" }], { env: ON }).code, "fusion_team_rule", "Ranked: team rule");
}

section("Showcase: forms allowed, no team rule");
{
  const u = player();
  normalizeBox(u); // Showcase slots are copies
  const r = prepareShowcaseSelection(u, [BLACK, { id: 644, variant: "normal" }], { env: ON });
  assertTrue(r.ok && r.team[0].form === "kyurem-black", "Black Kyurem beside Zekrom on the Showcase");
  assertEqual(prepareShowcaseSelection(u, [BLACK], { env: OFF }).code, "fusion_disabled", "Showcase: switched off → refused");
}

section("stored teams: form kept while unlocked, reverts with a notice");
{
  const u = player();
  u.displayedPokemon = [clone(BLACK), { id: 6, variant: "normal" }];
  u.battleTeam = [clone(BLACK)];
  normalizeDisplayedTeam(u);
  normalizeBattleTeam(u);
  assertEqual(u.displayedPokemon[0].form, "kyurem-black", "Casual keeps the form");
  assertEqual(u.battleTeam[0].form, "kyurem-black", "Ranked keeps the form");
  assertTrue(!u.notices, "no notice while unlocked");
  u.pokemon[644] = { normal: 0, shiny: 0 }; // Zekrom donated
  normalizeDisplayedTeam(u);
  normalizeBattleTeam(u);
  assertTrue(!u.displayedPokemon[0].form && u.displayedPokemon[0].id === 646, "Casual slot back to plain Kyurem");
  assertTrue(!u.battleTeam[0].form && u.battleTeam[0].id === 646, "Ranked slot back to plain Kyurem");
  assertEqual(u.notices?.filter((n) => n.kind === "fusion_revert").length, 2, "one notice per team");
  assertTrue(/Black Kyurem went back to Kyurem on your Casual team because you no longer own Zekrom/.test(u.notices[0].text), "notice names the team and the partner");
  normalizeDisplayedTeam(u);
  assertEqual(u.notices.length, 2, "idempotent: no repeat notice");
  assertEqual(normalizeTeam([{ id: 646, variant: "normal", form: "kyurem-black" }])[0].form, "kyurem-black", "normalizeTeam keeps the form");
}

section("battle: fusion stats when valid, plain Kyurem otherwise (fail-closed)");
{
  const u = player();
  u.displayedPokemon = [clone(BLACK), { id: 6, variant: "normal" }];
  const on = buildTeam(u, { env: ON });
  assertEqual(on[0].fusionForm, "kyurem-black", "fights as Black Kyurem");
  assertEqual(on[0].name, "Black Kyurem", "named Black Kyurem");
  assertEqual(on[0].baseName, "Kyurem", "baseName kept");
  assertEqual(on[0].battleProfile.baseStats.atk, 170, "Black Kyurem stats");
  assertEqual(on[0].speciesId, 646, "species stays Kyurem (EXP, Levels, ownership)");
  assertTrue(!on[0].megaForm, "not a Mega");
  const off = buildTeam(u, { env: OFF });
  assertTrue(!off[0].fusionForm && !off[0].battleProfile && off[0].name === "Kyurem", "switched off → plain Kyurem");
  const broken = player();
  broken.displayedPokemon = [clone(BLACK), { id: 644, variant: "normal" }]; // stored past the rule somehow
  const b = buildTeam(broken, { env: ON });
  assertTrue(!b[0].fusionForm, "team rule broken in storage → plain Kyurem");
  const lost = player({ 644: { normal: 0, shiny: 0 } });
  lost.displayedPokemon = [clone(BLACK)];
  assertTrue(!buildTeam(lost, { env: ON })[0].fusionForm, "partner gone → plain Kyurem");
  u.battleTeam = [{ id: 646, variant: "shiny", form: "kyurem-black" }];
  const ranked = buildBattleTeam(u, { env: ON });
  assertTrue(ranked[0].fusionForm === "kyurem-black" && ranked[0].variant === "shiny" && ranked[0].level === 50, "Ranked: shiny Black Kyurem at Lv 50");

  const set = memberSet(on[0], { slot: 0, env: ON });
  assertEqual(set.species, "Kyurem-Black", "full sim: Showdown forme Kyurem-Black");
  assertEqual(set.ability, "Teravolt", "full sim: Teravolt");
  const mon = buildMon(on[0]);
  assertTrue(mon.fusionForm === "kyurem-black" && !mon.megaForm && mon.ability === "Teravolt" && mon.name === "Black Kyurem", "legacy sim battler");

  const saved = withoutMegaStats(on);
  assertTrue(saved[0].fusionForm === "kyurem-black" && !saved[0].battleProfile, "saved record keeps only the form id");
  const again = withMegaStats(saved, { env: ON });
  assertEqual(again[0].battleProfile?.baseStats.atk, 170, "saved fighter gets its fusion stats back");
  const back = withMegaStats(saved, { env: OFF });
  assertTrue(!back[0].fusionForm && back[0].name === "Kyurem", "saved fighter fights as Kyurem when switched off");
}

section("Black/White Kyurem uses the team's one Mega slot");
{
  const { fusionSelectionError } = await import("../services/fusionTeam.js");
  const u = player();
  const withMega = [clone(BLACK), { id: 6, variant: "normal", mega: "mega-charizard-x" }];
  assertEqual(fusionSelectionError(u, withMega, { env: ON })?.code, "fusion_mega_slot", "Casual/Ranked: fused Kyurem + a Mega refused");
  assertTrue(/Mega slot/.test(fusionSelectionError(u, withMega, { env: ON })?.error ?? ""), "error names the Mega slot");
  assertEqual(fusionSelectionError(u, withMega, { env: ON, teamRule: false }), null, "Showcase: both allowed (never fights)");
  assertEqual(fusionSelectionError(u, [clone(BLACK), { id: 6, variant: "normal" }], { env: ON }), null, "no Mega: fine");
  const r = F.resolveSlotFusion(u, BLACK, [BLACK], { env: ON, megaActive: true });
  assertTrue(r && !r.ok && /Mega slot/.test(r.reason), "battle: a Mega really battling → Kyurem fights as Kyurem");
  assertTrue(F.resolveSlotFusion(u, BLACK, [BLACK], { env: ON, megaActive: false })?.ok, "no active Mega → fights as Black Kyurem");
}

section("DNA Splicers fill a fused Kyurem's item slot (like a Mega Stone)");
{
  const H = await import("../services/heldItems.js");
  const { HELD_ITEM_IDS } = await import("../catalog/heldItems.js");
  const item = HELD_ITEM_IDS[0];
  const HELD = { HELD_ITEMS_ENABLED: "1", HELD_ITEMS_BATTLES_ENABLED: "1", ...ON };
  const u = player();
  normalizeBox(u);
  u.items = { [item]: 1 };
  u.displayedPokemon = [{ id: 646, variant: "normal" }, { id: 6, variant: "normal" }];
  normalizeDisplayedTeam(u);
  const line = (s) => (s.uid ? `u:${s.uid}` : `${s.id}:${s.variant}`);
  const kyuremKey = line(u.displayedPokemon[0]);
  assertTrue(H.applyEquip(u, { teamId: "display", line: kyuremKey, itemId: item }).ok, "plain Kyurem can hold an item");
  u.displayedPokemon[0].form = "kyurem-black"; // team saved as Black Kyurem
  const removed = H.reconcileTeamEquipment(u, "display");
  assertEqual(removed.map((r) => r.reason), ["fusion_slot"], "saving Black Kyurem clears its item (fusion_slot)");
  const again = H.checkEquip(u, { teamId: "display", line: kyuremKey, itemId: item });
  assertEqual(again.code, "fusion_slot", "can't equip an item on Black Kyurem");
  assertTrue(/DNA Splicers/.test(again.error), "message names DNA Splicers");
  const lo = H.describeLoadout(u, "display");
  assertTrue(lo[0].item === null && lo[0].megaSlot?.fusion && lo[0].megaSlot.stoneName === "DNA Splicers", "loadout shows DNA Splicers in the slot");
  assertTrue(!lo[1].megaSlot, "other members unaffected");
  u.equipment.teams.display = { [kyuremKey]: item }; // stored past the rule somehow
  assertTrue(!H.battleItems(u, "display", { env: HELD }).has(kyuremKey), "battle: a fused slot never fights with a regular item");
  const n = H.normalizeEquipment(u);
  assertTrue(!(u.equipmentLegacy ?? []).length && n.removed.some((r) => r.reason === "fusion_slot"), "load repair drops it without quarantine");
}

section("form moves: equippable only while Kyurem uses that form");
{
  const M = await import("../services/movesets.js");
  const { pokemonDetail } = await import("../services/pokemonDetail.js");
  const saved = { fusion: process.env.KYUREM_FUSION_ENABLED, sim: process.env.FULL_SIM_ENABLED };
  process.env.KYUREM_FUSION_ENABLED = "1";
  process.env.FULL_SIM_ENABLED = "1"; // production engine: knows all four moves
  const u = player({ 643: { normal: 1, shiny: 0 } });
  u.training = { "646:normal": { exp: 85 ** 3 } }; // Lv 85
  u.displayedPokemon = [clone(BLACK), { id: 6, variant: "normal" }];
  const ids = (list) => list.map((m) => m.id);
  assertEqual(ids(M.formMoves(u, 646, "normal", "kyurem-black", 85)), ["fusionbolt", "freezeshock"], "Black Kyurem Lv 85: Fusion Bolt + Freeze Shock");
  assertEqual(ids(M.formMoves(u, 646, "normal", "kyurem-white", 85)), ["fusionflare", "iceburn"], "White Kyurem Lv 85: Fusion Flare + Ice Burn");
  assertEqual(ids(M.formMoves(u, 646, "normal", "kyurem-black", 60)), ["fusionbolt"], "Lv 60: only the Lv 48 move");
  assertEqual(ids(M.formMoves(u, 646, "normal", "kyurem-black", 40)), [], "Lv 40: none yet");
  assertTrue(!ids(M.learnableMoves(u, 646, "normal")).includes("freezeshock"), "plain Kyurem can't learn Freeze Shock");
  assertTrue(ids(M.learnableMoves(u, 646, "normal", { form: "kyurem-black" })).includes("freezeshock"), "Black Kyurem can");

  assertEqual(M.validateMoveset(u, 646, "normal", ["freezeshock", "icebeam"]).code, "not_learned", "save without the form → refused");
  const ok = M.saveMoveset(u, { team: "display", pokeId: 646, variant: "normal", moves: ["freezeshock", "fusionbolt", "icebeam"], form: "kyurem-black" });
  assertTrue(ok.ok && ok.moves.includes("freezeshock"), "save with the form → kept");
  assertEqual(M.saveMoveset(u, { team: "display", pokeId: 646, variant: "normal", moves: ["iceburn"], form: "kyurem-black" }).code, "not_learned", "White Kyurem's move refused for Black Kyurem");
  const locked = player({ 644: { normal: 0, shiny: 0 } });
  locked.training = { "646:normal": { exp: 85 ** 3 } };
  assertEqual(M.validateMoveset(locked, 646, "normal", ["freezeshock"], { form: "kyurem-black" }).code, "not_learned", "form not unlocked → refused");

  assertEqual(M.chosenMoves(u, "display", 646, "normal"), ["freezeshock", "fusionbolt", "icebeam"], "stored team uses Black Kyurem → moves kept");
  const team = buildTeam(u, { env: process.env });
  assertEqual(team[0].moves, ["freezeshock", "fusionbolt", "icebeam"], "battle: Black Kyurem fights with Freeze Shock and Fusion Bolt");
  assertEqual(memberSet(team[0], { slot: 0 }).moves, ["freezeshock", "fusionbolt", "icebeam"], "full sim set carries them");
  u.displayedPokemon[0] = { id: 646, variant: "normal" }; // back to plain Kyurem
  assertEqual(buildTeam(u, { env: process.env })[0].moves, ["icebeam"], "plain Kyurem: form moves drop out");
  u.displayedPokemon[0] = clone(BLACK);
  assertEqual(buildTeam(u, { env: {} })[0].moves, ["icebeam"], "fusion switched off: form moves drop out");

  const d = pokemonDetail(u, 646).body.copies.normal;
  assertEqual(ids(d.formLearnable["kyurem-black"]), ["fusionbolt", "freezeshock"], "detail lists Black Kyurem's moves for the editor");
  assertEqual(ids(d.formLearnable["kyurem-white"]), ["fusionflare", "iceburn"], "…and White Kyurem's");

  delete process.env.FULL_SIM_ENABLED; // legacy engine: no Freeze Shock / Ice Burn data
  assertEqual(ids(M.formMoves(u, 646, "normal", "kyurem-black", 85)), ["fusionbolt"], "legacy engine: only Fusion Bolt (it has no Freeze Shock)");
  for (const [k, v] of [["KYUREM_FUSION_ENABLED", saved.fusion], ["FULL_SIM_ENABLED", saved.sim]]) if (v === undefined) delete process.env[k]; else process.env[k] = v;
}

finish();
