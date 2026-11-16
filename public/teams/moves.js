// ==========================================================
// public/teams/moves.js — the Teams page's moveset editor (owner decision:
// each team keeps its own moveset for the same Pokémon copy, with a copy
// from the other team). Up to 4 distinct moves the copy has learned by its
// real Level, plus the TM moves of the slot's copy when it is a trained copy
// (`s.uid`, TM system). Save sends them through POST /api/pokemon/moveset.
// "Use recommended moves" (full sim) fills in the picks for the Team's
// Battle plan (services/battlePlans.js recommendMoves), whose rows carry a
// Recommended badge; "Use automatic moves" shows the moves it fights with
// when none are picked, and saving that clears the pick. Every fill waits
// for Save. The picks logic is public/teams/movePicks.js. The server
// re-checks every rule.
// Ability (full sim, owner decision 2026-11-16): Automatic (the Battle
// plan's pick, made before each fight) or one of the species' regular
// abilities, per team like the moves. Save sends it through
// POST /api/pokemon/ability, only when it changed.
// ==========================================================

import { toast, showActionError, showExpired } from "/public/shared/shell.js";
import { openTeachDialog } from "/public/shared/teachTm.js";
import { moveMeta, moveDescLine } from "/public/shared/moveMeta.js";
import { MAX, AUTOMATIC, startPicks, shownMoves, tickedMoves, lostMoves, toggleMove, pickFrom, savedMoves, canSave, moveRow } from "/public/teams/movePicks.js";

const LABEL = { display: "Casual team", battle: "Ranked team" };
const OTHER = { display: "battle", battle: "display" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let dialog = null;
let lastFocus = null;
let saving = false; // a save is in flight: keep the dialog open and its controls disabled

function ensureDialog() {
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.className = "tm-moves";
  dialog.setAttribute("aria-labelledby", "movesTitle");
  dialog.addEventListener("click", (e) => { if (e.target === dialog && !saving) dialog.close(); });
  dialog.addEventListener("cancel", (e) => { if (saving) e.preventDefault(); }); // Esc while saving
  dialog.addEventListener("close", () => lastFocus?.focus?.({ preventScroll: true }));
  document.body.append(dialog);
  return dialog;
}

async function postAbility(userId, team, s, ability) {
  const res = await fetch("/api/pokemon/ability", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: userId, team, pokeId: s.id, variant: s.variant, ability, ...(s.uid ? { uid: s.uid } : {}) }),
  });
  let body = {};
  try { body = await res.json(); } catch { /* non-JSON */ }
  if (res.status === 403) { showExpired(); throw Object.assign(new Error("expired"), { silent: true }); }
  if (!res.ok || !body.success) throw new Error(body.error || `Couldn't save the ability (${res.status}).`);
  return body;
}

// The Ability block: Automatic + each regular ability, or the one it has.
// formAbility: a fusion form's fixed ability while the slot uses that form.
function abilityBlock(view, team, pick, formAbility = null) {
  if (formAbility) return `<div class="tm-ability"><p class="tm-ability-head">Ability</p><p class="tm-ability-only"><b>${esc(formAbility.name)}</b> <span class="tm-sub">${esc(formAbility.desc)} ${esc(formAbility.formName)} always has this ability.</span></p></div>`;
  if (!view?.options?.length) return "";
  const t = view.teams[team];
  if (view.options.length < 2) {
    const o = view.options[0];
    return `<div class="tm-ability"><p class="tm-ability-head">Ability</p><p class="tm-ability-only"><b>${esc(o.name)}</b> <span class="tm-sub">${esc(o.desc)} It has only this ability.</span></p></div>`;
  }
  const row = (value, title, desc, on) => `<label class="tm-ab${on ? " is-on" : ""}"><input type="radio" name="ability" value="${esc(value)}"${on ? " checked" : ""}>
    <span><b>${title}</b>${desc ? `<small>${desc}</small>` : ""}</span></label>`;
  return `<fieldset class="tm-ability"><legend class="tm-ability-head">Ability</legend>
    ${row("", "Automatic", `Picked for this team's Battle plan before each fight. Right now: <b>${esc(t.automatic ?? "—")}</b>.`, pick == null)}
    ${view.options.map((o) => row(o.name, esc(o.name), esc(o.desc), pick === o.name)).join("")}
  </fieldset>`;
}

async function postMoveset(userId, team, s, moves) {
  const res = await fetch("/api/pokemon/moveset", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: userId, team, pokeId: s.id, variant: s.variant, moves, ...(s.uid ? { uid: s.uid } : {}), ...(s.form ? { form: s.form } : {}) }),
  });
  let body = {};
  try { body = await res.json(); } catch { /* non-JSON */ }
  if (res.status === 403) { showExpired(); throw Object.assign(new Error("expired"), { silent: true }); }
  if (!res.ok || !body.success) throw new Error(body.error || `Couldn't save the moves (${res.status}).`);
  return body;
}

