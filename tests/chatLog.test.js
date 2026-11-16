// ==========================================================
// tests/chatLog.test.js
// Economy audit 2026-11, D10: chat CC is logged. Chat is not capped (D3 was
// declined: activity drives the game).
// ==========================================================

import { createMessageHandler } from "../utils/passiveChat.js";
import { NO_EFFECTS } from "../utils/liveEventRules.js";
import { assertTrue, assertEqual, section, finish } from "./harness.js";

function setup({ random = () => 0, candyChance = 0 } = {}) {
  const trainerData = {};
  const calls = { rewards: 0, logs: [] };
  let t = Date.UTC(2026, 10, 13, 12, 0, 0);
  const handler = createMessageHandler({
    isReady: () => true,
    getTrainerData: () => trainerData,
    normalizeUserSchema: (id, u) => ({ id, tp: 0, cc: 0, ...(u ?? {}) }),
    cooldowns: new Map(),
    config: { cooldownMs: 7000, tpGain: 2, ccChance: 0.02, ccGain: 100, candyChance },
    enqueueSave: () => {},
    queueRoleUpdate: () => {},
    giveRandomReward: async () => { calls.rewards++; return "missed"; },
    random,
    now: () => t,
    defer: (fn) => fn(),
    effects: () => NO_EFFECTS,
    log: (type, userId, data) => calls.logs.push({ type, userId, data }),
  });
  calls.reactions = [];
  const msg = { author: { id: "u1", bot: false }, guild: {}, channel: {}, react: async (e) => { calls.reactions.push(e); } };
  return { trainerData, calls, send: async () => { t += 10_000; await handler(msg); } };
}

section("Chat CC is logged");
{
  const s = setup();
  await s.send();
  assertEqual(s.calls.logs, [{ type: "chat_cc", userId: "u1", data: { cc: 100 } }], "one chat_cc event per CC award");
  const quiet = setup({ random: () => 0.99 });
  await quiet.send();
  assertEqual(quiet.calls.logs.length, 0, "no CC, nothing logged");
}

section("Chat Rare Candy");
{
  // First roll is CC (0.5 misses 2%), second is the candy (0.005 hits 1%).
  const rolls = [0.5, 0.005];
  const s = setup({ random: () => rolls.shift() ?? 0.99, candyChance: 0.01 });
  await s.send();
  assertEqual(s.trainerData.u1.items?.rare_candy, 1, "a Rare Candy found while chatting");
  assertEqual(s.calls.logs.map((l) => l.type), ["chat_rare_candy"], "logged");
  assertEqual(s.calls.reactions, ["🍬"], "the bot reacts 🍬 so the player knows");
  const off = setup({ random: () => 0 });
  await off.send();
  assertEqual(off.trainerData.u1.items?.rare_candy, undefined, "no candy when the chance isn't configured");
}

section("No daily cap");
{
  const s = setup();
  for (let i = 0; i < 500; i++) await s.send();
  assertEqual(s.trainerData.u1.tp, 1000, "500 rewarded messages all pay TP");
  assertEqual(s.calls.rewards, 500, "and all roll for a catch");
  assertTrue(s.trainerData.u1.chatToday === undefined, "no chat counter is kept");
}

finish();
