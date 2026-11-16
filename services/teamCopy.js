// ==========================================================
// services/teamCopy.js — copying one team onto the other (owner decision,
// 2026-11-11): the Teams page's "Copy from Display team" / "Copy from Battle
// team". The page copies the Pokémon, their order and Mega choices into the
// team it shows; Save sends the team with copyFrom + copiedKeys, and the
// team save calls applyTeamCopy in the same locked write, so the team and
// the copied moves land together or not at all.
//
// 2026-11-16 (owner): a copy carries the whole loadout, so each copied
// Pokémon also brings its chosen Ability (services/abilities.js) and its
// held item (services/heldItems.js, user.equipment.teams). The Showcase has
// none of these, so copies to or from it carry only the Pokémon.
// ==========================================================

import { chosenMoves, setMoveset, learnableMoves, copyUid, TEAM_TYPES } from "./movesets.js";
import { copyTraining } from "./box.js";
// fullSimCutover imports movesets.js, which this module also imports; used only inside functions.
import { defaultMoves } from "./fullSimCutover.js";
import { chosenAbility, setAbility, automaticAbility } from "./abilities.js";
import { teamEquipment, memberKey, lineKey as itemLineKey } from "./heldItems.js";
import { normalizeVariant, VARIANT_KEYS } from "../utils/specialVariants.js";

const TEAM_FIELD = { display: "displayedPokemon", battle: "battleTeam" };
const keyOf = (s) => `${Number(s?.id)}:${normalizeVariant(s?.variant)}`;

// Catalog keys are lowercase words and hyphens, so they need no escaping.
const KEY = new RegExp(`^([1-9]\\d{0,4}):(${VARIANT_KEYS.join("|")})$`);
export const MAX_COPIED_KEYS = 6;

/**
 * Validate copyFrom / copiedKeys from the team save body.
 * @returns {{ok:true, copy:null} | {ok:true, copy:{from, keys}} | {ok:false, status, error, code}}
 */
export function parseTeamCopy(body, teamType) {
  const from = body?.copyFrom;
  if (from == null) return { ok: true, copy: null };
  if (!TEAM_TYPES.includes(from) || from === teamType) return { ok: false, status: 400, error: "Unknown team to copy from.", code: "bad_copy" };
  const keys = body?.copiedKeys;
  if (!Array.isArray(keys) || keys.length < 1 || keys.length > MAX_COPIED_KEYS || keys.some((k) => typeof k !== "string" || !KEY.test(k))) {
    return { ok: false, status: 400, error: "Invalid copied Pokémon.", code: "bad_copy" };
  }
  return { ok: true, copy: { from, keys: [...new Set(keys)] } };
}

/**
 * IN PLACE, after the team itself was validated and saved: for each copied
 * Pokémon that is on the saved team, make its moves, Ability and held item
 * on team `to` the same as on team `from` (automatic there → automatic
 * here, no item there → no item here). Pokémon added by hand after the
 * copy are not in copiedKeys and keep their own.
 *
 * Every slot names one copy (docs/adr/0001), and battles read that copy's
 * own moves (`u:<uid>`) before the line's. So a slot with a copy gets the
 * moves of the same copy on the source team (else that line's first source
 * slot) written to ITS copy; only a slot without a copy uses line moves.
 * Before 2026-11-15 this copied line moves only, which did nothing for
 * copies with their own pick.
 *
 * Held items keep the team rules (services/heldItems.js R2–R5): the caller
 * runs reconcileTeamEquipment right after, which drops anything that no
 * longer fits (a Mega slot, a duplicate with a hand-added Pokémon).
 * @returns the keys whose loadout was copied
 */
