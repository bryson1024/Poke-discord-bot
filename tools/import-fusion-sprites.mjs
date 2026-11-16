// ==========================================================
// tools/import-fusion-sprites.mjs
// Imports the sprites of fusion forms (utils/fusions.js) that aren't in the
// repository yet: Dusk Mane and Dawn Wings Necrozma. Same rules as
// tools/import-sprites.mjs:
//   • sources and audited SHA-1s come from data/sprites/source-manifest.json
//     (Smogon Sun/Moon Sprite Project, via Pokémon Showdown gen5ani);
//     a download that doesn't match its SHA-1 aborts the import
//   • GIFs using disposal 3 are re-encoded; grayscale copies use BT.709 luma
// Output: public/sprites/pokemon/<normal|shiny|grayscale>/<spriteId>.gif,
// where spriteId is the form's (e.g. 800-duskmane).
//
// Run: node tools/import-fusion-sprites.mjs   (network; cached in .cache/)
// ==========================================================

import fs from "fs";
import crypto from "crypto";
import { gifFrames, encodeGif, toGrayscale } from "./lib/spriteCodec.mjs";

const ROOT = new URL("..", import.meta.url);
const P = (rel) => new URL(rel, ROOT);
const SOURCE = JSON.parse(fs.readFileSync(P("data/sprites/source-manifest.json"), "utf8"));
const CACHE = P(".cache/sprites/");
const UA = "coopbot-sprite-import/1.0 (build tool)";
const sha1 = (b) => crypto.createHash("sha1").update(b).digest("hex");

// Source-manifest name → our sprite id (utils/fusions.js spriteId).
const FORMS = { "Necrozma-Dusk-Mane": "800-duskmane", "Necrozma-Dawn-Wings": "800-dawnwings" };

async function download(asset) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = new URL(asset.sha1, CACHE);
  if (fs.existsSync(file) && sha1(fs.readFileSync(file)) === asset.sha1) return fs.readFileSync(file);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(asset.url, { headers: { "User-Agent": UA } });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (sha1(buf) !== asset.sha1) throw new Error(`SHA-1 mismatch for ${asset.url}: got ${sha1(buf)}, audited ${asset.sha1}`);
      fs.writeFileSync(file, buf);
      return buf;
    }
    if (res.status === 404) break;
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
  throw new Error(`download failed: ${asset.url}`);
}

const storable = (src) => {
  const g = gifFrames(src);
  return { bytes: g.disposals.includes(3) ? encodeGif(g.width, g.height, g.frames) : src, decoded: g };
};

for (const [name, spriteId] of Object.entries(FORMS)) {
  const e = SOURCE.entries.find((x) => x.name === name);
  if (!e?.normal || !e?.shiny) throw new Error(`${name}: no normal + shiny source in the manifest`);
  if (e.normal.format !== "GIF" || e.shiny.format !== "GIF") throw new Error(`${name}: expected animated GIF sources`);
  if (e.normal.sha1 === e.shiny.sha1) throw new Error(`${name}: shiny isn't distinct from normal`);
  const normal = storable(await download(e.normal));
  const shiny = storable(await download(e.shiny));
  fs.writeFileSync(P(`public/sprites/pokemon/normal/${spriteId}.gif`), normal.bytes);
  fs.writeFileSync(P(`public/sprites/pokemon/shiny/${spriteId}.gif`), shiny.bytes);
  fs.writeFileSync(P(`public/sprites/pokemon/grayscale/${spriteId}.gif`), encodeGif(normal.decoded.width, normal.decoded.height, toGrayscale(normal.decoded.frames)));
  console.log(`${name} → ${spriteId}: ${normal.decoded.width}x${normal.decoded.height}, ${normal.decoded.frames.length} frames (credit: ${e.credit?.project ?? "?"}${e.credit?.artist ? `, ${e.credit.artist}` : ""})`);
}
