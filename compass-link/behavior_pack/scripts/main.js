import { system, world } from "@minecraft/server";
import { readout } from "./readout.js";

const TICKS_PER_UPDATE = 5;
// Matched by id rather than by the word "compass", so another pack's custom item
// with that word in its name is left alone.
const COMPASS_IDS = new Set([
  "minecraft:compass",
  "minecraft:lodestone_compass",
  "minecraft:recovery_compass",
]);

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
    biome: on("current_biome"),
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
      const location = player.location;
      const biome = options.biome ? biomeAt(player.dimension, location) : undefined;
      const text = readout(player.dimension.id, location, biome, options);
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
  showing.delete(playerId);
});
