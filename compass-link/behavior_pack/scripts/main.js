import { system, world } from "@minecraft/server";

const TICKS_PER_UPDATE = 5;
// Matched by id rather than by the word "compass", so another pack's custom item
// with that word in its name is left alone.
const COMPASS_IDS = new Set([
  "minecraft:compass",
  "minecraft:lodestone_compass",
  "minecraft:recovery_compass",
]);
const NETHER_SCALE = 8;

/** Return the selected hotbar stack, or undefined if inventory is unavailable. */
function getSelectedItem(player) {
  const inventory = player.getComponent("minecraft:inventory");
  const container = inventory?.container;
  if (!container) return undefined;
  return container.getItem(player.selectedSlotIndex);
}

function blockCoordinate(value) {
  return Math.floor(value);
}

function getOppositeCoordinates(player) {
  const { x, y, z } = player.location;
  const dimensionId = player.dimension.id;

  if (dimensionId === "minecraft:overworld") {
    return {
      label: "Nether",
      x: Math.floor(x / NETHER_SCALE),
      y: blockCoordinate(y),
      z: Math.floor(z / NETHER_SCALE),
    };
  }

  if (dimensionId === "minecraft:nether") {
    return {
      label: "Overworld",
      x: blockCoordinate(x * NETHER_SCALE),
      y: blockCoordinate(y),
      z: blockCoordinate(z * NETHER_SCALE),
    };
  }

  return undefined;
}

const showingCoordinates = new Set();

system.runInterval(() => {
  for (const player of world.getPlayers()) {
    try {
      const selectedItem = getSelectedItem(player);
      if (!COMPASS_IDS.has(selectedItem?.typeId)) {
        if (showingCoordinates.delete(player.id)) {
          player.onScreenDisplay.setActionBar("");
        }
        continue;
      }

      const coordinates = getOppositeCoordinates(player);
      if (!coordinates) {
        if (showingCoordinates.delete(player.id)) {
          player.onScreenDisplay.setActionBar("");
        }
        continue;
      }

      player.onScreenDisplay.setActionBar(
        `${coordinates.label}: ${coordinates.x}, ${coordinates.y}, ${coordinates.z}`,
      );
      showingCoordinates.add(player.id);
    } catch {
      // Players can leave or change dimensions while this periodic update runs.
    }
  }
}, TICKS_PER_UPDATE);
