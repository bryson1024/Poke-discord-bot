// ==========================================================
// tests/challengeMythics.test.js — on the full sim, the Elite Four, Blue and
// Red notice mythics on the player's Team (decided 2026-11-14). Each mythic,
// up to 3, raises their hidden stat boost a step toward
// FULL_SIM.mythicStatBoost, and each fight's heading gets a line from the
// opponent naming one. Gyms, and every fight on today's engine, stay as
// they were. The Levels this works out to are measured by
// tests/fullSimMythicBalance.slow.js.
// ==========================================================

import { assertEqual, assertTrue, section, finish } from "./harness.js";
import { simulateChallenge, runChallenge, startRun, continueRun } from "../utils/challenge/runChallenge.js";
import { closeSimPool } from "../utils/battle/simPool.js";
import { createNewUser } from "../utils/userSchema.js";
import { CHALLENGES } from "../utils/challenge/roster.js";
import { CHALLENGE, FULL_SIM } from "../utils/battle/tuning.js";
import { challengeHeader } from "../utils/battle/playback.js";
import { mythicLine } from "../catalog/challengeLines.js";
import { isMythicTier } from "../services/battleTeam.js";
import { displaySpeciesName } from "../utils/render/names.js";
import { readFileSync } from "fs";

const MEWTWO = 150, MEW = 151, RAYQUAZA = 384, GIRATINA = 487, ARCEUS = 493, DEOXYS = 386;
const team = (...ids) => ids.map((speciesId) => ({ speciesId, variant: "normal", name: `#${speciesId}`, level: 60 }));
const FILLER = [6, 9, 3, 65, 68, 94];
const withMythics = (n) => team(...[MEWTWO, MEW, RAYQUAZA, GIRATINA, ARCEUS, DEOXYS].slice(0, n), ...FILLER.slice(0, 6 - n));

// The first fight only (the stub loses it), as simulateChallenge builds it.
function firstFight(key, members, engine = "full") {
  let sides = null;
  const lose = (input) => { sides = input.sides; return { winner: 1, knockouts: [], snapshots: [[[0], [1]]] }; };
  const run = simulateChallenge({ team: members, opponents: CHALLENGES[key].opponents, seed: 7, engine, simulate: lose });
  return { foes: sides[1].members, fight: run.fights[0] };
}
const boostOf = (key, members, engine) => firstFight(key, members, engine).foes[0].statMult;

section("The stat boost");
{
  const base = FULL_SIM.challengeStatBoost.red, top = FULL_SIM.mythicStatBoost.red;
  assertTrue(top > base, "Red's 3-mythic boost is above his usual one");
  assertEqual(boostOf("red", withMythics(0)), base, "no mythics: Red fights with his usual boost");
  assertEqual(boostOf("red", withMythics(3)), top, "3 mythics: the full mythic boost");
  assertEqual(boostOf("red", withMythics(1)), base + (top - base) / 3, "1 mythic: a third of the way there");
  assertEqual(boostOf("red", withMythics(2)), base + (2 * (top - base)) / 3, "2 mythics: two thirds");
  assertEqual(boostOf("red", withMythics(6)), top, "past 3 mythics the boost stops rising");
  assertEqual(boostOf("blue", withMythics(3)), FULL_SIM.mythicStatBoost.blue, "Blue has his own");
  assertEqual(boostOf("elite4", withMythics(3)), FULL_SIM.mythicStatBoost.lorelei, "the run opens on Lorelei's");
  for (const o of CHALLENGES.elite4.opponents) {
    assertTrue(FULL_SIM.mythicStatBoost[o.key] > FULL_SIM.challengeStatBoost[o.key], `${o.name} notices mythics`);
  }
  for (const key of ["brock", "giovanni"]) {
    assertEqual(boostOf(key, withMythics(3)), FULL_SIM.challengeStatBoost[key], `${key}: mythics change nothing at a Gym`);
  }
  assertEqual(boostOf("red", withMythics(3), "legacy"), CHALLENGE.statBoost, "today's engine: mythics change nothing");
}

section("What the fight records");
{
  assertEqual(firstFight("red", team(6, GIRATINA, MEWTWO)).fight.mythics, { count: 2, speciesId: GIRATINA }, "how many, and the first one in Team order");
  assertEqual(firstFight("red", withMythics(0)).fight.mythics, null, "no mythics, nothing");
  assertEqual(firstFight("brock", withMythics(3)).fight.mythics, null, "a Gym Leader doesn't notice");
  assertEqual(firstFight("red", withMythics(3), "legacy").fight.mythics, null, "nor does anyone on today's engine");
}

