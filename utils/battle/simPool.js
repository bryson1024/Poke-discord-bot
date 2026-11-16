// ==========================================================
// utils/battle/simPool.js — full-sim fights on worker threads, so a fight
// (about 10 ms with Solid AI, 150 ms or more with an Expert side) never
// blocks the bot's main thread. Same shape as utils/render/renderPool.js,
// minus its queue timeouts: a fight's result is never optional.
//
// simulateLive(input) is what fight runners call: with the full sim off it
// returns today's synchronous result (nothing changes); with it on it
// returns a Promise from the worker. after(value, fn) continues either way,
// so runners stay synchronous with the switch off.
//
// SIM_THREADS (config/fullSim.js): worker count, default 1; 0 runs inline.
// A worker that crashes or exits fails its fight and is replaced while
// fights wait (with a growing delay when it can't even start).
// settleSimJobs() lets a graceful shutdown wait for fights in progress.
// ==========================================================

import { Worker } from "worker_threads";
import { isFullSimEnabled } from "../../config/fullSim.js";
import { simulateBattle, loadFullSim } from "./sim.js";

const WORKER_URL = new URL("./simWorker.js", import.meta.url);
export const DEFAULT_SIM_THREADS = 1;

export function simThreads(env = process.env) {
  const n = Number(env.SIM_THREADS ?? DEFAULT_SIM_THREADS);
  return Number.isInteger(n) && n >= 0 ? Math.min(n, 8) : DEFAULT_SIM_THREADS;
}

/** fn(value) now if value is plain, or once it resolves if it's a Promise. */
export const after = (value, fn) => (value && typeof value.then === "function" ? value.then(fn) : fn(value));

/** fn()'s value; if it throws or rejects, undo() runs first and the error still reaches the caller. */
export function undoOnFailure(fn, undo) {
  let value;
  try {
    value = fn();
  } catch (err) {
    undo();
    throw err;
  }
  return value && typeof value.then === "function" ? value.catch((err) => { undo(); throw err; }) : value;
}

const workers = [];
const idle = [];
const queue = [];
const jobs = new Map(); // id → { resolve, reject, worker }
const inFlight = new Set(); // every job's Promise until it settles (settleSimJobs)
let nextId = 1;
let workerUrl = WORKER_URL;
let closing = false;
let loadFailures = 0; // workers in a row that died before finishing a job
let respawnTimer = null;
let targetThreads = DEFAULT_SIM_THREADS; // SIM_THREADS as the last fight read it

// A worker that dies before its first result most likely can't load the
// engine at all (out of memory, a broken install), so it isn't replaced in
// a tight loop: a new one starts only while fights wait, after a growing
// delay, and after MAX_LOAD_FAILURES in a row the waiting fights fail.
export const MAX_LOAD_FAILURES = 5;
const respawnDelay = (n) => Math.min(30_000, 250 * 2 ** (n - 1));

/** The pool right now: live workers, fights waiting, fights running. */
export const simPoolStats = () => ({ workers: workers.length, queued: queue.length, running: jobs.size });

/** Tests only: the script each new worker runs. */
export function useWorkerScript(url) { workerUrl = url ?? WORKER_URL; }

function spawn() {
  const worker = new Worker(workerUrl);
  worker.unref(); // an idle pool never keeps the process alive
  let finishedOne = false;
  worker.on("message", ({ id, result, error }) => {
    finishedOne = true;
    loadFailures = 0;
    const job = jobs.get(id);
    jobs.delete(id);
    if (error) job?.reject(new Error(error)); else job?.resolve(result);
    idle.push(worker);
    pump();
  });
  // 'error' (an uncaught throw, out of memory) is followed by 'exit'; an
  // exit without an error (process.exit, a terminate) still ends its fight.
  worker.on("error", (err) => retire(worker, err, finishedOne));
  worker.on("exit", (code) => retire(worker, new Error(`sim worker exited (code ${code})`), finishedOne));
  workers.push(worker);
  idle.push(worker);
}

