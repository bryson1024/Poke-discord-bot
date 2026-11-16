// ==========================================================
// tests/teamCopy.test.js — "Copy from Display/Battle team" on the Teams page
// (services/teamCopy.js). Synthetic players only.
// ==========================================================

import { assertEqual, assertTrue, section, finish } from "./harness.js";
import { parseTeamCopy, applyTeamCopy } from "../services/teamCopy.js";
import { learnableMoves, chosenMoves, setMoveset } from "../services/movesets.js";

const exp = (lv) => ({ exp: lv ** 3 });
const player = () => ({
  pokemon: { 6: { normal: 1, shiny: 1 }, 4: { normal: 1, shiny: 0 }, 7: { normal: 1, shiny: 0 } },
  training: { "6:normal": exp(58), "6:shiny": exp(40), "4:normal": exp(20), "7:normal": exp(20) },
  displayedPokemon: [{ id: 6, variant: "normal" }, { id: 4, variant: "normal" }],
  battleTeam: [{ id: 7, variant: "normal" }],
});

section("parseTeamCopy: request validation");
{
  assertEqual(parseTeamCopy({}, "battle"), { ok: true, copy: null }, "no copyFrom → plain team save");
  assertEqual(parseTeamCopy({ copyFrom: null }, "battle"), { ok: true, copy: null }, "copyFrom null → plain team save");
  assertEqual(parseTeamCopy({ copyFrom: "display", copiedKeys: ["6:normal", "6:normal", "4:normal"] }, "battle"),
    { ok: true, copy: { from: "display", keys: ["6:normal", "4:normal"] } }, "valid copy, duplicate keys dropped");
  assertEqual(parseTeamCopy({ copyFrom: "battle", copiedKeys: ["6:normal"] }, "battle").code, "bad_copy", "copying a team onto itself is rejected");
  assertEqual(parseTeamCopy({ copyFrom: "ranked", copiedKeys: ["6:normal"] }, "battle").code, "bad_copy", "unknown source team is rejected");
  const bad = [undefined, [], ["6"], ["6:gold"], ["0:normal"], [6], Array(7).fill("6:normal")];
  for (const keys of bad) assertEqual(parseTeamCopy({ copyFrom: "display", copiedKeys: keys }, "battle").status, 400, `bad copiedKeys ${JSON.stringify(keys)} → 400`);
}

section("applyTeamCopy: moves follow the copied Pokémon");
{
  const u = player();
  const ids = learnableMoves(u, 6, "normal").map((m) => m.id);
  const ids4 = learnableMoves(u, 4, "normal").map((m) => m.id);
  const ids7 = learnableMoves(u, 7, "normal").map((m) => m.id);
  setMoveset(u, "display", 6, "normal", [ids[0], ids[1]]);
  setMoveset(u, "battle", 6, "normal", [ids[2]]);
  setMoveset(u, "battle", 4, "normal", [ids4[0]]); // display has automatic moves for 4
  setMoveset(u, "battle", 7, "normal", [ids7[0]]); // added by hand, not copied
  const saved = [{ id: 6, variant: "normal" }, { id: 4, variant: "normal" }, { id: 7, variant: "normal" }];
  const done = applyTeamCopy(u, { from: "display", to: "battle", keys: ["6:normal", "4:normal", "6:shiny"] }, saved);
  assertEqual(done, ["6:normal", "4:normal"], "only copied keys that are on the saved team");
  assertEqual(chosenMoves(u, "battle", 6, "normal"), [ids[0], ids[1]], "battle moves overwritten by display moves");
  assertEqual(chosenMoves(u, "battle", 4, "normal"), null, "automatic on the source → automatic on the target");
  assertEqual(chosenMoves(u, "battle", 7, "normal"), [ids7[0]], "a Pokémon added by hand keeps its own moves");
  assertEqual(chosenMoves(u, "display", 6, "normal"), [ids[0], ids[1]], "source team untouched");
  assertTrue(!("6:shiny" in (u.movesets.battle ?? {})), "key not on the team writes nothing");
}

