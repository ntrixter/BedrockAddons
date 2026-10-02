import { ItemStack, world } from "@minecraft/server";

/**
 * Bottles of XP: trade Bottles o' Enchanting for raw experience at a crafting
 * table, and back again, at a fixed 7 XP a bottle.
 *
 * A crafting recipe can turn one item into another, but it cannot add or take
 * experience, and the stable script API has no "player crafted" event to do it
 * from - PlayerCraftRecipeAfterEvent exists only in the 26.60 preview, as beta.
 *
 * So each recipe makes a placeholder that looks like what you are buying, and
 * this script settles it the moment it reaches a player's inventory:
 *
 *   Bottle o' Enchanting -> "Glass Bottle (+7 XP)"         -> glass bottle, +7 XP
 *   glass bottle         -> "Bottle o' Enchanting (-7 XP)" -> XP bottle, -7 XP,
 *                                                            or the glass bottle back
 *
 * The placeholder is the receipt. Crafting makes one from a real bottle, and
 * settling consumes it, so nothing is ever paid twice or paid for nothing.
 *
 * Only a player's inventory settles one. Dropped from the cursor, or found in a
 * chest a Crafter filled, it turns back into the bottle it was made from, so a
 * placeholder cannot be thrown at someone, or left in a chest for them, to bill
 * them for it. One clicked into a bundle is out of reach, and settles with
 * whoever takes it out.
 *
 * Nine bottles also pack into one gilded blackstone, and back, while the world's
 * "Gilded blackstone storage" setting is on. Those recipes make placeholders too,
 * for a different reason: a pack cannot add or remove a recipe while the world
 * runs, so the setting is applied as the crafted item lands - packed or unpacked
 * if storage is on, handed back if it is off. No XP moves either way.
 *
 *   9 Bottles o' Enchanting -> "Gilded Blackstone (9 Bottles o' Enchanting)"
 *   gilded blackstone       -> "9 Bottles o' Enchanting"
 */

const XP_PER_BOTTLE = 7;
const BOTTLES_PER_BLOCK = 9;

// Every item this pack hands out stacks to 64. new ItemStack clamps a larger
// amount to that without a word, so bigger counts go out as several stacks.
const FULL_STACK = 64;

// Set true for a test build: a "[debug]" chat line with the raw numbers the
// game reports whenever XP moves, so an in-game test shows what the XP API
// really returned.
const DEBUG = false;

const GLASS_BOTTLE = "minecraft:glass_bottle";
const XP_BOTTLE = "minecraft:experience_bottle";
const GILDED_BLACKSTONE = "minecraft:gilded_blackstone";
const PENDING_GLASS_BOTTLE = "bottlesofxp:pending_glass_bottle";
const PENDING_XP_BOTTLE = "bottlesofxp:pending_experience_bottle";
const PENDING_GILDED_BLACKSTONE = "bottlesofxp:pending_gilded_blackstone";
const PENDING_BOTTLES = "bottlesofxp:pending_bottles";

// The world's "Gilded blackstone storage" setting, read when the world loads:
// the stable API has no event for a change. The default matches the manifest's.
const STORAGE_SETTING = "bottlesofxp:gilded_storage";
const STORAGE_DEFAULT = true;
let storageOn = STORAGE_DEFAULT;

/**
 * What each placeholder was crafted from, and how many of it: what it turns back
 * into if it never reaches an inventory, or if storage is off.
 */
const INGREDIENT = new Map([
  [PENDING_GLASS_BOTTLE, { item: XP_BOTTLE, per: 1 }],
  [PENDING_XP_BOTTLE, { item: GLASS_BOTTLE, per: 1 }],
  [PENDING_GILDED_BLACKSTONE, { item: XP_BOTTLE, per: BOTTLES_PER_BLOCK }],
  [PENDING_BOTTLES, { item: GILDED_BLACKSTONE, per: 1 }],
]);

