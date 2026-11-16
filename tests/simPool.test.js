// ==========================================================
// tests/simPool.test.js
// Fights under FULL_SIM_ENABLED: the sim worker gives the same result as
// running inline; with the switch off nothing becomes async; Battles and
// Elite Four runs await the worker; a run keeps the engine it started on;
// HP and status carry between Elite Four fights.
// ==========================================================

import { assertEqual, assertTrue, section, finish } from "./harness.js";
import { simulateBattle, loadFullSim } from "../utils/battle/sim.js";
import { simulateAsync, simulateLive, closeSimPool, settleSimJobs, simPoolStats, useWorkerScript } from "../utils/battle/simPool.js";
import { runBattle } from "../utils/battle/runBattle.js";
import { startRun, continueRun, carryHp, finishAllOpenRuns, finishOpenRun } from "../utils/challenge/runChallenge.js";
import { createNewUser } from "../utils/userSchema.js";

await loadFullSim(); // the full sim loads on first use (utils/battle/sim.js)

const D = new Date("2026-11-09T12:00:00Z");
const GYMS = ["brock", "misty", "surge", "erika", "koga", "sabrina", "blaine", "giovanni"];
const side = (...ids) => ({ members: ids.map((speciesId) => ({ speciesId, variant: "normal", name: `#${speciesId}`, level: 50 })) });
const input = { sides: [side(25, 6, 9), side(3, 143, 94)], seed: 77, surge: null };
const withSwitch = async (on, fn) => {
  const saved = process.env.FULL_SIM_ENABLED;
  if (on) process.env.FULL_SIM_ENABLED = "1"; else delete process.env.FULL_SIM_ENABLED;
  try { return await fn(); } finally { if (saved === undefined) delete process.env.FULL_SIM_ENABLED; else process.env.FULL_SIM_ENABLED = saved; }
};
function player(id, speciesIds, level) {
  const u = createNewUser(id, `Trainer ${id}`);
  for (const sid of speciesIds) {
    u.pokemon[sid] = { normal: 1, shiny: 0 };
    u.training ??= {};
    u.training[`${sid}:normal`] = { exp: level ** 3 };
  }
  u.displayedPokemon = speciesIds.map((sid) => ({ id: sid, variant: "normal" }));
  u.cc = 5000;
  return u;
}

section("Worker");
{
  const inline = simulateBattle({ ...input, engine: "full" });
  const pooled = await simulateAsync({ ...input, engine: "full" });
  assertEqual(pooled, inline, "the sim worker returns exactly the inline result");
  assertEqual(inline.v, 2, "the full engine's result");
}

section("Switch off");
await withSwitch(false, () => {
  const r = simulateLive(input);
  assertTrue(typeof r?.then !== "function" && r.v === undefined, "with the switch off a fight stays synchronous on today's engine");
});

section("A Battle on the full sim");
await withSwitch(true, async () => {
  const td = { A: player("A", [25, 6, 9], 40), B: player("B", [3, 143, 94], 40) };
  const pending = runBattle({ trainerData: td, challengerId: "A", defenderId: "B", mode: "open", seed: 5, now: D });
  assertTrue(typeof pending?.then === "function", "with the switch on, runBattle returns a Promise");
  const out = await pending;
  assertEqual([out.ok, out.result.v, Object.keys(out.exp)], [true, 2, ["A"]], "it fights on the full engine and pays the Challenger's EXP once");
});

section("Elite Four carry-over");
{
  const team = [{ name: "a" }, { name: "b" }, { name: "c" }];
  const carried = carryHp(team, [0.4, 0, 1], ["psn", "", ""], 1);
  assertEqual(carried.members.map((m) => [m.hpFraction, m.status ?? ""]), [[0.4, "psn"], [1, ""], [1, ""]], "HP and status carry; a Revive brings a Pokémon back at full HP with no status");
  assertEqual(carryHp(team, [0.4, 0, 1], undefined, null).members.map((m) => m.status ?? ""), ["", "", ""], "a result without status (today's engine) carries none");
}
await withSwitch(true, async () => {
  const td = { A: player("A", [150, 249, 250, 384, 483, 484], 100) };
  td.A.challenge = { won: Object.fromEntries(GYMS.map((k) => [k, "2026-11-01"])), day: null, attempts: 0 };
  const first = await startRun({ trainerData: td, userId: "A", seed: 1, now: D });
  assertEqual([first.ok, td.A.challenge.run?.engine], [true, "full"], "a run started on the full sim is stamped with it");
  delete process.env.FULL_SIM_ENABLED;
  const next = await continueRun({ trainerData: td, userId: "A", nonce: first.nonce, step: first.step + 1, slot: null, now: D });
  assertEqual(next.view.fights.at(-1).result?.v, 2, "after the switch flips, the run still finishes on the engine it started on");
});

