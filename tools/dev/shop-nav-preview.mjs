// ==========================================================
// tools/dev/shop-nav-preview.mjs — a LOCAL preview of the Shop page with
// every optional section on (TMs, Held items), for checking the section
// bar. One synthetic player in memory; uses the real TM shop and held-item
// handlers. The Weekly Pack claim is faked (fixed rewards, flips to
// Claimed). Nothing is saved; no Discord, no player data. Never deploy this.
//
//   node tools/dev/shop-nav-preview.mjs [port=5193]
//   PREVIEW_WEEKLY_CLAIMED=1 starts with the pack already claimed.
// ==========================================================

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { tmShopView, buyTms, tmLearners } from "../../services/tmShop.js";
import { runInventoryTransaction } from "../../services/inventory.js";
import { createHeldItemHandlers, createRateLimiter } from "../../services/heldItemsApi.js";
import { createNewUser } from "../../utils/userSchema.js";
import { lockUser } from "../../utils/userLocks.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = Number(process.argv[2] ?? 5193);
const ID = "100000000000000077";
const env = { TM_ENABLED: "1", HELD_ITEMS_ENABLED: "1" };

const u = createNewUser(ID, "Preview Trainer");
u.cc = 26000;
u.items = { ...(u.items ?? {}), evolution_stone: 2, tm_thunderbolt: 1 };
for (const s of [6, 25, 133, 26, 130, 135, 145, 149, 9, 59, 448, 373, 181, 143, 94]) u.pokemon[s] = { normal: 1, shiny: s === 25 ? 1 : 0 };
u.displayedPokemon = [6, 26, 130].map((id) => ({ id, variant: "normal" }));
u.battleTeam = [145, 135, 25, 6, 149, 9].map((id) => ({ id, variant: "normal" }));
u.weeklyPackClaimed = process.env.PREVIEW_WEEKLY_CLAIMED === "1";
const td = { [ID]: u };
const held = createHeldItemHandlers({ getTrainerData: () => td, lockUser, save: async () => ({ saved: true, note: "" }), getEnv: () => env, allowWrite: createRateLimiter({ max: 1000 }) });
const ok = () => true;

const app = express();
app.use("/public", express.static(path.join(ROOT, "public"), { etag: false, maxAge: 0 }));
app.get("/public/dashboardshop", (_, res) => res.sendFile(path.join(ROOT, "public", "dashboardshop", "index.html")));
app.get("/api/user", (_, res) => res.json(u));
app.get("/api/mega/shop", (_, res) => res.json({ success: true, enabled: false }));
app.get("/api/live-events", (_, res) => res.json({ success: true, events: [] }));
app.get("/api/tm-shop", (_, res) => res.json(tmShopView(u, { env })));
app.get("/api/tm-shop/learners", (req, res) => {
  const r = tmLearners(u, String(req.query.item ?? ""), { env });
  if (!r.ok) { const { ok: _ok, status = 400, ...rest } = r; return res.status(status).json(rest); }
  const { ok: _ok, ...body } = r;
  return res.json(body);
});
app.post("/api/shop/buy-tm", express.json(), async (req, res) => {
  const { item, qty = 1, requestId = null } = req.body || {};
  const tx = await runInventoryTransaction({
    trainerData: td, userId: ID, lock: (_id, fn) => fn(), save: async () => ({ saved: true, note: "" }),
    requestId, payloadKey: `buy-tm:${item}:${Number(qty)}`,
    mutate: (x) => buyTms(x, { item, qty: Number(qty) }, { env }),
  });
  if (!tx.ok) { const { ok: _ok, status = 400, ...rest } = tx; return res.status(status).json({ success: false, ...rest }); }
  const { ok: _ok, ...result } = tx.result;
  return res.json({ saved: true, success: true, ...result });
});
app.post("/api/weekly-pack", express.json(), (_, res) => {
  if (u.weeklyPackClaimed) return res.json({ success: false, error: "Already claimed this week." });
  u.weeklyPackClaimed = true;
  res.json({ success: true, rewards: [{ name: "Pidgey", rarity: "common", sprite: "/public/sprites/pokemon/normal/16.gif" }] });
});
app.get("/api/held-items", (req, res) => { const { status, body } = held.view({ query: req.query, isAuthorized: ok }); res.status(status).json(body); });
for (const [route, fn] of [["claim-starter", held.claimStarter], ["buy", held.buy]]) {
  app.post(`/api/held-items/${route}`, express.json({ limit: "4kb" }), async (req, res) => { const { status, body } = await fn({ body: req.body ?? {}, isAuthorized: ok }); res.status(status).json(body); });
}
app.listen(port, "127.0.0.1", () => console.log(`shop-nav preview: http://localhost:${port}/public/dashboardshop?id=${ID}`));
