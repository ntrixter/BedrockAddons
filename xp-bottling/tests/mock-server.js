// Mock of the bits of @minecraft/server that XP Bottling touches: the event
// signals, ItemStack, containers, item entities, and the player's experience.
//
// Experience is modelled the way Bedrock stores it - a level plus progress into
// that level - because that is where the pack's first in-game test broke.
//
// Where the engine's behaviour is NOT established, the mock is switchable
// rather than opinionated, and the suite runs under every combination. The
// first build passed against a mock that knew only one answer to each, then
// refunded every glass bottle in game.

export const control = {
  /**
   * What getTotalXp() returns. "total" is what its documentation says, and
   * what 1.0.1's debug lines showed in game. "level" - points into the current
   * level only - and "zero" are kept because the pack must not depend on it.
   */
  totalXpMode: "total",
  /**
   * addExperience with a negative amount. "crosses" level boundaries properly;
   * "clamps" stops at the bottom of the current level, as a Mojang bug report
   * describes; "ignored" does nothing at all.
   */
  negativeMode: "crosses",
  /** addLevels: keeps the "fraction" of the bar, keeps the "points", or is "ignored". */
  addLevelsMode: "fraction",
  /**
   * totalXpNeededForNextLevel: the "cost" of the current level, or the
   * "cumulative" total to reach the next; "weird" fits neither, which the pack
   * must refuse to do arithmetic on.
   */
  barMode: "cost",
  /**
   * Entity.remove(): "immediate" - the entity is invalid at once and removing
   * it again throws - or "deferred", gone only when the tick ends, with a second
   * remove() a silent no-op. Deferred is the case that could turn one dropped
   * placeholder into two bottles.
   */
  removeMode: "immediate",
  /** Whether entitySpawn also fires, with cause Loaded, for an entity entityLoad reports. */
  spawnOnLoad: false,
  /** The cause entitySpawn gives an item a player drops. Nothing says which, so the pack must not care. */
  dropCause: "Spawned",
  /** clearVelocity/applyImpulse on an item entity: "works", or "throws". */
  impulseMode: "works",
};

export const hooks = {
  inventoryChange: null,
  inventoryChangeOptions: null,
  spawn: null,
  entitySpawn: null,
  entityLoad: null,
  blockContainerOpened: null,
  entityContainerOpened: null,
};

export const EntityInitializationCause = {
  Born: "Born",
  Event: "Event",
  Loaded: "Loaded",
  Spawned: "Spawned",
  Transformed: "Transformed",
};

// The engine's curve. Deliberately written out here rather than imported, so a
// mistake in the pack's copy cannot hide itself.
export function cost(level) {
  if (level < 16) return 2 * level + 7;
  if (level < 31) return 5 * level - 38;
  return 9 * level - 158;
}
export function cumulative(level) {
  let total = 0;
  for (let l = 0; l < level; l++) total += cost(l);
  return total;
}
function fromTotal(total) {
  let level = 0;
  while (total >= cost(level)) total -= cost(level++);
  return [level, total];
}

export class ItemStack {
  constructor(typeId, amount = 1) {
    if (!Number.isInteger(amount) || amount < 1 || amount > 255) {
      throw new Error(`mock: ItemStack amount out of range: ${amount}`);
    }
    this.typeId = typeId;
    this.amount = amount;
    this.maxAmount = 64;
  }
  clone() { return new ItemStack(this.typeId, this.amount); }
  isStackableWith(other) { return other.typeId === this.typeId; }
}

