// ==========================================================
// utils/fusions.js — fusion forms: Black/White Kyurem and Dusk Mane /
// Dawn Wings Necrozma.
//
// Owner design (2026-11-16):
//   • Owning the base Pokémon plus its partner unlocks the form; nothing is
//     used up. Kyurem + Zekrom → Black Kyurem, Kyurem + Reshiram → White
//     Kyurem; Necrozma + Solgaleo → Dusk Mane Necrozma, Necrozma + Lunala →
//     Dawn Wings Necrozma. Any copy of the partner (normal or shiny) counts;
//     the form follows the base slot's own variant.
//   • A form is chosen on a team slot of the base Pokémon, like a Mega:
//       { id: 646, variant: "normal", form: "kyurem-black" }
//     It is never a species: it can't be caught, counted in the Pokédex,
//     gifted, donated or evolved. Level, EXP and moves stay the copy's.
//   • Team rules (Casual and Ranked; the Showcase never fights, no rules):
//       – a fused Pokémon can't share the team with any member of its family
//         (Kyurem, Zekrom, Reshiram / Necrozma, Solgaleo, Lunala)
//       – it takes the team's one Mega slot (Mega-level stat totals), so no
//         Mega and no second fusion beside it
//       – it counts as mythic-tier for Ranked's one-mythic limit
//       – its fusion item (DNA Splicers, N-Solarizer, N-Lunarizer) fills its
//         item slot, like a Mega Stone (services/heldItems.js)
//   • Switches, per family: KYUREM_FUSION_ENABLED, NECROZMA_FUSION_ENABLED
//     (config/features.js), and the base species' generation must be live.
//     Off = nobody can pick the form, and a stored form shows and battles as
//     the base Pokémon.
//   • Ultra Necrozma is not included: it is a mid-battle Z-Crystal
//     transformation, and Z-moves aren't simulated.
//
// Stats, types, abilities and moves are @pkmn/dex Gen 9. Sprites are
// public/sprites/pokemon/<variant>/<spriteId>.gif (646-black, 800-duskmane…).
// ==========================================================

import { isKyuremFusionEnabled, isNecrozmaFusionEnabled } from "../config/features.js";
import { generationOfDex } from "../config/generations.js";
import { isGenerationLive } from "./speciesCatalog.js";

export const KYUREM = 646;
export const RESHIRAM = 643;
export const ZEKROM = 644;
export const NECROZMA = 800;
export const SOLGALEO = 791;
export const LUNALA = 792;

const FAMILIES = Object.freeze({
  kyurem: Object.freeze({
    key: "kyurem",
    species: KYUREM,
    baseName: "Kyurem",
    members: Object.freeze({ [KYUREM]: "Kyurem", [RESHIRAM]: "Reshiram", [ZEKROM]: "Zekrom" }),
    order: Object.freeze([KYUREM, ZEKROM, RESHIRAM]), // how messages list the family
    label: "Black or White Kyurem",
    switchOn: isKyuremFusionEnabled,
  }),
  necrozma: Object.freeze({
    key: "necrozma",
    species: NECROZMA,
    baseName: "Necrozma",
    members: Object.freeze({ [NECROZMA]: "Necrozma", [SOLGALEO]: "Solgaleo", [LUNALA]: "Lunala" }),
    order: Object.freeze([NECROZMA, SOLGALEO, LUNALA]),
    label: "Dusk Mane or Dawn Wings Necrozma",
    switchOn: isNecrozmaFusionEnabled,
  }),
});

