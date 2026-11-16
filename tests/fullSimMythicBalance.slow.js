// ==========================================================
// tests/fullSimMythicBalance.slow.js — how much mythics help against the
// Elite Four, Blue and Red on the full sim (decided 2026-11-14). Without
// the mythic boost, a Team with 3 mythics cleared each of them about 10
// Levels lower than one with none. The owner wants that gap closer to 5,
// so each mythic, up to 3, steps the opponents' boost toward
// FULL_SIM.mythicStatBoost (utils/challenge/runChallenge.js).
//
// Gate Levels are measured as in tests/fullSimChallengeBalance.slow.js: 6
// stand-ins, here with the first `m` drawn from the fully evolved mythics,
// the rest from the usual non-legendary pool. Checks that 3 mythics land
// within a Level of 5 under the no-mythic gate, and that each mythic still
// helps (gates fall from 0 to 3). Runs with `npm run test:full-sim-balance`.
// ==========================================================

process.env.FULL_SIM_ENABLED = "1"; // set before any battle module reads it
import { readFileSync } from "fs";
import { assertTrue, section, finish } from "./harness.js";
import { simulateChallenge } from "../utils/challenge/runChallenge.js";
import { teamPower } from "../utils/battle/power.js";
import { CHALLENGES } from "../utils/challenge/roster.js";
import { catchBand } from "../utils/training.js";
import { isMythicTier } from "../services/battleTeam.js";
import { createRng } from "../utils/battle/rng.js";
import { loadFullSim } from "../utils/battle/sim.js";

await loadFullSim();

const started = Date.now();
const battleData = JSON.parse(readFileSync(new URL("../battleData.json", import.meta.url)));
const pokemonData = JSON.parse(readFileSync(new URL("../pokemonData.json", import.meta.url)));
const SEED = 20261109;
const N = 200;
const final = (id) => pokemonData[id] && !(pokemonData[id].evolvesTo ?? []).length;
const pool = Object.keys(battleData.species).map(Number).filter((id) => final(id) && catchBand(id) !== "legendary");
const mythicPool = Object.keys(battleData.species).map(Number).filter((id) => final(id) && isMythicTier(id));

function standIn(level, i, mythics) {
  const rng = createRng(SEED + i);
  const picked = new Set();
  while (picked.size < mythics) picked.add(mythicPool[rng.int(mythicPool.length)]);
  while (picked.size < 6) picked.add(pool[rng.int(pool.length)]);
  return [...picked].map((speciesId) => ({ speciesId, variant: "normal", level }));
}
const simSeed = (i) => SEED + 8 * i;
const pickStrongest = ({ team, hp }) => hp.reduce((best, h, slot) =>
  (h === 0 && (best === null || teamPower([team[slot]]) > teamPower([team[best]])) ? slot : best), null);

const winRate = (key, level, mythics) => {
  let wins = 0;
  for (let i = 0; i < N; i++) {
    if (simulateChallenge({ team: standIn(level, i, mythics), opponents: CHALLENGES[key].opponents, seed: simSeed(i), pick: pickStrongest, engine: "full" }).cleared) wins++;
  }
  return wins / N;
};
function gate(key, mythics) {
  if (winRate(key, 100, mythics) < 0.5) return 101;
  let lo = 1, hi = 100;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (winRate(key, mid, mythics) >= 0.5) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

section("Mythic pool");
assertTrue(mythicPool.length >= 40 && mythicPool.includes(487) && mythicPool.includes(150), `${mythicPool.length} fully evolved mythics, Giratina and Mewtwo among them`);

section("Gate Levels by mythics on the Team");
for (const key of ["elite4", "blue", "red"]) {
  const gates = [0, 1, 2, 3].map((m) => gate(key, m));
  console.log(`  ${CHALLENGES[key].label.padEnd(10)} ${gates.map((g, m) => `${m} mythic${m === 1 ? "" : "s"} Lv ${g}`).join(" · ")}`);
  assertTrue(Math.abs(gates[0] - 5 - gates[3]) <= 1, `${CHALLENGES[key].label}: 3 mythics clear it about 5 Levels lower (${gates[0]} → ${gates[3]})`);
  assertTrue(gates[0] >= gates[1] && gates[1] >= gates[2] && gates[2] >= gates[3], `${CHALLENGES[key].label}: each mythic still helps`);
}

console.log(`\n  (${((Date.now() - started) / 1000).toFixed(0)} s)`);
finish();
