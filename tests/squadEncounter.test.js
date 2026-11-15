// ==========================================================
// tests/squadEncounter.test.js
// The Squirtle Squad, a rare Trainer encounter (docs/superpowers/specs/
// 2026-11-14-squirtle-squad-design.md): the seeded 1-in-100 roll, the fixed
// party, the card's copy, the fight and its prize (the Squirtle Squad
// Leader, once per player), the result lines, and the service's
// announcement. Synthetic data only.
// ==========================================================

import { assertEqual, assertTrue, section, finish } from "./harness.js";
import { SQUAD_CLASS_KEY, SQUAD_TEXT, squadFromSeed, squadTrainer, squadBroadcast } from "../utils/encounter/squad.js";
import { broadcastReward } from "../utils/broadcastReward.js";
import { fightEncounter } from "../utils/encounter/runEncounter.js";
import { rollTrainer } from "../utils/encounter/generate.js";
import { createEncounterService } from "../utils/encounter/service.js";
import { encounterCardView, encounterAltText, renderEncounterCard } from "../utils/render/encounterCard.js";
import { encounterNames, encounterSummary } from "../utils/battle/playback.js";
import { ENCOUNTER, PLAYBACK } from "../utils/battle/tuning.js";
import { createNewUser } from "../utils/userSchema.js";
import { buildTeam } from "../utils/battle/runBattle.js";
import { getMove } from "../utils/battle/data.js";
import { levelForExp } from "../utils/training.js";
import { lockUser } from "../utils/userLocks.js";

PLAYBACK.delayMs = 0;
const NOW = new Date("2026-11-14T12:00:00Z");
const LEADER_STATS = { hp: 66, atk: 72, def: 97, spa: 75, spd: 96, spe: 64 };
const SQUAD_SEED = 145; // squadFromSeed(145) is true (the first such seed)
const WIN_SEED = 146; // the service fights with the card's seed + 1; the Lv 100 team wins it

function player(speciesIds, level, cc = 12345) {
  const u = createNewUser("A", "A");
  for (const sid of speciesIds) {
    u.pokemon[sid] = { normal: 1, shiny: 0 };
    (u.training ??= {})[`${sid}:normal`] = { exp: level ** 3 };
  }
  u.displayedPokemon = speciesIds.map((sid) => ({ id: sid, variant: "normal" }));
  u.cc = cc;
  return u;
}
const STRONG = () => player([150, 249, 250, 384, 483, 484], 100);
const WEAK = () => player([10], 5);
const card = (user) => buildTeam(user).map(({ speciesId, variant, copyUid }) => ({ speciesId, variant, ...(copyUid && { copyUid }) }));
const fight = (user, trainer = squadTrainer(), seed = WIN_SEED) =>
  fightEncounter({ trainerData: { A: user }, userId: "A", encounter: { team: card(user), trainer }, seed, now: NOW });
const leaders = (user) => Object.values(user.box ?? {}).filter((r) => r.variant === "squad-leader");

section("The roll");
{
  assertEqual(squadFromSeed(1), false, "seed 1 (the flow tests' seed) is an ordinary Trainer");
  assertEqual(squadFromSeed(SQUAD_SEED), true, "fixture: seed 145 is the Squad");
  let hits = 0;
  for (let s = 1; s <= 20000; s++) if (squadFromSeed(s)) hits++;
  assertTrue(hits / 20000 >= 0.005 && hits / 20000 <= 0.015, `about 1 in 100 encounters is the Squad (${hits / 200}%)`);
  assertEqual(ENCOUNTER.squadShare, 0.01, "squadShare tuning");
}

section("The Squad");
{
  const t = squadTrainer();
  const leader = { speciesId: 7, level: 100, variant: "squad-leader", name: "Squirtle Squad Leader", moves: ["surf", "hydropump", "aquatail", "bite"], statMult: 1.7 };
  const member = { speciesId: 7, level: 25, variant: "squad-member", name: "Squirtle" };
  assertEqual(t.party, [leader, member, member, member, member, member], "the Leader at Lv 100 leads five Lv 25 Squad members");
  assertTrue(t.party[0].moves.every((m) => getMove(m)), "the Leader's moves all exist");
  assertEqual([t.classKey, t.squad, t.title, t.name, t.spriteFile, t.prize, t.surprise], [SQUAD_CLASS_KEY, true, "Squirtle Squad", "Leader", "squirtlesquadleader.png", 0, false], "the Squad as a Trainer");
  assertEqual(t.lines, { intro: "Squirtle! Squirt squirtle!", lost: "Squirtle...", won: "Squirtle squirt!" }, "its lines");
  assertTrue(squadTrainer() !== t && squadTrainer().party[0] !== t.party[0], "each encounter gets its own copy of the party");
}

