// ==========================================================
// tests/necrozmaFusion.test.js — Dusk Mane / Dawn Wings Necrozma
// (utils/fusions.js families): Gen 7 gate + switch, unlock by ownership, the
// family rule, one Mega slot (Mega or one fusion), mythic-tier on Ranked,
// N-Solarizer / N-Lunarizer item slot, battle profile, Sunsteel Strike /
// Moongeist Beam, sprites. Synthetic players only.
// ==========================================================

import fs from "fs";
import { assertTrue, assertEqual, section, finish } from "./harness.js";

process.env.POKEMON_GENERATIONS = "7"; // Necrozma, Solgaleo and Lunala are Gen 7
process.env.KYUREM_FUSION_ENABLED = "1";
process.env.NECROZMA_FUSION_ENABLED = "1";
process.env.FULL_SIM_ENABLED = "1";

const F = await import("../utils/fusions.js");
const { prepareTeamSelection, normalizeDisplayedTeam } = await import("../services/megaTeam.js");
const { prepareBattleTeamSelection, isMythicSlot } = await import("../services/battleTeam.js");
const { prepareShowcaseSelection } = await import("../services/showcaseTeam.js");
const { fusionView } = await import("../services/fusionTeam.js");
const { buildTeam } = await import("../utils/battle/runBattle.js");
const { memberSet } = await import("../utils/battle/showdown/sets.js");
const { spriteFileFor } = await import("../utils/render/sprites.js");
const { normalizeBox } = await import("../services/box.js");
const M = await import("../services/movesets.js");
const H = await import("../services/heldItems.js");

const env = process.env;
const clone = (o) => JSON.parse(JSON.stringify(o));
// 800 Necrozma (normal + shiny), 791 Solgaleo, 792 Lunala, 646 Kyurem + 644 Zekrom, 150 Mewtwo (mythic), 6, 25.
const player = (extra = {}) => ({
  id: "400000000000000800",
  name: "Necrozma Tester",
  pokemon: { 800: { normal: 1, shiny: 1 }, 791: { normal: 1, shiny: 0 }, 6: { normal: 1, shiny: 0 }, 25: { normal: 1, shiny: 0 }, 646: { normal: 1, shiny: 0 }, 644: { normal: 1, shiny: 0 }, 150: { normal: 1, shiny: 0 }, ...extra },
  displayedPokemon: [{ id: 6, variant: "normal" }],
});
const DUSK = { id: 800, variant: "normal", form: "necrozma-duskmane" };
const BLACK = { id: 646, variant: "normal", form: "kyurem-black" };

section("catalogue + sprites");
{
  const d = F.getFusion("necrozma-duskmane"), w = F.getFusion("necrozma-dawnwings");
  assertTrue(d.partner === 791 && w.partner === 792, "Dusk Mane ← Solgaleo, Dawn Wings ← Lunala");
  assertEqual([d.types, w.types], [["Psychic", "Steel"], ["Psychic", "Ghost"]], "types (@pkmn/dex)");
  const total = (s) => Object.values(s).reduce((a, v) => a + v, 0);
  assertEqual([total(d.baseStats), d.baseStats.atk, total(w.baseStats), w.baseStats.spa], [680, 157, 680, 157], "680 BST; Atk 157 / SpA 157");
  assertTrue(d.ability === "Prism Armor" && w.ability === "Prism Armor", "Prism Armor");
  assertTrue(d.item === "N-Solarizer" && w.item === "N-Lunarizer", "fusion items");
  assertEqual(F.fusionsOfSpecies(800).map((f) => f.id), ["necrozma-duskmane", "necrozma-dawnwings"], "no Ultra Necrozma");
  for (const f of [d, w]) for (const v of ["normal", "shiny", "grayscale"]) {
    const file = spriteFileFor(f.spriteId, v);
    assertTrue(file && fs.existsSync(new URL(`../public/${file}`, import.meta.url)), `${f.name} ${v} sprite exists`);
  }
  const n = fs.readFileSync(new URL("../public/sprites/pokemon/normal/800-duskmane.gif", import.meta.url));
  const s = fs.readFileSync(new URL("../public/sprites/pokemon/shiny/800-duskmane.gif", import.meta.url));
  assertTrue(!n.equals(s), "shiny sprite differs from normal");
}

