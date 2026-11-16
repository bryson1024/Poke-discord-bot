// ==========================================================
// tests/fullSimEngine.test.js
// The Showdown engine core (utils/battle/showdown/engine.js): seeded
// determinism, our engine overrides (stat multiplier, a set's own base
// stats, damage roll, crit odds and crit damage), the turn cap, slot-order switching, and the
// fallback for a choice the engine refuses.
// ==========================================================

import { assertEqual, assertTrue, assertBetween, section, finish } from "./harness.js";
import { Dex } from "@pkmn/sim";
import { createBattle, drive, slotOf, publicLog } from "../utils/battle/showdown/engine.js";
import { readConditions } from "../utils/battle/showdown/conditions.js";
import { buildResult } from "../utils/battle/showdown/result.js";
import { computeStats } from "../utils/battle/stats.js";
import { memberSet } from "../utils/battle/showdown/sets.js";
import { specialBattleProfile } from "../utils/specialVariants.js";

const set = (species, moves, slot, o = {}) => ({
  name: `s${slot}`, species, moves, item: o.item ?? "", ability: o.ability ?? "", nature: "Hardy", gender: "",
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
  level: o.level ?? 50, ...(o.statMult && { statMult: o.statMult }), ...(o.baseStats && { baseStats: o.baseStats }),
});
const first = () => "move 1";
const byId = (ids) => (req) => {
  if (req.forceSwitch) return null; // the driver answers switch requests
  const moves = req.active[0].moves;
  const k = moves.findIndex((m) => ids.includes(m.id) && !m.disabled);
  return `move ${k >= 0 ? k + 1 : 1}`;
};
const logOf = (b) => publicLog(b).join("\n");

section("Determinism");
{
  const teams = () => [
    [set("Pikachu", ["thunderbolt", "quickattack", "irontail", "thunderwave"], 0), set("Snorlax", ["bodyslam", "rest"], 1)],
    [set("Gengar", ["shadowball", "sludgebomb", "willowisp", "hypnosis"], 0), set("Machamp", ["closecombat", "knockoff"], 1)],
  ];
  const run = (seed) => { const b = createBattle({ sets: teams(), seed }); drive(b, [first, first]); return logOf(b); };
  assertTrue(run(7) === run(7), "the same seed gives the same battle log");
  assertTrue(run(7) !== run(8), "a different seed gives a different battle");
}

section("Stat multiplier");
{
  const b = createBattle({ sets: [[set("Charizard", ["flamethrower"], 0, { statMult: 1.1 })], [set("Charizard", ["flamethrower"], 0)]], seed: 1 });
  const want = computeStats(Dex.species.get("Charizard").baseStats, 50);
  const [boosted, plain] = b.sides.map((s) => s.pokemon[0]);
  const stats = (p) => [p.maxhp, p.storedStats.atk, p.storedStats.def, p.storedStats.spa, p.storedStats.spd, p.storedStats.spe];
  assertEqual(stats(plain), [want.hp, want.atk, want.def, want.spa, want.spd, want.spe], "no multiplier: our stat formula (IV 15, EV 0, neutral nature)");
  assertEqual(stats(boosted), [want.hp, want.atk, want.def, want.spa, want.spd, want.spe].map((v) => Math.round(v * 1.1)), "×1.1 on every stat, HP included, rounded");
}

