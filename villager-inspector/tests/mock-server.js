// Mock of the bits of @minecraft/server that links.js touches: world dynamic
// properties, entity lookup by id, and blocks in a dimension. Blocks are set
// with setBlock(); entities are plain objects made by makeVillager().

const worldProps = new Map();
const entities = new Map();
const blocks = new Map();

const key = (dim, x, y, z) => `${dim}|${x}|${y}|${z}`;

function makeBlock(dim, x, y, z, typeId, states = {}) {
  return {
    x, y, z, typeId,
    location: { x, y, z },
    dimension: dimensions[dim],
    permutation: { getAllStates: () => ({ ...states }) },
  };
}

function makeDimension(id) {
  return {
    id,
    getBlock: ({ x, y, z }) => blocks.get(key(id, x, y, z)) ?? makeBlock(id, x, y, z, "minecraft:air"),
  };
}
const dimensions = { "minecraft:overworld": makeDimension("minecraft:overworld") };

export const world = {
  getDynamicProperty: (id) => worldProps.get(id),
  setDynamicProperty: (id, v) => (v === undefined ? worldProps.delete(id) : worldProps.set(id, v)),
  getDynamicPropertyIds: () => [...worldProps.keys()],
  getEntity: (id) => entities.get(id),
  getDimension: (id) => dimensions[id],
};

export function setBlock(x, y, z, typeId, states) {
  const b = makeBlock("minecraft:overworld", x, y, z, typeId, states);
  blocks.set(key("minecraft:overworld", x, y, z), b);
  return b;
}

let nextId = 1;
export function makeVillager() {
  const props = new Map();
  const v = {
    id: String(nextId++),
    getDynamicProperty: (id) => props.get(id),
    setDynamicProperty: (id, val) => (val === undefined ? props.delete(id) : props.set(id, val)),
  };
  entities.set(v.id, v);
  return v;
}

export function unload(v) {
  entities.delete(v.id);
}

export function reset() {
  worldProps.clear();
  entities.clear();
  blocks.clear();
}

export const system = {};
