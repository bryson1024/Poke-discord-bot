// ==========================================================
// utils/specialVariants.js: Special variants (CONTEXT.md, Special variant;
// docs/adr/0002-special-variants.md).
// A Variant is normal, shiny, or a Special variant such as the Squirtle Squad
// Leader: a one-of-a-kind version of a species a player wins, with its own
// look, base stats and extra moves. data/pokedex/special-variants.json is the
// catalog. Its ownable: false entries (the Squad members' round shades) are
// looks for computer-run Trainers' Pokémon only: sprites, never owned.
// Derived counts stay two-way (countKey): a Special copy counts as normal, so
// species-level readers and the previous release see a plain copy.
// ==========================================================

import { readFileSync } from "fs";
import { getSpecies } from "./battle/data.js";

const raw = JSON.parse(readFileSync(new URL("../data/pokedex/special-variants.json", import.meta.url), "utf8"));

export const SPECIAL_VARIANTS = Object.freeze(Object.fromEntries(
  Object.entries(raw.variants).map(([key, e]) => [key, Object.freeze({ ...e })]),
));

/** An ownable Special variant key (a Variant a copy can have). */
export const isSpecialVariant = (v) => typeof v === "string" && SPECIAL_VARIANTS[v]?.ownable === true;

/** Any catalog key, ownable or a Trainer-only look: something with Special sprites. */
export const isSpriteVariant = (v) => typeof v === "string" && Object.hasOwn(SPECIAL_VARIANTS, v);

export const specialVariant = (v) => (isSpriteVariant(v) ? SPECIAL_VARIANTS[v] : null);

/** "shiny", an ownable Special variant, else "normal". */
export const normalizeVariant = (v) => (v === "shiny" ? "shiny" : isSpecialVariant(v) ? v : "normal");

/** The derived-count key: shiny stays shiny, everything else counts as normal. */
export const countKey = (v) => (v === "shiny" ? "shiny" : "normal");

export const VARIANT_KEYS = Object.freeze(["normal", "shiny", ...Object.keys(SPECIAL_VARIANTS).filter(isSpecialVariant)]);

/** Battle stats for a Special variant ({ baseStats, types, name }), or null (normal, shiny, a look with no stats). */
export function specialBattleProfile(v) {
  const e = specialVariant(v);
  if (!e?.baseStats) return null;
  return { baseStats: { ...e.baseStats }, types: [...getSpecies(e.species).types], name: e.name };
}

export const specialExtraMoves = (v) => [...(specialVariant(v)?.extraMoves ?? [])];

/** Path under public/sprites/pokemon/ for a Special sprite: the grayscale twin for "grayscale", else the live one. */
export function specialSpriteFile(v, folder) {
  if (!isSpriteVariant(v)) return null;
  return `special/${folder === "grayscale" ? "grayscale" : "normal"}/${v}.gif`;
}
