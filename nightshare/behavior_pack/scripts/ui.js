import { world } from "@minecraft/server";
import * as settings from "./settings.js";

const TAG = "\u00a7b[Nightshare]\u00a7r";

export const SHARE_SPENT = "\u00a7aYour share is spent.\u00a7r Sleep again tomorrow night.";
export const ALREADY_SPENT = "\u00a77You have already given your share tonight.\u00a7r";
export const LATE_JOIN = "\u00a77You arrived after nightfall - your share starts tomorrow.\u00a7r";
export const STORM_SLEEP = "\u00a77Nightshare only counts at night.\u00a7r";

/**
 * @param {import("@minecraft/server").Player} player
 * @param {{spent: number, total: number, pct: number}} result
 */
export function announceSpend(player, result) {
  if (!settings.announce()) return;
  world.sendMessage(
    `${TAG} \u00a7e${player.name}\u00a7r turned in. \u00a76+${result.pct}%\u00a7r of the night ` +
      `\u2014 \u00a76${result.spent}/${result.total}\u00a7r shares given.`
  );
}

/**
 * Action bar text is best-effort: the player may have left between the scan and
 * this call, which throws rather than returning a sentinel.
 * @param {import("@minecraft/server").Player} player
 * @param {string} text
 */
export function actionBar(player, text) {
  try {
    player.onScreenDisplay.setActionBar(text);
  } catch {
    /* player is gone this tick - nothing to show */
  }
}

/** @param {string} text */
export function broadcast(text) {
  world.sendMessage(`${TAG} ${text}`);
}
