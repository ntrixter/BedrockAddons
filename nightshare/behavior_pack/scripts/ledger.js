import { world } from "@minecraft/server";
import * as cfg from "./config.js";
import * as settings from "./settings.js";

/**
 * @typedef {object} State
 * @property {number}   night        world.getDay() this snapshot belongs to, or -1 for none
 * @property {string[]} roster       player IDs captured at nightfall - N is roster.length
 * @property {string[]} spent        IDs that have already spent their share
 * @property {number}   pendingTicks world time still queued for the burner
 * @property {number}   burnRate     ticks of world time to spend per real tick
 */

/** @type {State} */
const EMPTY = { night: -1, roster: [], spent: [], pendingTicks: 0, burnRate: 0 };

/**
 * In-memory source of truth. Parsing JSON every tick would be wasteful, so we
 * read the dynamic property once at boot, mutate freely, and write back only
 * when something actually changed.
 * @type {State}
 */
let state = { ...EMPTY };
let dirty = false;

/** Read persisted state. Tolerates a truncated or hand-edited blob. */
export function init() {
  const raw = world.getDynamicProperty(cfg.STATE_KEY);
  if (typeof raw !== "string") {
    state = { ...EMPTY };
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    state = {
      night: typeof parsed.night === "number" ? parsed.night : -1,
      roster: Array.isArray(parsed.roster) ? parsed.roster : [],
      spent: Array.isArray(parsed.spent) ? parsed.spent : [],
      pendingTicks: typeof parsed.pendingTicks === "number" ? parsed.pendingTicks : 0,
      burnRate: typeof parsed.burnRate === "number" ? parsed.burnRate : 0,
    };
  } catch {
    state = { ...EMPTY };
  }
}

/** @returns {State} */
export function get() {
  return state;
}

export function markDirty() {
  dirty = true;
}

/** Persist if anything changed since the last flush. */
export function flush() {
  if (!dirty) return;
  world.setDynamicProperty(cfg.STATE_KEY, JSON.stringify(state));
  dirty = false;
}

export function reset() {
  state = { ...EMPTY };
  world.setDynamicProperty(cfg.STATE_KEY, undefined);
  dirty = false;
}

/**
 * True while the clock sits inside the night budget. NIGHT_END is 24000, so
 * everything from NIGHT_START up to the wrap counts.
 */
export function isNight() {
  return world.getTimeOfDay() >= cfg.NIGHT_START;
}

/** Players who own a share, i.e. those in a dimension where beds work. */
export function eligiblePlayers() {
  return world.getAllPlayers().filter((p) => cfg.COUNT_DIMENSIONS.includes(p.dimension.id));
}

/**
 * Snapshot the roster at nightfall, and tear it down at dawn.
 *
 * The night's identity is world.getDay() rather than an in-memory "was it night
 * last tick" flag, so this stays correct across a script reload or a rejoin
 * halfway through the night.
 */
export function syncNight() {
  const day = world.getDay();

  if (!isNight()) {
    if (state.night !== -1) {
      state = { ...EMPTY };
      dirty = true;
    }
    return;
  }

  if (state.night === day) return;

  const roster = eligiblePlayers().map((p) => p.id);

  // Everyone was in the Nether or End when night fell. Committing an empty
  // roster would fix N at 0 and make the night unskippable, so leave the
  // snapshot uncommitted and retry on the next scan.
  if (roster.length === 0) return;

  state = { night: day, roster, spent: [], pendingTicks: 0 };
  dirty = true;
}

/**
 * True when someone on tonight's roster is not in the Overworld right now -
 * off in the Nether or End, or logged out.
 *
 * This is exactly the state in which vanilla's own skip can fire while shares
 * remain unspent, because its denominator is the players present now while ours
 * was fixed at nightfall.
 */
export function rosterMemberAway() {
  if (state.roster.length === 0) return false;
  const here = new Set(eligiblePlayers().map((p) => p.id));
  return state.roster.some((id) => !here.has(id));
}

/** Ticks of night one share is worth right now. */
export function shareTicks() {
  if (state.roster.length === 0) return 0;
  return cfg.SPAN / state.roster.length;
}

/**
 * Bank a player's share and queue the time for the burner.
 * @param {string} playerId
 * @returns {{spent: number, total: number, pct: number}}
 */
export function spendShare(playerId) {
  const total = state.roster.length;
  state.spent.push(playerId);
  state.pendingTicks += shareTicks();

  // Re-paced on every top-up rather than accumulated, so two people turning in
  // at once still finish in one BURN_DURATION_TICKS sweep instead of queueing
  // up behind each other.
  state.burnRate = Math.max(cfg.MIN_BURN_RATE, Math.ceil(state.pendingTicks / settings.burnDurationTicks()));
  dirty = true;
  return { spent: state.spent.length, total, pct: Math.round((100 / total) * 10) / 10 };
}
