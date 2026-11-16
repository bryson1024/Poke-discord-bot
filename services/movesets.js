// ==========================================================
// services/movesets.js — chosen movesets, per team (owner decision,
// 2026-11-10): each team keeps its own up-to-4 moves for the same Pokémon
// copy, with a copy-from-the-other-team option on the dashboard.
//
//   user.movesets = {
//     display: { "6:normal": ["flamethrower", "slash", …],     // plain copies of the line
//                "u:c_7Hk2Qm9xLp": ["dragonclaw", …] },        // one copy (any copy, docs/adr/0001)
//     battle:  { "6:normal": ["wingattack", …] },              // ranked + wager
//   }
//
// A move is allowed when the species learns it by level-up at or below the
// copy's REAL Level (never its Lv 50 ranked Level), or — for a customized
// copy (TM system, services/ownership.js) — when that copy learned it from
// a TM (customPokemon[uid].tmMoves). TM moves belong to the copy, never to
// the line: a plain copy never sees another copy's TM moves.
// 1–4 distinct moves. No stored moveset → the automatic moveset (the last
// four learned). A level-up never changes equipped moves: keepMovesOnLevelUp
// pins the old automatic moves before a new one could take a slot. A copy with no selection of its own uses
// the line's selection (stored before copies had their own; its learnable
// pool decides what survives). Every copy is its own Pokémon: its moves
// follow ITS Level, and two copies on one team keep separate movesets.
// ==========================================================

import { getSpecies, getMove } from "../utils/battle/data.js";
import { isFullSimEnabled } from "../config/fullSim.js";
import { getTraining } from "../utils/training.js";
import { movesLearned } from "../utils/battle/moveset.js";
import { moveDetails } from "../utils/battle/moveText.js";
import { slotCopyUid, slotBoxUid } from "./ownership.js";
import { copyTraining } from "./box.js";
// fullSimCutover imports this module back; each uses the other only inside functions.
import { defaultMoves } from "./fullSimCutover.js";
import { getFusion, fusionMovesAt, fusionUnlocked, storedTeamFusion, isFusionEnabled } from "../utils/fusions.js";

export const TEAM_TYPES = Object.freeze(["display", "battle"]);
export const MAX_MOVES = 4;
const normV = (variant) => (variant === "shiny" ? "shiny" : "normal");
const lineKey = (id, variant) => `${Number(id)}:${normV(variant)}`;
export const copyKey = (uid) => `u:${uid}`;

/**
 * A valid copy uid for this line, or null. Accepts both kinds of copy id
 * (docs/adr/0001): a box copy (user.box, every copy since the Pokédex /
 * Collection split) and a customized TM copy (user.customPokemon).
 */
export const copyUid = (user, speciesId, variant, uid) => {
  if (uid == null) return null;
  const slot = { id: Number(speciesId), variant: normV(variant), uid };
  return slotBoxUid(user, slot) ?? slotCopyUid(user, slot);
};

/** TM moves this copy learned (none for a plain copy). Unknown move ids are skipped. */
export function tmMovesFor(user, speciesId, variant, { uid = null } = {}) {
  const u = copyUid(user, speciesId, variant, uid);
  const rec = u ? user.customPokemon?.[u] : null;
  if (!rec || rec.suspended) return [];
  return rec.tmMoves.filter((m) => getMove(m));
}

/**
 * Black/White Kyurem (utils/fusions.js): the form's own moves (Fusion Bolt +
 * Freeze Shock, Fusion Flare + Ice Burn) this copy may equip while it uses
 * `form`, at or below `level`: only with fusion switched on, the form
 * unlocked on this line, and moves the battle engine knows (the legacy
 * engine has no Freeze Shock or Ice Burn). [{ id, learnedAt, source: "form", form }]
 */
export function formMoves(user, speciesId, variant, form, level, { env } = {}) {
  const f = getFusion(form);
  if (!f || f.species !== Number(speciesId) || !isFusionEnabled(env ?? process.env) || !fusionUnlocked(user, form, normV(variant))) return [];
  return fusionMovesAt(form, level).filter(([, id]) => getMove(id, env)).map(([at, id]) => ({ id, learnedAt: at, source: "form", form }));
}

