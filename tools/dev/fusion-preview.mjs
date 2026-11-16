// ==========================================================
// tools/dev/fusion-preview.mjs — a LOCAL preview of the Teams page with
// Black/White Kyurem switched on, over ONE synthetic player held in memory
// (owns Kyurem, shiny Kyurem, Zekrom and Reshiram). Team saves go through
// the real validation (prepareTeamSelection / prepareBattleTeamSelection /
// prepareShowcaseSelection) and change memory only. No Discord, no player
// data. Never deploy this.
//
//   node tools/dev/fusion-preview.mjs [port=5261]
// ==========================================================

process.env.KYUREM_FUSION_ENABLED = "1";
process.env.FULL_SIM_ENABLED = "1"; // production engine (all four form moves)

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createNewUser } from "../../utils/userSchema.js";
import { levelsForUser } from "../../utils/training.js";
import { powersFromLevels, powersAtRanked } from "../../utils/battle/power.js";
import { normalizeBox } from "../../services/box.js";
import { prepareTeamSelection, normalizeDisplayedTeam } from "../../services/megaTeam.js";
import { prepareBattleTeamSelection, normalizeBattleTeam } from "../../services/battleTeam.js";
import { prepareShowcaseSelection } from "../../services/showcaseTeam.js";
import { fusionView } from "../../services/fusionTeam.js";
import { teamCheck } from "../../services/teamCheck.js";
import { pokemonDetail } from "../../services/pokemonDetail.js";
import { saveMoveset } from "../../services/movesets.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = Number(process.argv[2] ?? 5261);
const ID = "100000000000000646";
const u = createNewUser(ID, "Fusion Preview");
for (const s of [646, 644, 643, 6, 25, 149]) {
  u.pokemon[s] = { normal: 1, shiny: s === 646 ? 1 : 0 };
  u.training ??= {};
  u.training[`${s}:normal`] = { exp: 60 ** 3 };
}
u.training["646:shiny"] = { exp: 55 ** 3 };
u.training["646:normal"] = { exp: 85 ** 3 }; // Lv 85: both form moves learned
u.displayedPokemon = [{ id: 646, variant: "normal", form: "kyurem-black" }, { id: 6, variant: "normal" }, { id: 25, variant: "normal" }];
u.battleTeam = [{ id: 646, variant: "shiny" }, { id: 149, variant: "normal" }];
normalizeBox(u);
u.showcaseTeam = [];

const app = express();
app.use("/public", express.static(path.join(ROOT, "public"), { etag: false, maxAge: 0 }));
app.get("/public/teams", (_, res) => res.sendFile(path.join(ROOT, "public", "teams", "index.html")));
app.get("/api/mega", (_, res) => res.json({ success: true, enabled: false }));
app.get("/api/held-items", (_, res) => res.json({ enabled: false }));
app.get("/api/live-events", (_, res) => res.json({ events: [] }));
app.get("/api/battle/enabled", (_, res) => res.json({ enabled: false }));
app.get("/api/battle-plans", (_, res) => res.json({ enabled: false }));
app.get("/api/user-pokemon", (_, res) => {
  normalizeDisplayedTeam(u);
  normalizeBattleTeam(u);
  const levels = levelsForUser(u);
  res.json({ id: ID, cc: 0, items: u.items, pokemon: u.pokemon, box: u.box, currentTeam: u.displayedPokemon, battleTeam: u.battleTeam ?? null, showcaseTeam: u.showcaseTeam, levels, powers: powersFromLevels(levels), powers50: powersAtRanked(levels), notices: u.notices ?? [], fusion: fusionView(u), ranked: { rating: 1000, wins: 0, losses: 0, position: null, players: 0, streak: 0 }, casual: { wins: 0, losses: 0, streak: 0, bestStreak: 0 } });
});
app.post("/api/set-pokemon-team", express.json(), (req, res) => {
  const { team, teamType } = req.body ?? {};
  const r = teamType === "showcase" ? prepareShowcaseSelection(u, team) : teamType === "battle" ? prepareBattleTeamSelection(u, team) : prepareTeamSelection(u, team);
  console.log("save", teamType, JSON.stringify(team), "→", r.ok ? "ok" : r.code);
  if (!r.ok) return res.status(r.status).json({ success: false, error: r.error, code: r.code });
  if (teamType === "showcase") u.showcaseTeam = r.team;
  else if (teamType === "battle") u.battleTeam = r.team;
  else u.displayedPokemon = r.team;
  res.json({ success: true, saved: true });
});
app.get("/api/pokemon/detail", (req, res) => { const { status, body } = pokemonDetail(u, req.query.species); res.status(status).json(body); });
app.post("/api/pokemon/moveset", express.json(), (req, res) => {
  const { team, pokeId, variant, moves, uid = null, form = null } = req.body ?? {};
  const r = saveMoveset(u, { team, pokeId, variant, moves, uid, form });
  console.log("moveset", team, pokeId, form, JSON.stringify(moves), "→", r.ok ? JSON.stringify(r.moves) : r.code);
  return r.ok ? res.json({ success: true, saved: true, team: r.team, moves: r.moves }) : res.status(r.status).json({ success: false, error: r.error });
});
app.post("/api/team-check", express.json(), (req, res) => {
  const r = teamCheck(u, req.body ?? {});
  return r.ok ? res.json(r.check) : res.status(r.status).json({ error: r.error });
});
app.listen(port, "127.0.0.1", () => console.log(`fusion preview: http://localhost:${port}/public/teams?id=${ID}`));
