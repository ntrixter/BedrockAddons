import { world } from "@minecraft/server";
import * as cfg from "./config.js";

/** Reading a gamerule can throw; a missing answer should not block the skip. */
function daylightCycleRunning() {
  try {
    return world.gameRules.doDayLightCycle;
  } catch {
    return true;
  }
}

/**
 * Drains queued night time smoothly.
 *
 * There is one shared queue rather than one timer per sleeper, so simultaneous
 * sleepers merge into a single continuous fast-forward instead of fighting each
 * other over setTimeOfDay.
 *
 * @param {import("./ledger.js").State} state mutated in place
 * @returns {boolean} true if any time was consumed this tick
 */
export function burn(state) {
  if (state.pendingTicks <= 0) return false;

  const now = world.getTimeOfDay();

  // Dawn arrived before the queue drained - either the clock wrapped between
  // scans or someone set the time by hand. Drop the remainder rather than
  // shoving the morning forward.
  if (now < cfg.NIGHT_START) {
    state.pendingTicks = 0;
    state.burnRate = 0;
    return true;
  }

  const step = Math.min(state.pendingTicks, state.burnRate || cfg.MIN_BURN_RATE);
  let next = now + step;

  // Stop one tick short of 24000 and let the game's own cycle roll it over.
  // Calling setTimeOfDay(0) moves the clock backwards within the same day and
  // leaves the day counter unincremented.
  //
  // With doDayLightCycle off there is no cycle to hand off to, so parking at
  // 23999 would strand the world one tick shy of dawn forever. Go to 0 instead
  // and accept the stale day counter - it is already frozen in that mode.
  if (next >= cfg.NIGHT_END - 1) {
    next = daylightCycleRunning() ? cfg.NIGHT_END - 1 : 0;
    state.pendingTicks = 0;
    state.burnRate = 0;
  } else {
    state.pendingTicks -= step;
    if (state.pendingTicks <= 0) state.burnRate = 0;
  }

  world.setTimeOfDay(Math.floor(next));
  return true;
}
