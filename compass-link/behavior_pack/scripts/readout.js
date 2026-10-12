/**
 * Builds the compass readout: the current dimension's line on top, the other
 * dimension's underneath. Pure, so tests/run.js can drive it without the game.
 */

export const NETHER_SCALE = 8;

const LABELS = {
  "minecraft:overworld": "Overworld",
  "minecraft:nether": "Nether",
  "minecraft:the_end": "The End",
};

const OTHER = {
  "minecraft:overworld": "minecraft:nether",
  "minecraft:nether": "minecraft:overworld",
};

// The five Nether biomes, by their Bedrock ids. Checked against
// bedrock-samples metadata/vanilladata_modules/mojang-biomes.json.
export const NETHER_BIOMES = [
  "minecraft:hell",
  "minecraft:crimson_forest",
  "minecraft:warped_forest",
  "minecraft:soulsand_valley",
  "minecraft:basalt_deltas",
];

// Bedrock still uses pre-1.18 ids for many biomes. These are the names the
// game shows today; anything not listed is title-cased from its id.
const BIOME_NAMES = {
  "minecraft:hell": "Nether Wastes",
  "minecraft:soulsand_valley": "Soul Sand Valley",
  "minecraft:the_end": "The End",
  "minecraft:mesa": "Badlands",
  "minecraft:mesa_bryce": "Eroded Badlands",
  "minecraft:mesa_plateau_stone": "Wooded Badlands",
  "minecraft:roofed_forest": "Dark Forest",
  "minecraft:extreme_hills": "Windswept Hills",
  "minecraft:extreme_hills_mutated": "Windswept Gravelly Hills",
  "minecraft:extreme_hills_plus_trees": "Windswept Forest",
  "minecraft:savanna_mutated": "Windswept Savanna",
  "minecraft:cold_taiga": "Snowy Taiga",
  "minecraft:ice_plains": "Snowy Plains",
  "minecraft:ice_plains_spikes": "Ice Spikes",
  "minecraft:mega_taiga": "Old Growth Pine Taiga",
  "minecraft:redwood_taiga_mutated": "Old Growth Spruce Taiga",
  "minecraft:birch_forest_mutated": "Old Growth Birch Forest",
  "minecraft:jungle_edge": "Sparse Jungle",
  "minecraft:swampland": "Swamp",
  "minecraft:mushroom_island": "Mushroom Fields",
  "minecraft:stone_beach": "Stony Shore",
  "minecraft:cold_beach": "Snowy Beach",
};

export function biomeName(id) {
  if (BIOME_NAMES[id]) return BIOME_NAMES[id];
  return id
    .replace(/^[^:]*:/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function otherDimension(dimensionId) {
  return OTHER[dimensionId];
}

/** The matching position in the other dimension, or undefined if there is none. */
export function otherPosition(dimensionId, { x, y, z }) {
  if (dimensionId === "minecraft:overworld") {
    return { x: Math.floor(x / NETHER_SCALE), y: Math.floor(y), z: Math.floor(z / NETHER_SCALE) };
  }
  if (dimensionId === "minecraft:nether") {
    return { x: Math.floor(x * NETHER_SCALE), y: Math.floor(y), z: Math.floor(z * NETHER_SCALE) };
  }
  return undefined;
}

function line(dimensionId, pos, biomeId, showCoords, showBiome) {
  const parts = [];
  if (showCoords) parts.push(`${pos.x}, ${pos.y}, ${pos.z}`);
  if (showBiome && biomeId) parts.push(biomeName(biomeId));
  if (!parts.length) return undefined;
  const label = LABELS[dimensionId] ?? biomeName(dimensionId);
  return `${label}: ${parts.join(" · ")}`;
}

/**
 * The readout text, or "" when every enabled part is empty.
 *
 * `options` are the four settings: currentCoords, otherCoords, currentBiome,
 * otherBiome. `biomes` holds { current, other } ids, either possibly undefined
 * when the game could not tell.
 */
export function readout(dimensionId, location, biomes, options) {
  const here = { x: Math.floor(location.x), y: Math.floor(location.y), z: Math.floor(location.z) };
  const lines = [];
  const top = line(dimensionId, here, biomes.current, options.currentCoords, options.currentBiome);
  if (top) lines.push(top);
  const otherId = otherDimension(dimensionId);
  if (otherId) {
    const there = otherPosition(dimensionId, location);
    const bottom = line(otherId, there, biomes.other, options.otherCoords, options.otherBiome);
    // The other dimension's line is dimmed, so the current one reads first.
    if (bottom) lines.push(`§7${bottom}§r`);
  }
  return lines.join("\n");
}