section("A set's own base stats");
{
  // The Squirtle Squad Leader is a Squirtle with its own base stats (data/pokedex/special-variants.json).
  const leader = specialBattleProfile("squad-leader");
  const b = createBattle({ sets: [[set("Squirtle", ["tackle"], 0, { baseStats: leader.baseStats, statMult: 1.7 })], [set("Squirtle", ["tackle"], 0)]], seed: 1 });
  const [own, plain] = b.sides.map((s) => s.pokemon[0]);
  const stats = (p) => [p.maxhp, p.storedStats.atk, p.storedStats.def, p.storedStats.spa, p.storedStats.spd, p.storedStats.spe];
  const at50 = (base) => { const c = computeStats(base, 50); return [c.hp, c.atk, c.def, c.spa, c.spd, c.spe]; };
  assertEqual(stats(plain), at50(Dex.species.get("Squirtle").baseStats), "a set without baseStats uses its species'");
  assertEqual(stats(own), at50(leader.baseStats).map((v) => Math.round(v * 1.7)), "a set's baseStats replace its species', and statMult still applies");
  const m = { speciesId: 7, variant: "squad-leader", name: leader.name, level: 50, moves: ["tackle"], battleProfile: leader };
  assertEqual([memberSet(m, { slot: 0 }).species, memberSet(m, { slot: 0 }).baseStats], ["Squirtle", leader.baseStats], "the Leader's full sim set is a Squirtle with its own base stats");
  assertEqual("baseStats" in memberSet({ speciesId: 7, variant: "normal", level: 50, moves: ["tackle"] }, { slot: 0 }), false, "a plain Squirtle's set has none");
}

section("Randomness");
{
  const b = createBattle({ sets: [[set("Snorlax", ["tackle"], 0)], [set("Snorlax", ["tackle"], 0)]], seed: 3 });
  const rolls = Array.from({ length: 2000 }, () => b.randomizer(100));
  assertEqual([Math.min(...rolls), Math.max(...rolls)], [80, 100], "damage roll runs 80–100%");
  let crits = 0, hits = 0;
  for (let seed = 1; seed <= 60 && hits < 3000; seed++) {
    const fight = createBattle({ sets: [[set("Blissey", ["tackle"], 0, { level: 100 })], [set("Blissey", ["tackle"], 0, { level: 100 })]], seed });
    drive(fight, [first, first], { turnCap: 60 });
    const lines = publicLog(fight);
    hits += lines.filter((l) => l.startsWith("|-damage|") && !l.includes("[from]")).length;
    crits += lines.filter((l) => l.startsWith("|-crit|")).length;
  }
  assertBetween(crits / hits, 0.065, 0.1, "crits land about 1 time in 12");
  const fight = createBattle({ sets: [[set("Snorlax", ["tackle"], 0)], [set("Snorlax", ["tackle"], 0)]], seed: 5 });
  fight.randomizer = (x) => x; // no roll, so only the crit changes the number
  const [src, tgt] = fight.sides.map((s) => s.pokemon[0]);
  const hit = (willCrit) => { const m = fight.dex.getActiveMove("tackle"); m.willCrit = willCrit; return fight.actions.getDamage(src, tgt, m); };
  assertBetween(hit(true) / hit(false), 1.85, 2.15, "a critical hit does ×2 damage");
}

section("Turn cap");
{
  const b = createBattle({ sets: [[set("Shuckle", ["splash"], 0)], [set("Shuckle", ["splash"], 0)]], seed: 1 });
  const { cappedAt } = drive(b, [first, first], { turnCap: 5 });
  assertEqual([cappedAt, b.ended], [5, false], "a fight nobody can end stops at the turn cap");
}

section("Slot order");
{
  // Slot 0 U-turns out; slot 1 (lowest healthy on the bench) comes in and is
  // knocked out; slot 0 is healthy again and comes back before slot 2.
  const b = createBattle({
    sets: [
      [set("Scizor", ["uturn"], 0), set("Magikarp", ["splash"], 1, { level: 5 }), set("Snorlax", ["bodyslam"], 2)],
      [set("Snorlax", ["bodyslam"], 0, { level: 60 })],
    ],
    seed: 2,
  });
  drive(b, [byId(["uturn", "splash", "bodyslam"]), first], { turnCap: 4 });
  const switchIns = publicLog(b).filter((l) => l.startsWith("|switch|p1a: ")).map((l) => Number(/p1a: s(\d+)/.exec(l)[1]));
  assertEqual(switchIns.slice(0, 3), [0, 1, 0], "after a U-turn and a faint, the lowest healthy slot comes in");
  assertEqual(slotOf(b.sides[0].pokemon.find((p) => p.name === "s2")), 2, "slotOf reads the slot from the nickname");
}

