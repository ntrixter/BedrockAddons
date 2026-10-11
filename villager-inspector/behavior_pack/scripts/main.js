import { system, world } from "@minecraft/server";
import { describe } from "./describe.js";

const TICKS_PER_UPDATE = 5;
const VILLAGER = "minecraft:villager_v2";

/** Read once at load: there is no stable settings-change event yet. */
function readSettings() {
  let values = {};
  try {
    values = world.getPackSettings() ?? {};
  } catch {
    // Older runtimes or a server with no settings file: use the defaults.
  }
  const reach = Number(values["villager_inspector:reach"]);
  return {
    throughBlocks: values["villager_inspector:through_blocks"] !== false,
    reach: Number.isFinite(reach) && reach > 0 ? reach : 8,
  };
}

const settings = readSettings();

/** The nearest villager the player is pointing at, or undefined. */
function targetVillager(player) {
  const hits = player.getEntitiesFromViewDirection({
    type: VILLAGER,
    maxDistance: settings.reach,
    ignoreBlockCollision: settings.throughBlocks,
  });
  let nearest;
  for (const hit of hits) {
    if (!nearest || hit.distance < nearest.distance) nearest = hit;
  }
  return nearest?.entity;
}

/** Copy what describe() needs out of the live entity. */
function snapshot(villager) {
  const container = villager.getComponent("minecraft:inventory")?.container;
  if (!container) return undefined;
  const slots = [];
  for (let i = 0; i < container.size; i++) {
    const stack = container.getItem(i);
    slots.push(stack ? { typeId: stack.typeId, amount: stack.amount } : undefined);
  }
  return {
    profession: villager.getComponent("minecraft:variant")?.value ?? 0,
    baby: villager.hasComponent("minecraft:is_baby"),
    slots,
  };
}

const showing = new Set();

system.runInterval(() => {
  for (const player of world.getPlayers()) {
    try {
      const villager = targetVillager(player);
      const snap = villager && snapshot(villager);
      if (!snap) {
        if (showing.delete(player.id)) player.onScreenDisplay.setActionBar("");
        continue;
      }
      player.onScreenDisplay.setActionBar(describe(snap));
      showing.add(player.id);
    } catch {
      // A player can leave, or a villager despawn, while this update runs.
    }
  }
}, TICKS_PER_UPDATE);