// Fails the worker's fight and drops it from the pool, once. A replacement
// starts only when fights are waiting (simulateAsync starts one otherwise).
function retire(worker, err, finishedOne) {
  for (const [id, job] of jobs) if (job.worker === worker) { jobs.delete(id); job.reject(err); }
  const w = workers.indexOf(worker);
  if (w < 0) return; // already retired ('exit' after 'error'), or closed
  workers.splice(w, 1);
  const i = idle.indexOf(worker);
  if (i >= 0) idle.splice(i, 1);
  if (!finishedOne) loadFailures++;
  if (loadFailures >= MAX_LOAD_FAILURES) {
    console.warn(`⚠️ sim worker failed to start ${loadFailures} times in a row: ${err?.message || err}`);
    for (const job of queue.splice(0)) job.reject(err);
    loadFailures = 0;
    return;
  }
  scheduleRespawn();
}

// Fights are waiting and the pool is short of workers: start one, after a
// delay when workers have been failing to start. (The timer keeps the
// process alive, as a fight in progress does: those fights are owed a result.)
function scheduleRespawn() {
  if (closing || respawnTimer || !queue.length || idle.length || workers.length >= targetThreads) return;
  respawnTimer = setTimeout(() => {
    respawnTimer = null;
    if (closing || !queue.length) return;
    if (!idle.length && workers.length < targetThreads) spawn();
    pump();
  }, loadFailures ? respawnDelay(loadFailures) : 0);
}

function pump() {
  while (idle.length && queue.length) {
    const worker = idle.shift();
    const { id, input, resolve, reject } = queue.shift();
    jobs.set(id, { resolve, reject, worker });
    worker.ref(); // a fight in progress keeps the process alive
    worker.once("message", () => worker.unref());
    worker.postMessage({ id, input });
  }
}

const track = (promise) => {
  inFlight.add(promise);
  const done = () => inFlight.delete(promise);
  promise.then(done, done);
  return promise;
};

/** One full-sim fight on a worker (inline when SIM_THREADS=0). */
export function simulateAsync(input, { env = process.env } = {}) {
  const threads = simThreads(env);
  if (threads === 0) return track(loadFullSim().then(() => simulateBattle(input)));
  closing = false;
  targetThreads = threads;
  while (workers.length < threads && !respawnTimer) spawn();
  return track(new Promise((resolve, reject) => {
    queue.push({ id: nextId++, input, resolve, reject });
    pump();
    scheduleRespawn();
  }));
}

/**
 * Waits (at most timeoutMs) for every fight already on the sim to settle,
 * so a graceful shutdown saves each one's result, not a fight half done.
 * The runners apply a result in the same tick its fight resolves, before
 * this returns. → true when nothing was left running.
 */
export async function settleSimJobs(timeoutMs = 5000) {
  if (!inFlight.size) return true;
  let timer;
  const timedOut = new Promise((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); });
  const settled = Promise.allSettled([...inFlight]).then(() => true);
  const done = await Promise.race([settled, timedOut]);
  clearTimeout(timer);
  // A resolved fight's runner continues on the next microtasks (its save is queued there).
  await new Promise((resolve) => setImmediate(resolve));
  return done && !inFlight.size;
}

/**
 * A fight as the runners need it: today's synchronous result with the full
 * sim off; with it on (or input.engine "full"), a Promise from the worker.
 */
export function simulateLive(input, { env = process.env } = {}) {
  const engine = input.engine ?? (isFullSimEnabled(env) ? "full" : "legacy");
  return engine === "full" ? simulateAsync({ ...input, engine }, { env }) : simulateBattle({ ...input, engine });
}

/** Stops every worker (tests, graceful shutdown). */
export async function closeSimPool() {
  closing = true;
  if (respawnTimer) { clearTimeout(respawnTimer); respawnTimer = null; }
  const all = workers.splice(0);
  idle.length = 0;
  loadFailures = 0;
  const err = new Error("The sim pool closed.");
  for (const job of queue.splice(0)) job.reject(err);
  await Promise.all(all.map((w) => w.terminate()));
  for (const [id, job] of jobs) { jobs.delete(id); job.reject(err); }
}
