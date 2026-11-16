// ==========================================================
// utils/battle/moveText.js — what a move does, in one line, for the
// dashboard's move rows (shown under each move). Showdown's own short text
// (@pkmn/sim 0.10.12, the engine the full sim runs), with "Pokemon" spelled
// properly and a few lines rewritten where Showdown's wording assumes
// competitive-play knowledge or a mechanic our battles don't have.
// Our engine changes (utils/battle/showdown/engine.js) only touch damage
// rolls and crit odds, so the text stays true.
// ==========================================================

import { Dex } from "@pkmn/sim";

const dex = Dex.forGen(9);

// Showdown lines that read wrong here.
const REWRITE = {
  splash: "Does nothing.",
  celebrate: "Does nothing.",
  holdhands: "Does nothing.",
  happyhour: "Does nothing in Coop battles.",
};

const cache = new Map();

/** The move's one-line description, or "" when Showdown doesn't know it. */
export function moveDesc(moveId) {
  const id = String(moveId ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (cache.has(id)) return cache.get(id);
  const m = dex.moves.get(id);
  const text = REWRITE[id] ?? (m?.exists ? String(m.shortDesc || m.desc || "") : "");
  const out = text.replace(/Pokemon/g, "Pokémon");
  cache.set(id, out);
  return out;
}

/** Priority (-7..+5) when not 0, else null: "goes first" moves like Quick Attack. */
export function movePriority(moveId) {
  const m = dex.moves.get(String(moveId ?? ""));
  return m?.exists && m.priority ? m.priority : null;
}

/**
 * The extra fields every dashboard move row carries: { desc, acc, priority }.
 * acc (true = never misses, else a %) is named apart from `accuracy`, which
 * public/shared/moveMeta.js prints on the row's meta line: moveDescLine
 * shows it only when it says something (below 100%, or an attack that never misses).
 */
export function moveDetails(moveId, move) {
  const acc = move?.accuracy === true ? true : Number.isFinite(move?.accuracy) ? move.accuracy : null;
  return { desc: moveDesc(moveId), acc, priority: movePriority(moveId) };
}