const form = (f) => Object.freeze({ ...f, types: Object.freeze(f.types), baseStats: Object.freeze(f.baseStats), moves: Object.freeze(f.moves) });
const FORMS = Object.freeze([
  form({
    id: "kyurem-black", family: "kyurem", species: KYUREM, partner: ZEKROM, partnerName: "Zekrom",
    name: "Black Kyurem", shortName: "Black", showdownName: "Kyurem-Black", spriteId: "646-black",
    types: ["Dragon", "Ice"], baseStats: { hp: 125, atk: 170, def: 100, spa: 120, spd: 90, spe: 95 }, ability: "Teravolt",
    // Gen 9 Kyurem-Black level-up moves Kyurem doesn't learn (Lv 48 replaces Scary Face, Lv 80 Glaciate).
    moves: [[48, "fusionbolt"], [80, "freezeshock"]],
    item: "DNA Splicers", glyph: "🧬",
  }),
  form({
    id: "kyurem-white", family: "kyurem", species: KYUREM, partner: RESHIRAM, partnerName: "Reshiram",
    name: "White Kyurem", shortName: "White", showdownName: "Kyurem-White", spriteId: "646-white",
    types: ["Dragon", "Ice"], baseStats: { hp: 125, atk: 120, def: 90, spa: 170, spd: 100, spe: 95 }, ability: "Turboblaze",
    moves: [[48, "fusionflare"], [80, "iceburn"]],
    item: "DNA Splicers", glyph: "🧬",
  }),
  form({
    id: "necrozma-duskmane", family: "necrozma", species: NECROZMA, partner: SOLGALEO, partnerName: "Solgaleo",
    name: "Dusk Mane Necrozma", shortName: "Dusk Mane", showdownName: "Necrozma-Dusk-Mane", spriteId: "800-duskmane",
    types: ["Psychic", "Steel"], baseStats: { hp: 97, atk: 157, def: 127, spa: 113, spd: 109, spe: 77 }, ability: "Prism Armor",
    // Learned on fusing in the games (learnset "R"), so from any Level.
    moves: [[1, "sunsteelstrike"]],
    item: "N-Solarizer", glyph: "☀️",
  }),
  form({
    id: "necrozma-dawnwings", family: "necrozma", species: NECROZMA, partner: LUNALA, partnerName: "Lunala",
    name: "Dawn Wings Necrozma", shortName: "Dawn Wings", showdownName: "Necrozma-Dawn-Wings", spriteId: "800-dawnwings",
    types: ["Psychic", "Ghost"], baseStats: { hp: 97, atk: 113, def: 109, spa: 157, spd: 127, spe: 77 }, ability: "Prism Armor",
    moves: [[1, "moongeistbeam"]],
    item: "N-Lunarizer", glyph: "🌙",
  }),
]);
const BY_ID = new Map(FORMS.map((f) => [f.id, f]));
const BY_SPRITE = new Map(FORMS.map((f) => [f.spriteId, f]));

/** Every well-formed fusion form id (the client pages keep a copy of this pattern). */
export const FUSION_ID_PATTERN = /^(kyurem-(black|white)|necrozma-(duskmane|dawnwings))$/;

export const allFusions = () => FORMS;
export const getFusion = (id) => (typeof id === "string" ? BY_ID.get(id) ?? null : null);
export const isFusionId = (id) => BY_ID.has(id);
export const fusionFamily = (formOrId) => FAMILIES[(typeof formOrId === "string" ? getFusion(formOrId) : formOrId)?.family] ?? null;
export const fusionsOfSpecies = (species) => FORMS.filter((f) => f.species === Number(species));
/** A sprite id ("646-black") → its form, else null. Sprite loaders use it. */
export const fusionBySpriteId = (spriteId) => BY_SPRITE.get(String(spriteId)) ?? null;
export const isFusionSpriteId = (spriteId) => BY_SPRITE.has(String(spriteId));
/** The name of a fusion-family member (Kyurem, Zekrom, …), else null. */
const memberName = (id) => Object.values(FAMILIES).map((fam) => fam.members[Number(id)]).find(Boolean) ?? null;

/**
 * Is this form usable right now: its family's switch on and the base
 * species' generation live (Necrozma waits for Gen 7).
 */
export function isFusionFormEnabled(formId, env = process.env, { generationLive = isGenerationLive } = {}) {
  const f = getFusion(formId);
  const fam = fusionFamily(f);
  return !!(f && fam && fam.switchOn(env) && generationLive(generationOfDex(f.species)));
}
/** Is any fusion form usable right now (the dashboard's switch)? */
export const isAnyFusionEnabled = (env = process.env) => FORMS.some((f) => isFusionFormEnabled(f.id, env));

/** "/public/sprites/pokemon/<normal|shiny>/646-black.gif". */
export function fusionSpritePath(id, variant = "normal") {
  const f = getFusion(id);
  if (!f) return null;
  return `/public/sprites/pokemon/${variant === "shiny" ? "shiny" : "normal"}/${f.spriteId}.gif`;
}

const owns = (user, species, variant) => Number(user?.pokemon?.[species]?.[variant]) > 0;
const ownsAny = (user, species) => owns(user, species, "normal") || owns(user, species, "shiny");

/**
 * Data integrity (no switch): the player owns this base line and any copy
 * of the partner. Ownership is all it takes.
 */
export function fusionUnlocked(user, formId, baseVariant = "normal") {
  const f = getFusion(formId);
  if (!f) return false;
  return owns(user, f.species, baseVariant === "shiny" ? "shiny" : "normal") && ownsAny(user, f.partner);
}

