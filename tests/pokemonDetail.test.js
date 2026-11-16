// ==========================================================
// tests/pokemonDetail.test.js — B2, GET /api/pokemon/detail's service
// (services/pokemonDetail.js): same numbers as the Discord cards, read-only.
// ==========================================================

import { assertEqual, assertTrue, section, finish } from "./harness.js";
import { pokemonDetail } from "../services/pokemonDetail.js";
import { slotView } from "../utils/render/teamView.js";
import { pokemonPower } from "../utils/battle/power.js";
import { autoMoveset } from "../utils/battle/moveset.js";
import { getMove } from "../utils/battle/data.js";

const clone = (o) => JSON.parse(JSON.stringify(o));
const user = () => ({
  pokemon: { 6: { normal: 1, shiny: 1 }, 25: { normal: 2, shiny: 0 } },
  training: { "6:normal": { exp: 58 ** 3 }, "6:shiny": { exp: 36 ** 3 }, "25:normal": { exp: 16 ** 3 } },
  displayedPokemon: [{ id: 25, variant: "normal" }, { id: 6, variant: "normal" }],
  battleTeam: [{ id: 6, variant: "shiny" }],
});

section("owned Pokémon: the Discord cards' numbers");
{
  const u = user();
  const before = clone(u);
  const { status, body } = pokemonDetail(u, 6);
  assertEqual(status, 200, "found");
  assertEqual([body.name, body.types, body.tier, body.region], ["Charizard", ["Fire", "Flying"], "legendary", "Kanto"], "species facts");
  const ref = slotView(u, { speciesId: 6, variant: "normal", level: 58 }, 0);
  assertEqual([body.copies.normal.level, body.copies.normal.stats, body.copies.normal.power], [58, ref.stats, ref.statTotal], "stats and Power equal slotView (/showteam, /inspectpokemon)");
  assertEqual(body.copies.normal.power, pokemonPower(6, 58), "Power equals the dashboard sort's Power");
  assertEqual(body.copies.normal.power50, pokemonPower(6, 50), "Lv 50 (ranked) Power");
  assertEqual(body.copies.normal.moves.map((m) => m.name), autoMoveset(6, 58).map((m) => getMove(m).name), "the battle moveset, with types");
  assertTrue(body.copies.normal.moves.every((m) => m.type), "moves carry their type");
  assertEqual([body.copies.normal.teams, body.copies.shiny.teams], [{ display: 2, battle: null }, { display: null, battle: 1 }], "team slots per copy");
  assertEqual(body.evolvesFrom, [{ id: 5, name: "Charmeleon" }], "evolves from");
  assertEqual(body.megaForms, [], "Mega forms hidden while Mega Evolution is off");
  assertEqual(u, before, "read-only: nothing written to the player");
}

section("unowned and unknown");
{
  const { status, body } = pokemonDetail(user(), 1);
  assertEqual([status, Object.keys(body.copies), body.owned], [200, [], { normal: 0, shiny: 0 }], "unowned live species: facts and base stats, no copies");
  assertTrue(body.baseTotal > 0, "base stat total");
  assertEqual(pokemonDetail(user(), 99999).status, 404, "unknown species");
  assertEqual(pokemonDetail(user(), "abc").status, 404, "not a number");
  assertEqual(pokemonDetail(user(), 700).status, 404, "unowned species of a generation that isn't live");
}

section("Mega forms when Mega teams are on");
{
  const { body } = pokemonDetail(user(), 6, { env: { MEGA_EVOLUTION_ENABLED: "1" } });
  assertTrue(body.megaForms.some((f) => f.id === "mega-charizard-x") && body.megaForms.every((f) => f.unlocked.normal === false), "listed, locked (none unlocked)");
}

section("a copy's own moves and Level (the drawer of a Teams slot / box tile), 2026-11-15");
{
  // Zapdos Lv 52 as a box copy on the Ranked team, with an old line-level
  // Ranked pick and the copy's own pick: battles use the copy's.
  const { addCopy } = await import("../services/box.js");
  const { saveMoveset } = await import("../services/movesets.js");
  const { buildBattleTeam } = await import("../utils/battle/runBattle.js");
  const { expForLevel } = await import("../utils/training.js");
  const u = { pokemon: {} };
  const uid = addCopy(u, 145, "normal", { exp: expForLevel(52) }).uid;
  addCopy(u, 145, "normal", { exp: expForLevel(20) });
  u.battleTeam = [{ id: 145, variant: "normal", uid }];
  u.movesets = { battle: { "145:normal": ["peck", "thundershock", "pluck", "ancientpower"] } };
  const picked = ["thundershock", "pluck", "ancientpower", "discharge"];
  assertTrue(saveMoveset(u, { team: "battle", pokeId: 145, variant: "normal", moves: picked, uid }).ok, "Discharge saved for the slot's copy");
  const line = pokemonDetail(u, 145).body.copies.normal;
  const own = line.each.find((c) => c.uid === uid);
  assertEqual(own.movesets.battle.map((m) => m.id), picked, "the copy's Ranked moves are the saved ones");
  assertEqual(own.movesets.battle.map((m) => m.id), buildBattleTeam(u)[0].moves, "…and what the ranked battle uses");
  assertEqual(own.teams, { display: null, battle: 1 }, "the copy knows its slots");
  assertEqual([own.level, own.stats, own.power], [52, slotView(u, { speciesId: 145, variant: "normal", level: 52, copyUid: uid }, 0).stats, own.power], "the copy's Level and stats");
  const low = line.each.find((c) => c.uid !== uid);
  assertEqual(low.level, 20, "each copy has its own Level");
  assertTrue(low.power < own.power, "and its own stats");
}

section("learnset: every level-up move with its Level, TMs while TMs are on");
{
  const off = pokemonDetail(user(), 145, { env: {} }).body.learnset;
  const { getSpecies } = await import("../utils/battle/data.js");
  const firstAt = new Map();
  for (const [at, m] of getSpecies(145).levelMoves) if (!firstAt.has(m)) firstAt.set(m, at);
  assertEqual(off.levelUp.map((m) => [m.id, m.learnedAt]), [...firstAt], "Zapdos level-up moves, each once at its first Level, in Level order (the battle's learnset)");
  assertTrue(off.levelUp.some((m) => m.id === "discharge"), "Discharge listed");
  assertTrue(off.levelUp.every((m) => m.type && m.category && m.name), "type, category and name on every move");
  assertEqual(off.tm, [], "no TMs listed while TMs are off");
  const on = pokemonDetail(user(), 145, { env: { TM_ENABLED: "1" } }).body.learnset;
  assertTrue(on.tm.length > 0 && on.tm.some((m) => m.id === "thunderbolt"), "TM moves listed (Thunderbolt)");
  assertTrue(on.tm.every((m) => m.type && m.category), "TM moves carry type and category");
  const { canLearnByTm } = await import("../utils/battle/tmData.js");
  assertTrue(on.tm.every((m) => canLearnByTm(145, m.id)), "only TMs it can learn");
  assertEqual(pokemonDetail({}, 145, { env: {} }).status, 200, "works for an unowned species (Pokédex)");
}

finish();
