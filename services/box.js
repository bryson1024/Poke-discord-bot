// ==========================================================
// services/box.js: individual copies (the Collection) and the Pokédex.
// docs/adr/0001-individual-copies-and-permanent-pokedex.md
//
// Source of truth:
//   user.box[uid] = { id, shiny?: true, variant?: "<Special variant>", exp, at? }   one record per Copy
//   user.pokedex[id] = 1 | 2 | 3                      bit 1 normal, bit 2 shiny
//
// Derived (rewritten by syncLine after every change, read by older code and
// by the previous release during the rollback window):
//   user.pokemon[id] = { normal, shiny }   copies per line; a Special variant
//                                          copy (the Squirtle Squad Leader) counts
//                                          as normal (docs/adr/0002-special-variants.md)
//   user.training["id:variant"] = { exp }  the line's best copy, per exact variant
//
// Trained copies keep their user.customPokemon[uid] record (TM moves); the
// box record of a trained copy uses the same uid.
//
// Pure + synchronous: call inside the caller's user lock / transaction.
// ==========================================================

import { randomBytes } from "crypto";
import {
  expForLevel, levelForExp, floorLevel, rollCatchLevel, trainingKey,
} from "../utils/training.js";
import { LEVEL_CAP, DUPLICATE_LEVEL_SHARE } from "../utils/battle/tuning.js";
import { normalizeVariant, countKey, isSpecialVariant, specialVariant } from "../utils/specialVariants.js";

export const COPY_UID_PATTERN = /^c_[A-Za-z0-9]{10}$/;
/** Team fields whose slots each name one copy. showcaseTeam arrives with the three-teams split. */
export const TEAM_FIELDS = ["displayedPokemon", "battleTeam", "showcaseTeam"];
export const DEX_NORMAL = 1;
export const DEX_SHINY = 2;

const VARIANTS = ["normal", "shiny"]; // derived-count keys
const maxExp = () => expForLevel(LEVEL_CAP);
/** A copy's Variant: its Special variant, else shiny or normal. */
export const variantOf = (rec) => (isSpecialVariant(rec?.variant) ? rec.variant : rec?.shiny ? "shiny" : "normal");
const normV = normalizeVariant;
const bitOf = (variant) => (variant === "shiny" ? DEX_SHINY : DEX_NORMAL);
/** Copies of a species counted under one derived-count key (normal counts Special copies too). */
const countedCopies = (user, id, key) =>
  Object.values(user?.box ?? {}).filter((rec) => Number(rec?.id) === Number(id) && countKey(variantOf(rec)) === key).length;
/** Rewrites a record's Variant fields. */
function setVariant(rec, v) {
  delete rec.shiny;
  delete rec.variant;
  if (v === "shiny") rec.shiny = true;
  else if (isSpecialVariant(v)) rec.variant = v;
}
const variantFields = (v) => (v === "shiny" ? { shiny: true } : isSpecialVariant(v) ? { variant: v } : {});
const clampExp = (exp) => Math.max(0, Math.min(maxExp(), Math.floor(Number(exp) || 0)));

// ---------------------------------------------------------- Pokédex

/** Bitmask for one species (0 = never caught). */
export function dexMask(user, id) {
  const m = Number(user?.pokedex?.[id]);
  return Number.isInteger(m) && m > 0 ? m & 3 : 0;
}

/**
 * Pokédex bits for a species, counting what is owned now as registered too
 * (everything owned was caught; this also covers a record not normalized yet).
 */
export function registeredMask(user, id) {
  const e = user?.pokemon?.[id];
  return dexMask(user, id) | ((Number(e?.normal) || 0) > 0 ? DEX_NORMAL : 0) | ((Number(e?.shiny) || 0) > 0 ? DEX_SHINY : 0);
}

/** Every species id with any registered bit (Pokédex ∪ owned now). */
export function registeredSpecies(user) {
  const ids = new Set([...Object.keys(user?.pokedex ?? {}), ...Object.keys(user?.pokemon ?? {})].filter((k) => /^\d+$/.test(k)).map(Number));
  return [...ids].filter((id) => registeredMask(user, id) > 0);
}

export const isRegistered = (user, id) => registeredMask(user, id) > 0;
export const isShinyRegistered = (user, id) => (dexMask(user, id) & DEX_SHINY) !== 0;

/**
 * Record a catch of id:variant. Append-only.
 * @returns {{ newSpecies: boolean, newShiny: boolean }}
 */
