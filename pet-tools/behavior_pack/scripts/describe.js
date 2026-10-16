// Turns what is known about a pet into the action-bar line. Pure: no game
// objects, so the tests can drive it with plain values.

/** Names that are not just the id tidied up. */
const SPECIES = {
  "minecraft:wolf": "Dog",
  "minecraft:trader_llama": "Llama",
};

/** "minecraft:skeleton_horse" -> "Skeleton horse". */
export function speciesName(typeId) {
  if (SPECIES[typeId]) return SPECIES[typeId];
  const bare = String(typeId).replace(/^[^:]*:/, "").replace(/_/g, " ");
  return bare.charAt(0).toUpperCase() + bare.slice(1);
}

/** Drop § formatting codes, so a name cannot recolour the rest of the line. */
export function plain(text) {
  return String(text).replace(/§./g, "").replace(/§/g, "");
}

/**
 * pet: {
 *   typeId,
 *   nameTag?: string,  the pet's own name, if it has one
 *   owner?: string,    the owner's player name, if known
 *   hasOwnerId: bool,  whether the game says a player tamed it
 *   yours: bool,       whether the player looking is the owner
 * }
 */
export function describe(pet) {
  let label = speciesName(pet.typeId);
  if (pet.nameTag) label += ` "${plain(pet.nameTag)}"`;
  if (pet.yours) return `§a${label} · yours`;
  if (pet.owner) return `§b${label} · owned by ${plain(pet.owner)}`;
  if (pet.hasOwnerId) return `§7${label} · owner not seen yet`;
  return `§7${label} · tamed`;
}
