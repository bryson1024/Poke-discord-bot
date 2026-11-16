export function normVariant(v) {
  const s = String(v ?? "normal").toLowerCase().trim();
  return s === "shiny" ? "shiny" : "normal";
}

export function toTeamObj(entry) {
  if (typeof entry === "number") return Number.isInteger(entry) ? { id: entry, variant: "normal" } : null;
  if (typeof entry === "string") {
    const n = Number(entry);
    return Number.isInteger(n) ? { id: n, variant: "normal" } : null;
  }
  if (entry && typeof entry === "object") {
    const id = Number(entry.id);
    if (!Number.isInteger(id)) return null;

    const legacyIsShiny = entry.variant == null && (entry.shiny === true || entry.isShiny === true);
    return { id, variant: legacyIsShiny ? "shiny" : normVariant(entry.variant) };
  }
  return null;
}

export function normalizeTeam(rawTeam, maxSize = 6) {
  const arr = Array.isArray(rawTeam) ? rawTeam : [];
  const kept = arr.filter((e) => toTeamObj(e));
  const mapped = kept.map(toTeamObj);

  const seen = new Set();
  const out = [];

  for (const [i, slot] of mapped.entries()) {
    // Each Pokémon once per team (only the Showcase takes repeats); the slot
    // keeps the copy it names (docs/adr/0001).
    const uid = kept[i] && typeof kept[i] === "object" && typeof kept[i].uid === "string" ? kept[i].uid : null;
    // Black/White Kyurem (utils/fusions.js): the slot keeps its fusion form id.
    const form = kept[i] && typeof kept[i] === "object" && typeof kept[i].form === "string" && /^kyurem-(black|white)$/.test(kept[i].form) ? kept[i].form : null;
    const clean = { id: Number(slot.id), variant: normVariant(slot.variant), ...(uid ? { uid } : {}), ...(form ? { form } : {}) };
    const k = `${clean.id}:${clean.variant}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(clean);
    if (out.length >= maxSize) break;
  }
  return out;
}