/** What the storage placeholders become while storage is on. */
const STORED = new Map([
  [PENDING_GILDED_BLACKSTONE, { item: GILDED_BLACKSTONE, per: 1 }],
  [PENDING_BOTTLES, { item: XP_BOTTLE, per: BOTTLES_PER_BLOCK }],
]);

/** Points needed to go from `level` to `level + 1`, on vanilla's experience curve. */
function levelCost(level) {
  if (level < 16) return 2 * level + 7;
  if (level < 31) return 5 * level - 38;
  return 9 * level - 158;
}

/** Points needed to reach the start of `level` from nothing. */
function pointsToReach(level) {
  let total = 0;
  for (let l = 0; l < level; l++) total += levelCost(l);
  return total;
}

/** The level a player with `points` total experience is on. */
function levelFor(points) {
  let level = 0;
  for (let left = points; left >= levelCost(level); level++) left -= levelCost(level);
  return level;
}

/**
 * The player's total experience in points, or undefined if the game's numbers
 * do not fit vanilla's curve - in which case nothing is charged.
 *
 * Worked out from level and progress and checked against the game's own bar
 * size, so a change to the curve stops the pack rather than mischarging. In
 * game it has agreed with getTotalXp() every time.
 */
function totalXp(player) {
  const level = player.level;
  const into = Math.round(player.xpEarnedAtCurrentLevel);
  const bar = player.totalXpNeededForNextLevel;
  const cost = levelCost(level);
  // The game's own bar size cross-checks the curve. Either reading of it fits:
  // the size of this level, or the running total up to the next one.
  if (bar !== cost && bar !== pointsToReach(level + 1)) return undefined;
  if (!(into >= 0 && into <= cost)) return undefined;
  return pointsToReach(level) + into;
}

/**
 * Move the player to exactly `points` total experience.
 *
 * Never subtracts across a level boundary - negative addExperience is reported
 * to stop at the bottom of the current level. Instead it empties the current
 * bar, changes whole levels, then fills part of the new bar.
 */
function setTotalXp(player, points) {
  const level = levelFor(points);
  const into = points - pointsToReach(level);
  const current = Math.round(player.xpEarnedAtCurrentLevel);
  if (current > 0) player.addExperience(-current);
  if (level !== player.level) player.addLevels(level - player.level);
  if (into > 0) player.addExperience(into);
}

/**
 * Take `points` from a player who has `before`. True only if the game ended up
 * exactly that much lower; otherwise whatever was taken goes back, and false.
 */
function charge(player, before, points) {
  const target = before - points;
  setTotalXp(player, target);
  const after = totalXp(player);
  if (DEBUG) player.sendMessage(`[debug] charge ${points}: ${before} -> ${after}, wanted ${target}. ${describe(player)}`);
  if (after === target) return true;
  // Put back whatever moved. Adding is the direction known to work; an
  // overshoot is taken back off, which works while it stays inside the bar.
  if (after !== undefined && after < before) player.addExperience(before - after);
  if (after !== undefined && after > before) player.addExperience(before - after);
  return false;
}

/** What the game itself reports, for the debug lines. */
function describe(player) {
  let reported;
  try {
    reported = player.getTotalXp();
  } catch {
    reported = "threw";
  }
  return `Game says: level ${player.level}, ${player.xpEarnedAtCurrentLevel}/${player.totalXpNeededForNextLevel} into it, getTotalXp() ${reported}.`;
}

/**
 * Swap every placeholder in this player's inventory for what it stands for.
 *
 * Scans the whole inventory instead of trusting the event's slot: one
 * shift-click can land a crafted stack across several slots, and a sweep that
 * finds nothing to do is harmless.
 */
