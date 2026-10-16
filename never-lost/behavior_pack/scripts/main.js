/**
 * Never Lost
 *
 * Dropped netherite, anything enchanted with Mending, and optionally any
 * renamed item, stays on the ground indefinitely. See keeper.js for how.
 */

import { system, world } from "@minecraft/server";
import { loadSettings } from "./settings.js";
import { shouldKeep, Tracker } from "./keeper.js";

/** How often each kept item's age is advanced, in ticks. */
const STEP_TICKS = 100;

/**
 * How often every loaded item is looked at, in ticks. The events below see
 * nearly every item arrive; this catches whatever they do not, such as items
 * already on the ground before the script started.
 */
const SWEEP_TICKS = 600;

const DIMENSIONS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];

const settings = loadSettings();
const tracker = new Tracker();

function stackOf(entity) {
  try {
    return entity.getComponent("minecraft:item")?.itemStack;
  } catch {
    return undefined;
  }
}

/** Start counting an item entity's age, if it is one the settings keep. */
function consider(entity, born) {
  if (!entity.isValid || entity.typeId !== "minecraft:item" || tracker.has(entity.id)) return;
  if (shouldKeep(stackOf(entity), settings)) tracker.watch(entity, born);
}

/**
 * Swap the item for an identical copy in the same place, moving the same way.
 * The copy's despawn clock starts from zero. The stack carries everything with
 * it: enchantments, durability, name, lore and amount.
 */
function refresh(entity) {
  tracker.forget(entity.id);
  if (!entity.isValid) return;
  const stack = stackOf(entity);
  // Re-checked here: the stack can have changed since it was first seen.
  if (!shouldKeep(stack, settings)) return;

  const { dimension, location } = entity;
  const velocity = entity.getVelocity();
  // The copy appears before the original goes, so a failure part-way through
  // can never lose the item. Both happen inside one script call, before the
  // game gets a tick in which to merge them.
  const copy = dimension.spawnItem(stack, location);
  try {
    entity.remove();
  } catch {
    copy.remove();
    return;
  }
  try {
    copy.clearVelocity();
    copy.applyImpulse(velocity);
  } catch {
    // Only the drift is lost; the item itself is safe.
  }
  tracker.watch(copy, true);
}

function sweep() {
  for (const id of DIMENSIONS) {
    let entities;
    try {
      entities = world.getDimension(id).getEntities({ type: "minecraft:item" });
    } catch {
      continue;
    }
    for (const entity of entities) consider(entity, false);
  }
}

if (settings.netherite || settings.mending || settings.named_items) {
  world.afterEvents.entitySpawn.subscribe((event) => {
    // "Loaded" is a chunk load: the item may already be old.
    consider(event.entity, event.cause !== "Loaded");
  });
  world.afterEvents.entityLoad.subscribe((event) => consider(event.entity, false));

  system.runInterval(() => {
    for (const entity of tracker.step(STEP_TICKS)) {
      try {
        refresh(entity);
      } catch {
        // One bad item must not stop the rest; it is seen again by the sweep.
      }
    }
  }, STEP_TICKS);

  system.runTimeout(sweep, 20);
  system.runInterval(sweep, SWEEP_TICKS);
}