export function registerDex(user, id, variant) {
  const before = dexMask(user, id);
  const bit = bitOf(variant);
  if ((before & bit) === 0) {
    user.pokedex ??= {};
    user.pokedex[Number(id)] = before | bit;
  }
  return { newSpecies: before === 0, newShiny: bit === DEX_SHINY && (before & DEX_SHINY) === 0 };
}

/** Registered species ids (numbers). `shinyOnly` → species ever caught shiny. */
export function registeredIds(user, { shinyOnly = false } = {}) {
  const out = [];
  for (const [id, m] of Object.entries(user?.pokedex ?? {})) {
    if ((Number(m) & (shinyOnly ? DEX_SHINY : 3)) !== 0) out.push(Number(id));
  }
  return out;
}

/** Union a { id: mask } map into the Pokédex (backfill). Returns how many bits were added. */
export function mergeDex(user, masks) {
  let added = 0;
  for (const [id, m] of Object.entries(masks ?? {})) {
    const bits = Number(m) & 3;
    if (!Number.isInteger(Number(id)) || Number(id) < 1 || !bits) continue;
    const before = dexMask(user, id);
    if ((before | bits) !== before) {
      user.pokedex ??= {};
      user.pokedex[Number(id)] = before | bits;
      added++;
    }
  }
  return added;
}

// ---------------------------------------------------------- copies

export function newCopyUid(user) {
  const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let attempt = 0; attempt < 20; attempt++) {
    let uid = "c_";
    for (const b of randomBytes(10)) uid += ALPHA[b % ALPHA.length];
    if (!user?.box?.[uid] && !user?.customPokemon?.[uid]) return uid;
  }
  throw new Error("newCopyUid: could not find a free id");
}

export const copyOf = (user, uid) => (typeof uid === "string" ? user?.box?.[uid] ?? null : null);

/** Copies of one line, best (highest EXP) first: [{ uid, id, variant, exp, level, at, trained }]. */
export function copiesOf(user, id, variant) {
  const v = normV(variant);
  const out = [];
  for (const [uid, rec] of Object.entries(user?.box ?? {})) {
    if (Number(rec?.id) !== Number(id) || variantOf(rec) !== v) continue;
    out.push(describe(user, uid, rec));
  }
  return out.sort((a, b) => b.exp - a.exp || a.uid.localeCompare(b.uid));
}

/** Every copy, in no particular order. */
export function allCopies(user) {
  return Object.entries(user?.box ?? {}).map(([uid, rec]) => describe(user, uid, rec));
}

function describe(user, uid, rec) {
  const exp = clampExp(rec.exp);
  const trained = !!user?.customPokemon?.[uid] && !user.customPokemon[uid].suspended;
  return { uid, id: Number(rec.id), variant: variantOf(rec), exp, level: levelForExp(exp), at: rec.at ?? null, trained };
}

export const isTrained = (user, uid) => !!user?.customPokemon?.[uid] && !user.customPokemon[uid].suspended;

/** True when this copy is a Special variant (kept for good: never auto-picked, donated, fed, gifted or transformed). */
export const isSpecialCopy = (user, uid) => isSpecialVariant(copyOf(user, uid)?.variant);

/** How many copies of exactly this species + Variant the player owns (read from the box). */
export const ownedCount = (user, id, variant) => copiesOf(user, id, variant).length;

/** { exp, level } of one copy, or null. */
export function copyTraining(user, uid) {
  const rec = copyOf(user, uid);
  if (!rec) return null;
  const exp = clampExp(rec.exp);
  return { exp, level: levelForExp(exp) };
}

/** Every team slot holding this copy: [{ field, index }]. */
export function slotsHolding(user, uid) {
  const out = [];
  for (const field of TEAM_FIELDS) {
    const team = user?.[field];
    if (!Array.isArray(team)) continue;
    team.forEach((s, index) => { if (s && typeof s === "object" && s.uid === uid) out.push({ field, index }); });
  }
  return out;
}

export const isOnTeam = (user, uid) => slotsHolding(user, uid).length > 0;

/** Lowest-Level copies of the line that are on no Team, untrained and not Special (auto-pick order). */
export function spareCopies(user, id, variant) {
  return copiesOf(user, id, variant)
    .filter((c) => !c.trained && !isSpecialVariant(c.variant) && !isOnTeam(user, c.uid))
    .sort((a, b) => a.exp - b.exp || a.uid.localeCompare(b.uid));
}