function settle(player) {
  if (!player.isValid) return;
  const container = player.getComponent("minecraft:inventory")?.container;
  if (!container) return;

  // Pay out first, so XP from emptying bottles can buy bottles in the same sweep.
  let paidOut = 0;
  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (item?.typeId !== PENDING_GLASS_BOTTLE) continue;
    // The placeholder goes first: once it is gone it can never be settled twice.
    container.setItem(slot, new ItemStack(GLASS_BOTTLE, item.amount));
    player.addExperience(XP_PER_BOTTLE * item.amount);
    paidOut += XP_PER_BOTTLE * item.amount;
  }
  if (DEBUG && paidOut > 0) player.sendMessage(`[debug] paid out ${paidOut}, now ${totalXp(player)}. ${describe(player)}`);

  let returned = 0;
  let unreadable = false;
  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (item?.typeId !== PENDING_XP_BOTTLE) continue;

    const before = totalXp(player);
    if (before === undefined) unreadable = true;
    const paid = before === undefined ? 0 : Math.min(item.amount, Math.floor(before / XP_PER_BOTTLE));
    const unpaid = item.amount - paid;

    // Whichever part is non-empty takes the placeholder's own slot, so a full
    // inventory always has room for at least that part.
    container.setItem(
      slot,
      paid > 0 ? new ItemStack(XP_BOTTLE, paid) : new ItemStack(GLASS_BOTTLE, unpaid),
    );
    if (paid > 0 && !charge(player, before, XP_PER_BOTTLE * paid)) {
      // The XP could not be taken, so the bottles go back to glass and nothing is owed.
      container.setItem(slot, new ItemStack(GLASS_BOTTLE, paid));
      returned += paid;
      unreadable = true;
    }
    if (paid > 0 && unpaid > 0) giveBack(player, container, new ItemStack(GLASS_BOTTLE, unpaid));
    returned += unpaid;
  }

  if (returned > 0) {
    const bottles = returned === 1 ? "1 glass bottle" : `${returned} glass bottles`;
    player.sendMessage(
      unreadable
        ? `Bottles of XP could not read or take your XP, so nothing was charged: ${bottles} returned.`
        : `Not enough XP: ${bottles} returned. You have ${totalXp(player)} XP, and each Bottle o' Enchanting costs ${XP_PER_BOTTLE}.`,
    );
    if (DEBUG) player.sendMessage(`[debug] ${describe(player)}`);
  }

  // Gilded blackstone storage: each placeholder becomes what it makes, or with
  // storage off goes back to what it was made from.
  const handedBack = new Map();
  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (!STORED.has(item?.typeId)) continue;
    const { item: id, per } = (storageOn ? STORED : INGREDIENT).get(item.typeId);
    replaceInSlot(container, slot, id, item.amount * per, (stack) => player.dimension.spawnItem(stack, player.location));
    if (!storageOn) handedBack.set(id, (handedBack.get(id) ?? 0) + item.amount * per);
  }
  for (const [id, count] of handedBack) {
    player.sendMessage(`Gilded blackstone storage is turned off on this world: ${countOf(id, count)} returned.`);
  }
}

/** "1 Bottle o' Enchanting", "9 Bottles o' Enchanting", "2 gilded blackstone". */
function countOf(item, n) {
  if (item === XP_BOTTLE) return n === 1 ? "1 Bottle o' Enchanting" : `${n} Bottles o' Enchanting`;
  return `${n} gilded blackstone`;
}

/** Back into the inventory; whatever does not fit lands at the player's feet. Never deleted. */
function giveBack(player, container, stack) {
  const leftover = container.addItem(stack);
  if (leftover) player.dimension.spawnItem(leftover, player.location);
}

/** `count` of `item`, as stacks of at most a full one each. */
function stacksOf(item, count) {
  const stacks = [];
  for (let left = count; left > 0; left -= FULL_STACK) stacks.push(new ItemStack(item, Math.min(left, FULL_STACK)));
  return stacks;
}

/**
 * Swap the stack in `slot` for `count` of `item`. The slot takes the first full
 * stack, the rest of the container whatever it can, and `spill` anything still
 * left over. Never deleted.
 */
