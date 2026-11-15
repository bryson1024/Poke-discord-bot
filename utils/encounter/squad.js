// ==========================================================
// utils/encounter/squad.js
// The Squirtle Squad (docs/superpowers/specs/2026-11-14-squirtle-squad-
// design.md): a rare Trainer encounter with a fixed party, the Squirtle
// Squad Leader at Lv 100 leading five Lv 25 Squad members. It plays for no
// CC either way; the first win grants the player the Squirtle Squad Leader
// (a Special variant, utils/specialVariants.js). The card's seed decides
// whether a spotting Trainer is the Squad, so both team picks of one card
// agree and a replayed seed gives the same Trainer.
// ==========================================================

import { escapeMarkdown } from "discord.js";
import { createRng } from "../battle/rng.js";
import { ENCOUNTER, SQUAD } from "../battle/tuning.js";
import { specialVariant } from "../specialVariants.js";

export const SQUAD_CLASS_KEY = "squirtlesquad";

export const SQUAD_TEXT = Object.freeze({
  heading: "You've crossed paths with the Squirtle Squad",
  intro: "Squirtle! Squirt squirtle!",
  prize: "???",
  joined: "The Squirtle Squad Leader has joined your party.",
  salutes: "The Squirtle Squad salutes you!",
  squadWon: "Squirtle squirt!",
  squadLost: "Squirtle...",
});

// Salted so the roll doesn't follow rollTrainer's first draw from the same seed.
export const squadFromSeed = (seed) => createRng(seed ^ 0x5eed5).next() < ENCOUNTER.squadShare;

/** The Squad as a Trainer, a fresh object each call (the card and the fight keep their own). */
export function squadTrainer() {
  const leader = {
    speciesId: 7, level: SQUAD.leaderLevel, variant: "squad-leader", name: specialVariant("squad-leader").name,
    moves: [...SQUAD.leaderMoves], statMult: SQUAD.statMult,
  };
  const member = () => ({ speciesId: 7, level: SQUAD.memberLevel, variant: "squad-member", name: specialVariant("squad-member").name });
  return {
    classKey: SQUAD_CLASS_KEY, squad: true, title: "Squirtle Squad", name: "Leader", spriteFile: "squirtlesquadleader.png",
    tier: "squad", surprise: false, prize: 0,
    party: [leader, ...Array.from({ length: SQUAD.members }, member)],
    lines: { intro: SQUAD_TEXT.intro, lost: SQUAD_TEXT.squadLost, won: SQUAD_TEXT.squadWon },
  };
}

/**
 * broadcastReward's arguments (after the client) for a player who just won
 * the Leader: the reward and rare channels, like a rare catch. No ping, like
 * every broadcast; the card in the player's channel already shows the win.
 */
export function squadBroadcast({ userId, displayName }) {
  const name = specialVariant("squad-leader").name;
  return {
    user: { id: userId, username: displayName },
    type: "pokemon",
    item: { id: 7, name, rarity: "rare", variant: "squad-leader" },
    source: "Squirtle Squad",
    caption: `**${escapeMarkdown(displayName)}** beat the Squirtle Squad and won the **${name}**!`,
  };
}