export function applyTeamCopy(user, { from, to, keys }, savedTeam) {
  const wanted = new Set(keys);
  const source = Array.isArray(user?.[TEAM_FIELD[from]]) ? user[TEAM_FIELD[from]].filter((s) => s && typeof s === "object") : [];
  const fromItems = teamEquipment(user, from);
  const toItems = [];
  const done = [];
  for (const slot of savedTeam ?? []) {
    const key = keyOf(slot);
    if (!wanted.has(key)) continue;
    const id = Number(slot.id);
    const variant = normalizeVariant(slot.variant);
    const toUid = copyUid(user, id, variant, slot.uid ?? null);
    const src = (slot.uid ? source.find((s) => s.uid && s.uid === slot.uid) : null) ?? source.find((s) => keyOf(s) === key);
    const fromUid = src ? copyUid(user, id, variant, src.uid ?? null) : null;
    if (!toUid) {
      // An older slot without a copy: the line's moves and Ability, as before.
      if (!done.includes(key)) {
        setMoveset(user, to, id, variant, chosenMoves(user, from, id, variant));
        setAbility(user, to, id, variant, chosenAbility(user, from, id, variant));
      }
    } else {
      const moves = chosenMoves(user, from, id, variant, { uid: fromUid });
      if (moves) setMoveset(user, to, id, variant, moves, { uid: toUid });
      else {
        // Automatic on the source → automatic here. If a line pick on this
        // team would then apply instead, pin the moves it fights with on the
        // source, so the two teams still match.
        setMoveset(user, to, id, variant, null, { uid: toUid });
        if (chosenMoves(user, to, id, variant, { uid: toUid })) {
          const level = copyTraining(user, fromUid ?? toUid)?.level;
          const allowed = new Set(learnableMoves(user, id, variant, { uid: toUid }).map((m) => m.id));
          const auto = defaultMoves(user, { id, variant, uid: fromUid ?? toUid }, level).filter((m) => allowed.has(m));
          if (auto.length) setMoveset(user, to, id, variant, auto, { uid: toUid });
        }
      }
      // Ability: the same rule. Automatic on the source, but a line choice
      // here would win → pin what Automatic picks on the source team.
      const ability = chosenAbility(user, from, id, variant, { uid: fromUid });
      setAbility(user, to, id, variant, ability, { uid: toUid });
      if (!ability && chosenAbility(user, to, id, variant, { uid: toUid })) {
        setAbility(user, to, id, variant, automaticAbility(user, from, id), { uid: toUid });
      }
    }
    // Held item: the source member's item (its copy, else an older line key).
    const item = src ? (fromItems[memberKey(src)] ?? fromItems[itemLineKey(src.id, src.variant)] ?? null) : null;
    toItems.push({ member: memberKey(toUid ? { uid: toUid } : slot), line: itemLineKey(id, variant), item });
    if (!done.includes(key)) done.push(key);
  }
  copyItems(user, to, toItems);
  return done;
}

/** Write the copied members' items on team `to` (null = none), in one rev bump. */
function copyItems(user, to, entries) {
  if (!entries.length) return;
  const had = user?.equipment?.teams?.[to];
  if (!entries.some((e) => e.item) && !(had && typeof had === "object")) return;
  user.equipment = user.equipment && typeof user.equipment === "object" && !Array.isArray(user.equipment) ? user.equipment : { rev: 0, teams: {} };
  user.equipment.teams = user.equipment.teams && typeof user.equipment.teams === "object" ? user.equipment.teams : {};
  const map = user.equipment.teams[to] && typeof user.equipment.teams[to] === "object" ? user.equipment.teams[to] : {};
  const before = JSON.stringify(map);
  for (const { member, line } of entries) { delete map[member]; delete map[line]; }
  // Item Clause: a copied item wins over the same item on a Pokémon that wasn't copied.
  const copied = new Set(entries.map((e) => e.item).filter(Boolean));
  for (const k of Object.keys(map)) if (copied.has(map[k])) delete map[k];
  for (const { member, item } of entries) if (item) map[member] = item;
  if (Object.keys(map).length) user.equipment.teams[to] = map;
  else delete user.equipment.teams[to];
  if (JSON.stringify(map) !== before) user.equipment.rev = (Number.isSafeInteger(user.equipment.rev) && user.equipment.rev >= 0 ? user.equipment.rev : 0) + 1;
}