section("The line under the heading");
{
  const outcome = (key, opponentKey, mythics) => ({ key, userId: "A", fights: [{ opponentKey, mythics, sides: [{ members: [] }, { members: [] }] }] });
  const lines = (key, opponentKey, mythics) => challengeHeader(outcome(key, opponentKey, mythics), 0).split("\n");
  assertEqual(lines("blue", "blue", null), ["⚔️ <@A> challenges Champion Blue!"], "no mythics: the heading alone");
  const blue = lines("blue", "blue", { count: 1, speciesId: GIRATINA });
  assertEqual(blue[0], "⚔️ <@A> challenges Champion Blue!", "the heading stays first");
  assertTrue(blue[1].startsWith("**Blue:** \"") && blue[1].includes("Giratina") && !blue[1].includes("altered"), `Blue names it as the games do: ${blue[1]}`);
  const lance = lines("elite4", "lance", { count: 1, speciesId: DEOXYS });
  assertTrue(lance.at(-1).startsWith("**Lance:** \"") && lance.at(-1).includes("Deoxys"), `Lance's line comes last: ${lance.at(-1)}`);
  assertEqual([1, 2, 3, 6].map((count) => mythicLine("red", { count, speciesId: RAYQUAZA })),
    ['**Red:** "..."', '**Red:** "......"', '**Red:** "........."', '**Red:** "........."'],
    "Red says nothing: only his silence grows, up to 3 mythics");
  assertEqual(mythicLine("brock", { count: 3, speciesId: RAYQUAZA }), null, "a Gym Leader has no line");
}

section("A line for every mythic");
{
  // Each speaker has their own line for each mythic (decided 2026-11-14).
  const pokemonData = JSON.parse(readFileSync(new URL("../pokemonData.json", import.meta.url)));
  const mythics = Object.keys(pokemonData).map(Number).filter(isMythicTier);
  assertTrue(mythics.length >= 44 && mythics.includes(489) && mythics.includes(808), `${mythics.length} mythic-tier species, Phione and Meltan among them`);
  for (const o of [...CHALLENGES.elite4.opponents, ...CHALLENGES.blue.opponents]) {
    const said = mythics.map((speciesId) => ({ speciesId, line: mythicLine(o.key, { count: 1, speciesId }) }));
    const unnamed = said.filter(({ speciesId, line }) => !line?.includes(displaySpeciesName(speciesId, pokemonData[speciesId].name)));
    assertEqual(unnamed.map((x) => x.speciesId), [], `${o.name} has a line naming each mythic`);
    assertEqual(new Set(said.map((x) => x.line)).size, mythics.length, `${o.name} never repeats a line`);
    const hints = said.filter(({ line }) => /serious|hold(ing)? back|go(ing)? easy|gloves|(try|fight|push) harder|all (i|we)'ve got|full (power|strength)|for real/i.test(line ?? ""));
    assertEqual(hints.map((x) => x.line), [], `${o.name} never hints they'd try less without one`);
    const quotes = said.filter(({ line }) => (line ?? "").slice(o.name.length + 7, -1).includes('"'));
    assertEqual(quotes.map((x) => x.line), [], `${o.name}'s lines have no double quotes inside`);
  }
}

section("Real fights on the full sim");
{
  // The live path: runChallenge and an Elite Four run on the sim worker,
  // with the frozen run Team, then the heading each replay posts under.
  const GYMS = ["brock", "misty", "surge", "erika", "koga", "sabrina", "blaine", "giovanni"];
  const ids = [GIRATINA, 6, 9, MEWTWO, 65, 68];
  const u = createNewUser("A", "Ash");
  for (const sid of ids) {
    u.pokemon[sid] = { normal: 1, shiny: 0 };
    u.training ??= {};
    u.training[`${sid}:normal`] = { exp: 100 ** 3 };
  }
  u.displayedPokemon = ids.map((sid) => ({ id: sid, variant: "normal" }));
  u.challenge = { won: Object.fromEntries(GYMS.map((k) => [k, "2026-11-01"])), day: null, attempts: 0 };
  const td = { A: u };
  const now = new Date("2026-11-14T12:00:00Z");
  process.env.FULL_SIM_ENABLED = "1";
  try {
    const red = await runChallenge({ trainerData: td, userId: "A", key: "red", seed: 1, now });
    assertEqual(red.engine, "full", "Red fights on the full sim");
    assertEqual(red.fights[0].mythics, { count: 2, speciesId: GIRATINA }, "the outcome keeps what Red noticed");
    assertEqual(challengeHeader(red, 0).split("\n")[1], '**Red:** "......"', "and his heading shows two mythics' worth of silence");
    const { challengeStatBoost: base, mythicStatBoost: top } = FULL_SIM;
    assertEqual(red.fights[0].sides[1].members[0].statMult, base.red + (2 * (top.red - base.red)) / 3, "his Team fought with the 2-mythic boost");

    const first = await startRun({ trainerData: td, userId: "A", seed: 1, now });
    const lorelei = challengeHeader(first.view, first.step).split("\n");
    assertEqual(lorelei[1], mythicLine("lorelei", { count: 2, speciesId: GIRATINA }), "Lorelei's fight opens with her line about Giratina");
    assertTrue(!first.ended, "the run goes on to Bruno");
    const second = await continueRun({ trainerData: td, userId: "A", nonce: first.view.nonce ?? first.nonce, step: first.step + 1, slot: null, now });
    assertEqual(challengeHeader(second.view, second.step).split("\n").at(-1), mythicLine("bruno", { count: 2, speciesId: GIRATINA }),
      "Bruno's fight, later in the run, still has his own line last");
  } finally {
    delete process.env.FULL_SIM_ENABLED;
    await closeSimPool();
  }
}

finish();
