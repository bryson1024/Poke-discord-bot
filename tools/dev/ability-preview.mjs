// ==========================================================
// tools/dev/ability-preview.mjs — a LOCAL preview of the Teams page with
// the full sim on, over ONE synthetic player held in memory: the details
// drawer's Ability lines and the moves editor's Ability picker, using the
// real services (pokemonDetail, movesets, abilities, battle plans). Saves
// change memory only. No Discord, no player data. Never deploy this.
//
//   node tools/dev/ability-preview.mjs [port=5260]
// ==========================================================

process.env.FULL_SIM_ENABLED = "1";

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createNewUser } from "../../utils/userSchema.js";
import { lockUser } from "../../utils/userLocks.js";
import { levelsForUser } from "../../utils/training.js";
import { powersFromLevels } from "../../utils/battle/power.js";
import { pokemonDetail } from "../../services/pokemonDetail.js";
import { saveMoveset } from "../../services/movesets.js";
import { saveAbility } from "../../services/abilities.js";
import { createBattlePlanHandlers } from "../../services/battlePlansApi.js";
import { normalizeBox } from "../../services/box.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = Number(process.argv[2] ?? 5260);
const ID = "100000000000000043";
const u = createNewUser(ID, "Preview Trainer");
u.cc = 24000;
// Kingdra (Swift Swim / Sniper), Pelipper (Keen Eye / Drizzle), Gyarados (Intimidate only), Mantine + Gligar (change on Weather), …
for (const s of [230, 279, 130, 226, 207, 143]) {
  u.pokemon[s] = { normal: 1, shiny: 0 };
  u.training ??= {};
  u.training[`${s}:normal`] = { exp: 45 ** 3 };
}
u.displayedPokemon = [230, 279, 130, 226, 207, 143].map((id) => ({ id, variant: "normal" }));
u.battleTeam = [230, 279, 130, 226, 207, 143].map((id) => ({ id, variant: "normal" }));
u.battlePlans = { display: "weather", battle: "allout" };
normalizeBox(u);
const td = { [ID]: u };
const ok = () => true;
const saveAndAck = async () => ({ saved: true, note: "" });
const plans = createBattlePlanHandlers({ getTrainerData: () => td, isAuthorized: ok, lockUser, saveAndAck });

const app = express();
app.use("/public", express.static(path.join(ROOT, "public"), { etag: false, maxAge: 0 }));
app.get("/public/teams", (_, res) => res.sendFile(path.join(ROOT, "public", "teams", "index.html")));
app.get("/api/mega", (_, res) => res.json({ success: true, enabled: false }));
app.get("/api/held-items", (_, res) => res.json({ enabled: false }));
app.get("/api/live-events", (_, res) => res.json({ events: [] }));
app.get("/api/battle/enabled", (_, res) => res.json({ enabled: false }));
app.get("/api/user-pokemon", (_, res) => {
  const levels = levelsForUser(u);
  res.json({ id: ID, cc: u.cc, items: u.items, pokemon: u.pokemon, box: u.box, currentTeam: u.displayedPokemon, battleTeam: u.battleTeam ?? null, levels, powers: powersFromLevels(levels), ranked: { rating: 1000, wins: 0, losses: 0, position: null, players: 0, streak: 0 }, casual: { wins: 0, losses: 0, streak: 0, bestStreak: 0 } });
});
app.get("/api/pokemon/detail", (req, res) => { const { status, body } = pokemonDetail(u, req.query.species); res.status(status).json(body); });
app.get("/api/battle-plans", (req, res) => plans.get(req, res));
app.post("/api/battle-plan", express.json(), (req, res) => plans.set(req, res));
app.post("/api/pokemon/moveset", express.json(), (req, res) => {
  const r = saveMoveset(u, req.body ?? {});
  return r.ok ? res.json({ success: true, saved: true, team: r.team, moves: r.moves }) : res.status(r.status).json({ success: false, error: r.error });
});
app.post("/api/pokemon/ability", express.json(), (req, res) => {
  const r = saveAbility(u, req.body ?? {});
  console.log("ability saved:", JSON.stringify(u.abilities));
  return r.ok ? res.json({ success: true, saved: true, team: r.team, ability: r.ability, automatic: r.automatic }) : res.status(r.status).json({ success: false, error: r.error });
});
app.listen(port, "127.0.0.1", () => console.log(`ability preview: http://localhost:${port}/public/teams?id=${ID}`));
