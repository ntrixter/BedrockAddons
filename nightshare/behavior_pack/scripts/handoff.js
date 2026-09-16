import { world } from "@minecraft/server";
import * as cfg from "./config.js";
import * as guard from "./guard.js";
import * as ledger from "./ledger.js";
import * as settings from "./settings.js";

/**
 * Lets Minecraft finish the last stretch of the night, so that whoever is in
 * bed for it gets a real sleep.
 *
 * WHY. Phantoms watch a per-player "time since rest" that only a completed
 * vanilla sleep clears. Nightshare moves the clock with setTimeOfDay, which
 * clears nothing, and no script can clear it either - the entire API surface on
 * the subject is Entity.isSleeping, GameRules.doInsomnia and
 * playersSleepingPercentage. There is no per-player rest value to write and no
 * sleep-completed event to hook.
 *
 * So do not imitate a sleep: arrange for a real one. Stop just short of dawn,
 * drop the sleep threshold so a single sleeper satisfies it, and let Minecraft
 * perform its own night skip. Everyone in bed at that moment is woken by the
 * game, through the game's own path, and their counter clears exactly as it
 * would in an unmodded world.
 *
 * The useful property that falls out of this: it is per player, and a player
 * fixes their own phantoms the obvious way - stay in bed until morning.
 *
 * WHAT IT DOES NOT COVER. A night that never reaches dawn. One player of four
 * turns in, a quarter of the night burns, they get up in the dark - there is no
 * sleep to complete, so their counter keeps running. That is arguably right:
 * they did not sleep the night through.
 *
 * The gamerule is not written here. guard.js owns every write to it, against
 * one stored original, because it also borrows the same rule for the opposite
 * purpose mid-night.
 */

/** Real tick at which vanilla was invited, or -1 when idle. */
let armedAt = -1;

export function armed() {
  return armedAt >= 0;
}

/** Give the gamerule back and stand down. Used by nightshare:reset. */
export function clear() {
  if (armed()) guard.release();
  armedAt = -1;
}

function anyoneInBed() {
  for (const player of ledger.eligiblePlayers()) {
    if (player.isSleeping) return true;
  }
  return false;
}

/**
 * @param {number} tick monotonically increasing real tick count
 * @param {boolean} [enabled] overrides the resolved setting; the test harness
 *   uses this to exercise both branches without touching the settings screen
 */
export function sync(tick, enabled = settings.dawnHandoff()) {
  if (!enabled) {
    clear();
    return;
  }

  const time = world.getTimeOfDay();

  if (armed()) {
    // Vanilla took it: the clock is past dawn. Give the gamerule back.
    if (time < cfg.NIGHT_START) {
      guard.release();
      armedAt = -1;
      return;
    }
    // It did not, and the window is up - most likely the sleeper got out of
    // bed between the invitation and the skip. Take the night back so the
    // burner can finish it; a stuck night is far worse than a missed reset.
    if (tick - armedAt >= cfg.HANDOFF_TIMEOUT_TICKS) {
      guard.release();
      armedAt = -1;
    }
    return;
  }

  // Not near dawn yet. Comparing with >= rather than a window matters: a large
  // share can carry the clock across the threshold in a single tick, and a
  // narrow band would be stepped straight over.
  if (time < cfg.NIGHT_END - cfg.HANDOFF_TICKS) return;

  if (!anyoneInBed()) return;
  if (guard.invite()) armedAt = tick;
}
