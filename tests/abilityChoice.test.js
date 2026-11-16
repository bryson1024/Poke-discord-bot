// ==========================================================
// tests/abilityChoice.test.js
// A chosen Ability per team (services/abilities.js, owner decision
// 2026-11-16): only regular abilities, Automatic by default, each team its
// own, a copy's own choice first; the fight uses it (buildTeam →
// simulateFull), the details API shows it, and a removed copy's choice goes.
// ==========================================================

import { assertEqual, assertTrue, section, finish } from "./harness.js";
import { saveAbility, chosenAbility, abilityView, abilityInfo, regularAbilities, fightingAbility } from "../services/abilities.js";
import { setPlan, teamPlanView } from "../services/battlePlans.js";
import { buildTeam } from "../utils/battle/runBattle.js";
import { simulateFull } from "../utils/battle/showdown/simulate.js";
import { makeChooser } from "../utils/battle/ai/choose.js";
import { createNewUser } from "../utils/userSchema.js";
import { pokemonDetail } from "../services/pokemonDetail.js";
import { addCopy, takeCopy } from "../services/box.js";
import { inspectSlots } from "../commands/inspectpokemon.js";
import { equippedAbility } from "../public/picker-pokemon/detailMoves.js";
import { abilityChanges } from "../public/teams/plans.js";
import { createBattlePlanHandlers } from "../services/battlePlansApi.js";

const ON = { FULL_SIM_ENABLED: "1" };
const withSwitch = (on, fn) => {
  const saved = process.env.FULL_SIM_ENABLED;
  if (on) process.env.FULL_SIM_ENABLED = "1"; else delete process.env.FULL_SIM_ENABLED;
  try { return fn(); } finally { if (saved === undefined) delete process.env.FULL_SIM_ENABLED; else process.env.FULL_SIM_ENABLED = saved; }
};
function player(id, speciesIds, level = 50) {
  const u = createNewUser(id, `Trainer ${id}`);
  for (const sid of speciesIds) {
    u.pokemon[sid] = { normal: 1, shiny: 0 };
    u.training ??= {};
    u.training[`${sid}:normal`] = { exp: level ** 3 };
  }
  u.displayedPokemon = speciesIds.map((sid) => ({ id: sid, variant: "normal" }));
  u.battleTeam = speciesIds.map((sid) => ({ id: sid, variant: "normal" }));
  return u;
}

section("Regular abilities and their text");
{
  assertEqual(regularAbilities(130), ["Intimidate"], "Gyarados: Intimidate only (Moxie is hidden)");
  assertEqual(regularAbilities(230), ["Swift Swim", "Sniper"], "Kingdra: two regular abilities");
  const info = abilityInfo("Swift Swim");
  assertEqual(info.name, "Swift Swim", "name");
  assertTrue(/Speed/.test(info.desc) && !/Pokemon/.test(info.desc), "one-line text, with Pokémon spelled right");
}

section("Saving: regular abilities only, per team, null = Automatic");
{
  const u = player("A", [230]);
  assertEqual(saveAbility(u, { team: "display", pokeId: 230, variant: "normal", ability: "Sniper" }, { env: {} }).code, "full_sim_off", "full sim off: refused");
  assertEqual(saveAbility(u, { team: "display", pokeId: 230, variant: "normal", ability: "Drizzle" }, { env: ON }).code, "bad_ability", "another species' ability: refused");
  assertEqual(saveAbility(u, { team: "display", pokeId: 186, variant: "normal", ability: "Drizzle" }, { env: ON }).code, "unowned", "Politoed not owned");
  assertEqual(saveAbility(u, { team: "nope", pokeId: 230, variant: "normal", ability: "Sniper" }, { env: ON }).code, "bad_team", "unknown team");
  const ok = saveAbility(u, { team: "display", pokeId: 230, variant: "normal", ability: "Sniper" }, { env: ON });
  assertTrue(ok.ok && ok.ability === "Sniper", "Sniper saved on the Casual team");
  assertEqual(chosenAbility(u, "battle", 230, "normal"), null, "the Ranked team keeps Automatic");
  assertEqual(saveAbility(u, { team: "display", pokeId: 230, variant: "normal", ability: null }, { env: ON }).ability, null, "null clears it");
  assertEqual(u.abilities.display["230:normal"], undefined, "nothing stored after clearing");
  // Hidden abilities are never accepted (Politoed's Drizzle).
  const p = player("P", [186]);
  assertEqual(saveAbility(p, { team: "display", pokeId: 186, variant: "normal", ability: "Drizzle" }, { env: ON }).code, "bad_ability", "hidden ability refused");
}