section("A worker that exits without an error");
{
  await closeSimPool();
  useWorkerScript(new URL("./fixtures/simWorkerExits.mjs", import.meta.url));
  const failed = await simulateAsync({ ...input, engine: "full" }).then(() => null, (err) => err.message);
  assertTrue(/exited \(code 3\)/.test(failed ?? ""), "its fight fails instead of hanging (and both players' locks with it)");
  await closeSimPool();
  useWorkerScript(null);
  const again = await simulateAsync({ ...input, engine: "full" });
  assertEqual(again.v, 2, "the pool works again afterwards");
}

section("A worker that can't load the engine");
{
  await closeSimPool();
  useWorkerScript(new URL("./fixtures/simWorkerFails.mjs", import.meta.url));
  const failed = await simulateAsync({ ...input, engine: "full" }).then(() => null, (err) => err.message);
  assertEqual(failed, "engine failed to load", "the fight fails with the load error");
  await new Promise((resolve) => setTimeout(resolve, 1000));
  assertEqual(simPoolStats().workers, 0, "with no fights waiting, no replacement starts (no respawn loop)");
  const both = await Promise.all([1, 2].map(() => simulateAsync({ ...input, engine: "full" }).then(() => "ok", () => "failed")));
  assertEqual(both, ["failed", "failed"], "fights waiting behind it fail too, after a few delayed retries");
  await new Promise((resolve) => setTimeout(resolve, 1000));
  assertEqual(simPoolStats().workers, 0, "and nothing keeps respawning");
  await closeSimPool();
  useWorkerScript(null);
}

section("Shutdown waits for fights in progress");
await withSwitch(true, async () => {
  const td = { A: player("A", [25, 6, 9], 40), B: player("B", [3, 143, 94], 40) };
  const pending = runBattle({ trainerData: td, challengerId: "A", defenderId: "B", mode: "open", seed: 9, now: D });
  const games = () => (td.A.casual?.wins ?? 0) + (td.A.casual?.losses ?? 0);
  assertEqual(games(), 0, "nothing is applied while the fight is on the worker");
  assertEqual(await settleSimJobs(10_000), true, "settleSimJobs waits for it");
  assertEqual(games(), 1, "and its result is applied before a shutdown's save");
  await pending;
  assertEqual(await settleSimJobs(10), true, "nothing running: returns at once");
});

section("An Elite Four run saved while its fight was on the worker");
await withSwitch(true, async () => {
  const td = { A: player("A", [150, 249, 250, 384, 483, 484], 100) };
  td.A.challenge = { won: Object.fromEntries(GYMS.map((k) => [k, "2026-11-01"])), day: null, attempts: 0 };
  const first = startRun({ trainerData: td, userId: "A", seed: 1, now: D });
  const saved = JSON.parse(JSON.stringify(td)); // a save during the first fight
  const step = await first;
  assertEqual(saved.A.challenge.run.hp, null, "the save holds a run whose first fight never finished");
  const done = await finishAllOpenRuns(saved, new Date(D.getTime() + 20 * 60 * 1000));
  assertEqual([done.length, !!saved.A.challenge.run], [1, false], "a restart finishes it instead of leaving it open for good");
  assertEqual(done[0].outcome.fights[0].winnerId, step.view.fights[0].winnerId, "replaying the same first fight");

  // A save during a later fight: its break is recorded, the fight isn't.
  const td2 = { A: player("A", [150, 249, 250, 384, 483, 484], 100) };
  td2.A.challenge = { won: Object.fromEntries(GYMS.map((k) => [k, "2026-11-01"])), day: null, attempts: 0 };
  const s1 = await startRun({ trainerData: td2, userId: "A", seed: 1, now: D });
  const second = continueRun({ trainerData: td2, userId: "A", nonce: s1.nonce, step: s1.step + 1, slot: null, now: D });
  const saved2 = JSON.parse(JSON.stringify(td2));
  await second;
  assertEqual([saved2.A.challenge.run.breaks.length, saved2.A.challenge.run.next], [1, 1], "the save holds the break but not its fight");
  const outcome = await finishOpenRun({ trainerData: saved2, userId: "A", now: D });
  assertEqual(outcome.breaks.length, outcome.fights.length - 1, "the restart records that break once");
});

await closeSimPool();
finish();