section("switches: family switch + Gen 7 live");
{
  assertTrue(F.isFusionFormEnabled("necrozma-duskmane", env), "on: switch + Gen 7");
  assertTrue(!F.isFusionFormEnabled("necrozma-duskmane", { ...env, NECROZMA_FUSION_ENABLED: "" }), "Necrozma switch off → off");
  assertTrue(F.isFusionFormEnabled("kyurem-black", { ...env, NECROZMA_FUSION_ENABLED: "" }), "…Kyurem unaffected");
  assertTrue(!F.isFusionFormEnabled("necrozma-duskmane", env, { generationLive: (g) => g !== 7 }), "Gen 7 not live → off");
  assertTrue(F.isFusionFormEnabled("kyurem-black", env, { generationLive: (g) => g !== 7 }), "…Kyurem (Gen 5) unaffected");
  assertTrue(!F.isFusionFormEnabled("kyurem-black", { ...env, KYUREM_FUSION_ENABLED: "" }), "Kyurem switch is its own");
  const v = fusionView(player(), { env: { ...env, NECROZMA_FUSION_ENABLED: "" } });
  assertTrue(v.enabled && v.forms.every((f) => f.species === 646), "dashboard lists only enabled forms");
  assertEqual(prepareTeamSelection(player(), [DUSK], { env: { ...env, NECROZMA_FUSION_ENABLED: "" } }).code, "fusion_disabled", "save refused while off");
}

section("unlock by ownership; family rule; Showcase free");
{
  const u = player();
  assertTrue(F.fusionUnlocked(u, "necrozma-duskmane", "normal") && F.fusionUnlocked(u, "necrozma-duskmane", "shiny"), "Necrozma + Solgaleo → Dusk Mane (normal and shiny Necrozma)");
  assertTrue(!F.fusionUnlocked(u, "necrozma-dawnwings", "normal"), "no Lunala → no Dawn Wings");
  assertTrue(prepareTeamSelection(u, [DUSK, { id: 6, variant: "normal" }], { env }).ok, "Dusk Mane saves on Casual");
  for (const [other, label] of [[{ id: 791, variant: "normal" }, "Solgaleo"], [{ id: 800, variant: "shiny" }, "Necrozma"]]) {
    const r = prepareTeamSelection(u, [DUSK, other], { env });
    assertEqual(r.code, "fusion_team_rule", `Dusk Mane + ${label} refused`);
    assertTrue(/Necrozma, Solgaleo or Lunala/.test(r.error), "message names the family");
  }
  assertTrue(prepareTeamSelection(u, [{ id: 800, variant: "normal" }, { id: 791, variant: "normal" }], { env }).ok, "plain Necrozma + Solgaleo fine");
  normalizeBox(u);
  assertTrue(prepareShowcaseSelection(u, [DUSK, { id: 791, variant: "normal" }, BLACK], { env }).ok, "Showcase: Dusk Mane beside Solgaleo and Black Kyurem");
}

section("one Mega slot: a Mega or one fusion");
{
  const u = player();
  const two = prepareTeamSelection(u, [DUSK, BLACK], { env });
  assertEqual(two.code, "fusion_mega_slot", "Dusk Mane + Black Kyurem refused (both need the Mega slot)");
  // Stored past the rule somehow: only the first fusion fights as its form.
  u.displayedPokemon = [clone(DUSK), clone(BLACK)];
  const team = buildTeam(u, { env });
  assertTrue(team[0].fusionForm === "necrozma-duskmane" && !team[1].fusionForm, "battle: first fusion only, second fights as Kyurem");
}

