// ==========================================================
// tests/moveDetails.test.js
// What a move does (utils/battle/moveText.js): every move the dashboard
// shows carries a one-line desc, its accuracy (acc) and priority, shown
// under each move (public/shared/moveMeta.js moveDescLine), leaving out
// lines that say nothing.
// ==========================================================

import { assertEqual, assertTrue, section, finish } from "./harness.js";
import { moveDesc, moveDetails } from "../utils/battle/moveText.js";
import { moveInfo } from "../services/movesets.js";
import { moveDescLine } from "../public/shared/moveMeta.js";
import { moveRow } from "../public/teams/movePicks.js";
import { pokemonDetail } from "../services/pokemonDetail.js";
import { createNewUser } from "../utils/userSchema.js";
import { normalizeBox } from "../services/box.js";

process.env.FULL_SIM_ENABLED = "1";
const fs = await import("fs");
const full = JSON.parse(fs.readFileSync(new URL("../data/battle/full-sim-data.json", import.meta.url), "utf8"));

section("Text");
{
  assertEqual(moveDesc("mist"), "For 5 turns, protects user's party from stat drops.", "Mist says what it does");
  assertEqual(moveDesc("splash"), "Does nothing.", "Showdown's 'No competitive use.' is rewritten");
  assertTrue(!/Pokemon/.test(Object.keys(full.moves).map(moveDesc).join(" ")), "Pokémon spelled right everywhere");
  const missing = Object.keys(full.moves).filter((id) => !moveDesc(id));
  assertEqual(missing, [], `every full-sim move has a description (${Object.keys(full.moves).length})`);
  assertEqual(moveDetails("mist", { accuracy: true }), { desc: moveDesc("mist"), acc: true, priority: null }, "status move: never misses, no priority");
  assertEqual(moveDetails("quickattack", { accuracy: 100 }).priority, 1, "Quick Attack: priority +1");
  assertEqual(moveDetails("trickroom", { accuracy: true }).priority, -7, "Trick Room: -7");
}

section("Move info the dashboard gets");
{
  const m = moveInfo("mist");
  assertTrue(m.desc.length > 0 && m.acc === true, "moveInfo carries desc and acc");
  assertEqual("accuracy" in m, false, "no `accuracy`, so rows don't print 'never misses' on every status move");
  const u = createNewUser("1", "T");
  u.pokemon[131] = { normal: 1, shiny: 0 }; // Lapras learns Mist
  u.training = { "131:normal": { exp: 40 ** 3 } };
  normalizeBox(u);
  const d = pokemonDetail(u, 131).body;
  const all = [...d.copies.normal.learnable, ...d.copies.normal.moves, ...d.copies.normal.each[0].learnable, ...(d.learnset?.levelUp ?? []), ...(d.learnset?.tm ?? [])];
  assertTrue(all.length > 0 && all.every((x) => typeof x.desc === "string" && x.desc.length > 0), `every move in the details carries a desc (${all.length})`);
  assertTrue(d.copies.normal.learnable.some((x) => x.id === "mist"), "Lapras can pick Mist");
}

section("Rows");
{
  const line = (id) => moveDescLine(moveInfo(id));
  assertEqual(line("mist"), '<span class="cc-movedesc">For 5 turns, protects user&#39;s party from stat drops.</span>', "Mist: its text, no 'never misses' on a status move");
  assertTrue(line("dragonbreath").includes("30% chance to paralyze the target.") && !line("dragonbreath").includes("accuracy"), "Dragon Breath: text, 100% accuracy left out");
  assertEqual(line("tackle"), "", "plain attack: 'No additional effect.' and 100% left out, so no line");
  assertTrue(line("thunderwave").includes("90% accuracy"), "below 100% is shown");
  assertTrue(line("aerialace").includes("Never misses"), "an attack that never misses says so");
  assertTrue(line("quickattack").includes("Moves first (priority +1)"), "priority shown");
  assertEqual(moveDescLine({ name: "Old", id: "x" }), "", "older server (no desc): nothing");
  const row = moveRow(moveInfo("mist"), { on: false, full: false, recommended: false, meta: "", details: line("mist") });
  assertTrue(row.includes("cc-movedesc") && !row.includes("<button"), "editor row: the line under the move, no button");
}

finish();