/**
 * Open the editor for copy `s` ({ id, variant, name }) on team `team`.
 * onSaved(): called after a successful save (the page re-renders).
 */
export async function openMovesEditor({ userId, team, s, name, recommended = null, onSaved, onTaught }) {
  lastFocus = document.activeElement;
  saving = false;
  ensureDialog();
  dialog.innerHTML = `<p class="tm-sub" style="padding:24px">Loading moves…</p>`;
  if (!dialog.open) dialog.showModal();
  let d;
  try {
    const res = await fetch(`/api/pokemon/detail?${new URLSearchParams({ id: userId, species: s.id })}`, { credentials: "same-origin" });
    if (res.status === 403) { dialog.close(); return showExpired(); }
    d = await res.json();
    if (!res.ok) throw new Error(d.error || "Couldn't load the moves.");
  } catch (err) {
    dialog.innerHTML = `<div class="tm-moves-head"><h2 id="movesTitle">Couldn't load the moves</h2><button type="button" class="tm-ib" data-close aria-label="Close">✕</button></div><p class="tm-sub" style="padding:0 16px 16px">${esc(err.message)}</p>`;
    dialog.querySelector("[data-close]").onclick = () => dialog.close();
    return;
  }
  const line = d.copies?.[s.variant];
  if (!line) { dialog.close(); return toast("You don't own that copy any more."); }
  // Every copy is its own Pokémon (docs/adr/0001): the slot's copy has its
  // own Level, learnable moves and moveset per team. A trained copy also
  // lists its TM moves in the note below.
  const own = s.uid ? line.each?.find((c) => c.uid === s.uid) : null;
  if (s.uid && !own) { dialog.close(); return toast("That Pokémon changed. Reload the page."); }
  const trained = s.uid ? line.trained?.find((t) => t.uid === s.uid) ?? null : null;
  const copy = own ? { ...line, level: own.level, moves: own.moves, nextMoves: own.nextMoves, learnable: own.learnable, formLearnable: own.formLearnable, movesets: own.movesets, ability: own.ability ?? line.ability } : { ...line };
  copy.learnable ??= [];
  // Fusion forms: while this slot uses a fusion form (s.form, saved or
  // not), its own moves can be picked too (the server checks the form).
  const formExtra = (s.form && copy.formLearnable?.[s.form]) || [];
  if (formExtra.length) copy.learnable = [...copy.learnable, ...formExtra.filter((m) => !copy.learnable.some((x) => x.id === m.id))];
  copy.moves ??= [];
  const other = copy.movesets?.[OTHER[team]];
  // This team's moveset, else the automatic moves it battles with now. Full
  // sim: moves from before the switch that its learnset no longer teaches
  // still fight until a new pick is saved, so they show but can't be ticked.
  let picks = startPicks(copy, team);
  const startMoves = JSON.stringify(savedMoves(picks));
  // Ability: null = Automatic. Only full-sim servers send copy.ability.
  // A fusion form's ability is fixed (Teravolt, Turboblaze, Prism Armor): no choice to make.
  const formAbility = s.form ? line.formAbility?.[s.form] ?? null : null;
  const abilityView = formAbility ? null : copy.ability ?? null;
  const abilityStart = abilityView?.teams?.[team]?.chosen ?? null;
  let abilityPick = abilityStart;
  const canChooseAbility = (abilityView?.options?.length ?? 0) > 1;
  // Only moves it can pick now (the plan view may predate a TM teach).
  const rec = pickFrom(copy, recommended?.moves ?? []).picked;

  // Same-type attack bonus: a damaging move of one of the Pokémon's own types hits ×1.5.
  const ownTypes = new Set((d.types ?? []).map((t) => String(t).toLowerCase()));
  const isStab = (m) => m.category !== "Status" && Number(m.power) > 0 && ownTypes.has(String(m.type ?? "").toLowerCase());
  const draw = () => {
    const ticked = tickedMoves(picks, copy);
    const full = ticked.length >= MAX;
    const lost = lostMoves(picks, copy, team);
    dialog.innerHTML = `
      <div class="tm-moves-head">
        <div><p class="cc-eyebrow">${esc(LABEL[team])} · Lv ${copy.level}</p><h2 id="movesTitle">${esc(name)}'s moves${abilityView ? " &amp; ability" : ""}</h2>
          <p class="tm-sub">Pick up to 4 moves it has learned. ${team === "battle" ? "Ranked battles are at Lv 50, but it only knows moves learned by its real Level." : "Used in casual (open) battles."}</p></div>
        <button type="button" class="tm-ib" data-close aria-label="Close">✕</button>
      </div>
      <div class="tm-moves-picked" aria-live="polite"><b>${picks.auto ? "Automatic" : `${picks.picked.length}/${MAX}`}</b> ${shownMoves(picks, copy).map((m) => `<span class="tm-movechip">${esc(m.name ?? m.id)}</span>`).join("") || "<span class=\"tm-sub\">No moves picked</span>"}</div>
      ${lost.length ? `<p class="tm-sub tm-moves-kept">${esc(lost.map((m) => m.name ?? m.id).join(", "))} can't be picked again.${picks.auto ? "" : ` ${lost.length === 1 ? "It stays" : "They stay"} until you save new moves.`}</p>` : ""}
      <div class="tm-moves-tools">
        ${d.tm?.enabled ? `<button type="button" class="cc-btn" data-teach>Teach a TM</button>` : ""}
        ${other ? `<button type="button" class="cc-btn" data-copy>Copy from ${esc(LABEL[OTHER[team]])}</button>` : ""}
        ${rec.length ? `<button type="button" class="cc-btn" data-recommended>Use recommended moves</button>` : ""}
        ${picks.auto ? "" : `<button type="button" class="cc-btn" data-auto>Use automatic moves</button>`}
      </div>
      <ul class="tm-movelist" aria-label="Learned moves">
        ${copy.learnable.map((m) => moveRow(m, {
          on: ticked.includes(m.id), full, recommended: rec.includes(m.id),
          meta: moveMeta(m, { extra: [m.source === "tm" ? "TM" : m.source === "form" ? (m.learnedAt > 1 ? `${m.formName} · Lv ${m.learnedAt}` : m.formName) : m.learnedAt ? `Lv ${m.learnedAt}` : "", isStab(m) ? "STAB ×1.5" : ""] }),
          details: moveDescLine(m),
        })).join("")}
      </ul>
      ${abilityBlock(abilityView, team, abilityPick, formAbility)}
      <p class="tm-sub tm-moves-note">${copy.nextMoves?.length ? `Learns next: ${copy.nextMoves.map((m) => esc(m.name)).join(", ")}. ` : ""}${trained ? `★ Trained copy: ${trained.tmMoves.map((m) => esc(m.name)).join(", ")} learned from TMs.` : ""}</p>
      <div class="tm-moves-actions"><button type="button" class="cc-btn" data-close>Cancel</button><button type="button" class="cc-btn cc-btn--primary" data-save${canSave(picks) ? "" : " disabled"}>${canChooseAbility ? "Save" : "Save moves"}</button></div>`;
  };
  draw();
  dialog.querySelector("[data-close]")?.focus();

  dialog.onchange = (e) => {
    const radio = e.target.closest('input[name="ability"]');
    if (radio && !saving) {
      abilityPick = radio.value || null;
      draw();
      dialog.querySelector(`input[name="ability"][value="${CSS.escape(radio.value)}"]`)?.focus();
      return;
    }
    const box = e.target.closest('input[type="checkbox"]');
    if (!box || saving) return;
    picks = toggleMove(picks, copy, box.value, box.checked);
    draw();
    dialog.querySelector(`input[value="${CSS.escape(box.value)}"]`)?.focus();
  };
  dialog.onclick = async (e) => {
    if (saving) return; // controls are disabled; ignore stray clicks until the server answers
    if (e.target === dialog || e.target.closest("[data-close]")) return dialog.close();
    if (e.target.closest("[data-teach]")) {
      dialog.close();
      // This slot's copy: its trained copy, or an untrained one (uid null).
      return openTeachDialog({ userId, speciesId: s.id, variant: s.variant, name, uid: s.uid ?? null, onDone: () => onTaught?.() });
    }
    if (e.target.closest("[data-copy]")) {
      picks = pickFrom(copy, other.map((m) => m.id));
      draw();
      toast("Save to keep them.");
      return;
    }
    if (e.target.closest("[data-recommended]")) {
      picks = pickFrom(copy, rec);
      draw();
      toast(`Picked for ${recommended.planName}. Save to keep them.`);
      return;
    }
    if (e.target.closest("[data-auto]")) {
      picks = AUTOMATIC;
      draw();
      toast("Save to keep them.");
      return;
    }
    if (e.target.closest("[data-save]")) {
      const clearing = picks.auto;
      const movesChanged = JSON.stringify(savedMoves(picks)) !== startMoves;
      const abilityChanged = canChooseAbility && abilityPick !== abilityStart;
      setBusy(true);
      try {
        // Moves as before (also when nothing changed); the ability only when it changed.
        const bodies = [];
        if (movesChanged || !abilityChanged) bodies.push(await postMoveset(userId, team, s, savedMoves(picks)));
        if (abilityChanged) bodies.push(await postAbility(userId, team, s, abilityPick));
        saving = false;
        dialog.close();
        // Success only after the server confirmed; "saved with a delay" when
        // the change is kept in memory but not on disk yet.
        const delayed = bodies.find((b) => b.saved === false);
        const abilityText = abilityPick ? `${name} uses ${abilityPick} on your ${LABEL[team]}.` : `${name}'s ability is automatic on your ${LABEL[team]}.`;
        if (delayed) toast(delayed.saveNotice || "Saved with a delay. Your change is kept and will be written shortly.");
        else if (abilityChanged && !movesChanged) toast(abilityText, { tone: "success" });
        else if (abilityChanged) toast(`${name}'s moves and ability saved for your ${LABEL[team]}.`, { tone: "success" });
        else toast(clearing ? `${name} uses its automatic moves on your ${LABEL[team]}.` : `${name}'s moves saved for your ${LABEL[team]}.`, { tone: "success" });
        onSaved?.();
      } catch (err) {
        setBusy(false);
        if (!err.silent) showActionError(err, "Couldn't save");
      }
    }
  };

  // While saving: every control is disabled, Save says "Saving…", and the
  // dialog can't be dismissed (the result is still coming).
  function setBusy(on) {
    saving = on;
    dialog.setAttribute("aria-busy", on ? "true" : "false");
    if (!on) { draw(); return; }
    for (const el of dialog.querySelectorAll("button, input")) el.disabled = true;
    const pressed = dialog.querySelector("[data-save]");
    if (pressed) pressed.textContent = "Saving…";
  }
}
