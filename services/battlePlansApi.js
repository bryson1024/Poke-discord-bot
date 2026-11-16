// ==========================================================
// services/battlePlansApi.js — the dashboard's Battle plan endpoints
// (Teams page). Wired in bot_final.js:
//   GET  /api/battle-plans?id=…   plans, and each fighting Team's plan,
//                                 readiness (who helps, by name), and each
//                                 member's recommended moves (the Moves
//                                 editor marks them and can fill them in),
//                                 and each member's Ability per plan
//   POST /api/battle-plan         { id, team: "display"|"battle", plan }
// Session-checked like every dashboard route. A plan is only ever set
// here, validated under the player's lock, never through the dashboard
// patch allowlist. With the full sim off, plans do nothing, so the page
// isn't offered them and can't set them.
// ==========================================================

import { isFullSimEnabled } from "../config/fullSim.js";
import { BATTLE_PLANS, PLAN_TEAMS, setPlan, teamPlanView, recommended } from "./battlePlans.js";
import { normalizeTeam } from "../utils/teamNormalize.js";
import { getMove } from "../utils/battle/data.js";
import { chosenAbility } from "./abilities.js";
import { pickAbility } from "../utils/battle/ai/abilities.js";

const planCard = ({ id, name, blurb, hint = [] }) => ({ id, name, blurb, hint });

export function createBattlePlanHandlers({ getTrainerData, isAuthorized, lockUser, saveAndAck, env = process.env }) {
  const userFor = (req, res, id) => {
    if (!id) { res.status(400).json({ error: "Missing id" }); return null; }
    if (!isAuthorized(req, id)) { res.status(403).json({ error: "Invalid or expired session" }); return null; }
    const user = getTrainerData()[id];
    if (!user) { res.status(404).json({ error: "User not found" }); return null; }
    return user;
  };
  const teamView = (user, team) => {
    const field = team === "battle" ? "battleTeam" : "displayedPokemon";
    const slots = normalizeTeam(user[field] ?? [], 6).map((slot) => ({
      speciesId: slot.id, variant: slot.variant, ...(slot.uid && { uid: slot.uid }),
      recommended: recommended(user, team, slot.id, slot.variant, { uid: slot.uid ?? null }),
      // Its Ability: the player's choice (null = Automatic) and what Automatic
      // picks under each plan, so the page can warn before a plan change
      // swaps abilities. A Mega slot keeps its Mega's own ability: none.
      ...(!slot.mega && { ability: abilityByPlan(user, team, slot) }),
    }));
    const view = teamPlanView(user, team);
    const nameOf = (id) => getMove(id)?.name ?? id;
    const helpers = view.readiness.helpers.map((h) => ({ name: h.name, moveNames: h.moves.map(nameOf), ability: h.ability }));
    return { ...view, readiness: { ...view.readiness, helpers, missingNames: view.readiness.missing.map(nameOf) }, slots };
  };

  const abilityByPlan = (user, team, slot) => ({
    chosen: chosenAbility(user, team, slot.id, slot.variant, { uid: slot.uid ?? null }),
    byPlan: Object.fromEntries(BATTLE_PLANS.map((p) => [p.id, pickAbility(slot.id, p.id) ?? null])),
  });

  return {
    async get(req, res) {
      const id = req.query?.id;
      const user = userFor(req, res, id);
      if (!user) return;
      if (!isFullSimEnabled(env)) return res.json({ enabled: false, plans: [] });
      return res.json({
        enabled: true,
        plans: BATTLE_PLANS.map(planCard),
        teams: Object.fromEntries(PLAN_TEAMS.map((team) => [team, teamView(user, team)])),
      });
    },

    async set(req, res) {
      const { id, team, plan } = req.body ?? {};
      if (!userFor(req, res, id)) return;
      if (!isFullSimEnabled(env)) return res.status(409).json({ success: false, error: "Battle plans aren't on yet." });
      return lockUser(id, async () => {
        const user = getTrainerData()[id];
        const result = setPlan(user, team, plan);
        if (!result.ok) return res.status(400).json({ success: false, error: result.error });
        const ack = await saveAndAck(getTrainerData());
        return res.json({ success: true, saved: ack?.saved ?? true, view: teamView(user, team) });
      });
    },
  };
}
