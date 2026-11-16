// ==========================================================
// public/dashboardshop/sectionNav.js — the Shop's sticky section bar.
//
// One chip per visible section (section.shop-section[data-nav-label]).
// Sections that load later (TMs, Mega, Held items) add their chip when they
// appear. Weekly Pack is always listed first and says when it's ready.
//
// - Click: scrolls to the section, puts its heading in focus (keyboard and
//   screen-reader users land where they jumped) and writes #hash with
//   replaceState, so a reload or a shared link (?id=…#weekly) opens there
//   without adding Back-button steps.
// - Sections above can still grow after a jump (the TM list mounts above
//   Weekly Pack, images load), so the target stays pinned until the player
//   scrolls, touches or types, or a few seconds pass.
// - The chip of the section under the bar is marked aria-current.
// Only navigation: no prices, purchases or availability are touched here.
// ==========================================================

const nav = document.getElementById("shopJump");
const list = document.getElementById("shopJumpList");
const main = document.getElementById("ccMain");
const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");

const PIN_MS = 4000;
let signature = "";
let activeId = "";
let pin = null; // { id, until }
let lockSpyUntil = 0;

const hashOf = (s) => s.dataset.navHash || s.id;

function sections() {
  const shown = [...main.querySelectorAll("section.shop-section[data-nav-label]")].filter((s) => !s.hidden && s.id);
  return { shown, ordered: [...shown.filter((s) => s.hasAttribute("data-nav-first")), ...shown.filter((s) => !s.hasAttribute("data-nav-first"))] };
}

function byHash(hash) {
  if (!hash) return null;
  return sections().shown.find((s) => hashOf(s) === hash || s.id === hash) ?? null;
}

function weeklyReady() {
  const btn = document.querySelector("[data-item='weekly']");
  return !!btn && !btn.disabled && /claim/i.test(btn.textContent) && !/claimed/i.test(btn.textContent);
}

function build() {
  const { ordered } = sections();
  const ready = weeklyReady();
  const sig = ordered.map((s) => s.id).join("|") + `:${ready}`;
  if (sig === signature) return;
  signature = sig;
  nav.hidden = ordered.length < 2;
  list.innerHTML = ordered.map((s) => {
    const weekly = s.id === "weekly";
    const label = s.dataset.navLabel;
    const badge = weekly && ready ? `<span class="shop-jump-badge" aria-hidden="true">Ready</span>` : "";
    const sr = weekly && ready ? `<span class="sr-only"> (ready to claim)</span>` : "";
    return `<li${weekly ? ` class="is-pinned"` : ""}><a class="shop-jump-chip${weekly ? " is-weekly" : ""}" href="#${hashOf(s)}" data-target="${s.id}">${label}${badge}${sr}</a></li>`;
  }).join("");
  list.classList.toggle("is-overflowing", list.scrollWidth > list.clientWidth + 1);
  markActive(activeId, { force: true });
}

function markActive(id, { force = false } = {}) {
  if (id === activeId && !force) return;
  activeId = id;
  let current = null;
  for (const a of list.querySelectorAll(".shop-jump-chip")) {
    const on = a.dataset.target === id;
    if (on) { a.setAttribute("aria-current", "location"); current = a; } else a.removeAttribute("aria-current");
  }
  // Keep the active chip in view inside the bar (never scrolls the page).
  if (current && list.scrollWidth > list.clientWidth && !current.parentElement.classList.contains("is-pinned")) {
    const pinnedW = list.querySelector("li.is-pinned")?.offsetWidth ?? 0; // covers the row's left edge
    const l = current.getBoundingClientRect().left - list.getBoundingClientRect().left + list.scrollLeft;
    const r = l + current.offsetWidth;
    if (l < list.scrollLeft + pinnedW + 8) list.scrollTo({ left: Math.max(0, l - pinnedW - 16), behavior: "auto" });
    else if (r > list.scrollLeft + list.clientWidth - 8) list.scrollTo({ left: r - list.clientWidth + 24, behavior: "auto" });
  }
}

// The section whose top has passed under the bar; the last one at page end.
function spy() {
  if (Date.now() < lockSpyUntil) return;
  const { shown } = sections();
  if (!shown.length) return;
  const line = nav.getBoundingClientRect().bottom + 24;
  let cur = shown[0];
  for (const s of shown) if (s.getBoundingClientRect().top <= line) cur = s;
  const doc = document.documentElement;
  if (window.scrollY + window.innerHeight >= doc.scrollHeight - 4) cur = shown[shown.length - 1];
  markActive(cur.id);
}