/** Forms this player has unlocked for one line of `species`. */
export const unlockedFusions = (user, species, baseVariant = "normal") =>
  fusionsOfSpecies(species).filter((f) => fusionUnlocked(user, f.id, baseVariant)).map((f) => f.id);

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

/** Ranked's one-mythic limit: a fused slot counts as mythic-tier (Mega-level stat totals). */
export const isFusedSlot = (slot) => !!getFusion(fusionFieldOf(slot));

/**
 * The family rule, or null when the team is fine: a fused Pokémon can't
 * share a team with any member of its family (another fused one included).
 * `team` is a list of { id, form? } slots.
 */
export function fusionTeamConflict(team) {
  const list = Array.isArray(team) ? team : [];
  for (const [i, s] of list.entries()) {
    const f = getFusion(fusionFieldOf(s));
    if (!f) continue;
    const fam = fusionFamily(f);
    const other = list.find((m, k) => k !== i && fam.members[Number(m?.id)]);
    if (!other) continue;
    const otherName = getFusion(fusionFieldOf(other))?.name ?? memberName(other.id);
    const names = fam.order.map((id) => fam.members[id]);
    return { form: f, otherName, error: `${f.name} can't be on a team with ${otherName}. A team with ${fam.label} can't also have ${names.slice(0, -1).join(", ")} or ${names.at(-1)}.` };
  }
  return null;
}

/**
 * The fusion's own moves this Pokémon may equip while it uses the form:
 * [[learnedAt, moveId]], only those at or below `level`. Empty when the
 * form is unknown. (Movesets also need the form enabled and unlocked:
 * services/movesets.js formMoves.)
 */
export function fusionMovesAt(formId, level) {
  const f = getFusion(formId);
  return f ? f.moves.filter(([at]) => at <= Number(level)) : [];
}

/**
 * The form this copy uses on a stored team ("display" | "battle"), when it is
 * enabled and still unlocked; else null. `uid` names the slot's copy
 * (null = the line's plain slot).
 */
export function storedTeamFusion(user, team, speciesId, variant, { uid = null, env = process.env } = {}) {
  if (!fusionsOfSpecies(speciesId).length) return null;
  const raw = team === "battle" ? user?.battleTeam : team === "display" ? user?.displayedPokemon : null;
  const v = variant === "shiny" ? "shiny" : "normal";
  const slot = (Array.isArray(raw) ? raw : []).find((t) => t && typeof t === "object" && Number(t.id) === Number(speciesId) && (t.variant === "shiny" ? "shiny" : "normal") === v && (uid == null || t.uid === uid || t.uid == null));
  const form = fusionFieldOf(slot);
  return form && isFusionFormEnabled(form, env) && fusionUnlocked(user, form, v) ? form : null;
}

/** The battle-only profile (stats, types, ability, name), shaped like a Mega's. */
export function fusionBattleProfile(id) {
  const f = getFusion(id);
  if (!f) return null;
  return Object.freeze({ kind: "fusion", formId: f.id, name: f.name, species: f.species, showdownName: f.showdownName, types: [...f.types], baseStats: { ...f.baseStats }, ability: f.ability });
}

/**
 * Battle time, fail-closed: may this stored slot fight as its fusion form?
 * Needs the form enabled, unlocked on that line and the family rule met; on
 * any doubt the slot fights as its base Pokémon. `team` is the whole stored
 * team the slot is on.
 * megaActive: a Mega (or an earlier fusion) on the same team already uses the
 * team's one Mega slot this fight. Pure.
 * @returns {null | {ok:true, formId, profile} | {ok:false, reason, formId}}
 */
export function resolveSlotFusion(user, slot, team, { env = process.env, megaActive = false } = {}) {
  const formId = fusionFieldOf(slot);
  if (!formId) return null;
  if (!isFusionFormEnabled(formId, env)) return { ok: false, reason: "this fusion is switched off (or its generation isn't live)", formId };
  const f = getFusion(formId);
  if (!fusionFitsSlot(user, { id: Number(slot.id), variant: slot.variant === "shiny" ? "shiny" : "normal" }, formId)) return { ok: false, reason: `not unlocked (${fusionFamily(f).baseName} and ${f.partnerName} must both be owned)`, formId };
  if (fusionTeamConflict(team)) return { ok: false, reason: "team has another member of its family", formId };
  if (megaActive) return { ok: false, reason: "a Mega or another fusion already uses the team's Mega slot", formId };
  return { ok: true, formId, profile: fusionBattleProfile(formId) };
}
