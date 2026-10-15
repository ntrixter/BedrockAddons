/**
 * Netherite No Despawn - which items to keep, and when each is due a refresh.
 *
 * Nothing here imports @minecraft/server, so the tests drive it with plain
 * objects.
 *
 * A dropped item despawns after 6000 ticks (five minutes) on the ground, and
 * no stable API reads or resets that clock. What a script can do is replace
 * the item with an identical copy, which starts a fresh clock. The pack does
 * that for every item it keeps, well before the five minutes are up.
 */

/**
 * Every netherite item with durability or an armour slot, from
 * metadata/vanilladata_modules/mojang-items.json at 1.26.50. A list rather
 * than a "netherite_" prefix, so that a future netherite material is not
 * swept up with the gear.
 */
export const NETHERITE_GEAR = new Set([
  "minecraft:netherite_sword",
  "minecraft:netherite_spear",
  "minecraft:netherite_pickaxe",
  "minecraft:netherite_axe",
  "minecraft:netherite_shovel",
  "minecraft:netherite_hoe",
  "minecraft:netherite_helmet",
  "minecraft:netherite_chestplate",
  "minecraft:netherite_leggings",
  "minecraft:netherite_boots",
  "minecraft:netherite_horse_armor",
  "minecraft:netherite_nautilus_armor",
]);

/** Vanilla's despawn age for an item on the ground, in ticks. */
export const DESPAWN_TICKS = 6000;

/**
 * Refresh at four minutes. The minute of slack covers the gap between checks
 * and anything the count cannot see; refreshing early costs nothing.
 */
export const REFRESH_AT = 4800;

/** Should this stack outlive the despawn timer, under these settings? */
export function shouldKeep(stack, settings) {
  if (!stack) return false;
  if (settings.netherite && NETHERITE_GEAR.has(stack.typeId)) return true;
  if (settings.named_items && typeof stack.nameTag === "string" && stack.nameTag.length > 0) {
    return true;
  }
  return false;
}

/**
 * Counts how long each kept item has been on the ground, by entity id.
 *
 * Only ticks the item spent loaded are counted, because an item in an
 * unloaded chunk does not age either. An item the pack did not see appear -
 * one already lying there when the world loaded, or carried in on a chunk
 * load - has an unknown age, so it is due at once.
 */
export class Tracker {
  constructor() {
    /** @type {Map<string, { entity: any, age: number }>} */
    this.items = new Map();
  }

  /** Start counting. `born` is true when the item appeared just now. */
  watch(entity, born) {
    if (this.items.has(entity.id)) return;
    this.items.set(entity.id, { entity, age: born ? 0 : REFRESH_AT });
  }

  forget(id) {
    this.items.delete(id);
  }

  has(id) {
    return this.items.has(id);
  }

  get size() {
    return this.items.size;
  }

  /**
   * Advance every item by `ticks` and return the entities now due a refresh.
   * Anything no longer valid - picked up, destroyed, or unloaded - is
   * forgotten; an unloaded item is seen again when its chunk loads.
   */
  step(ticks) {
    const due = [];
    for (const [id, entry] of this.items) {
      if (!entry.entity.isValid) {
        this.items.delete(id);
        continue;
      }
      if (entry.age >= REFRESH_AT) {
        due.push(entry.entity);
      } else {
        entry.age += ticks;
        if (entry.age >= REFRESH_AT) due.push(entry.entity);
      }
    }
    return due;
  }
}