section("Automatic follows the plan; a choice wins");
{
  const u = player("B", [230]);
  setPlan(u, "display", "weather");
  assertEqual(fightingAbility(u, "display", 230, "normal"), "Swift Swim", "Automatic on Weather: Swift Swim");
  saveAbility(u, { team: "display", pokeId: 230, variant: "normal", ability: "Sniper" }, { env: ON });
  assertEqual(fightingAbility(u, "display", 230, "normal"), "Sniper", "the choice wins");
  withSwitch(true, () => assertEqual(inspectSlots(u, { id: 230, name: "Kingdra", tier: "rare", types: [11, 16], region: "Johto" })[0].ability, "Sniper", "/inspectpokemon shows the choice"));
  // A stale stored name (not a regular ability) reads as Automatic.
  u.abilities.display["230:normal"] = "Drizzle";
  assertEqual(chosenAbility(u, "display", 230, "normal"), null, "invalid stored name → Automatic");
}

section("The fight uses it");
{
  const u = player("C", [130, 230]);
  saveAbility(u, { team: "display", pokeId: 230, variant: "normal", ability: "Sniper" }, { env: ON });
  const casual = buildTeam(u, { env: ON });
  assertEqual(casual.map((m) => m.chosenAbility ?? null), [null, "Sniper"], "buildTeam carries the Casual choice only where set");
  assertEqual(buildTeam(u, { env: {} }).some((m) => "chosenAbility" in m), false, "full sim off: no choice on members");
  const ranked = buildTeam(u, { env: ON, team: u.battleTeam, movesetTeam: "battle" });
  assertEqual(ranked[1].chosenAbility, undefined, "Ranked team: Automatic");
  // The engine's own request names each Pokémon's ability (Showdown id).
  const seen = new Set();
  const spy = (i) => { const inner = makeChooser({ plan: "allout", skill: "solid", seed: 3 + i }); return (req, b, side) => { if (i === 0) for (const p of req.side?.pokemon ?? []) seen.add(`${p.ident.split(": ")[1]}=${p.baseAbility}`); return inner(req, b, side); }; };
  const r = simulateFull({ sides: [{ members: casual }, { members: casual }], seed: 7, ai: [spy(0), spy(1)] });
  assertTrue(r.turns > 0, "the fight runs");
  assertTrue([...seen].some((x) => x.endsWith("=sniper")), `Kingdra fights with Sniper (${[...seen].join(", ")})`);
  assertTrue(![...seen].some((x) => x.endsWith("=swiftswim")), "never with Swift Swim");
}

section("Per copy, cleaned up with the copy");
{
  const u = player("D", [230]);
  const { uid } = addCopy(u, 230, "normal", { exp: 50 ** 3 });
  const r = saveAbility(u, { team: "battle", pokeId: 230, variant: "normal", ability: "Sniper", uid }, { env: ON });
  assertEqual(r.uid, uid, "saved on the copy");
  assertEqual(chosenAbility(u, "battle", 230, "normal", { uid }), "Sniper", "the copy's own choice");
  assertEqual(chosenAbility(u, "battle", 230, "normal"), null, "the line keeps Automatic");
  assertEqual(saveAbility(u, { team: "battle", pokeId: 230, variant: "normal", ability: "Sniper", uid: "c_nope" }, { env: ON }).code, "unknown_copy", "unknown copy refused");
  takeCopy(u, uid);
  assertEqual(u.abilities.battle[`u:${uid}`], undefined, "removing the copy removes its choice");
}

