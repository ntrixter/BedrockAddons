// Mock of the bits of @minecraft/server that XP Bottling touches: two event
// signals, ItemStack, a player inventory and the player's raw experience.
//
// The container mirrors the game where the pack depends on it: getItem hands
// back a copy, addItem tops up matching stacks before using empty slots and
// returns what did not fit, and stacks hold 64.

export const hooks = { inventoryChange: null, inventoryChangeOptions: null, spawn: null };

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

/** A player with a 36-slot inventory (0-8 hotbar, 9-35 inventory). */
export function makePlayer(xp = 0) {
  const container = new Container(36);
  const player = {
    isValid: true,
    location: { x: 0, y: 64, z: 0 },
    xp,
    messages: [],
    dropped: [],
    container,
    getComponent: (id) => (id === "minecraft:inventory" ? { container } : undefined),
    getTotalXp() { return this.xp; },
    addExperience(amount) {
      // The real game would not go below zero; spending more than the player
      // has is a bug in the pack, so the mock refuses loudly.
      if (this.xp + amount < 0) throw new Error(`mock: XP would go negative (${this.xp} + ${amount})`);
      this.xp += amount;
      return this.xp;
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
