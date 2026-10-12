import { system, world } from "@minecraft/server";
import { NETHER_BIOMES, otherDimension, otherPosition, readout } from "./readout.js";

const TICKS_PER_UPDATE = 5;
// Matched by id rather than by the word "compass", so another pack's custom item
// with that word in its name is left alone.
const COMPASS_IDS = new Set([
  "minecraft:compass",
  "minecraft:lodestone_compass",
  "minecraft:recovery_compass",
]);
// The seed-based Nether biome lookup is the expensive part, so it runs at most
// this often per player, and only when the matching Nether block changes.
const SEED_LOOKUP_TICKS = 20;
const SEED_SEARCH = { boundingSize: { x: 32, y: 32, z: 32 } };

/** Read once at load: there is no stable settings-change event yet. */
function readSettings() {
  let values = {};
  try {
    values = world.getPackSettings() ?? {};
  } catch {
    // Older runtimes or a server with no settings file: use the defaults.
  }
  const on = (name) => values[`compass_link:${name}`] !== false;
  return {
    currentCoords: on("current_coords"),
    otherCoords: on("other_coords"),
    currentBiome: on("current_biome"),
    otherBiome: on("other_biome"),
  };
}

const options = readSettings();

/** Return the selected hotbar stack, or undefined if inventory is unavailable. */
function getSelectedItem(player) {
  const inventory = player.getComponent("minecraft:inventory");
  const container = inventory?.container;
  if (!container) return undefined;
  return container.getItem(player.selectedSlotIndex);
}

function biomeAt(dimension, location) {
  try {
    return dimension.getBiome(location)?.id;
  } catch {
    return undefined; // Unloaded chunk or outside the world.
  }
}

// player id -> { key, biome, tick } for the other dimension's biome.
const otherBiomeCache = new Map();

/**
 * The other dimension's biome at the matching position. Read directly when
 * that chunk happens to be loaded. Otherwise, for the Nether only, worked out
 * from the world seed: with five candidates, the nearest one is the biome
 * there. The Overworld has too many biomes to search that way, so from the
 * Nether it shows only when the Overworld chunk is loaded.
 */
function otherBiome(player, otherId, pos) {
  const dimension = world.getDimension(otherId);
  const direct = biomeAt(dimension, pos);
  if (direct) return direct;
  if (otherId !== "minecraft:nether") return undefined;

  const key = `${pos.x},${pos.y},${pos.z}`;
  const cached = otherBiomeCache.get(player.id);
  const now = system.currentTick;
  if (cached && (cached.key === key || now - cached.tick < SEED_LOOKUP_TICKS)) return cached.biome;

  let best;
  let bestDist = Infinity;
  const at = { x: pos.x, y: Math.min(Math.max(pos.y, 1), 126), z: pos.z };
  for (const id of NETHER_BIOMES) {
    let found;
    try {
      found = dimension.calculateClosestBiomeFromSeed(at, id, SEED_SEARCH);
    } catch {
      continue;
    }
    if (!found) continue;
    const d = (found.x - at.x) ** 2 + (found.y - at.y) ** 2 + (found.z - at.z) ** 2;
    if (d < bestDist) {
      best = id;
      bestDist = d;
    }
  }
  otherBiomeCache.set(player.id, { key, biome: best, tick: now });
  return best;
}

const showing = new Set();

function clear(player) {
  if (showing.delete(player.id)) player.onScreenDisplay.setActionBar("");
}

system.runInterval(() => {
  for (const player of world.getPlayers()) {
    try {
      if (!COMPASS_IDS.has(getSelectedItem(player)?.typeId)) {
        clear(player);
        continue;
      }
      const dimensionId = player.dimension.id;
      const location = player.location;
      const otherId = otherDimension(dimensionId);
      const biomes = {
        current: options.currentBiome ? biomeAt(player.dimension, location) : undefined,
        other:
          options.otherBiome && otherId
            ? otherBiome(player, otherId, otherPosition(dimensionId, location))
            : undefined,
      };
      const text = readout(dimensionId, location, biomes, options);
      if (!text) {
        clear(player);
        continue;
      }
      player.onScreenDisplay.setActionBar(text);
      showing.add(player.id);
    } catch {
      // Players can leave or change dimensions while this periodic update runs.
    }
  }
}, TICKS_PER_UPDATE);

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  otherBiomeCache.delete(playerId);
  showing.delete(playerId);
});
