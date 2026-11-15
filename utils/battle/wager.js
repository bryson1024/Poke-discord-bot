// ==========================================================
// utils/battle/wager.js
// Stake bookkeeping for Wager battles. The Challenger's Stake is held
// (deducted) on offer and saved on the user, so a restart can refund it.
// Every refund/accept checks the offer's nonce, so a late click, an
// expiry, and a restart refund can never move the same CC twice.
// ==========================================================

import { WAGER } from "./tuning.js";
import { registeredSpecies } from "../../services/box.js";

const DISCORD_EPOCH = 1_420_070_400_000;
const DAY_MS = 86_400_000;

/** When a Discord account was made, from its id (a snowflake); null for an id that isn't one. */
export function accountCreatedAt(userId) {
  if (!/^\d{15,21}$/.test(String(userId ?? ""))) return null;
  return Number(BigInt(userId) >> 22n) + DISCORD_EPOCH;
}

/**
 * Why this player can't take part in a Wager battle yet, or null.
 * "new_account": their Discord account is under WAGER.minAccountDays old.
 * "dex": fewer than WAGER.minDex species registered.
 * An id that isn't a Discord snowflake (test fixtures) skips the age check.
 */
export function wagerEligibility(user, userId, now = Date.now()) {
  const created = accountCreatedAt(userId);
  if (created != null && now - created < WAGER.minAccountDays * DAY_MS) return "new_account";
  if (registeredSpecies(user ?? {}).length < WAGER.minDex) return "dex";
  return null;
}

export function offerWager(challenger, { defenderId, stake, channelId, nonce, now }) {
  if (!Number.isInteger(stake) || stake < WAGER.minStake) return { ok: false, reason: "invalid_stake" };
  if (challenger.pendingWager) return { ok: false, reason: "pending_exists" };
  if ((challenger.cc ?? 0) < stake) return { ok: false, reason: "insufficient_cc" };
  challenger.cc -= stake;
  challenger.pendingWager = { defenderId, stake, channelId, messageId: null, nonce, expiresAt: now + WAGER.windowMs };
  return { ok: true };
}

export function attachMessage(challenger, nonce, messageId) {
  if (challenger.pendingWager?.nonce === nonce) challenger.pendingWager.messageId = messageId;
}

export function refundWager(challenger, nonce) {
  const pending = challenger.pendingWager;
  // An accepted wager is settled by its fight (settleStake / refundAccepted), never by expiry.
  if (!pending || pending.nonce !== nonce || pending.accepted) return 0;
  challenger.cc = (challenger.cc ?? 0) + pending.stake;
  challenger.pendingWager = null;
  return pending.stake;
}

// All-in: a Defender with less than the Stake puts up everything they have,
// and the Challenger gets the difference back.
// Both Stakes then stay in escrow on the offer (pendingWager.accepted) until
// the fight's result is applied (settleStake) or the fight fails
// (refundAccepted). A fight on the full sim's worker takes time, and a save
// or restart in that window must still find the Stakes, so a restart
// refunds both (refundAllPending).
export function acceptStake(challenger, defender, nonce, now) {
  const pending = challenger.pendingWager;
  if (!pending || pending.nonce !== nonce || pending.accepted) return { ok: false, reason: "no_wager" };
  if (pending.defenderId !== defender.id) return { ok: false, reason: "wrong_defender" };
  if (now > pending.expiresAt) return { ok: false, reason: "expired" };
  if ((defender.cc ?? 0) < WAGER.minStake) return { ok: false, reason: "no_cc" };
  const stake = Math.min(pending.stake, defender.cc);
  const refunded = pending.stake - stake;
  challenger.cc += refunded;
  defender.cc -= stake;
  challenger.pendingWager = { ...pending, accepted: { stake } };
  return { ok: true, stake, refunded };
}

/** The fight's result is applied (the winner has the pot): the escrow ends. */
export function settleStake(challenger, nonce) {
  if (challenger?.pendingWager?.nonce === nonce && challenger.pendingWager.accepted) challenger.pendingWager = null;
}

/** The fight couldn't run: each player gets their Stake back and the escrow ends. → the Stake, or 0. */
export function refundAccepted(challenger, defender, nonce) {
  const pending = challenger?.pendingWager;
  if (!pending || pending.nonce !== nonce || !pending.accepted) return 0;
  const { stake } = pending.accepted;
  challenger.cc = (challenger.cc ?? 0) + stake;
  if (defender) defender.cc = (defender.cc ?? 0) + stake;
  challenger.pendingWager = null;
  return stake;
}

export function refundAllPending(trainerData) {
  const refunded = [];
  for (const [userId, user] of Object.entries(trainerData)) {
    const pending = user?.pendingWager;
    if (!pending) continue;
    const { channelId, messageId } = pending;
    if (pending.accepted) {
      // Accepted, and its fight never finished: both Stakes go back.
      const stake = refundAccepted(user, trainerData[pending.defenderId], pending.nonce);
      refunded.push({ userId, stake, channelId, messageId, accepted: true, defenderId: pending.defenderId });
      continue;
    }
    refundWager(user, pending.nonce);
    refunded.push({ userId, stake: pending.stake, channelId, messageId });
  }
  return refunded;
}
