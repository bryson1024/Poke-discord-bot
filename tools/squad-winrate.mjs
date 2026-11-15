// tools/squad-winrate.mjs — how often a player's team beats the Squirtle Squad.
//
// The Squad (design 2026-11-14): the Squirtle Squad Leader at Lv 100 leads
// off, then five Lv 25 Squirtle. The leader has Squirtle's stat spread scaled
// to a 470 base stat total and carries Surf, Hydro Pump, Aqua Tail and Bite.
// Each sample team is six random final-stage evolutions (species with a
// pre-evolution and no further one) at one Level, with automatic movesets,
// fought with the real simulator. Design target: Lv 90+ teams win about half
// the time.
//
//   node tools/squad-winrate.mjs [teamsPerLevel=400] [--leader-level=100] [--leader-total=470]
//                                [--leader-mult=1] [--member-level=25] [--leader-last=0]
// --leader-mult multiplies the leader's stats in the fight only, the way
// Challenge opponents get CHALLENGE.statBoost.
import fs from "fs";
import { simulateBattle } from "../utils/battle/sim.js";

const args = process.argv.slice(2);
const opt = (name, dflt) => Number(args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? dflt);
const TEAMS = Number(args.find((a) => /^\d+$/.test(a)) ?? 400);
const LEADER_LEVEL = opt("leader-level", 100);
const LEADER_TOTAL = opt("leader-total", 470);
const LEADER_MULT = opt("leader-mult", 1);
const MEMBER_LEVEL = opt("member-level", 25);
const LEADER_LAST = opt("leader-last", 0) === 1;

const battle = JSON.parse(fs.readFileSync(new URL("../battleData.json", import.meta.url), "utf8"));
const dex = JSON.parse(fs.readFileSync(new URL("../pokemonData.json", import.meta.url), "utf8"));

const squirtle = battle.species["7"];
const total = Object.values(squirtle.baseStats).reduce((a, b) => a + b, 0);
const leaderStats = Object.fromEntries(Object.entries(squirtle.baseStats).map(([k, v]) => [k, Math.round((v * LEADER_TOTAL) / total)]));
const leader = {
  speciesId: 7, variant: "normal", name: "Squirtle Squad Leader", level: LEADER_LEVEL,
  battleProfile: { baseStats: leaderStats, types: [...squirtle.types], name: "Squirtle Squad Leader" },
  moves: ["surf", "hydropump", "aquatail", "bite"],
  ...(LEADER_MULT !== 1 && { statMult: LEADER_MULT }),
};
const members = Array.from({ length: 5 }, () => ({ speciesId: 7, variant: "normal", name: "Squirtle", level: MEMBER_LEVEL }));
const squad = LEADER_LAST ? [...members, leader] : [leader, ...members];

const finals = Object.keys(battle.species)
  .map(Number)
  .filter((id) => dex[id]?.evolvesFrom?.length && !dex[id]?.evolvesTo?.length);

// mulberry32: a fixed sample, so reruns compare like with like
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

console.log(`Squad leader Lv ${LEADER_LEVEL}, base stats ${JSON.stringify(leaderStats)} (total ${Object.values(leaderStats).reduce((a, b) => a + b, 0)}), fight stat ×${LEADER_MULT}, ${LEADER_LAST ? "last" : "first"}; members Lv ${MEMBER_LEVEL}`);
console.log(`${finals.length} final-stage species sampled, ${TEAMS} teams per Level\n`);
console.log("Level  player wins");
for (const level of [50, 60, 70, 80, 90, 100]) {
  const rand = rng(level * 7919);
  let wins = 0;
  for (let t = 0; t < TEAMS; t++) {
    const team = Array.from({ length: 6 }, () => {
      const id = finals[Math.floor(rand() * finals.length)];
      return { speciesId: id, variant: "normal", name: battle.species[id].name, level };
    });
    const { winner } = simulateBattle({ sides: [{ members: team }, { members: squad }], seed: Math.floor(rand() * 2 ** 31), surge: null });
    if (winner === 0) wins++;
  }
  console.log(`Lv ${String(level).padEnd(4)} ${((100 * wins) / TEAMS).toFixed(1)}%`);
}
