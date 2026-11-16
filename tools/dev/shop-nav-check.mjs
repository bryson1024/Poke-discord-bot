// ==========================================================
// tools/dev/shop-nav-check.mjs — drives headless Chrome over the DevTools
// protocol against tools/dev/shop-nav-preview.mjs: real clicks and Enter on
// the Shop section bar at 375, 320 and 1280 px; prints landing times,
// active chip, hash, focus and page overflow; saves screenshots.
//
//   node tools/dev/shop-nav-preview.mjs 5193      (in another terminal)
//   node tools/dev/shop-nav-check.mjs <outDir> [chromePath]
// ==========================================================
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const OUT = process.argv[2];
const CHROME = process.argv[3] ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL0 = "http://localhost:5193/public/dashboardshop?id=100000000000000077";
const prof = fs.mkdtempSync(path.join(os.tmpdir(), "shop-nav-check-"));
const proc = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9333", `--user-data-dir=${prof}`, "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) { try { targets = await (await fetch("http://127.0.0.1:9333/json")).json(); break; } catch { await sleep(200); } }
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result?.result?.value; };
const shot = async (name) => { const r = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(r.result.data, "base64")); };
const errors = [];
await send("Runtime.enable");
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text); });
const state = `(() => { const a = document.querySelector('.shop-jump-chip[aria-current]'); const navB = document.getElementById('shopJump').getBoundingClientRect().bottom; const h = (id) => Math.round(document.getElementById(id)?.getBoundingClientRect().top); return { active: a?.dataset.target, hash: location.hash, navBottom: Math.round(navB), weeklyHead: h('weeklyHeading'), tmHead: h('tmHeading'), ballsHead: h('ballsHeading'), focus: document.activeElement?.id, docW: document.documentElement.scrollWidth, vw: innerWidth }; })()`;
const click = async (target) => {
  // like a swipe on the chip row: bring the chip clear of the pinned Weekly chip
  await ev(`(() => { const l = document.getElementById('shopJumpList'); const a = document.querySelector('.shop-jump-chip[data-target=${target}]'); if (a.parentElement.classList.contains('is-pinned')) return; const pw = l.querySelector('li.is-pinned')?.offsetWidth ?? 0; const left = a.getBoundingClientRect().left - l.getBoundingClientRect().left; if (left < pw) l.scrollLeft += left - pw - 8; })()`);
  await sleep(100);
  const r = await ev(`(() => { const b =document.querySelector('.shop-jump-chip[data-target=${target}]').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`);
  for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: r[0], y: r[1], button: "left", clickCount: 1 });
};
const landTime = async (headId, max = 4000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < max) {
    const ok = await ev(`(() => { const t = document.getElementById('${headId}').getBoundingClientRect().top; const n = document.getElementById('shopJump').getBoundingClientRect().bottom; return Math.abs(t - n - 12) < 2; })()`);
    if (ok) return Date.now() - t0;
    await sleep(30);
  }
  return null;
};
const report = {};

async function run(label, w, h, scale, mobile) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: scale, mobile });
  await send("Page.navigate", { url: URL0 });
  await sleep(3500);
  const r = report[label] = {};
  r.initial = await ev(state);
  await shot(`${label}-1-top`);
  await click("weekly");
  r.weeklyLandMs = await landTime("weeklyHeading");
  await sleep(400);
  r.afterWeekly = await ev(state);
  await shot(`${label}-2-weekly`);
  await click("tms");
  r.tmsLandMs = await landTime("tmHeading");
  await sleep(400);
  r.afterTms = await ev(state);
  // scroll inside the TM list by wheel, spy should stay on TMs
  await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: w / 2, y: h / 2, deltaX: 0, deltaY: 3000 });
  await sleep(800);
  r.afterWheelInTms = await ev(state);
  await shot(`${label}-3-in-tms`);
  await click("balls");
  r.ballsLandMs = await landTime("ballsHeading");
  await sleep(400);
  r.backToBalls = await ev(state);
  // keyboard: focus chip, Enter
  await ev(`document.querySelector('.shop-jump-chip[data-target=weekly]').focus()`);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  r.keyboardWeeklyLandMs = await landTime("weeklyHeading");
  r.afterKeyboard = await ev(state);
  // reload on the deep link: should land on Weekly even though TMs mount above it
  await send("Page.reload");
  await sleep(4000);
  r.reloadOnHash = await ev(state);
}

await run("mobile", 375, 812, 2, true);
await run("narrow320", 320, 640, 2, true);
await run("desktop", 1280, 800, 1, false);
report.errors = errors;
console.log(JSON.stringify(report, null, 1));
ws.close();
proc.kill();
