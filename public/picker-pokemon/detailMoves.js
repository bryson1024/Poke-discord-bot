// ==========================================================
// public/picker-pokemon/detailMoves.js — which moves the details drawer
// shows (public/picker-pokemon/detail.js). DOM-free, so
// tests/detailMoves.test.js runs it in Node.
//
// A copy's drawer (a Teams slot, a Collection box tile) shows that copy's
// equipped moves on each team: its own pick, else the moves it fights with
// automatically. These are the moves battles use (utils/battle/runBattle.js
// buildTeam → chosenMoves with the slot's uid). The line-level movesets in
// the same response are only the fallback stored before copies had their
// own, and showing them made saved moves look unsaved (2026-11-15).
//
// The Pokédex drawer shows every move the species can learn instead:
// level-up moves with their Levels, and TMs, with a filter.
// ==========================================================

const onTeam = (c) => (c?.teams?.display || c?.teams?.battle ? 1 : 0);

/**
 * The copy whose moves the drawer shows: the one named by `uid`, else the
 * best copy (highest Level, then one on a team). null when none is owned.
 * line: GET /api/pokemon/detail copies[variant].
 */
export function pickCopy(line, uid = null) {
  const each = Array.isArray(line?.each) ? line.each : [];
  if (uid) {
    const own = each.find((c) => c.uid === uid);
    if (own) return own;
  }
  if (!each.length) return null;
  return [...each].sort((a, b) => b.level - a.level || onTeam(b) - onTeam(a) || String(a.uid).localeCompare(String(b.uid)))[0];
}

/**
 * The moves this copy uses on `team` ("display" | "battle"):
 * { auto: true } when nothing is picked (its automatic moves).
 * Without a copy record (older server), the line's data.
 */
export function equippedMoves(line, copy, team) {
  const src = copy ?? line ?? {};
  const set = src.movesets?.[team] ?? null;
  return { auto: !set, moves: set ?? src.moves ?? [] };
}

export const LEARNSET_FILTERS = Object.freeze(["all", "level", "tm"]);

/**
 * Pokédex rows for one filter. "all": level-up moves in Level order, then
 * TM-only moves; a move learned both ways is one row with both labels.
 * Each row: { id, name, type, category, power, learnedAt|null, byTm }.
 */
export function learnsetRows(learnset, filter = "all") {
  const tmIds = new Set((learnset?.tm ?? []).map((m) => m.id));
  const level = (learnset?.levelUp ?? []).map((m) => ({ ...m, byTm: tmIds.has(m.id) }));
  const tms = (learnset?.tm ?? []).map((m) => ({ ...m, learnedAt: null, byTm: true }));
  if (filter === "level") return level;
  if (filter === "tm") return tms;
  const seen = new Set(level.map((m) => m.id));
  return [...level, ...tms.filter((m) => !seen.has(m.id))];
}

/** The small label after a learnset row's stats: "Lv 22", "TM", "Lv 22 · TM". */
export function learnLabel(row, filter = "all") {
  if (filter === "tm" || row.learnedAt == null) return "TM";
  const lv = `Lv ${Math.max(1, row.learnedAt)}`;
  return row.byTm && filter === "all" ? `${lv} · TM` : lv;
}

/**
 * The Ability this copy fights with on `team` (full sim; null when the
 * server sends none): { name, desc, auto, only } where auto = no choice
 * saved (the Battle plan's pick, made per fight) and only = the species has
 * one regular ability, so there is nothing to choose.
 * Per copy first (services/abilities.js chosenAbility), else the line's.
 */
export function equippedAbility(line, copy, team) {
  const view = copy?.ability ?? line?.ability ?? null;
  const t = view?.teams?.[team];
  if (!view || !t) return null;
  const name = t.chosen ?? t.automatic;
  if (!name) return null;
  const info = view.options.find((o) => o.name === name) ?? { name, desc: "" };
  return { name: info.name, desc: info.desc, auto: !t.chosen, only: view.options.length < 2 };
}
