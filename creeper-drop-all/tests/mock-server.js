// Mock of the bits of @minecraft/server that Creeper Drop All touches.
//
// The pack's whole job is turning destroyed blocks into the right items, so the
// mock's job is modelling the two things that decide that: what the loot table
// returns for a permutation, and what the block itself can be asked directly.
//
// Where the real engine's behaviour is NOT established, the mock is switchable
// rather than opinionated - see control.bedLootHalves. Two bed fixes shipped
// broken because a guess about the engine was baked in here and then relied on.

export const control = {
  /** Set by tests before importing the pack. */
  packSettings: {},
  /** Item ids whose `new ItemStack` should throw, to exercise fallbacks. */
  itemStackFailures: new Set(),

  /** Captured output. */
  spawned: [],
  /** Blocks the pack removed itself in P2. */
  removed: 0,
  /** The impacted-block list as the pack left it, i.e. what vanilla destroys. */
  impacted: null,
  pendingRuns: [],
  jobs: [],

  /**
   * Which half of a bed the loot table yields an item for: "foot" or "both".
   *
   * UNESTABLISHED. head_piece_bit is a block state, so the table *could* tell
   * the halves apart - but whether it does has never been checked in game, and
   * assuming it did produced a fix that dropped two beds per bed. The pack must
   * give one bed either way, so the suite runs under both.
   */
  bedLootHalves: "foot",
};

export const hooks = {
  explosionBefore: null,
  worldLoad: null,
  /** Set only if the pack subscribed, with the options it passed. */
  entityHurtBefore: null,
  entityHurtOptions: null,
  startup: null,
};

/** World dynamic properties, kept across loads like a real world's. */
export const dynamicProperties = new Map();

/** What the pack registered at startup: enums by name, commands by name. */
export const registry = { enums: new Map(), commands: new Map() };

export const CommandPermissionLevel = { Any: 0, GameDirectors: 1, Admin: 2, Host: 3, Owner: 4 };
export const CustomCommandStatus = { Success: 0, Failure: 1 };
export const CustomCommandSource = { Block: "Block", Entity: "Entity", NPCDialogue: "NPCDialogue", Server: "Server" };
export const CustomCommandParamType = {
  BlockType: "BlockType", Boolean: "Boolean", EntitySelector: "EntitySelector", EntityType: "EntityType",
  Enum: "Enum", Float: "Float", Integer: "Integer", ItemType: "ItemType", Location: "Location",
  PlayerSelector: "PlayerSelector", String: "String",
};

/** Hand the pack a startup event, as the engine does before worldLoad. */
export function startup() {
  registry.enums = new Map();
  registry.commands = new Map();
  if (!hooks.startup) return;
  hooks.startup({
    customCommandRegistry: {
      registerEnum(name, values) { registry.enums.set(name, values); },
      registerCommand(def, fn) { registry.commands.set(def.name, { def, fn }); },
    },
  });
}

export class ItemStack {
  constructor(typeId, amount = 1, data = undefined) {
    if (control.itemStackFailures.has(typeId)) {
      throw new Error("mock: unknown item " + typeId);
    }
    this.typeId = typeId;
    this.amount = amount;
    // Stands in for block entity data carried on the item: a bed's colour, a
    // banner's patterns. Bedrock keeps ONE minecraft:bed item id, so a bed's
    // colour never appears in typeId and only isStackableWith can tell two
    // colours apart.
    this.data = data;
    this.maxAmount = typeId === "minecraft:bed" ? 1 : 64;
  }
  clone() { return new ItemStack(this.typeId, this.amount, this.data); }
  isStackableWith(other) {
    return other.typeId === this.typeId && other.data === this.data;
  }
}

export class BlockPermutation {
  constructor(id, states = {}) { this.type = { id }; this.states = states; }
  static resolve(id, states = {}) { return new BlockPermutation(id, states); }
  getState(name) { return this.states[name]; }
}

const isLeaf = (id) => id.includes("leaves");