section("The card");
{
  const u = STRONG();
  const view = encounterCardView({ trainer: squadTrainer(), team: card(u), user: u, displayName: "Ash", prizes: [{ label: "Casual", prize: 0 }, { label: "Ranked", prize: 0 }] });
  assertEqual([view.heading, view.line, view.stakes, view.prizes], ["You've crossed paths with the Squirtle Squad", "Squirtle! Squirt squirtle!", "???", null], "heading, line and a ??? prize");
  const alt = encounterAltText(view);
  assertTrue(alt.includes("???") && !/CC/.test(alt), "the alt text says ??? and never CC");
  const png = await renderEncounterCard(view);
  assertTrue(Buffer.isBuffer(png) && png.length > 1000, "the card renders");
  const plain = encounterCardView({ trainer: rollTrainer({ team: [{ level: 10 }], seed: 1 }), team: card(u), user: u, displayName: "Ash" });
  assertEqual(plain.stakes, null, "an ordinary Trainer's card keeps its CC stakes");
}

section("The fight");
{
  const u = STRONG();
  const out = fight(u);
  assertTrue(out.ok && out.won, "fixture: the Lv 100 team beats the Squad");
  assertEqual(out.special, { key: "squad-leader", granted: true }, "a first win grants the Leader");
  const [rec] = leaders(u);
  assertEqual([leaders(u).length, levelForExp(rec?.exp ?? 0)], [1, 25], "the Leader is in the box at Lv 25");
  assertEqual([u.cc, out.prize, out.paid], [12345, 0, 0], "no CC either way");
  const [lead, firstMember] = out.sides[1].members;
  assertEqual([lead.variant, lead.name, lead.statMult, lead.moves, lead.battleProfile?.baseStats], ["squad-leader", "Squirtle Squad Leader", 1.7, ["surf", "hydropump", "aquatail", "bite"], LEADER_STATS], "the Leader fights with its own stats, boost and moves");
  assertEqual([firstMember.variant, firstMember.level, firstMember.battleProfile, firstMember.moves], ["squad-member", 25, undefined, undefined], "a Squad member fights as a Lv 25 Squirtle with automatic moves");

  const again = fight(u);
  assertEqual([again.won, again.special, leaders(u).length], [true, { key: "squad-leader", granted: false }, 1], "owner win grants nothing: still one Leader");

  const weak = WEAK();
  const loss = fight(weak);
  assertEqual([loss.won, loss.special ?? null, weak.cc, leaders(weak).length], [false, null, 12345, 0], "a loss costs nothing and grants nothing");

  const youngster = rollTrainer({ team: [{ level: 10 }], seed: 1 });
  const plain = fight(STRONG(), youngster, 1);
  assertTrue(plain.sides[1].members.every((m) => m.variant === "normal" && !m.battleProfile && !m.statMult) && plain.special == null, "an ordinary Trainer's foes are unchanged");

  const names = encounterNames(out, "Ash");
  assertEqual(names.trainer, "Squirtle Squad Leader", "the Squad speaks as its Leader");
  assertEqual(encounterSummary(out, names).split("\n"), ['💬 Squirtle Squad Leader: "Squirtle..."', "The Squirtle Squad Leader has joined your party."], "granted win: the Leader joins");
  assertEqual(encounterSummary(again, names).split("\n").at(-1), "The Squirtle Squad salutes you!", "owner win: a salute");
  assertEqual(encounterSummary(loss, encounterNames(loss, "Ash")).split("\n"), ['💬 Squirtle Squad Leader: "Squirtle squirt!"', "Ash whited out!"], "a loss: the Squad cheers");
  assertTrue([out, again, loss].every((o) => !/CC/.test(encounterSummary(o, names))), "no result line mentions CC");
  assertEqual([SQUAD_TEXT.heading, SQUAD_TEXT.joined], ["You've crossed paths with the Squirtle Squad", "The Squirtle Squad Leader has joined your party."], "SQUAD_TEXT copy");
}

section("The announcement");
{
  const b = squadBroadcast({ userId: "A", displayName: "Ash *star*" });
  assertEqual(b.caption, "**Ash \\*star\\*** beat the Squirtle Squad and won the **Squirtle Squad Leader**!", "the caption, its name escaped");
  assertEqual([b.type, b.item, b.user.id], ["pokemon", { id: 7, name: "Squirtle Squad Leader", rarity: "rare", variant: "squad-leader" }, "A"], "a rare Pokémon broadcast of the Leader");
  const sent = [];
  const channel = (id) => ({ id, send: async (p) => { sent.push({ id, p }); } });
  const client = { channels: { cache: new Map([["G", channel("G")], ["R", channel("R")]]), fetch: async () => null } };
  process.env.REWARD_CHANNEL_ID = "G";
  process.env.RARE_SIGHTINGS_CHANNEL_ID = "R";
  await broadcastReward(client, b);
  assertEqual(sent.map((s) => s.id), ["G", "R"], "it reaches the reward and rare channels");
  assertTrue(sent.every((s) => s.p.content === b.caption && s.p.files?.length === 1 && s.p.allowedMentions?.parse?.length === 0), "as a card under the Squad's caption, pinging no one");
}

