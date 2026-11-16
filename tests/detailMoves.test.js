// ==========================================================
// tests/detailMoves.test.js — which moves the details drawer shows
// (public/picker-pokemon/detailMoves.js). Regression, 2026-11-15: the
// Teams drawer showed the line's old Ranked pick (Peck…) while the slot's
// copy had saved Discharge, which battles used, so saves looked lost.
// ==========================================================

import { assertEqual, assertTrue, section, finish } from "./harness.js";
import { pickCopy, equippedMoves, learnsetRows, learnLabel } from "../public/picker-pokemon/detailMoves.js";

const mv = (...ids) => ids.map((id) => ({ id, name: id }));
const line = {
  level: 52,
  moves: mv("thundershock", "pluck", "ancientpower", "discharge"),
  movesets: { display: null, battle: mv("peck", "thundershock", "pluck", "ancientpower") }, // old line pick
  each: [
    { uid: "c_low", level: 20, teams: { display: null, battle: null }, moves: mv("peck", "thundershock"), movesets: { display: null, battle: null } },
    { uid: "c_slot", level: 52, teams: { display: null, battle: 1 }, moves: mv("thundershock", "pluck", "ancientpower", "discharge"),
      movesets: { display: null, battle: mv("thundershock", "pluck", "ancientpower", "discharge") } },
  ],
};
const ids = (r) => r.moves.map((m) => m.id);

section("a copy's drawer shows that copy's equipped moves");
{
  const copy = pickCopy(line, "c_slot");
  assertEqual(copy.uid, "c_slot", "the slot's copy");
  assertEqual(ids(equippedMoves(line, copy, "battle")), ["thundershock", "pluck", "ancientpower", "discharge"], "Ranked: the saved pick, not the line's Peck set");
  assertEqual(equippedMoves(line, copy, "battle").auto, false, "not labelled automatic");
  assertEqual(equippedMoves(line, copy, "display").auto, true, "Casual: automatic");
  assertEqual(ids(equippedMoves(line, pickCopy(line, "c_low"), "battle")), ["peck", "thundershock"], "another copy: its own automatic moves");
}

section("no uid: the best copy, never the line's stale pick");
{
  assertEqual(pickCopy(line, null).uid, "c_slot", "highest Level");
  assertEqual(pickCopy(line, "c_gone").uid, "c_slot", "an unknown uid falls back to the best copy");
  const tie = { each: [{ uid: "a", level: 30, teams: {} }, { uid: "b", level: 30, teams: { battle: 2 } }] };
  assertEqual(pickCopy(tie).uid, "b", "same Level: the one on a team");
  assertEqual(pickCopy({ each: [] }), null, "none owned");
  assertEqual(ids(equippedMoves(line, null, "battle")), ["peck", "thundershock", "pluck", "ancientpower"], "an older server without copies: the line's data");
}

section("Pokédex learnset rows and the Level-up / TM filter");
{
  const ls = {
    levelUp: [{ id: "peck", name: "Peck", learnedAt: 1 }, { id: "pluck", name: "Pluck", learnedAt: 22 }, { id: "thunder", name: "Thunder", learnedAt: 78 }],
    tm: [{ id: "roost", name: "Roost" }, { id: "thunder", name: "Thunder" }],
  };
  assertEqual(learnsetRows(ls, "all").map((m) => m.id), ["peck", "pluck", "thunder", "roost"], "All: level-up first, a move learned both ways once");
  assertEqual(learnsetRows(ls, "level").map((m) => m.id), ["peck", "pluck", "thunder"], "Level-up only");
  assertEqual(learnsetRows(ls, "tm").map((m) => m.id), ["roost", "thunder"], "TM only");
  const thunder = learnsetRows(ls, "all").find((m) => m.id === "thunder");
  assertEqual(learnLabel(thunder, "all"), "Lv 78 · TM", "both ways labelled");
  assertEqual(learnLabel(thunder, "level"), "Lv 78", "Level-up filter: just the Level");
  assertEqual(learnLabel(learnsetRows(ls, "tm")[1], "tm"), "TM", "TM filter: TM");
  assertEqual(learnLabel({ learnedAt: 0 }, "all"), "Lv 1", "an evolution move (Lv 0) reads Lv 1");
  assertTrue(learnsetRows(undefined, "all").length === 0, "no learnset: no rows");
}

finish();