section("applyTeamCopy: a slot's own copy gets the source copy's moves (2026-11-15)");
{
  const { addCopy } = await import("../services/box.js");
  const { buildBattleTeam } = await import("../utils/battle/runBattle.js");
  const { expForLevel } = await import("../utils/training.js");
  const u = { pokemon: {} };
  const uid = addCopy(u, 145, "normal", { exp: expForLevel(52) }).uid;
  u.displayedPokemon = [{ id: 145, variant: "normal", uid }];
  setMoveset(u, "display", 145, "normal", ["discharge", "pluck"], { uid });
  setMoveset(u, "battle", 145, "normal", ["peck"]); // an old line pick on the target team
  const saved = [{ id: 145, variant: "normal", uid }];
  u.battleTeam = saved;
  assertEqual(applyTeamCopy(u, { from: "display", to: "battle", keys: ["145:normal"] }, saved), ["145:normal"], "copied");
  assertEqual(buildBattleTeam(u)[0].moves, ["discharge", "pluck"], "the ranked battle uses the copied moves");
  assertEqual(u.movesets.battle["145:normal"], ["peck"], "the line pick is left alone");

  // Automatic on the source → the same moves on the target, even with a line pick there.
  setMoveset(u, "display", 145, "normal", null, { uid });
  applyTeamCopy(u, { from: "display", to: "battle", keys: ["145:normal"] }, saved);
  const { defaultMoves } = await import("../services/fullSimCutover.js");
  assertEqual(buildBattleTeam(u)[0].moves, defaultMoves(u, { id: 145, variant: "normal", uid }, 52), "automatic source → its automatic moves, not the old line pick");
}

section("applyTeamCopy: Abilities and held items come along (2026-11-16)");
{
  const { addCopy } = await import("../services/box.js");
  const { expForLevel } = await import("../utils/training.js");
  const { chosenAbility, setAbility, regularAbilities } = await import("../services/abilities.js");
  const { reconcileTeamEquipment, teamEquipment } = await import("../services/heldItems.js");
  const u = { pokemon: {}, items: { leftovers: 1, focus_sash: 1, quick_claw: 1 } };
  const a = addCopy(u, 6, "normal", { exp: expForLevel(50) }).uid;   // Charizard
  const b = addCopy(u, 130, "normal", { exp: expForLevel(50) }).uid; // Gyarados
  const c = addCopy(u, 94, "normal", { exp: expForLevel(50) }).uid;  // Gengar, added by hand
  const [abil6] = regularAbilities(6);
  const abil130 = regularAbilities(130)[0];
  u.displayedPokemon = [{ id: 6, variant: "normal", uid: a }, { id: 130, variant: "normal", uid: b }];
  setAbility(u, "display", 6, "normal", abil6, { uid: a });
  setAbility(u, "battle", 130, "normal", abil130, { uid: b }); // automatic on display → cleared here
  u.equipment = { rev: 3, teams: {
    display: { [`u:${a}`]: "leftovers" },
    battle: { [`u:${b}`]: "focus_sash", [`u:${c}`]: "leftovers" },
  } };
  const saved = [{ id: 6, variant: "normal", uid: a }, { id: 130, variant: "normal", uid: b }, { id: 94, variant: "normal", uid: c }];
  u.battleTeam = saved;
  applyTeamCopy(u, { from: "display", to: "battle", keys: ["6:normal", "130:normal"] }, saved);
  assertEqual(chosenAbility(u, "battle", 6, "normal", { uid: a }), abil6, "chosen Ability copied");
  assertEqual(chosenAbility(u, "battle", 130, "normal", { uid: b }), null, "Automatic on the source → Automatic here");
  assertEqual(teamEquipment(u, "battle")[`u:${a}`], "leftovers", "held item copied");
  assertTrue(!(`u:${b}` in teamEquipment(u, "battle")), "no item on the source → none here");
  assertTrue(!(`u:${c}` in teamEquipment(u, "battle")), "Item Clause: the copied Leftovers wins over the hand-added holder");
  assertTrue(u.equipment.rev > 3, "equipment rev bumped");
  assertEqual(reconcileTeamEquipment(u, "battle"), [], "copied items pass the team rules");
  assertEqual(teamEquipment(u, "display"), { [`u:${a}`]: "leftovers" }, "source items untouched");
}

finish();