/** Rewrite the derived count + training record of one line from the box. */
// Counts go by derived-count key (a Special copy counts as normal, as the
// previous release reads it); the training record is per exact Variant, so a
// plain line's best copy is never the Special one.
export function syncLine(user, id, variant) {
  const v = normV(variant);
  const key = countKey(v);
  const copies = copiesOf(user, id, v);
  const counted = countedCopies(user, id, key);
  user.pokemon ??= {};
  if (counted) {
    user.pokemon[id] ??= { normal: 0, shiny: 0 };
    user.pokemon[id][key] = counted;
  } else if (user.pokemon[id]) {
    user.pokemon[id][key] = 0;
  }
  if (copies.length) {
    user.training ??= {};
    user.training[trainingKey(id, v)] = { exp: copies[0].exp };
  } else if (user.training) {
    delete user.training[trainingKey(id, v)];
  }
  const e = user.pokemon[id];
  if (e && (e.normal ?? 0) <= 0 && (e.shiny ?? 0) <= 0) delete user.pokemon[id];
}

/**
 * Add one copy and register it. `exp` defaults to a fresh Catch level roll.
 * @returns {{ uid, level, exp, newSpecies, newShiny }}
 */
export function addCopy(user, id, variant, { exp = null, at = Date.now(), uid = null, rand = Math.random } = {}) {
  const v = normV(variant);
  if (!user.box || typeof user.box !== "object") normalizeBox(user, { rand });
  const useUid = uid && COPY_UID_PATTERN.test(uid) && !user?.box?.[uid] ? uid : newCopyUid(user);
  const e = clampExp(exp ?? expForLevel(rollCatchLevel(Number(id), rand)));
  user.box ??= {};
  user.box[useUid] = { id: Number(id), ...variantFields(v), exp: e, ...(at ? { at } : {}) };
  syncLine(user, id, v);
  return { uid: useUid, exp: e, level: levelForExp(e), ...registerDex(user, id, v) };
}

/**
 * Gives the player a Special variant (the Squirtle Squad Leader for beating
 * the Squad) at its catalog start Level, unless they already have one: a
 * player holds at most one of each.
 * @returns {{ granted: boolean, uid: string|null }}
 */
export function grantSpecial(user, key, { at = Date.now() } = {}) {
  if (!isSpecialVariant(key)) throw new Error(`grantSpecial: unknown Special variant ${key}`);
  const { species, startLevel } = specialVariant(key);
  const have = copiesOf(user, species, key)[0];
  if (have) return { granted: false, uid: have.uid };
  return { granted: true, uid: addCopy(user, species, key, { exp: expForLevel(startLevel), at }).uid };
}

/**
 * Remove one copy and everything that points at it (team slots, per-copy
 * movesets, TM record). Returns the removed record (with its TM record, if
 * any) so a Gift can hand it on. The caller has done all the checks.
 */
export function takeCopy(user, uid) {
  const rec = user?.box?.[uid];
  if (!rec) return null;
  const custom = user.customPokemon?.[uid] ?? null;
  delete user.box[uid];
  if (custom) {
    delete user.customPokemon[uid];
    if (Object.keys(user.customPokemon).length === 0) delete user.customPokemon;
  }
  for (const { field, index } of slotsHolding(user, uid)) delete user[field][index].uid;
  for (const team of Object.values(user.movesets ?? {})) {
    if (team && typeof team === "object") delete team[`u:${uid}`];
  }
  syncLine(user, rec.id, variantOf(rec));
  return { rec, custom };
}

/**
 * A Gift arriving (commands/gift.js): the same Pokémon, with its EXP,
 * caught-on time and TM record (rev bumped), under a new uid. Registers.
 * @returns {{ uid, level, newSpecies, newShiny }}
 */
export function adoptCopy(user, { rec, custom = null }) {
  // A Special variant is kept for good; gift.js never takes one (spareCopies), so this is a bug guard.
  if (isSpecialVariant(rec?.variant)) throw new Error("adoptCopy: a Special variant can't be gifted");
  const variant = variantOf(rec);
  const made = addCopy(user, Number(rec.id), variant, { exp: rec.exp, at: rec.at ?? null });
  if (custom) {
    user.customPokemon ??= {};
    user.customPokemon[made.uid] = { ...custom, uid: made.uid, speciesId: Number(rec.id), variant, rev: (custom.rev ?? 0) + 1 };
  }
  return made;
}

/** Add EXP to one copy (battle EXP). @returns {{ fromLevel, toLevel }} */
export function addCopyExp(user, uid, amount) {
  const rec = copyOf(user, uid);
  if (!rec) return { fromLevel: 1, toLevel: 1 };
  const fromLevel = levelForExp(clampExp(rec.exp));
  rec.exp = clampExp(rec.exp + Math.max(0, Math.floor(Number(amount) || 0)));
  syncLine(user, rec.id, variantOf(rec));
  return { fromLevel, toLevel: levelForExp(rec.exp) };
}

