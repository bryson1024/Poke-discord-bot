// ==========================================================
// services/fusionTeam.js — Black/White Kyurem on stored teams.
//
// A Kyurem team slot may carry `form: "kyurem-black" | "kyurem-white"`
// (utils/fusions.js). These helpers are shared by the three teams:
//   • storedFusion: normalization keeps a form only while it is unlocked
//     (Kyurem and its partner owned). When the partner is gone, the slot goes
//     back to plain Kyurem and the player gets a one-time notice.
//   • fusionSelectionError: a team save; refuses a malformed or locked form,
//     and (Casual / Ranked only) the team rule: no Kyurem, Zekrom or Reshiram
//     beside a fused Kyurem.
// Rollback: older builds ignore `form`, so the slot is plain Kyurem again.
// ==========================================================

import { getFusion, allFusions, fusionFieldOf, fusionFitsSlot, fusionTeamConflict, fusionUnlocked } from "../utils/fusions.js";
import { powerOfStats } from "../utils/battle/power.js";
import { RANKED } from "../utils/battle/tuning.js";
import { isKyuremFusionEnabled } from "../config/features.js";
import { addNotice, NOTICE_KINDS } from "./notices.js";

const fail = (status, error, code) => ({ ok: false, status, error, code });

/**
 * The form to keep on a stored slot, or null. A form that is no longer
 * unlocked is dropped with a notice naming the team (`teamLabel`).
 */
export function storedFusion(user, slot, entry, teamLabel, now = Date.now()) {
  const form = fusionFieldOf(entry);
  if (!form || !Number.isInteger(slot?.id)) return null;
  if (fusionFitsSlot(user, slot, form)) return form;
  const f = getFusion(form);
  // Only a slot that stays on the team (its Kyurem copy still owned) is worth a notice.
  if (f && f.species === slot.id && Number(user?.pokemon?.[slot.id]?.[slot.variant]) > 0) {
    addNotice(user, NOTICE_KINDS.FUSION_REVERT,
      `${f.name} went back to Kyurem on your ${teamLabel} team because you no longer own ${f.partnerName}. Get ${f.partnerName} back to use ${f.name} again.`, now);
  }
  return null;
}

/** True when a raw slot sent by the dashboard names a `form` at all. */
export const hasFormKey = (entry) => !!entry && typeof entry === "object" && !Array.isArray(entry) && entry.form !== undefined && entry.form !== null;

/**
 * A team save's fusion checks, or null when fine. `slots` are parsed
 * { id, variant, form? } slots (duplicates not yet removed). teamRule: false
 * for the Showcase (never fights).
 */
export function fusionSelectionError(user, slots, { env = process.env, teamRule = true } = {}) {
  const fused = slots.filter((s) => s.form);
  if (!fused.length) return null;
  if (!isKyuremFusionEnabled(env)) return fail(403, "Black and White Kyurem aren't available yet.", "fusion_disabled");
  for (const s of fused) {
    const f = getFusion(s.form);
    if (!f || f.species !== s.id) return fail(400, "That form doesn't belong to that Pokémon.", "wrong_species");
    if (s.mega) return fail(400, "A Pokémon can't use a Mega form and a fusion form at once.", "mega_and_fusion");
    if (!fusionFitsSlot(user, s, s.form)) return fail(400, `${f.name} needs Kyurem and ${f.partnerName} in your collection.`, "fusion_locked");
  }
  if (teamRule) {
    const conflict = fusionTeamConflict(slots);
    if (conflict) return fail(400, conflict.error, "fusion_team_rule");
    // Black/White Kyurem's 700 BST is Mega-level: it takes the team's one Mega slot.
    const mega = slots.find((s) => s.mega);
    if (mega) return fail(400, `${getFusion(fused[0].form).name} uses the team's Mega slot, so the team can't also have a Mega. Only one Mega or Black/White Kyurem per team.`, "fusion_mega_slot");
  }
  return null;
}

/**
 * The dashboard's view (GET /api/user-pokemon `fusion`): whether fusion is on
 * and, per form, whether each Kyurem line (normal/shiny) has it unlocked.
 */
export function fusionView(user, { env = process.env } = {}) {
  if (!isKyuremFusionEnabled(env)) return { enabled: false, forms: [] };
  return {
    enabled: true,
    forms: allFusions().map((f) => ({
      id: f.id,
      name: f.name,
      shortName: f.shortName,
      partner: f.partner,
      partnerName: f.partnerName,
      ability: f.ability,
      spriteId: f.spriteId,
      power50: powerOfStats(f.baseStats, RANKED.level),
      unlocked: { normal: fusionUnlocked(user, f.id, "normal"), shiny: fusionUnlocked(user, f.id, "shiny") },
    })),
  };
}
