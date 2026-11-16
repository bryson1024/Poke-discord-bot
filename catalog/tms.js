// ==========================================================
// catalog/tms.js — Technical Machine catalog entries and prices (TM T3).
//
// One item per catalog move in data/battle/tm-data.json (generated, T2):
//   id "tm_<moveId>", category "tm", inventory stack, consumed only when a
//   TM is successfully taught (phase T4).
//   • launch moves   → status "active" (obtainable)
//   • fullsim moves  → status "active" with tm.fullSim; sold and taught only
//     while FULL_SIM_ENABLED is on (utils/battle/tmData.js tmMoveAvailable).
//     Prices: owner's "TM Price Draft", 2026-11-16 (status moves by how much
//     one use swings a 6v6 singles fight; 9 former holds re-tiered;
//     Explosion, Self-Destruct and Misty Explosion added by the owner).
//   • held moves     → status "defined" (grantItem refuses them; not sold)
//
// Prices (owner decision D-T6, 2026-11-11): by strategic tier, not rarity.
//   Basic 1,500 · Standard 3,000 · Power 5,000 · Premium 6,000 · Elite 7,500
// Elite = 120 power with 100% accuracy (Double-Edge, Flare Blitz, Brave
// Bird; Close Combat, Superpower and Outrage once their engine fixes land).
// The tier of every move is listed explicitly below (from the owner-approved
// TM audit catalog) so a data regeneration can never silently re-price one.
// ==========================================================

import fs from "fs";

const TM_DATA = JSON.parse(fs.readFileSync(new URL("../data/battle/tm-data.json", import.meta.url), "utf8"));
const BATTLE = JSON.parse(fs.readFileSync(new URL("../battleData.json", import.meta.url), "utf8"));
let FULL_SIM_MOVES = null;
const fullSimMoves = () => (FULL_SIM_MOVES ??= JSON.parse(fs.readFileSync(new URL("../data/battle/full-sim-data.json", import.meta.url), "utf8")).moves);

export const TM_PRICE_BY_TIER = Object.freeze({ basic: 1500, standard: 3000, power: 5000, premium: 6000, elite: 7500 });
const TIER_RARITY = Object.freeze({ basic: "common", standard: "uncommon", power: "rare", premium: "epic", elite: "legendary" });

const TIERS = {
  basic: "acidspray aerialace aircutter assurance avalanche breakingswipe brine brutalswing bugbite bulldoze charge chargebeam charm chillingwater confide confuseray cut disarmingvoice dragontail drainingkiss dreameater echoedvoice eerieimpulse electroweb endure faketears falseswipe featherdance firefang firespin flamecharge flipturn focusenergy grassyglide icefang icywind imprison incinerate infestation leechlife lowsweep magicalleaf metalclaw metalsound metronome mudshot mudslap nightshade payback pinmissile pluck poisontail pounce poweruppunch psybeam psychup revenge roar rocksmash rocktomb round safeguard sandtomb scaryface screech skillswap sleeptalk smackdown snarl snore spite storedpower strugglebug swift thief thunderfang torment trailblaze trick upperhand vacuumwave venoshock waterpulse whirlpool",
  standard: "acrobatics agility airslash alluringvoice amnesia auroraveil batonpass blazekick bodypress bodyslam bounce brickbreak bulletseed burningjealousy cosmicpower crosspoison crunch curse darkestlariat darkpulse dazzlinggleam dig dive dragonclaw drainpunch drillrun dualwingbeat electricterrain electroball encore endeavor energyball expandingforce facade firepledge firepunch flashcannon fly gigadrain grassknot grasspledge grassyterrain gyroball hardpress haze headbutt heatcrash heavyslam hex honeclaws icepunch icespinner iciclespear irondefense ironhead irontail knockoff lashout lightscreen liquidation lowkick lunge megapunch mistyexplosion mistyterrain mysticalfire painsplit phantomforce poisonjab powergem protect psychicfangs psychicnoise psychicterrain psychocut psyshock raindance razorshell reflect rest retaliate reversal rockblast rockpolish rockslide roost sandstorm scald scaleshot scorchingsands seedbomb shadowball shadowclaw skittersmack smartstrike snowscape spikes steelwing stompingtantrum strength substitute sunnyday superfang tailslap tailwind taunt temperflare terablast throatchop thunderpunch thunderwave toxicspikes triattack trickroom uproar uturn voltswitch waterfall waterpledge weatherball workup xscissor zenheadbutt",
  power: "blastburn blizzard dracometeor explosion fireblast focusblast focuspunch frenzyplant futuresight gigaimpact gunkshot hurricane hydrocannon hydropump hyperbeam leafstorm megahorn megakick meteorbeam overheat poltergeist powerwhip selfdestruct solarbeam solarblade steelbeam thunder",
  premium: "aurasphere bugbuzz bulkup calmmind dragondance dragonpulse earthpower earthquake flamethrower foulplay frostbreath heatwave highhorsepower hypervoice icebeam leafblade muddywater nastyplot petalblizzard playrough pollenpuff psychic sludgebomb sludgewave stealthrock stoneedge supercellslam surf swordsdance takedown thunderbolt toxic tripleaxel wildcharge willowisp",
  elite: "bravebird closecombat doubleedge flareblitz outrage superpower",
};
const TIER_OF = new Map(Object.entries(TIERS).flatMap(([tier, list]) => list.split(" ").map((id) => [id, tier])));

/** The price tier of a catalog move ("basic"…"elite"), or null. */
export const tmTierOf = (moveId) => TIER_OF.get(moveId) ?? null;

/**
 * Catalog item definitions for every TM (consumed by catalog/items.js).
 * Throws at load time if a catalog move has no tier, so nothing can be
 * sold without an approved price.
 */
export function tmItemDefinitions() {
  const out = [];
  for (const [moveId, m] of Object.entries(TM_DATA.moves)) {
    const tier = tmTierOf(moveId);
    if (!tier) throw new Error(`catalog/tms.js: no price tier for TM move "${moveId}"`);
    const fullSimOnly = m.status === "fullsim";
    // Full-sim TMs take their numbers from the full sim's data (Gen 9), the rest from battleData.json.
    const mv = fullSimOnly ? fullSimMoves()[moveId] : BATTLE.moves[moveId];
    const label = m.tm ? `${m.tm} ${mv.name}` : `TM ${mv.name}`;
    const what = mv.category === "Status" ? `${mv.type}, Status` : mv.power ? `${mv.type}, ${mv.category}, ${mv.power} power` : `${mv.type}, ${mv.category}`;
    out.push({
      id: `tm_${moveId}`,
      name: label,
      description: `Teaches ${mv.name} (${what}) to one compatible Pokémon. Used up when taught.`,
      category: "tm",
      rarity: TIER_RARITY[tier],
      consumable: true,
      // Full-sim TMs are catalog-active; the shop and teaching also check
      // tmMoveAvailable (FULL_SIM_ENABLED) before selling or teaching one.
      status: m.status === "hold" ? "defined" : "active",
      storage: "inventory",
      shop: { eligible: m.status !== "hold", channel: "dashboard", price: { cc: TM_PRICE_BY_TIER[tier] }, tier },
      sources: ["shop"],
      icon: `items/tm/${String(mv.type).toLowerCase()}.png`, // PokéAPI bag disc, one per type
      tm: Object.freeze({ move: moveId, number: m.tm, type: mv.type, category: mv.category, power: mv.power || null, accuracy: mv.accuracy, ...(fullSimOnly && { fullSim: true }), ...(m.holdReason && { holdReason: m.holdReason }) }),
      sinceRelease: "TM",
    });
  }
  return out;
}