/** EXP a Feed gives a copy at `level`: today's duplicate share of one Level. */
export function feedExpFor(level) {
  if (level >= LEVEL_CAP) return 0;
  return Math.floor((expForLevel(level + 1) - expForLevel(level)) * DUPLICATE_LEVEL_SHARE);
}

const fail = (code, error, extra = {}) => ({ ok: false, code, error, ...extra });

/**
 * Feed copy `from` to copy `to` (same species + Variant). `from` must be on
 * no Team; a trained `from` needs the rev the player confirmed.
 */
export function canFeed(user, { from, to, confirmRev = undefined }) {
  const a = copyOf(user, from);
  const b = copyOf(user, to);
  if (!a || !b) return fail("unknown_copy", "That Pokémon copy no longer exists.");
  if (from === to) return fail("bad_request", "A Pokémon can't be fed to itself.");
  const special = [a, b].map(variantOf).find(isSpecialVariant);
  if (special) return fail("special", `The ${specialVariant(special).name} can't be fed or fed to.`);
  if (Number(a.id) !== Number(b.id) || variantOf(a) !== variantOf(b)) return fail("bad_request", "Only a copy of the same Pokémon and variant can be fed.");
  if (isOnTeam(user, from)) return fail("on_team", "That Pokémon is on a team. Take it off the team first.");
  const custom = user.customPokemon?.[from];
  if (custom && !custom.suspended && confirmRev !== (custom.rev ?? 0)) {
    return fail("stale_confirmation", "That Pokémon has TM-trained moves. Confirm to feed it anyway.", { protected: [{ uid: from, rev: custom.rev ?? 0, tmMoves: [...(custom.tmMoves ?? [])] }] });
  }
  const level = levelForExp(clampExp(b.exp));
  if (level >= LEVEL_CAP) return fail("max_level", "That Pokémon is already at the top Level.");
  return { ok: true, gain: feedExpFor(level) };
}

export function feedCopy(user, args) {
  const check = canFeed(user, args);
  if (!check.ok) return check;
  takeCopy(user, args.from);
  const { fromLevel, toLevel } = addCopyExp(user, args.to, check.gain);
  return { ok: true, gained: check.gain, fromLevel, toLevel };
}

// ---------------------------------------------------------- normalization / migration

/**
 * IN PLACE, idempotent. Run on every load after normalizeCustomPokemon.
 *  1. First run (no box): build one record per counted copy. Trained copies
 *     and the copy standing in every untrained Team slot keep the old shared
 *     Level; other copies re-roll a Catch level, capped at the old Level.
 *  2. Later runs: reconcile the box to the counts when an older release
 *     changed them (rollback window): missing copies are added at the line's
 *     training EXP; extra ones are removed spare-first; a shared Level raised
 *     by the older release lands on the line's best copy.
 *  3. Every trained (customPokemon) record has a box record with its uid.
 *  4. Team slots name a copy of their line (best copy not already used in that team).
 *  5. Derived counts/training rewritten; the Pokédex holds everything owned.
 * @returns {{ changed: boolean, migrated: boolean, added: number, removed: number }}
 */