const lootManager = {
  /**
   * Mirrors the engine's contract, which the pack depends on precisely:
   *   undefined => the tool was INSUFFICIENT for this block  -> escalate
   *   []        => the tool was fine, the table rolled nothing -> stop
   */
  generateLootFromBlockPermutation(perm, tool) {
    const id = perm.type.id;
    const toolId = tool ? tool.typeId : undefined;

    if (isLeaf(id)) {
      // Leaves never need a tool, so never `undefined`. Shears give the block
      // itself, which is why they must stay out of the escalation ladder.
      if (toolId === "minecraft:shears") return [new ItemStack(id, 1)];
      return []; // the ~95% case: no sapling this roll
    }

    if (id === "minecraft:bed") {
      // The colour is NOT a block state, so whatever comes back is the wrong
      // colour. That is the bug the pack works around.
      const isHead = !!(perm.states && perm.states.head_piece_bit);
      if (control.bedLootHalves === "both") return [new ItemStack("minecraft:bed", 1, "red")];
      return isHead ? [] : [new ItemStack("minecraft:bed", 1, "red")];
    }
    if (id.endsWith("banner")) return [new ItemStack("minecraft:banner", 1, "white")];

    if (id === "minecraft:stone") {
      if (toolId === "minecraft:netherite_pickaxe") return [new ItemStack("minecraft:cobblestone", 1)];
      return undefined; // needs a pickaxe
    }
    if (id === "minecraft:vine") return toolId === "minecraft:shears" ? [new ItemStack(id, 1)] : [];
    return [];
  },
};

export const world = {
  beforeEvents: {
    explosion: { subscribe(fn) { hooks.explosionBefore = fn; } },
    entityHurt: {
      subscribe(fn, options) { hooks.entityHurtBefore = fn; hooks.entityHurtOptions = options; },
    },
  },
  afterEvents: { worldLoad: { subscribe(fn) { hooks.worldLoad = fn; } } },
  getPackSettings() { return control.packSettings; },
  getDynamicProperty(id) { return dynamicProperties.get(id); },
  setDynamicProperty(id, v) { if (v === undefined) dynamicProperties.delete(id); else dynamicProperties.set(id, v); },
  getAllPlayers() { return []; },
  getLootTableManager() { return lootManager; },
};

export const system = {
  currentTick: 1,
  run(fn) { control.pendingRuns.push(fn); },
  runInterval() { return 0; },
  beforeEvents: { startup: { subscribe(fn) { hooks.startup = fn; } } },
  runJob(gen) { control.jobs.push(gen); return control.jobs.length; },
};

/**
 * A block in the blast. `colour` stands in for block entity data, reachable
 * only through getItemStack(_, true) - never through the permutation.
 */
export function makeBlock(index, typeId, colour, states = {}) {
  return {
    location: { x: index, y: 70, z: 0 },
    typeId,
    permutation: BlockPermutation.resolve(typeId, states),
    hasComponent: () => false,
    getComponent: () => undefined,
    north: () => undefined, south: () => undefined,
    east: () => undefined, west: () => undefined,
    setPermutation() { control.removed++; },
    getItemStack(amount, withData) {
      return new ItemStack(typeId, amount, withData ? colour : undefined);
    },
  };
}

/** Drive one explosion over `blocks` and return what was spawned. */
export function detonate(blocks, sourceTypeId = "minecraft:creeper", dimensionId = "minecraft:overworld") {
  control.spawned = [];
  control.removed = 0;
  control.pendingRuns = [];
  control.jobs = [];
  // Each blast is its own tick, so the pack's tick-scoped ledgers start clean.
  system.currentTick++;

  const dimension = {
    id: dimensionId,
    getBlock: (loc) => blocks.find((b) => b.location.x === loc.x),
    spawnItem: (stack, at) =>
      control.spawned.push({ typeId: stack.typeId, data: stack.data, amount: stack.amount, x: Math.floor(at.x) }),
    playSound() {}, spawnParticle() {},
  };

  let impacted = blocks;
  hooks.explosionBefore({
    source: { typeId: sourceTypeId, hasComponent: () => false, location: { x: 0, y: 0, z: 0 } },
    dimension,
    getImpactedBlocks: () => impacted,
    setImpactedBlocks: (a) => { impacted = a; },
    cancel: false,
  });

  control.impacted = impacted;

  // P2 runs same-tick, P3 is a job drained over ticks.
  while (control.pendingRuns.length) control.pendingRuns.shift()();
  for (const job of control.jobs) { while (!job.next().done) { /* tick */ } }

  return control.spawned;
}

/**
 * Deliver one entityHurt before-event as the pack would see it, IGNORING the
 * subscription filters, and report whether the pack cancelled it. Returns
 * undefined when the pack never subscribed.
 */
export function hurt(entityTypeId, cause) {
  if (!hooks.entityHurtBefore) return undefined;
  const ev = {
    hurtEntity: { typeId: entityTypeId },
    damageSource: { cause },
    damage: 5,
    cancel: false,
  };
  hooks.entityHurtBefore(ev);
  return ev.cancel;
}
