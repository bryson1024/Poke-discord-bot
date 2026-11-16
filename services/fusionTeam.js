// ==========================================================
// services/fusionTeam.js — fusion forms (Black/White Kyurem, Dusk Mane /
// Dawn Wings Necrozma) on stored teams.
//
// A base Pokémon's team slot may carry `form` (utils/fusions.js). These
// helpers are shared by the three teams:
//   • storedFusion: normalization keeps a form only while it is unlocked
//     (base Pokémon and its partner owned). When the partner is gone, the
//     slot goes back to the base Pokémon and the player gets a one-time notice.
//   • fusionSelectionError: a team save; refuses a malformed, locked or
//     switched-off form, and (Casual / Ranked only) the team rules: no family
//     member beside a fused Pokémon, and one Mega slot per team (a Mega or a
//     fusion, not both, not two fusions).
// Rollback: older builds ignore `form`, so the slot is the base Pokémon again.
// ==========================================================

import { getFusion, allFusions, fusionFamily, fusionFieldOf, fusionFitsSlot, fusionTeamConflict, fusionUnlocked, isFusionFormEnabled } from "../utils/fusions.js";
import { powerOfStats } from "../utils/battle/power.js";
import { RANKED } from "../utils/battle/tuning.js";
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
  // Only a slot that stays on the team (its base copy still owned) is worth a notice.
  if (f && f.species === slot.id && Number(user?.pokemon?.[slot.id]?.[slot.variant]) > 0) {
    addNotice(user, NOTICE_KINDS.FUSION_REVERT,
      `${f.name} went back to ${fusionFamily(f).baseName} on your ${teamLabel} team because you no longer own ${f.partnerName}. Get ${f.partnerName} back to use ${f.name} again.`, now);
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
  for (const s of fused) {
    const f = getFusion(s.form);
    if (!f || f.species !== s.id) return fail(400, "That form doesn't belong to that Pokémon.", "wrong_species");
    if (!isFusionFormEnabled(s.form, env)) return fail(403, `${f.name} isn't available yet.`, "fusion_disabled");
    if (s.mega) return fail(400, "A Pokémon can't use a Mega form and a fusion form at once.", "mega_and_fusion");
    if (!fusionFitsSlot(user, s, s.form)) return fail(400, `${f.name} needs ${fusionFamily(f).baseName} and ${f.partnerName} in your collection.`, "fusion_locked");
  }
  if (teamRule) {
    const conflict = fusionTeamConflict(slots);
    if (conflict) return fail(400, conflict.error, "fusion_team_rule");
    // Fused forms have Mega-level stat totals: one takes the team's one Mega slot.
    const first = getFusion(fused[0].form).name;
    if (fused.length > 1) return fail(400, `${first} and ${getFusion(fused[1].form).name} both need the team's Mega slot. Only one Mega or fusion per team.`, "fusion_mega_slot");
    if (slots.some((s) => s.mega)) return fail(400, `${first} uses the team's Mega slot, so the team can't also have a Mega. Only one Mega or fusion per team.`, "fusion_mega_slot");
  }
  return null;
}

/**
 * The dashboard's view (GET /api/user-pokemon `fusion`): whether any fusion
 * is on and, per enabled form, whether each base line (normal/shiny) has it
 * unlocked. Forms switched off (or of a generation not live) aren't listed.
 */
export function fusionView(user, { env = process.env } = {}) {
  const forms = allFusions().filter((f) => isFusionFormEnabled(f.id, env));
  if (!forms.length) return { enabled: false, forms: [] };
  return {
    enabled: true,
    forms: forms.map((f) => {
      const fam = fusionFamily(f);
      return {
        id: f.id,
        species: f.species,
        baseName: fam.baseName,
        family: [...fam.order], // the team rule's members, in message order
        familyLabel: fam.label,
        name: f.name,
        shortName: f.shortName,
        partner: f.partner,
        partnerName: f.partnerName,
        ability: f.ability,
        types: [...f.types], // Dusk Mane Necrozma is Psychic/Steel, not Psychic
        spriteId: f.spriteId,
        item: f.item,
        glyph: f.glyph,
        power50: powerOfStats(f.baseStats, RANKED.level),
        unlocked: { normal: fusionUnlocked(user, f.id, "normal"), shiny: fusionUnlocked(user, f.id, "shiny") },
      };
    }),
  };
}
