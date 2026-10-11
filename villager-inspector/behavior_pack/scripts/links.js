import { world } from "@minecraft/server";

/**
 * Which bed and workstation each villager uses, learned by watching.
 *
 * No stable API exposes the link: claims live in the engine's village data.
 * main.js records a workstation when a villager fires minecraft:resupply_trades
 * (vanilla's on_arrival for every work goal, so it is standing at its own job
 * site) and a bed when a villager is found asleep on one. See BEDROCK-NOTES.md.
 *
 * Stored both ways in dynamic properties, so either end can be looked up:
 *   villager  "vi:bed" / "vi:job"     -> block key
 *   world     "vi:o:<block key>"      -> villager id
 * A link counts only while both ends agree. A block re-claimed by another
 * villager simply overwrites the world entry, which makes the old owner's
 * pointer stale; it is cleared the next time that villager is read.
 */

// Job-site blocks by id, with the English name shown on the action bar.
// Checked against bedrock-samples metadata/vanilladata_modules/mojang-blocks.json.
// The smoker and blast furnace change id while lit.
export const JOB_BLOCKS = {
  "minecraft:composter": "Composter",
  "minecraft:barrel": "Barrel",
  "minecraft:loom": "Loom",
  "minecraft:fletching_table": "Fletching Table",
  "minecraft:lectern": "Lectern",
  "minecraft:cartography_table": "Cartography Table",
  "minecraft:brewing_stand": "Brewing Stand",
  "minecraft:blast_furnace": "Blast Furnace",
  "minecraft:lit_blast_furnace": "Blast Furnace",
  "minecraft:grindstone": "Grindstone",
  "minecraft:smithing_table": "Smithing Table",
  "minecraft:smoker": "Smoker",
  "minecraft:lit_smoker": "Smoker",
  "minecraft:cauldron": "Cauldron",
  "minecraft:stonecutter_block": "Stonecutter",
};
export const BED = "minecraft:bed";

const OWNER_PREFIX = "vi:o:";

/** "x,y,z,dimension" for a block. */
export function blockKey(block) {
  return `${block.x},${block.y},${block.z},${block.dimension.id}`;
}

function parseKey(key) {
  const [x, y, z, dim] = key.split(",");
  return { x: Number(x), y: Number(y), z: Number(z), dim };
}

// Bedrock bed `direction`: 0 south, 1 west, 2 north, 3 east, the way the head
// points from the foot. UNVERIFIED in game, so the partner is only trusted
// when it really is the other half of the same bed.
const HEAD_OFFSET = [
  { x: 0, z: 1 },
  { x: -1, z: 0 },
  { x: 0, z: -1 },
  { x: 1, z: 0 },
];

/**
 * A bed is two blocks; links are kept on the head so either half finds them.
 * Falls back to the block itself if the other half cannot be confirmed.
 */
export function bedHead(block) {
  const states = block.permutation.getAllStates();
  if (states.head_piece_bit) return block;
  const off = HEAD_OFFSET[states.direction];
  if (!off) return block;
  const other = block.dimension.getBlock({ x: block.x + off.x, y: block.y, z: block.z + off.z });
  if (other?.typeId !== BED) return block;
  const os = other.permutation.getAllStates();
  return os.head_piece_bit && os.direction === states.direction ? other : block;
}

function stillThere(key, kind) {
  const { x, y, z, dim } = parseKey(key);
  let block;
  try {
    block = world.getDimension(dim).getBlock({ x, y, z });
  } catch {
    return undefined; // Unloaded: cannot tell, so keep the record.
  }
  if (!block) return undefined;
  return kind === "bed" ? block.typeId === BED : block.typeId in JOB_BLOCKS;
}

/** Record that `villager` uses `block` as its bed or job site. */
export function record(villager, kind, block) {
  const key = blockKey(kind === "bed" ? bedHead(block) : block);
  const prop = kind === "bed" ? "vi:bed" : "vi:job";
  const old = villager.getDynamicProperty(prop);
  if (old === key && world.getDynamicProperty(OWNER_PREFIX + key) === villager.id) return;
  if (typeof old === "string" && world.getDynamicProperty(OWNER_PREFIX + old) === villager.id) {
    world.setDynamicProperty(OWNER_PREFIX + old, undefined);
  }
  villager.setDynamicProperty(prop, key);
  world.setDynamicProperty(OWNER_PREFIX + key, villager.id);
}

/**
 * The villager's bed or job block key, or undefined if unknown. Clears a
 * pointer the world no longer agrees with, or whose block has gone.
 */
export function linkOf(villager, kind) {
  const prop = kind === "bed" ? "vi:bed" : "vi:job";
  const key = villager.getDynamicProperty(prop);
  if (typeof key !== "string") return undefined;
  if (world.getDynamicProperty(OWNER_PREFIX + key) !== villager.id || stillThere(key, kind) === false) {
    villager.setDynamicProperty(prop, undefined);
    if (world.getDynamicProperty(OWNER_PREFIX + key) === villager.id) {
      world.setDynamicProperty(OWNER_PREFIX + key, undefined);
    }
    return undefined;
  }
  return key;
}

/**
 * Who uses this block. Returns undefined if no villager has been seen using
 * it, { entity: undefined } if the owner is not loaded (or has died while
 * unloaded), or { entity } for a live owner whose own pointer agrees.
 */
export function ownerOf(block, kind, { readOnly = false } = {}) {
  const key = blockKey(kind === "bed" ? bedHead(block) : block);
  const id = world.getDynamicProperty(OWNER_PREFIX + key);
  if (typeof id !== "string") return undefined;
  const entity = world.getEntity(id);
  if (!entity) return { entity: undefined };
  const prop = kind === "bed" ? "vi:bed" : "vi:job";
  if (entity.getDynamicProperty(prop) !== key) {
    // A before-event runs in restricted execution, where writes throw; the
    // stale entry is cleaned up on the next ordinary read instead.
    if (!readOnly) world.setDynamicProperty(OWNER_PREFIX + key, undefined);
    return undefined;
  }
  return { entity };
}

/** Block centre for a stored key, for particles. */
export function keyLocation(key) {
  const { x, y, z, dim } = parseKey(key);
  return { dim, location: { x: x + 0.5, y: y + 1.2, z: z + 0.5 } };
}

/** Drop every world entry that points at a villager that has died. */
export function forget(villagerId) {
  for (const id of world.getDynamicPropertyIds()) {
    if (id.startsWith(OWNER_PREFIX) && world.getDynamicProperty(id) === villagerId) {
      world.setDynamicProperty(id, undefined);
    }
  }
}