/**
 * Every move this copy may equip: level-up moves learned at or below its
 * real Level (earliest Level kept), then its TM moves, then (a Kyurem using
 * a fusion form, `form`) that form's moves. [{ id, learnedAt|null, source }]
 */
export function learnableMoves(user, speciesId, variant, { level = null, uid = null, env, form = null } = {}) {
  const species = getSpecies(Number(speciesId), env);
  if (!species) return [];
  // The copy's own Level when one is named; else the line's best copy.
  const own = uid != null ? copyUid(user, speciesId, variant, uid) : null;
  const lv = level ?? (own && copyTraining(user, own)?.level) ?? getTraining(user ?? {}, Number(speciesId), variant).level;
  const seen = new Map();
  for (const [at, moveId] of species.levelMoves ?? []) {
    if (at > lv) break;
    if (!seen.has(moveId) && getMove(moveId, env)) seen.set(moveId, { id: moveId, learnedAt: at, source: "level" });
  }
  for (const moveId of tmMovesFor(user, speciesId, variant, { uid })) {
    if (!seen.has(moveId)) seen.set(moveId, { id: moveId, learnedAt: null, source: "tm" });
  }
  if (form) for (const m of formMoves(user, speciesId, variant, form, lv, { env })) if (!seen.has(m.id)) seen.set(m.id, m);
  return [...seen.values()];
}

/**
 * The stored moveset for this copy on this team, keeping only moves it may
 * still use (null when none is stored or none survives → automatic moves).
 * With a valid `uid`, the copy's own selection is used first, then the line's.
 */
// `form` (Black/White Kyurem): the fusion form this copy fights as, whose own
// moves count too. undefined = the form it uses on that stored team (none
// when fusion is off or the partner is gone, so those moves drop out).
export function chosenMoves(user, team, speciesId, variant, { uid = null, form } = {}) {
  const u = copyUid(user, speciesId, variant, uid);
  const stored = user?.movesets?.[team] ?? {};
  const raw = (u && stored[copyKey(u)]) || stored[lineKey(speciesId, variant)];
  if (!Array.isArray(raw) || !raw.length) return null;
  const fusion = form === undefined ? storedTeamFusion(user, team, speciesId, variant, { uid: u }) : form;
  const allowed = new Set(learnableMoves(user, speciesId, variant, { uid: u, form: fusion }).map((m) => m.id));
  // Full sim: a move picked before the switch that the new learnsets no
  // longer teach is kept until the player edits this Moveset (saving runs
  // validateMoveset, which allows only the new pool).
  if (isFullSimEnabled()) for (const m of learnableMoves(user, speciesId, variant, { uid: u, env: {} })) allowed.add(m.id);
  const out = [...new Set(raw)].filter((m) => allowed.has(m)).slice(0, MAX_MOVES);
  return out.length ? out : null;
}

const fail = (error, code) => ({ ok: false, status: 400, error, code });

/** Validate a moveset the dashboard sent. → { ok:true, moves, uid } | { ok:false, status, error, code } */
// `form`: the fusion form this slot uses on the team being edited (Teams page,
// possibly not saved yet); its moves are allowed when it is unlocked.
export function validateMoveset(user, speciesId, variant, moves, { uid = null, form = null } = {}) {
  const id = Number(speciesId);
  if (!Number.isInteger(id) || !getSpecies(id)) return fail("Unknown Pokémon.", "bad_species");
  if (!(Number(user?.pokemon?.[id]?.[normV(variant)]) > 0)) return fail("You don't own that Pokémon.", "unowned");
  const u = copyUid(user, id, variant, uid);
  if (uid != null && !u) return fail("That Pokémon copy no longer exists. Reload and try again.", "unknown_copy");
  if (!Array.isArray(moves) || moves.length < 1 || moves.length > MAX_MOVES) return fail(`Choose 1–${MAX_MOVES} moves.`, "bad_size");
  if (moves.some((m) => typeof m !== "string" || m.length > 40)) return fail("Invalid move.", "bad_move");
  if (new Set(moves).size !== moves.length) return fail("Each move can only be equipped once.", "duplicate");
  const allowed = new Set(learnableMoves(user, id, variant, { uid: u, form: typeof form === "string" ? form : null }).map((m) => m.id));
  const unknown = moves.filter((m) => !allowed.has(m));
  if (unknown.length) {
    const names = unknown.map((m) => getMove(m)?.name ?? m).join(", ");
    return fail(`Not learned yet: ${names}. A Pokémon can only use moves it has learned by its current Level.`, "not_learned");
  }
  return { ok: true, moves: [...moves], uid: u };
}

