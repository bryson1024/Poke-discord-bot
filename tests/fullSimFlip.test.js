// ==========================================================
// tests/fullSimFlip.test.js
// Flipping FULL_SIM_ENABLED while an Elite Four run is open (review I5):
// the bot finishes every open run at startup, so a flip is exactly when a
// run fights on with the other setting. A run finishes on the engine
// stamped at its start, and that engine's data too (today's battleData.json
// for the legacy engine, the Gen 9 full-sim data for Showdown), and its
// Fight record re-runs the earlier fights the same way.
// ==========================================================

import { assertEqual, assertTrue, section, finish } from "./harness.js";
import { simulateBattle, loadFullSim } from "../utils/battle/sim.js";
import { autoMoveset } from "../utils/battle/moveset.js";
import { startRun, finishOpenRun } from "../utils/challenge/runChallenge.js";
import { challengeRecord } from "../utils/fightRecordBuild.js";
import { closeSimPool } from "../utils/battle/simPool.js";
import { createNewUser } from "../utils/userSchema.js";
import { markNewPlayer, CUTOVER_VERSION } from "../config/fullSim.js";
import { runCutover } from "../services/fullSimCutover.js";
import { buildTeam } from "../utils/battle/runBattle.js";
import { initializeUserSchema } from "../utils/trainerDataHelper.js";

await loadFullSim();

const withSwitch = (on, fn) => {
  if (on) process.env.FULL_SIM_ENABLED = "1"; else delete process.env.FULL_SIM_ENABLED;
  try { return fn(); } finally { delete process.env.FULL_SIM_ENABLED; }
};

section("A fight reads its engine's data, whatever the switch says");
{
  // A species whose last 4 attacks differ between the two data files.
  let changed = 25;
  for (let id = 1; id <= 649; id++) {
    if (JSON.stringify(autoMoveset(id, 40, {})) !== JSON.stringify(autoMoveset(id, 40, { FULL_SIM_ENABLED: "1" }))) { changed = id; break; }
  }
  const input = { sides: [{ members: [{ speciesId: changed, variant: "normal", name: "A", level: 40 }] }, { members: [{ speciesId: 143, variant: "normal", name: "B", level: 40 }] }], seed: 5, surge: null };
  const legacy = (on) => withSwitch(on, () => simulateBattle({ ...input, engine: "legacy" }));
  assertEqual(legacy(true).log, legacy(false).log, "today's engine fights with today's data with the switch on");
  const full = (on) => withSwitch(on, () => simulateBattle({ ...input, engine: "full" }));
  assertEqual(full(false).raw, full(true).raw, "the full sim fights with Gen 9 data with the switch off");
}

section("An Elite Four record after the switch turns on");
{
  const GYMS = ["brock", "misty", "surge", "erika", "koga", "sabrina", "blaine", "giovanni"];
  const STRONG = [150, 249, 250, 384, 483, 484];
  const u = createNewUser("A", "Ash");
  for (const sid of STRONG) {
    u.pokemon[sid] = { normal: 1, shiny: 0 };
    u.training ??= {};
    u.training[`${sid}:normal`] = { exp: 100 ** 3 };
  }
  u.displayedPokemon = STRONG.map((sid) => ({ id: sid, variant: "normal" }));
  u.challenge = { won: Object.fromEntries(GYMS.map((k) => [k, "2026-11-01"])), day: null, attempts: 0 };
  const td = { A: u };
  const now = new Date("2026-11-09T12:00:00Z");
  const first = startRun({ trainerData: td, userId: "A", seed: 1, now }); // today's engine
  assertTrue(!first.ended, "a run is open on today's engine");
  process.env.FULL_SIM_ENABLED = "1"; // the restart that turns the switch on finishes it
  try {
    const outcome = await finishOpenRun({ trainerData: td, userId: "A", now });
    assertEqual(outcome.engine, "legacy", "the run finishes on the engine it started on");
    const record = await challengeRecord(outcome, "Ash", td, { now });
    assertEqual(record.fights.filter((f) => f.missing).length, 0, "and its Fight record replays every fight");
  } finally {
    delete process.env.FULL_SIM_ENABLED;
  }
}

section("A player who joins after the switch is on");
withSwitch(true, () => {
  // A first chat message builds the record from {} (bot_final.js normalizeUserSchema).
  const fresh = markNewPlayer({});
  assertEqual(fresh.fullSimCutover, CUTOVER_VERSION, "a record built for a first chat message counts as cut over");
  assertEqual(initializeUserSchema("N2", "New").fullSimCutover, CUTOVER_VERSION, "so does trainerDataHelper's new record");
  fresh.id = "N";
  fresh.pokemon = { 1: { normal: 1, shiny: 0 } };
  fresh.training = { "1:normal": { exp: 40 ** 3 } };
  fresh.displayedPokemon = [{ id: 1, variant: "normal" }];
  const before = buildTeam(fresh)[0].moves ?? autoMoveset(1, 40);
  assertEqual(runCutover({ N: fresh }), 0, "the next start's cutover skips them");
  assertEqual(buildTeam(fresh)[0].moves ?? autoMoveset(1, 40), before, "so their moves don't change at a restart");
  const old = { id: "O" };
  markNewPlayer(old, {});
  assertEqual(old.fullSimCutover, undefined, "with the switch off nothing is stamped");
  const existing = { id: "E", fullSimCutover: undefined, pokemon: {}, displayedPokemon: [] };
  assertEqual(runCutover({ E: existing }), 1, "a player from before the switch is still cut over once");
});

await closeSimPool();
finish();
