/**
 * spriteConfig.js
 * Centralized sprite URL map and rarity emoji set for CoopBot v1.2
 * Used by trainercard.js and pokedex.js
 */

export const rarityEmojis = {
  common: '⚬',
  uncommon: '✦︎',
  rare: '☆',
  epic: '✮✮',
  legendary: '✮✮✮',
  mythic: '✮✮✮✮'
};

export const rarityColors = {
  common: "#9ca3af",     // gray
  uncommon: "#10b981",   // green
  rare: "#3b82f6",       // blue
  epic: "#a855f7",       // purple
  legendary: "#facc15",  // gold
  mythic: "#ef4444",     // red
};

export const spritePaths = {
  // Pokémon sprites (Gen 1–5)
  pokemon: '/public/sprites/pokemon/normal/',
  shiny: '/public/sprites/pokemon/shiny/',
  grayscale: '/public/sprites/pokemon/grayscale/',

  // Trainer sprites
  trainers: '/public/sprites/trainers_2/',
  trainersGray: '/public/sprites/trainers_2/grayscale/',
  trainersIdle: '/public/sprites/trainers_idle/',

  // Type icons (1–17)
  types: '/public/sprites/types/',

  // NEW: item icons (e.g. Poké Ball placeholder)
  items: '/public/sprites/items/'
};

// Special variants: one-of-a-kind Variants with their own name and sprites
// (data/pokedex/special-variants.json; tests/specialVariants.test.js keeps
// these names in step with it). "squad-member" is a look the Squirtle
// Squad's members wear in battles: it shows in Battle Records, never owned.
export const SPECIAL_NAMES = Object.freeze({
  "squad-leader": "Squirtle Squad Leader",
  "squad-member": "Squirtle",
});
export const isSpecial = (v) => typeof v === "string" && Object.hasOwn(SPECIAL_NAMES, v);

/** A Variant as the dashboard keeps it: "shiny", a Special variant, else "normal". */
export const variantKey = (v) => (v === "shiny" ? "shiny" : isSpecial(v) ? v : "normal");

/** A Special variant's sprite: its own colors, or (folder "grayscale") its fainted twin. */
export const specialSprite = (key, folder = "normal") =>
  `/public/sprites/pokemon/special/${folder === "grayscale" ? "grayscale" : "normal"}/${key}.gif`;

/** A copy row's Variant (/api/user-pokemon `copies`: [2] shiny 0|1, [8] a Special variant or null). */
export const rowVariant = (r) => r?.[8] ?? (r?.[2] ? "shiny" : "normal");