section("Details API");
{
  const u = player("E", [230]);
  setPlan(u, "battle", "weather");
  saveAbility(u, { team: "display", pokeId: 230, variant: "normal", ability: "Sniper" }, { env: ON });
  const v = abilityView(u, 230, "normal", { env: ON });
  assertEqual(v.options.map((o) => o.name), ["Swift Swim", "Sniper"], "both options");
  assertTrue(v.options.every((o) => o.desc.length > 0), "each with its text");
  assertEqual(v.teams.display.chosen, "Sniper", "Casual: chosen");
  assertEqual([v.teams.battle.chosen, v.teams.battle.automatic], [null, "Swift Swim"], "Ranked: Automatic picks Swift Swim on Weather");
  assertEqual(abilityView(u, 230, "normal", { env: {} }), null, "full sim off: no block");
  const d = pokemonDetail(u, 230, { env: ON }).body;
  assertEqual(d.copies.normal.ability?.teams.display.chosen, "Sniper", "the line carries it");
  assertTrue(d.copies.normal.each.every((c) => c.ability?.options.length === 2), "every copy carries it");
  const line = d.copies.normal, copy = line.each[0];
  assertEqual(equippedAbility(line, copy, "display"), { name: "Sniper", desc: abilityInfo("Sniper").desc, auto: false, only: false }, "drawer: Casual shows the choice");
  assertEqual(equippedAbility(line, copy, "battle")?.name, "Swift Swim", "drawer: Ranked shows Automatic's pick");
  assertEqual(equippedAbility(line, copy, "battle")?.auto, true, "marked automatic");
  assertEqual(equippedAbility({}, null, "battle"), null, "older server / full sim off: no line");
}

section("Weather readiness counts a chosen setter");
{
  // Pelipper (279): Keen Eye / Drizzle. Automatic on Weather picks Drizzle; a
  // player who picks Keen Eye no longer sets rain.
  const u = player("F", [279, 230]);
  setPlan(u, "display", "weather");
  const has = () => teamPlanView(u, "display").readiness.helpers.some((h) => h.ability === "Drizzle");
  withSwitch(true, () => {
    assertTrue(has(), "Automatic: Pelipper's Drizzle helps");
    saveAbility(u, { team: "display", pokeId: 279, variant: "normal", ability: "Keen Eye" }, { env: ON });
    assertTrue(!has(), "Keen Eye chosen: Drizzle no longer counted");
  });
}

section("Changing plan: which Automatic abilities change (confirm dialog)");
{
  const u = player("G", [230, 226, 130]); // Kingdra, Mantine, Gyarados
  const td = { G: u };
  const api = createBattlePlanHandlers({ getTrainerData: () => td, isAuthorized: () => true, lockUser: (_, fn) => fn(), saveAndAck: async () => ({ saved: true }), env: ON });
  const get = async () => { let body; await api.get({ query: { id: "G" } }, { json: (b) => { body = b; }, status() { return this; } }); return body; };
  let plans = await get();
  const slot = (id) => plans.teams.display.slots.find((x) => x.speciesId === id);
  assertEqual(slot(226).ability.byPlan.weather, "Swift Swim", "API: Mantine on Weather → Swift Swim");
  assertEqual(slot(226).ability.byPlan.allout, "Water Absorb", "API: Mantine on All-out → Water Absorb");
  const ch = abilityChanges(plans, "display", "weather");
  assertEqual(ch.map((c) => [c.speciesId, c.from, c.to]), [[226, "Water Absorb", "Swift Swim"]], "All-out → Weather: only Mantine changes (Kingdra already Swift Swim, Gyarados has one)");
  assertEqual(abilityChanges(plans, "display", "allout"), [], "same plan: nothing");
  assertEqual(abilityChanges(plans, "display", "setup"), [], "a plan that changes nobody: no dialog");
  saveAbility(u, { team: "display", pokeId: 226, variant: "normal", ability: "Water Absorb" }, { env: ON });
  plans = await get();
  assertEqual(abilityChanges(plans, "display", "weather"), [], "a chosen ability never changes, so no dialog");
  assertEqual(abilityChanges(plans, "battle", "weather").length, 1, "the other team still on Automatic: listed");
}

finish();