export function normalizeBox(user, { rand = Math.random, now = Date.now() } = {}) {
  const res = { changed: false, migrated: false, added: 0, removed: 0 };
  if (!user || typeof user !== "object") return res;
  const pokemon = user.pokemon && typeof user.pokemon === "object" && !Array.isArray(user.pokemon) ? user.pokemon : {};
  const migrating = !user.box || typeof user.box !== "object" || Array.isArray(user.box);
  if (migrating) {
    // Nothing owned yet: leave the record as it is (addCopy creates the box).
    const hasAny = Object.values(pokemon).some((e) => (Number(e?.normal) || 0) > 0 || (Number(e?.shiny) || 0) > 0);
    if (!hasAny) return res;
    user.box = {};
    res.migrated = true;
    res.changed = true;
  }

  // drop malformed records
  for (const [uid, rec] of Object.entries(user.box)) {
    if (!COPY_UID_PATTERN.test(uid) || !rec || typeof rec !== "object" || !Number.isInteger(Number(rec.id)) || Number(rec.id) < 1) {
      delete user.box[uid];
      res.changed = true;
    }
  }

  // Lines to look at, by derived-count key (a Special copy counts as normal):
  // counted lines + box lines. Reconciling never adds or removes a Special
  // copy: the previous release never made one, and counts it as normal.
  const lines = new Set();
  for (const [id, e] of Object.entries(pokemon)) for (const v of VARIANTS) if ((Number(e?.[v]) || 0) > 0) lines.add(`${Number(id)}:${v}`);
  for (const rec of Object.values(user.box)) lines.add(`${Number(rec.id)}:${countKey(variantOf(rec))}`);

  for (const key of lines) {
    const [idS, v] = key.split(":");
    const id = Number(idS);
    const want = Math.max(0, Math.floor(Number(pokemon[id]?.[v]) || 0));
    const sharedExp = clampExp(user.training?.[trainingKey(id, v)]?.exp ?? expForLevel(floorLevel(id)));
    const sharedLevel = levelForExp(sharedExp);
    const trained = Object.values(user.customPokemon ?? {})
      .filter((c) => c && !c.suspended && Number(c.speciesId) === id && countKey(normV(c.variant)) === v);

    // 3. trained records always have a box record (of the trained record's exact Variant)
    for (const { uid, variant } of trained) {
      const tv = normV(variant);
      if (!user.box[uid]) {
        user.box[uid] = { id, ...variantFields(tv), exp: sharedExp };
        res.changed = true;
        res.added++;
      } else if (Number(user.box[uid].id) !== id || variantOf(user.box[uid]) !== tv) {
        user.box[uid].id = id;
        setVariant(user.box[uid], tv);
        res.changed = true;
      }
    }
    const trainedUids = trained.map((c) => c.uid);

    let have = countedCopies(user, id, v);
    if (have < want) {
      // 1 (migration) or 2 (counts grew under an older release)
      const plainSlotUsed = TEAM_FIELDS.some((f) => Array.isArray(user[f]) && user[f].some((s) => s && Number(s.id) === id && normV(s.variant) === v && !(s.uid && user.box[s.uid])));
      let keeperDone = !migrating || (!plainSlotUsed && trainedUids.length > 0);
      while (have < want) {
        let exp = sharedExp;
        if (!keeperDone) keeperDone = true;
        else if (migrating) exp = expForLevel(Math.min(rollCatchLevel(id, rand), sharedLevel));
        const uid = newCopyUid(user);
        user.box[uid] = { id, ...(v === "shiny" ? { shiny: true } : {}), exp };
        have++;
        res.added++;
        res.changed = true;
      }
    } else if (have > want && !migrating) {
      // counts shrank under an older release: remove spares, then anything untrained
      const order = [
        ...spareCopies(user, id, v),
        ...copiesOf(user, id, v).filter((c) => !c.trained && isOnTeam(user, c.uid)).sort((a, b) => a.exp - b.exp),
        ...copiesOf(user, id, v).filter((c) => c.trained).sort((a, b) => a.exp - b.exp),
      ];
      for (const c of order) {
        if (have <= want) break;
        takeCopy(user, c.uid);
        have--;
        res.removed++;
        res.changed = true;
      }
    }
  }

  // 2b. EXP an older release added to the shared Level (battles, duplicate
  // catches) during the rollback window lands on the line's best copy.
  if (!migrating) {
    for (const key of lines) {
      const [idS, v] = key.split(":"); // a count key: the plain normal or shiny line, never a Special copy
      const best = copiesOf(user, Number(idS), v)[0];
      const shared = clampExp(user.training?.[key]?.exp);
      if (best && shared > best.exp) { user.box[best.uid].exp = shared; res.changed = true; }
    }
  }

  // 4. team slots
  for (const field of TEAM_FIELDS) {
    const team = user[field];
    if (!Array.isArray(team)) continue;
    const used = new Set();
    for (const s of team) {
      if (!s || typeof s !== "object") continue;
      const v = normV(s.variant);
      const rec = s.uid ? user.box[s.uid] : null;
      if (rec && Number(rec.id) === Number(s.id) && variantOf(rec) === v && !used.has(s.uid)) { used.add(s.uid); continue; }
      const free = copiesOf(user, s.id, v).filter((c) => !used.has(c.uid));
      const pick = free.find((c) => !c.trained) ?? free[0];
      if (pick) { if (s.uid !== pick.uid) { s.uid = pick.uid; res.changed = true; } used.add(pick.uid); }
      else if ("uid" in s) { delete s.uid; res.changed = true; }
    }
  }

  // 5. derived fields + Pokédex
  const touched = new Set([...lines]);
  for (const rec of Object.values(user.box)) touched.add(`${Number(rec.id)}:${variantOf(rec)}`);
  for (const key of touched) {
    const [id, v] = key.split(":");
    syncLine(user, Number(id), v);
  }
  for (const rec of Object.values(user.box)) {
    const before = dexMask(user, rec.id);
    registerDex(user, rec.id, variantOf(rec));
    if (dexMask(user, rec.id) !== before) res.changed = true;
  }
  return res;
}