class Container {
  constructor(size) {
    this.size = size;
    this.slots = new Array(size).fill(undefined);
  }
  getItem(slot) { return this.slots[slot]?.clone(); }
  setItem(slot, item) { this.slots[slot] = item?.clone(); }
  addItem(item) {
    let left = item.amount;
    for (let i = 0; i < this.size && left > 0; i++) {
      const s = this.slots[i];
      if (s && s.isStackableWith(item) && s.amount < s.maxAmount) {
        const n = Math.min(left, s.maxAmount - s.amount);
        s.amount += n;
        left -= n;
      }
    }
    for (let i = 0; i < this.size && left > 0; i++) {
      if (!this.slots[i]) {
        const n = Math.min(left, 64);
        this.slots[i] = new ItemStack(item.typeId, n);
        left -= n;
      }
    }
    return left > 0 ? new ItemStack(item.typeId, left) : undefined;
  }
}

export const makeContainer = (size) => new Container(size);

// After-events are not delivered as things happen but in a batch, later in the
// tick. endTick() delivers them, then completes any deferred removals. Like the
// game, it carries on past a handler that throws; the error lands in
// scriptErrors, where the suite counts it as a failure.
let pending = [];
let removing = [];
export const scriptErrors = [];

/** Queue an after-event for the next endTick(). */
export function queue(hook, event) {
  pending.push([hook, event]);
}

export function discardPending() {
  pending = [];
  removing = [];
}

export function endTick() {
  const batch = pending;
  pending = [];
  for (const [hook, event] of batch) {
    try {
      hooks[hook]?.(event);
    } catch (error) {
      scriptErrors.push(`${hook}: ${error.message}`);
    }
  }
  for (const entity of removing) entity.finishRemoval();
  removing = [];
}

/** A dimension that keeps the item entities lying in it, so a test can see what is on the ground. */
export function makeDimension() {
  const dimension = {
    items: [],
    spawnItem(stack, location) {
      // The engine gives a spawned item a small pop of its own.
      const entity = makeItemEntity(dimension, stack, location, { x: 0.02, y: 0.2, z: -0.02 });
      queue("entitySpawn", { entity, cause: EntityInitializationCause.Spawned });
      return entity;
    },
  };
  return dimension;
}

let nextId = 1;

/** An item lying in `dimension`. No event is queued; see dropItem and loadItem. */
export function makeItemEntity(dimension, stack, location, velocity) {
  let state = "live"; // live | removing | gone
  const entity = {
    id: String(-(nextId++)),
    typeId: "minecraft:item",
    dimension,
    location: { ...location },
    velocity: { ...velocity },
    stack: stack.clone(),
    get isValid() { return state !== "gone"; },
    getComponent(id) {
      if (state === "gone") throw new Error("mock: InvalidEntityError");
      return id === "minecraft:item" ? { itemStack: entity.stack.clone() } : undefined;
    },
    getVelocity() { return { ...entity.velocity }; },
    clearVelocity() {
      if (control.impulseMode === "throws") throw new Error("mock: clearVelocity unsupported");
      entity.velocity = { x: 0, y: 0, z: 0 };
    },
    applyImpulse(v) {
      if (control.impulseMode === "throws") throw new Error("mock: applyImpulse unsupported");
      entity.velocity = { x: entity.velocity.x + v.x, y: entity.velocity.y + v.y, z: entity.velocity.z + v.z };
    },
    remove() {
      if (state === "gone") throw new Error("mock: InvalidEntityError");
      if (control.removeMode === "immediate") return entity.finishRemoval();
      if (state === "live") {
        state = "removing";
        removing.push(entity);
      }
    },
    finishRemoval() {
      state = "gone";
      dimension.items = dimension.items.filter((e) => e !== entity);
    },
  };
  dimension.items.push(entity);
  return entity;
}

/** A player throwing `stack` from the cursor: a new item entity, reported by entitySpawn. */
export function dropItem(dimension, stack, location, velocity) {
  const entity = makeItemEntity(dimension, stack, location, velocity);
  queue("entitySpawn", { entity, cause: control.dropCause });
  return entity;
}

/**
 * Items already lying in a chunk as it loads: each reported by entityLoad, and
 * maybe by entitySpawn too - every entitySpawn first, so the two reports of one
 * item have others between them.
 */