/**
 * IN PLACE. moves = null clears the choice (automatic moves). With `uid`
 * (already validated by validateMoveset), the copy's own selection is set.
 */
export function setMoveset(user, team, speciesId, variant, moves, { uid = null } = {}) {
  if (!TEAM_TYPES.includes(team)) throw new Error("bad team");
  const k = uid ? copyKey(uid) : lineKey(speciesId, variant);
  user.movesets ??= {};
  user.movesets[team] ??= {};
  if (moves == null) delete user.movesets[team][k];
  else user.movesets[team][k] = [...moves];
  return user.movesets[team][k] ?? null;
}

/**
 * IN PLACE. The POST /api/pokemon/moveset body applied to one user:
 * { team, pokeId, variant, moves: [moveId…] | null, uid? }.
 * → { ok:true, team, uid, moves } | { ok:false, status, error, code }
 * The slot's uid may name a box copy or a TM copy; both resolve through
 * copyUid() (a TM-only check here refused every box copy, 2026-11-12).
 */
export function saveMoveset(user, { team, pokeId, variant, moves, uid = null, form = null } = {}) {
  if (!TEAM_TYPES.includes(team)) return { ok: false, status: 400, error: "Unknown team type", code: "bad_team" };
  const v = normV(variant);
  const copy = uid == null ? null : copyUid(user, pokeId, v, uid);
  if (uid != null && !copy) return fail("That Pokémon copy no longer exists. Reload and try again.", "unknown_copy");
  if (moves !== null) {
    const check = validateMoveset(user, pokeId, v, moves, { uid: copy, form });
    if (!check.ok) return check;
    setMoveset(user, team, pokeId, v, check.moves, { uid: copy });
  } else setMoveset(user, team, pokeId, v, null, { uid: copy });
  // Echo what was saved: with the form being edited (it may not be on the saved team yet).
  return { ok: true, team, uid: copy, moves: chosenMoves(user, team, pokeId, v, { uid: copy, ...(typeof form === "string" && { form }) }) };
}

/**
 * IN PLACE. A newly learned move is never equipped by itself (owner
 * decision, 2026-11-12). Call after a copy gains Levels: when it learned a
 * level-up move, every team where it still used automatic moves keeps the
 * moves it had before (pinned as a stored selection). The new move stays
 * learned and can be equipped on the dashboard. → teams pinned
 */
export function keepMovesOnLevelUp(user, speciesId, variant, { uid = null, fromLevel, toLevel } = {}) {
  if (!(toLevel > fromLevel) || !movesLearned(speciesId, fromLevel, toLevel).length) return [];
  const u = copyUid(user, speciesId, variant, uid);
  const allowed = new Set(learnableMoves(user, speciesId, variant, { uid: u }).map((m) => m.id));
  // Full sim: recorded moves the new learnsets don't teach still count, as in chosenMoves.
  if (isFullSimEnabled()) for (const m of learnableMoves(user, speciesId, variant, { uid: u, env: {} })) allowed.add(m.id);
  // The moves it fought with: on the full sim, from its cutover record when it has one.
  const before = defaultMoves(user, { id: Number(speciesId), variant: normV(variant), ...(u && { uid: u }) }, fromLevel).filter((m) => allowed.has(m));
  if (!before.length) return []; // no real move yet: its first move is used
  const pinned = [];
  for (const team of TEAM_TYPES) {
    if (chosenMoves(user, team, speciesId, variant, { uid: u }) != null) continue;
    setMoveset(user, team, speciesId, variant, before, { uid: u });
    pinned.push(team);
  }
  return pinned;
}

/** Display info for a move id, with what it does (desc), accuracy (acc) and priority. */
export function moveInfo(moveId) {
  const m = getMove(moveId);
  // desc/acc/priority: what it does, for the dashboard's ⓘ (utils/battle/moveText.js).
  return m ? { id: moveId, name: m.name, type: m.type ?? null, power: m.power ?? null, category: m.category ?? null, ...moveDetails(moveId, m) } : { id: moveId, name: String(moveId), type: null, power: null, category: null, ...moveDetails(moveId, null) };
}