section("Ranked: a fused slot counts as mythic-tier");
{
  const u = player();
  assertTrue(isMythicSlot(DUSK) && !isMythicSlot({ id: 800, variant: "normal" }), "Dusk Mane mythic, plain Necrozma (legendary) not");
  const r = prepareBattleTeamSelection(u, [DUSK, { id: 150, variant: "normal" }], { env });
  assertEqual(r.code, "too_many_mythics", "Dusk Mane + Mewtwo refused on Ranked");
  assertTrue(/Dusk Mane Necrozma/.test(r.error), "error names the form");
  assertTrue(prepareBattleTeamSelection(u, [{ id: 800, variant: "normal" }, { id: 150, variant: "normal" }], { env }).ok, "plain Necrozma + Mewtwo fine");
  assertTrue(prepareTeamSelection(u, [DUSK, { id: 150, variant: "normal" }], { env }).ok, "Casual has no mythic limit");
}

section("battle: Dusk Mane profile, Showdown forme, Sunsteel Strike");
{
  const u = player();
  u.training = { "800:normal": { exp: 30 ** 3 } };
  u.displayedPokemon = [clone(DUSK), { id: 6, variant: "normal" }];
  const ok = M.saveMoveset(u, { team: "display", pokeId: 800, variant: "normal", moves: ["sunsteelstrike"], form: "necrozma-duskmane" });
  assertTrue(ok.ok, "Sunsteel Strike equippable on Dusk Mane (any Level)");
  assertEqual(M.validateMoveset(u, 800, "normal", ["moongeistbeam"], { form: "necrozma-duskmane" }).code, "not_learned", "Moongeist Beam isn't Dusk Mane's");
  assertEqual(M.validateMoveset(u, 800, "normal", ["sunsteelstrike"]).code, "not_learned", "plain Necrozma can't equip it");
  const t = buildTeam(u, { env });
  assertTrue(t[0].fusionForm === "necrozma-duskmane" && t[0].name === "Dusk Mane Necrozma" && t[0].speciesId === 800, "fights as Dusk Mane Necrozma (species stays Necrozma)");
  assertTrue(t[0].moves?.includes("sunsteelstrike"), "with Sunsteel Strike");
  const set = memberSet(t[0], { slot: 0, env });
  assertTrue(set.species === "Necrozma-Dusk-Mane" && set.ability === "Prism Armor", "full sim: Necrozma-Dusk-Mane, Prism Armor");
  u.displayedPokemon[0] = { id: 800, variant: "normal" };
  const plain = buildTeam(u, { env })[0];
  assertTrue(!plain.fusionForm && !(plain.moves ?? []).includes("sunsteelstrike"), "plain Necrozma: no form, Sunsteel Strike drops out");
}

section("item slot: N-Solarizer");
{
  const u = player();
  normalizeBox(u);
  u.items = { leftovers: 1 };
  u.displayedPokemon = [{ id: 800, variant: "normal" }];
  normalizeDisplayedTeam(u);
  const key = u.displayedPokemon[0].uid ? `u:${u.displayedPokemon[0].uid}` : "800:normal";
  assertTrue(H.applyEquip(u, { teamId: "display", line: key, itemId: "leftovers" }).ok, "plain Necrozma holds Leftovers");
  u.displayedPokemon[0].form = "necrozma-duskmane";
  assertEqual(H.reconcileTeamEquipment(u, "display").map((r) => r.reason), ["fusion_slot"], "fused: item comes off");
  const e = H.checkEquip(u, { teamId: "display", line: key, itemId: "leftovers" });
  assertTrue(e.code === "fusion_slot" && /N-Solarizer/.test(e.error), "equip refused, names N-Solarizer");
  const lo = H.describeLoadout(u, "display")[0];
  assertTrue(lo.megaSlot?.fusion && lo.megaSlot.stoneName === "N-Solarizer" && lo.megaSlot.glyph === "☀️", "loadout shows ☀️ N-Solarizer");
}

section("losing the partner");
{
  const u = player();
  u.displayedPokemon = [clone(DUSK)];
  u.pokemon[791] = { normal: 0, shiny: 0 };
  normalizeDisplayedTeam(u);
  assertTrue(!u.displayedPokemon[0].form, "back to Necrozma");
  assertTrue(/Dusk Mane Necrozma went back to Necrozma on your Casual team because you no longer own Solgaleo/.test(u.notices?.[0]?.text ?? ""), "notice names Necrozma and Solgaleo");
}

finish();