// Long jumps (past the whole TM list is ~35,000 px on a phone) snap most of
// the way, then glide the last half screen: fast, but you still see the move.
function scrollToSection(section, smooth) {
  const animate = smooth && !reduceMotion?.matches;
  if (animate) {
    const delta = section.getBoundingClientRect().top;
    const lead = window.innerHeight * 0.5;
    if (Math.abs(delta) > window.innerHeight * 1.5) window.scrollBy({ top: delta - Math.sign(delta) * lead, behavior: "instant" });
  }
  section.scrollIntoView({ behavior: animate ? "smooth" : "auto", block: "start" });
}

function go(section, { smooth = true, focus = true, writeHash = true } = {}) {
  scrollToSection(section, smooth);
  markActive(section.id);
  // A long smooth scroll passes other sections; keep this chip lit until it
  // lands (scrollend), with a time cap for browsers without that event.
  lockSpyUntil = Date.now() + (smooth ? 3000 : 150);
  if (smooth) window.addEventListener("scrollend", () => { lockSpyUntil = 0; spy(); }, { once: true });
  pin = { id: section.id, until: Date.now() + PIN_MS };
  if (writeHash) {
    const url = new URL(window.location.href);
    url.hash = hashOf(section);
    history.replaceState(history.state, "", url);
  }
  if (focus) {
    const heading = section.querySelector("h2");
    if (heading) {
      if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
  }
}

// Re-apply a pinned jump when content above it changes size.
function holdPin() {
  if (!pin) return;
  if (Date.now() > pin.until) { pin = null; return; }
  const s = document.getElementById(pin.id);
  if (!s || s.hidden) return;
  const top = s.getBoundingClientRect().top;
  const want = nav.getBoundingClientRect().height + 12;
  if (Math.abs(top - want) > 4) {
    lockSpyUntil = Date.now() + 150;
    scrollToSection(s, false);
  }
}

// A deep link (#weekly, #tms, …) whose section may not exist yet.
let pendingHash = decodeURIComponent(window.location.hash.slice(1));
function tryPending() {
  if (!pendingHash) return;
  const s = byHash(pendingHash);
  if (!s) return;
  pendingHash = "";
  go(s, { smooth: false, focus: false, writeHash: false });
}

const releasePin = () => { pin = null; pendingHash = ""; lockSpyUntil = 0; };
for (const ev of ["wheel", "touchstart", "keydown", "mousedown"]) {
  window.addEventListener(ev, (e) => {
    // Clicks and keys inside the bar start a jump of their own.
    if (e.target instanceof Node && nav.contains(e.target)) return;
    releasePin();
  }, { passive: true });
}
// Pending deep links only wait for sections that load in the first seconds.
setTimeout(() => { pendingHash = ""; }, 8000);

list.addEventListener("click", (e) => {
  const a = e.target.closest("a.shop-jump-chip");
  if (!a) return;
  const s = document.getElementById(a.dataset.target);
  if (!s) return;
  e.preventDefault();
  pendingHash = "";
  go(s);
});

window.addEventListener("hashchange", () => {
  const s = byHash(decodeURIComponent(window.location.hash.slice(1)));
  if (s) go(s, { smooth: false, focus: false, writeHash: false });
});

let spyQueued = false;
window.addEventListener("scroll", () => {
  if (spyQueued) return;
  spyQueued = true;
  requestAnimationFrame(() => { spyQueued = false; spy(); });
}, { passive: true });

function refresh() {
  build();
  tryPending();
  holdPin();
  spy();
}

if (nav && list && main) {
  // Bar height → scroll-margin of every section (see style.css).
  // Overflow flag: the pinned Weekly chip only casts its edge shadow when the row scrolls.
  const setHeight = () => {
    document.documentElement.style.setProperty("--shop-jump-h", `${Math.ceil(nav.getBoundingClientRect().height)}px`);
    list.classList.toggle("is-overflowing", list.scrollWidth > list.clientWidth + 1);
  };
  new ResizeObserver(setHeight).observe(nav);
  new ResizeObserver(setHeight).observe(list);
  // Sections appearing/hiding, the TM list mounting, the weekly button flipping.
  new MutationObserver(refresh).observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "disabled"] });
  new ResizeObserver(() => { holdPin(); spy(); }).observe(main);
  refresh();
  setHeight();
}