section("A refused choice");
{
  const b = createBattle({ sets: [[set("Pikachu", ["thundershock"], 0)], [set("Pikachu", ["thundershock"], 0)]], seed: 1 });
  let threw = false;
  try { drive(b, [() => "move 4", first]); } catch { threw = true; }
  assertTrue(!threw && b.ended, "a choice the engine refuses falls back to its default and the fight finishes");
}

section("Conditions after each turn");
{
  // conditions[0] before the leads come in, then one per turn (drive's onTurn).
  const play = (sets, choosers, { seed = 3, turnCap = 6 } = {}) => {
    let conditions;
    const b = createBattle({ sets, seed, beforeStart: (bb) => { conditions = [readConditions(bb, { before: true })]; } });
    const { cappedAt } = drive(b, choosers, { turnCap, onTurn: (bb) => conditions.push(readConditions(bb)) });
    return { b, conditions, cappedAt };
  };
  const byTurn = (moves) => (req, b) => (req.forceSwitch ? null : moves[Math.min(b.turn, moves.length) - 1]);
  const idle = () => "move 1";
  const wall = () => set("Snorlax", ["splash"], 0, { level: 60 });

  const tw = play([[set("Pikachu", ["thunderwave"], 0)], [wall()]], [idle, idle]);
  assertEqual(tw.conditions[0], { status: [[""], [""]], active: [null, null] }, "before the leads: statuses only, nobody in front");
  assertTrue(tw.conditions.slice(1).some((c) => c.status[1][0] === "par"), "Thunder Wave's paralysis is recorded on the target's slot");

  const sd = play([[set("Scizor", ["swordsdance"], 0)], [wall()]], [idle, idle]);
  assertEqual(sd.conditions[1].active[0], { slot: 0, boosts: { atk: 2 }, confused: false, seeded: false }, "Swords Dance: Attack +2 on the active Pokémon");

  const intim = play([[set("Gyarados", ["splash"], 0, { ability: "Intimidate" })], [wall()]], [idle, idle]);
  assertEqual(intim.conditions[1].active[1].boosts, { atk: -1 }, "Intimidate on the lead: the foe's Attack -1");

  const out = play([[set("Scizor", ["swordsdance"], 0), set("Snorlax", ["splash"], 1)], [wall()]], [(req, b) => (req.forceSwitch ? null : b.turn === 1 ? "move 1" : "switch 2"), idle]);
  assertEqual(out.conditions[2].active[0], { slot: 1, boosts: {}, confused: false, seeded: false }, "switching out leaves the stat changes behind");

  const haze = play([[set("Scizor", ["swordsdance", "splash"], 0)], [set("Weezing", ["haze", "splash"], 0, { level: 60 })]], [byTurn(["move 1", "move 2"]), byTurn(["move 2", "move 1"])]);
  assertEqual([haze.conditions[1].active[0].boosts, haze.conditions[2].active[0].boosts], [{ atk: 2 }, {}], "Haze clears them");

  const pass = play([[set("Scizor", ["swordsdance", "batonpass"], 0), set("Snorlax", ["splash"], 1)], [wall()]], [byTurn(["move 1", "move 2", "move 1"]), idle]);
  assertEqual([pass.conditions[2].active[0].slot, pass.conditions[2].active[0].boosts.atk], [1, 2], "Baton Pass hands them to the Pokémon coming in");

  const seed = play([[set("Gengar", ["confuseray", "leechseed"], 0)], [wall()]], [byTurn(["move 1", "move 2", "move 2", "move 2"]), idle]);
  assertTrue(seed.conditions[1].active[1].confused, "Confuse Ray: the target is confused");
  assertTrue(seed.conditions.slice(2).some((c) => c.active[1]?.seeded), "Leech Seed: the target is seeded");

  const capped = play([[set("Shuckle", ["splash"], 0)], [set("Shuckle", ["splash"], 0)]], [first, first], { turnCap: 5 });
  const r = buildResult(capped.b, { initial: [[1], [1]], cappedAt: capped.cappedAt, conditions: capped.conditions });
  assertEqual([r.endedBy, r.conditions.length, r.snapshots.length], ["turnCap", 6, 6], "a capped fight has one condition record per snapshot");
}

finish();
