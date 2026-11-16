// ==========================================================
// utils/fusions.js — Kyurem's fusion forms (Black Kyurem, White Kyurem).
//
// Owner design (2026-11-16):
//   • Owning Kyurem plus Zekrom unlocks Black Kyurem; Kyurem plus Reshiram
//     unlocks White Kyurem. Nothing is used up: the form stays available
//     while the player owns both Pokémon (any copy of the partner, normal or
//     shiny; the form follows the Kyurem slot's own variant).
//   • A fusion form is chosen on a Kyurem team slot, like a Mega:
//       { id: 646, variant: "normal", form: "kyurem-black" }
//     It is never a species: it can't be caught, counted in the Pokédex,
//     gifted, donated or evolved. Level, EXP, moves and held item stay the
//     Kyurem copy's.
//   • Team rule (Casual and Ranked): a team with a fused Kyurem can't also
//     have Kyurem, Zekrom or Reshiram, so at most one fused Kyurem per team.
//     A fused Kyurem also takes the team's one Mega slot (owner, 2026-11-16:
//     its 700 BST is Mega-level), so no Mega beside it.
//     The Showcase never fights and has no such rule.
//   • Switch: KYUREM_FUSION_ENABLED (config/features.js). Off = nobody can
//     pick a form, and a stored form shows and battles as plain Kyurem.
//
// Stats, types and abilities are @pkmn/dex Gen 9 (Kyurem-Black /
// Kyurem-White); sprites are public/sprites/pokemon/<variant>/646-<form>.gif.
// ==========================================================

import { isKyuremFusionEnabled } from "../config/features.js";

/** The KYUREM_FUSION_ENABLED switch, re-exported for callers outside the Mega allowlist. */
export const isFusionEnabled = (env = process.env) => isKyuremFusionEnabled(env);

export const KYUREM = 646;
export const RESHIRAM = 643;
export const ZEKROM = 644;

const FORMS = Object.freeze([
  Object.freeze({
    id: "kyurem-black",
    species: KYUREM,
    partner: ZEKROM,
    partnerName: "Zekrom",
    name: "Black Kyurem",
    shortName: "Black",
    showdownName: "Kyurem-Black",
    spriteId: "646-black",
    types: Object.freeze(["Dragon", "Ice"]),
    baseStats: Object.freeze({ hp: 125, atk: 170, def: 100, spa: 120, spd: 90, spe: 95 }),
    ability: "Teravolt",
    // Gen 9 Kyurem-Black level-up moves Kyurem doesn't learn (@pkmn/dex: Lv 48 replaces Scary Face, Lv 80 Glaciate).
    moves: Object.freeze([[48, "fusionbolt"], [80, "freezeshock"]]),
  }),
  Object.freeze({
    id: "kyurem-white",
    species: KYUREM,
    partner: RESHIRAM,
    partnerName: "Reshiram",
    name: "White Kyurem",
    shortName: "White",
    showdownName: "Kyurem-White",
    spriteId: "646-white",
    types: Object.freeze(["Dragon", "Ice"]),
    baseStats: Object.freeze({ hp: 125, atk: 120, def: 90, spa: 170, spd: 100, spe: 95 }),
    ability: "Turboblaze",
    moves: Object.freeze([[48, "fusionflare"], [80, "iceburn"]]), // Gen 9 Kyurem-White (Lv 48, Lv 80)
  }),
]);
const BY_ID = new Map(FORMS.map((f) => [f.id, f]));
const BY_SPRITE = new Map(FORMS.map((f) => [f.spriteId, f]));

/** Species a fused Kyurem can't share a (Casual or Ranked) team with. */
export const FUSION_EXCLUSIVE = Object.freeze(new Set([KYUREM, RESHIRAM, ZEKROM]));
export const FUSION_ID_PATTERN = /^kyurem-(black|white)$/;

export const allFusions = () => FORMS;
export const getFusion = (id) => (typeof id === "string" ? BY_ID.get(id) ?? null : null);
export const isFusionId = (id) => BY_ID.has(id);
export const fusionsOfSpecies = (species) => FORMS.filter((f) => f.species === Number(species));
/** A sprite id ("646-black") → its form, else null. Sprite loaders use it. */
export const fusionBySpriteId = (spriteId) => BY_SPRITE.get(String(spriteId)) ?? null;
export const isFusionSpriteId = (spriteId) => BY_SPRITE.has(String(spriteId));

/** "/public/sprites/pokemon/<normal|shiny>/646-black.gif". */
export function fusionSpritePath(id, variant = "normal") {
  const f = getFusion(id);
  if (!f) return null;
  return `/public/sprites/pokemon/${variant === "shiny" ? "shiny" : "normal"}/${f.spriteId}.gif`;
}

const owns = (user, species, variant) => Number(user?.pokemon?.[species]?.[variant]) > 0;
const ownsAny = (user, species) => owns(user, species, "normal") || owns(user, species, "shiny");

/**
 * Data integrity (no flag): the form is Kyurem's, and the player owns this
 * Kyurem line and any copy of the partner. Ownership is all it takes.
 */
