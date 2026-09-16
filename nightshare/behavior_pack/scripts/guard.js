import { world } from "@minecraft/server";
import * as cfg from "./config.js";
import * as settings from "./settings.js";

/**
 * Sole owner of playersSleepingPercentage.
 *
 * Two callers want that gamerule for opposite reasons - this module holds
 * vanilla's night skip OFF mid-night, and handoff.js invites it ON at dawn - and
 * both of them have to give the world its own value back afterwards. If each
 * borrowed independently they would record each other's temporary values as the
 * original, and the world would be left permanently skippable or permanently
 * not. So every write to that gamerule goes through here, against one stored
 * original.
 *
 * Keeps vanilla's own night skip from firing on top of ours, without leaving
 * the world permanently flagged as "night skipping is off".
 *
 * Off by default: when everyone who can sleep has slept, vanilla ending the
 * night is the intended outcome. The other modes exist for anyone who wants the
 * night to run exactly as long as the unspent shares say.
 *
 * 1.0.0 pinned playersSleepingPercentage above 100 for the whole session. That
 * worked, but Bedrock renders any value over 100 as the feature being switched
 * off, so anyone getting into bed was told to go turn it back on - which would
 * have broken the pack. migrate() undoes that on upgrade.
 */

function read() {
  try {
    return world.gameRules.playersSleepingPercentage;
  } catch {
    return undefined;
  }
}

function write(value) {
  try {
    world.gameRules.playersSleepingPercentage = value;
  } catch (e) {
    console.warn(`[Nightshare] could not set playersSleepingPercentage: ${e}`);
  }
}

/** True once we have taken the gamerule and still owe the world its value back. */
function borrowed() {
  return typeof world.getDynamicProperty(cfg.ORIGINAL_PCT_KEY) === "number";
}

/**
 * Record the world's own value, once, before the first write of a stint.
 * @returns {boolean} false when there is nothing safe to take
 */
function borrow() {
  if (borrowed()) return true;
  const current = read();
  // undefined: the engine would not say, so there would be nothing to restore.
  // Above 100: the world was deliberately made unskippable and that is not ours
  // to override, in either direction.
  if (current === undefined || current > 100) return false;
  world.setDynamicProperty(cfg.ORIGINAL_PCT_KEY, current);
  return true;
}

/** Hold vanilla's night skip off. */
function engage() {
  if (!borrow()) return;
  write(cfg.GUARD_PERCENTAGE);
}

/**
 * Invite vanilla to skip: drop the threshold low enough that one sleeper meets
 * it. Used by handoff.js at dawn, so the sleeper gets a real vanilla sleep and
 * their phantom timer clears the only way Minecraft allows.
 * @returns {boolean} whether the invitation was actually issued
 */
export function invite() {
  if (!borrow()) return false;
  write(cfg.INVITE_PERCENTAGE);
  return true;
}

/** Hand the world its own value back. Safe to call when nothing was taken. */
export function release() {
  // Only ever hand back a value we took. If the gamerule is above 100 because
  // the player chose that themselves, leave it alone.
  const original = world.getDynamicProperty(cfg.ORIGINAL_PCT_KEY);
  if (typeof original !== "number") return;
  write(original);
  world.setDynamicProperty(cfg.ORIGINAL_PCT_KEY, undefined);
}

/**
 * One-off repair for worlds that ran 1.0.0, which raised the gamerule and never
 * recorded what it replaced. Runs once per world, before any guard decision.
 */
export function migrate() {
  if (world.getDynamicProperty(cfg.MIGRATED_KEY)) return;
  world.setDynamicProperty(cfg.MIGRATED_KEY, true);

  const current = read();
  if (current !== undefined && current > 100 && !borrowed()) write(100);
}

/**
 * @param {boolean} rosterMemberAway whether someone on tonight's roster is
 *   missing from the Overworld, the only state in which vanilla can over-skip
 * @param {string} [mode] overrides the resolved mode; the test harness uses
 *   this to exercise every branch without touching the settings screen
 */
export function sync(rosterMemberAway, mode = settings.vanillaGuard()) {
  switch (mode) {
    case "off":
      release();
      return;
    case "always":
      engage();
      return;
    default:
      if (rosterMemberAway) engage();
      else release();
  }
}