// ==========================================================
// The service, with stub Discord objects and fake timers
// ==========================================================

function world({ user = STRONG(), seed = SQUAD_SEED } = {}) {
  const trainerData = { A: user };
  const log = { sent: [], events: [], views: [], plays: [], announced: [] };
  const timers = new Map();
  let ids = 0;
  let clock = new Date(NOW);
  const channel = {
    id: "C1",
    permissionsFor: () => ({ has: () => true }),
    send: async (o) => {
      const m = { id: `M${log.sent.length + 1}`, opts: o, edits: [], channel, edit: async (e) => { m.edits.push(e); } };
      log.sent.push(m);
      return m;
    },
  };
  const message = { author: { id: "A", username: "A" }, member: { displayName: "Ash" }, guild: { members: { me: { id: "BOT" } } }, channel };
  const service = createEncounterService({
    getTrainerData: () => trainerData,
    lockUser,
    enqueueSave: () => {},
    random: () => 0,
    now: () => clock,
    seed: () => seed,
    setTimer: (fn) => { const id = ++ids; timers.set(id, fn); return id; },
    clearTimer: (id) => { timers.delete(id); },
    render: async (view) => { log.views.push(view); return Buffer.from("PNG"); },
    renderExp: async () => Buffer.from("PNG"),
    play: async (_ch, _msg, outcome) => { log.plays.push(outcome); },
    recordFight: () => {},
    log: async (type, userId, data) => { log.events.push({ type, userId, ...data }); },
    announce: async (a) => { log.announced.push(a); },
  });
  const click = (customId) => {
    const i = {
      customId, user: { id: "A" }, channel, followUps: [], edits: [], updates: [],
      deferUpdate: async () => {}, editReply: async (o) => { i.edits.push(o); }, followUp: async (o) => { i.followUps.push(o); }, update: async (o) => { i.updates.push(o); },
    };
    return i;
  };
  const buttons = (m) => m.opts.components[0].toJSON().components.map((c) => c.custom_id);
  return { user, log, service, message, click, buttons, timers, advance: (ms) => { clock = new Date(clock.getTime() + ms); } };
}

section("The service");
{
  const w = world();
  w.user.battleTeam = w.user.displayedPokemon.map((s) => ({ ...s }));
  await w.service.maybeSpot(w.message);
  const posted = w.log.sent[0];
  assertEqual(w.log.views[0]?.heading, SQUAD_TEXT.heading, "a Squad seed posts the Squad's card");
  assertEqual(posted?.opts.content, "<@A>", "with no Prize money note");
  assertTrue(posted?.opts.files?.[0]?.description?.includes("???"), "its alt text shows the ??? prize");
  assertEqual(w.log.events.find((e) => e.phase === "spotted")?.classKey, SQUAD_CLASS_KEY, "the spotted log records the Squad");
  const ranked = w.buttons(posted).find((id) => id.endsWith(":battle_ranked"));
  assertTrue(!!ranked, "fixture: the player can pick either team");
  const i = w.click(ranked);
  await w.service.handleButton(i);
  const outcome = w.log.plays[0];
  assertTrue(outcome?.trainer?.squad === true && outcome.won, "the Ranked pick fights the Squad too, and wins");
  assertEqual(w.log.announced.map((a) => [a.userId, a.displayName, a.channel?.id]), [["A", "Ash", "C1"]], "a granted win is announced once");
  assertTrue(!/You paid/.test(i.followUps[0]?.content ?? ""), "the EXP card's caption never says You paid");

  // A second Squad win, after the gap: nothing more to grant or announce.
  w.advance(ENCOUNTER.gapMs + 1);
  await w.service.maybeSpot(w.message);
  const second = w.log.sent[1];
  await w.service.handleButton(w.click(w.buttons(second).find((id) => id.includes(":battle"))));
  assertEqual([w.log.plays[1]?.won, w.log.plays[1]?.special?.granted, w.log.announced.length], [true, false, 1], "owner win grants nothing and announces nothing");
}
{
  const w = world({ user: WEAK() });
  await w.service.maybeSpot(w.message);
  const i = w.click(w.buttons(w.log.sent[0]).find((id) => id.includes(":battle")));
  await w.service.handleButton(i);
  assertEqual([w.log.plays[0]?.won, w.user.cc, w.log.announced.length], [false, 12345, 0], "a Squad loss: no CC, no announcement");
  assertTrue(!/You paid/.test(i.followUps[0]?.content ?? ""), "and no You paid caption");
}
{
  const w = world({ seed: 1 });
  await w.service.maybeSpot(w.message);
  assertTrue(w.log.views[0]?.heading?.endsWith("challenged Ash!"), "seed 1: an ordinary Trainer, as before");
}

finish();