export function loadChunk(dimension, stacks, location) {
  const entities = stacks.map((stack) => makeItemEntity(dimension, stack, location, { x: 0, y: 0, z: 0 }));
  if (control.spawnOnLoad) {
    for (const entity of entities) queue("entitySpawn", { entity, cause: EntityInitializationCause.Loaded });
  }
  for (const entity of entities) queue("entityLoad", { entity });
  return entities;
}

/** A block, with a container if it has one. */
export function makeBlock(container) {
  return { getComponent: (id) => (id === "minecraft:inventory" && container ? { container } : undefined) };
}

/** A non-player entity, with a container if it has one: a chest minecart, a donkey. */
export function makeEntity(typeId, container) {
  const entity = {
    id: String(-(nextId++)),
    typeId,
    isValid: true,
    getComponent(id) {
      if (!entity.isValid) throw new Error("mock: InvalidEntityError");
      return id === "minecraft:inventory" && container ? { container } : undefined;
    },
  };
  return entity;
}

/** A player with `points` total experience and a 36-slot inventory (0-8 hotbar). */
export function makePlayer(points = 0) {
  const container = new Container(36);
  const dimension = makeDimension();
  const [level, into] = fromTotal(points);
  const player = {
    typeId: "minecraft:player",
    isValid: true,
    location: { x: 0, y: 64, z: 0 },
    messages: [],
    container,
    dimension,
    lvl: level,
    pts: into,
    getComponent: (id) => (id === "minecraft:inventory" ? { container } : undefined),

    /** Ground truth, for the tests - not part of the API. */
    trueTotal() { return cumulative(this.lvl) + this.pts; },
    /** What lies on the ground in the player's dimension - not part of the API. */
    get dropped() { return dimension.items.map((e) => e.stack); },

    get level() { return this.lvl; },
    get xpEarnedAtCurrentLevel() { return this.pts; },
    get totalXpNeededForNextLevel() {
      if (control.barMode === "cost") return cost(this.lvl);
      if (control.barMode === "cumulative") return cumulative(this.lvl + 1);
      return cost(this.lvl) + 3;
    },
    getTotalXp() {
      if (control.totalXpMode === "level") return this.pts;
      if (control.totalXpMode === "zero") return 0;
      return this.trueTotal();
    },
    addExperience(amount) {
      if (amount >= 0) {
        this.pts += amount;
        while (this.pts >= cost(this.lvl)) this.pts -= cost(this.lvl++);
      } else if (control.negativeMode === "crosses") {
        [this.lvl, this.pts] = fromTotal(Math.max(0, this.trueTotal() + amount));
      } else if (control.negativeMode === "clamps") {
        this.pts = Math.max(0, this.pts + amount);
      }
      return this.trueTotal();
    },
    addLevels(amount) {
      if (control.addLevelsMode === "ignored") return this.lvl;
      const next = Math.max(0, this.lvl + amount);
      this.pts = control.addLevelsMode === "fraction"
        ? Math.floor((this.pts / cost(this.lvl)) * cost(next))
        : Math.min(this.pts, cost(next) - 1);
      this.lvl = next;
      return this.lvl;
    },
    sendMessage(text) { this.messages.push(text); },
  };
  return player;
}

export const world = {
  afterEvents: {
    playerInventoryItemChange: {
      subscribe(fn, options) { hooks.inventoryChange = fn; hooks.inventoryChangeOptions = options; },
    },
    playerSpawn: { subscribe(fn) { hooks.spawn = fn; } },
    entitySpawn: { subscribe(fn) { hooks.entitySpawn = fn; } },
    entityLoad: { subscribe(fn) { hooks.entityLoad = fn; } },
    blockContainerOpened: { subscribe(fn) { hooks.blockContainerOpened = fn; } },
    entityContainerOpened: { subscribe(fn) { hooks.entityContainerOpened = fn; } },
  },
};
