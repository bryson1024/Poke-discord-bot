// ==========================================================
// services/copyRows.js: the Collection's compact per-copy rows for the
// dashboard (GET /api/user-pokemon `copies`; docs/adr/0001).
//
// [uid, id, shiny 0|1, level, caughtAt|0, trained 0|1,
//  teams bitmask (1 Casual, 2 Ranked, 4 Showcase), exp, special]
//
// exp is exact so Donate Duplicates keeps the same best copy the server
// does. special is the copy's Special variant key (the Squirtle Squad
// Leader, utils/specialVariants.js) or null; a Special copy also has
// shiny 0, so older pages that read only the first eight fields see a
// plain copy.
// ==========================================================

import { allCopies, slotsHolding } from "./box.js";
import { isSpecialVariant } from "../utils/specialVariants.js";

export const TEAM_BIT = Object.freeze({ displayedPokemon: 1, battleTeam: 2, showcaseTeam: 4 });

export function copyRows(user) {
  return allCopies(user).map((c) => [
    c.uid, c.id, c.variant === "shiny" ? 1 : 0, c.level, c.at ?? 0, c.trained ? 1 : 0,
    slotsHolding(user, c.uid).reduce((m, s) => m | (TEAM_BIT[s.field] ?? 0), 0),
    c.exp,
    isSpecialVariant(c.variant) ? c.variant : null,
  ]);
}
