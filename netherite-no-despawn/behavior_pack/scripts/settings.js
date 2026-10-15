/**
 * Netherite No Despawn - settings
 *
 * Values come from the native pack settings screen (the gear icon next to the
 * pack in world settings), which is driven by the "settings" block in
 * manifest.json. Read once at world load: there is no stable change event yet,
 * so edits take effect on the next world load.
 */

import { world } from "@minecraft/server";

const NS = "netherite_no_despawn";

/**
 * Mirrors the "settings" block in manifest.json exactly, and is what a
 * dedicated server runs on unless world_behavior_pack_settings.json says
 * otherwise. Add a setting to both lists or it silently does nothing.
 */
export const DEFAULTS = {
  netherite: true,
  named_items: false,
};

export function loadSettings() {
  const s = { ...DEFAULTS };
  try {
    const packed = world.getPackSettings() ?? {};
    for (const key of Object.keys(DEFAULTS)) {
      const v = packed[NS + ":" + key];
      // A malformed or absent value never replaces a known-good default.
      if (typeof v === typeof DEFAULTS[key]) s[key] = v;
    }
  } catch {
    // Engine can't supply pack settings - defaults stand and the pack still runs.
  }
  return s;
}