function replaceInSlot(container, slot, item, count, spill) {
  const [first, ...rest] = stacksOf(item, count);
  container.setItem(slot, first);
  for (const stack of rest) {
    const leftover = container.addItem(stack);
    if (leftover) spill(leftover);
  }
}

/**
 * Turn every placeholder in a container back into what it was crafted from;
 * whatever no longer fits goes to `spill`. No XP moves either way.
 */
function revertIn(container, spill) {
  if (!container) return;
  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    const back = INGREDIENT.get(item?.typeId);
    if (back) replaceInSlot(container, slot, back.item, item.amount * back.per, spill);
  }
}

// Ids of placeholders already turned back. One item can be reported more than
// once - a chunk load by both entityLoad and entitySpawn - and the game may not
// count it gone until the tick ends. The reports arrive together, so only recent
// ids need keeping.
const turnedBack = new Set();

/**
 * A placeholder on the ground turns back into what it was crafted from, where
 * it lies and still moving the way it was thrown. No XP moves either way.
 */
function revertDropped(entity) {
  if (!entity.isValid || entity.typeId !== "minecraft:item" || turnedBack.has(entity.id)) return;
  const stack = entity.getComponent("minecraft:item")?.itemStack;
  const back = INGREDIENT.get(stack?.typeId);
  if (!back) return;

  if (turnedBack.size >= 1000) turnedBack.clear();
  turnedBack.add(entity.id);
  const { dimension, location } = entity;
  const velocity = entity.getVelocity();
  // The placeholder goes before anything replaces it: if something fails between
  // the two, nothing is doubled.
  entity.remove();
  for (const each of stacksOf(back.item, stack.amount * back.per)) {
    const replacement = dimension.spawnItem(each, location);
    try {
      replacement.clearVelocity();
      replacement.applyImpulse(velocity);
    } catch {
      // Only the throw is lost; the item itself is already back.
    }
  }
}

/** The world's storage setting; anything but a real true or false means the default. */
function readStorageSetting() {
  try {
    const value = world.getPackSettings()[STORAGE_SETTING];
    return typeof value === "boolean" ? value : STORAGE_DEFAULT;
  } catch {
    return STORAGE_DEFAULT; // the engine supplied no pack settings
  }
}

world.afterEvents.worldLoad.subscribe(() => {
  storageOn = readStorageSetting();
});

world.afterEvents.playerInventoryItemChange.subscribe((event) => settle(event.player), {
  includeItems: [...INGREDIENT.keys()],
});

// A placeholder can reach an inventory while nothing is listening - the pack
// switched off and back on, say. Settle everyone as they spawn.
world.afterEvents.playerSpawn.subscribe((event) => settle(event.player));

// Dropped from the cursor: the craft is called off. One left on the ground while
// the script was not running turns back as its chunk loads.
world.afterEvents.entitySpawn.subscribe((event) => revertDropped(event.entity));
world.afterEvents.entityLoad.subscribe((event) => revertDropped(event.entity));

// A Crafter can fill a chest with placeholders. Whoever opens it finds the
// bottles they were made from, and is not charged for taking them.
world.afterEvents.blockContainerOpened.subscribe((event) => {
  const { block } = event;
  revertIn(block.getComponent("minecraft:inventory")?.container, (stack) =>
    block.dimension.spawnItem(stack, { x: block.x + 0.5, y: block.y + 1, z: block.z + 0.5 }),
  );
});
world.afterEvents.entityContainerOpened.subscribe((event) => {
  const { entity } = event;
  // A player's own inventory settles its placeholders; it never turns them back.
  if (!entity.isValid || entity.typeId === "minecraft:player") return;
  revertIn(entity.getComponent("minecraft:inventory")?.container, (stack) =>
    entity.dimension.spawnItem(stack, entity.location),
  );
});
