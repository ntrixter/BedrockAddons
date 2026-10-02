// Mock of the bits of @minecraft/server that XP Bottling touches: two event
// signals, ItemStack, a player inventory and the player's experience.
//
// Experience is modelled the way Bedrock stores it - a level plus progress into
// that level - because that is where the pack's first in-game test broke.
//
// Where the engine's behaviour is NOT established, the mock is switchable
// rather than opinionated, and the suite runs under every combination. The
// first build trusted a guess about getTotalXp() and every glass bottle came
// straight back.

export const control = {
  /**
   * What getTotalXp() returns. "total" is what its documentation says. "level"
   * - points into the current level only - reproduces the first in-game test,
   * where a player holding XP was refunded as though they had under 7.
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
};

export const hooks = { inventoryChange: null, inventoryChangeOptions: null, spawn: null };

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

/** A player with `points` total experience and a 36-slot inventory (0-8 hotbar). */
export function makePlayer(points = 0) {
  const container = new Container(36);
  const [level, into] = fromTotal(points);
  const player = {
    isValid: true,
    location: { x: 0, y: 64, z: 0 },
    messages: [],
    dropped: [],
    container,
    lvl: level,
    pts: into,
    getComponent: (id) => (id === "minecraft:inventory" ? { container } : undefined),

    /** Ground truth, for the tests - not part of the API. */
    trueTotal() { return cumulative(this.lvl) + this.pts; },

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
  player.dimension = { spawnItem: (stack, at) => player.dropped.push({ ...stack.clone(), at }) };
  return player;
}

export const world = {
  afterEvents: {
    playerInventoryItemChange: {
      subscribe(fn, options) { hooks.inventoryChange = fn; hooks.inventoryChangeOptions = options; },
    },
    playerSpawn: { subscribe(fn) { hooks.spawn = fn; } },
  },
};
