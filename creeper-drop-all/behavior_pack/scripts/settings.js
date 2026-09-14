/**
 * Creeper Drop All - settings
 * by ntrixter
 *
 * Values come from the native pack settings screen (the gear icon next to the
 * pack in world settings), which is driven by the "settings" block in
 * manifest.json. Read once at world load: there is no stable change event yet,
 * so edits take effect on the next world load.
 */

import { world } from "@minecraft/server";

const NS = "creeperdropall";

/**
 * Mirrors the "settings" block in manifest.json exactly.
 *
 * These are used whenever the engine cannot supply pack settings, and they are
 * what a Bedrock Dedicated Server effectively runs on: BDS has no gear icon,
 * and Bedrock scripts have no filesystem access, so on a server the manifest
 * defaults ARE the config file. Keep the two lists in sync - build.ps1 checks.
 */
export const DEFAULTS = {
  creepers: true,
  ghasts: true,
  withers: true,
  end_crystals: true,
  tnt: false,
  protect_containers: false,
  merge_grid: 4,
  max_blocks: 4096,
};

/** Which entity typeIds each toggle covers. */
export const SOURCE_GROUPS = {
  creepers: ["minecraft:creeper"],
  ghasts: ["minecraft:fireball"],
  withers: ["minecraft:wither_skull", "minecraft:wither_skull_dangerous"],
  end_crystals: ["minecraft:ender_crystal"],
  // TNT already drops 100% on Bedrock (tntExplosionDropDecay defaults to false),
  // so this is off by default and only exists for completeness.
  // NOTE: verify what typeId a TNT minecart actually reports from inside the
  // explosion event before relying on it - see TESTING.md T12.
  tnt: ["minecraft:tnt", "minecraft:tnt_minecart"],
};

function clamp(n, lo, hi) {
  if (typeof n !== "number" || !Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

export function loadSettings() {
  const s = { ...DEFAULTS };
  try {
    const packed = world.getPackSettings() ?? {};
    for (const key of Object.keys(DEFAULTS)) {
      const v = packed[NS + ":" + key];
      // Type-check every value: a malformed or absent setting must never
      // replace a known-good default.
      if (typeof v === typeof DEFAULTS[key]) s[key] = v;
    }
  } catch {
    // Engine can't supply pack settings - defaults stand and the pack still runs.
  }
  s.merge_grid = clamp(s.merge_grid, 1, 8);
  s.max_blocks = clamp(s.max_blocks, 512, 8192);
  return s;
}

/** Build the set of entity typeIds we take over, from the enabled toggles. */
export function buildHandledTypes(settings) {
  const handled = new Set();
  for (const key of Object.keys(SOURCE_GROUPS)) {
    if (settings[key]) {
      for (const id of SOURCE_GROUPS[key]) handled.add(id);
    }
  }
  return handled;
}
