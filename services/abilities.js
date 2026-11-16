// ==========================================================
// services/abilities.js — a chosen Ability, per team (owner decision,
// 2026-11-16): like movesets, each team keeps its own choice for the same
// Pokémon copy. No choice = Automatic: the best regular ability for the
// Team's Battle plan, picked fresh for each fight
// (utils/battle/ai/abilities.js pickAbility).
//
//   user.abilities = {
//     display: { "6:normal": "Solar Power",            // plain copies of the line
//                "u:c_7Hk2Qm9xLp": "Blaze" },          // one copy (docs/adr/0001)
//     battle:  { "130:normal": "Intimidate" },         // ranked + wager
//   }
//
// Only the species' REGULAR abilities can be chosen (hidden abilities are
// never used), so a choice never fights with anything Automatic couldn't
// pick: no Pokémon gets stronger than it could already be. A Mega slot
// always fights with its Mega's own ability (utils/battle/showdown/sets.js).
// Abilities only exist on the full sim; with it off, nothing here is shown
// or saved, and stored choices are kept for when it is on.
// ==========================================================

import { Dex } from "@pkmn/sim";
import { getSpecies } from "../utils/battle/data.js";
import { isFullSimEnabled } from "../config/fullSim.js";
import { pickAbility } from "../utils/battle/ai/abilities.js";
import { getPlan } from "./battlePlans.js";
import { copyUid, copyKey, TEAM_TYPES } from "./movesets.js";
import { ownsVariant } from "./box.js";
import { normalizeVariant } from "../utils/specialVariants.js";

const FULL = { FULL_SIM_ENABLED: "1" };
// A Special variant (the Squirtle Squad Leader) is its own line, not plain normal.
const normV = normalizeVariant;
const lineKey = (id, variant) => `${Number(id)}:${normV(variant)}`;

/** The species' regular abilities (slot 0, then slot 1), as named in the full sim's data. */
export const regularAbilities = (speciesId) => getSpecies(Number(speciesId), FULL)?.abilities ?? [];

/** Display info for an ability name: { name, desc }, Showdown's one-line text. */
export function abilityInfo(name) {
  const a = Dex.abilities.get(String(name ?? ""));
  const desc = a?.exists ? String(a.shortDesc || a.desc || "").replace(/Pokemon/g, "Pokémon") : "";
  return { name: a?.exists ? a.name : String(name ?? ""), desc };
}

/**
 * The stored choice for this copy on this team, when it is still one of the
 * species' regular abilities (else null → Automatic). With a valid `uid`,
 * the copy's own choice is used first, then the line's.
 */
export function chosenAbility(user, team, speciesId, variant, { uid = null } = {}) {
  const u = copyUid(user, speciesId, variant, uid);
  const stored = user?.abilities?.[team] ?? {};
  const raw = (u && stored[copyKey(u)]) || stored[lineKey(speciesId, variant)];
  return typeof raw === "string" && regularAbilities(speciesId).includes(raw) ? raw : null;
}

/** What Automatic picks for this species on this team right now (its Battle plan). */
export const automaticAbility = (user, team, speciesId) => pickAbility(Number(speciesId), getPlan(user, team)) ?? null;

/** The ability it fights with on this team: its choice, else Automatic. */
export const fightingAbility = (user, team, speciesId, variant, opts = {}) =>
  chosenAbility(user, team, speciesId, variant, opts) ?? automaticAbility(user, team, speciesId);

const fail = (error, code, status = 400) => ({ ok: false, status, error, code });

/** IN PLACE. ability = null clears the choice (Automatic). */
export function setAbility(user, team, speciesId, variant, ability, { uid = null } = {}) {
  if (!TEAM_TYPES.includes(team)) throw new Error("bad team");
  const k = uid ? copyKey(uid) : lineKey(speciesId, variant);
  user.abilities ??= {};
  user.abilities[team] ??= {};
  if (ability == null) delete user.abilities[team][k];
  else user.abilities[team][k] = ability;
  return user.abilities[team][k] ?? null;
}

/**
 * IN PLACE. The POST /api/pokemon/ability body applied to one user:
 * { team, pokeId, variant, ability: name | null, uid? }.
 * → { ok:true, team, uid, ability, automatic } | { ok:false, status, error, code }
 */
export function saveAbility(user, { team, pokeId, variant, ability, uid = null } = {}, { env = process.env } = {}) {
  if (!isFullSimEnabled(env)) return fail("Abilities aren't in battles yet.", "full_sim_off");
  if (!TEAM_TYPES.includes(team)) return fail("Unknown team type", "bad_team");
  const id = Number(pokeId);
  const v = normV(variant);
  if (!Number.isInteger(id) || !regularAbilities(id).length) return fail("Unknown Pokémon.", "bad_species");
  if (!ownsVariant(user, id, v)) return fail("You don't own that Pokémon.", "unowned");
  const copy = uid == null ? null : copyUid(user, id, v, uid);
  if (uid != null && !copy) return fail("That Pokémon copy no longer exists. Reload and try again.", "unknown_copy");
  if (ability !== null) {
    if (typeof ability !== "string" || !regularAbilities(id).includes(ability)) {
      return fail("That Pokémon can't have that ability.", "bad_ability");
    }
  }
  setAbility(user, team, id, v, ability, { uid: copy });
  return { ok: true, team, uid: copy, ability: chosenAbility(user, team, id, v, { uid: copy }), automatic: automaticAbility(user, team, id) };
}

/**
 * The details drawer's Ability block for one copy (or the line): every
 * regular ability with its text, and per team the choice (null = Automatic)
 * and what Automatic picks there now. null with the full sim off.
 */
export function abilityView(user, speciesId, variant, { uid = null, env = process.env } = {}) {
  if (!isFullSimEnabled(env)) return null;
  const options = regularAbilities(speciesId).map(abilityInfo);
  if (!options.length) return null;
  const teams = {};
  for (const team of TEAM_TYPES) {
    teams[team] = { chosen: chosenAbility(user, team, speciesId, variant, { uid }), automatic: automaticAbility(user, team, speciesId) };
  }
  return { options, teams };
}