export function fusionUnlocked(user, formId, kyuremVariant = "normal") {
  const f = getFusion(formId);
  if (!f) return false;
  return owns(user, f.species, kyuremVariant === "shiny" ? "shiny" : "normal") && ownsAny(user, f.partner);
}

/** Forms this player has unlocked for one Kyurem line (any order: Black, White). */
export const unlockedFusions = (user, kyuremVariant = "normal") =>
  FORMS.filter((f) => fusionUnlocked(user, f.id, kyuremVariant)).map((f) => f.id);

/** The slot's `form` value if it is a well-formed fusion id, else null. */
export function fusionFieldOf(entry) {
  const v = entry && typeof entry === "object" && !Array.isArray(entry) ? entry.form : undefined;
  return typeof v === "string" && FUSION_ID_PATTERN.test(v) ? v : null;
}

/** The form belongs to this slot's species and is unlocked on its line. */
export function fusionFitsSlot(user, slot, formId) {
  const f = getFusion(formId);
  return !!f && f.species === Number(slot?.id) && fusionUnlocked(user, formId, slot?.variant);
}

/**
 * The team rule, or null when the team is fine: a fused Kyurem can't share a
 * team with Kyurem, Zekrom or Reshiram (another fused Kyurem included).
 * `team` is a list of { id, form? } slots.
 */
export function fusionTeamConflict(team) {
  const list = Array.isArray(team) ? team : [];
  const fused = list.findIndex((s) => fusionFieldOf(s));
  if (fused < 0) return null;
  const f = getFusion(fusionFieldOf(list[fused]));
  const other = list.find((s, i) => i !== fused && FUSION_EXCLUSIVE.has(Number(s?.id)));
  if (!other) return null;
  const otherForm = getFusion(fusionFieldOf(other));
  const otherName = otherForm ? otherForm.name : ({ [KYUREM]: "Kyurem", [RESHIRAM]: "Reshiram", [ZEKROM]: "Zekrom" })[Number(other.id)];
  return { form: f, otherName, error: `${f.name} can't be on a team with ${otherName}. A team with Black or White Kyurem can't also have Kyurem, Zekrom or Reshiram.` };
}

/**
 * The fusion's own moves this Kyurem may equip while it uses the form:
 * [[learnedAt, moveId]], only those at or below `level`. Empty when the
 * form is unknown. (Movesets also need the switch on and the form unlocked:
 * services/movesets.js formMoves.)
 */
export function fusionMovesAt(formId, level) {
  const f = getFusion(formId);
  return f ? f.moves.filter(([at]) => at <= Number(level)) : [];
}

/**
 * The form this copy uses on a stored team ("display" | "battle"), when it is
 * switched on and still unlocked; else null. `uid` names the slot's copy
 * (null = the line's plain slot).
 */
export function storedTeamFusion(user, team, speciesId, variant, { uid = null, env = process.env } = {}) {
  if (Number(speciesId) !== KYUREM || !isKyuremFusionEnabled(env)) return null;
  const raw = team === "battle" ? user?.battleTeam : team === "display" ? user?.displayedPokemon : null;
  const v = variant === "shiny" ? "shiny" : "normal";
  const slot = (Array.isArray(raw) ? raw : []).find((t) => t && typeof t === "object" && Number(t.id) === KYUREM && (t.variant === "shiny" ? "shiny" : "normal") === v && (uid == null || t.uid === uid || t.uid == null));
  const form = fusionFieldOf(slot);
  return form && fusionUnlocked(user, form, v) ? form : null;
}

/** The battle-only profile (stats, types, ability, name), shaped like a Mega's. */
export function fusionBattleProfile(id) {
  const f = getFusion(id);
  if (!f) return null;
  return Object.freeze({ kind: "fusion", formId: f.id, name: f.name, species: f.species, showdownName: f.showdownName, types: [...f.types], baseStats: { ...f.baseStats }, ability: f.ability });
}

/**
 * Battle time, fail-closed: may this stored slot fight as its fusion form?
 * Needs the switch on, the form unlocked on that line and the team rule met;
 * on any doubt the slot fights as plain Kyurem. `team` is the whole stored
 * team the slot is on. Pure.
 * @returns {null | {ok:true, formId, profile} | {ok:false, reason, formId}}
 */
// megaActive: a Mega on the same team really battles as a Mega this fight;
// the fused Kyurem then fights as Kyurem (one Mega slot per team).
export function resolveSlotFusion(user, slot, team, { env = process.env, megaActive = false } = {}) {
  const formId = fusionFieldOf(slot);
  if (!formId) return null;
  if (!isKyuremFusionEnabled(env)) return { ok: false, reason: "Kyurem fusion is switched off", formId };
  if (!fusionFitsSlot(user, { id: Number(slot.id), variant: slot.variant === "shiny" ? "shiny" : "normal" }, formId)) return { ok: false, reason: "not unlocked (Kyurem and its partner must both be owned)", formId };
  if (fusionTeamConflict(team)) return { ok: false, reason: "team has Kyurem, Zekrom or Reshiram too", formId };
  if (megaActive) return { ok: false, reason: "a Mega already uses the team's Mega slot", formId };
  return { ok: true, formId, profile: fusionBattleProfile(formId) };
}
