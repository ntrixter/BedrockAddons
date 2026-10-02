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
 * The gilded blackstone storage recipes - nine bottles to one block and back -
 * make the real items and need nothing from this script.
 */

const XP_PER_BOTTLE = 7;

// Set true for a test build: a "[debug]" chat line with the raw numbers the
// game reports whenever XP moves, so an in-game test shows what the XP API
// really returned.
const DEBUG = false;

const GLASS_BOTTLE = "minecraft:glass_bottle";
const XP_BOTTLE = "minecraft:experience_bottle";
const PENDING_GLASS_BOTTLE = "bottlesofxp:pending_glass_bottle";
const PENDING_XP_BOTTLE = "bottlesofxp:pending_experience_bottle";

/** What each placeholder was crafted from, and turns back into if it never reaches an inventory. */
const INGREDIENT = new Map([
  [PENDING_GLASS_BOTTLE, XP_BOTTLE],
  [PENDING_XP_BOTTLE, GLASS_BOTTLE],
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
}

/** Back into the inventory; whatever does not fit lands at the player's feet. Never deleted. */
function giveBack(player, container, stack) {
  const leftover = container.addItem(stack);
  if (leftover) player.dimension.spawnItem(leftover, player.location);
}

/**
 * Turn every placeholder in a container back into what it was crafted from.
 * No XP moves either way.
 */
function revertIn(container) {
  if (!container) return;
  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    const ingredient = INGREDIENT.get(item?.typeId);
    if (ingredient) container.setItem(slot, new ItemStack(ingredient, item.amount));
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
  const ingredient = INGREDIENT.get(stack?.typeId);
  if (!ingredient) return;

  if (turnedBack.size >= 1000) turnedBack.clear();
  turnedBack.add(entity.id);
  const { dimension, location } = entity;
  const velocity = entity.getVelocity();
  // The placeholder goes before the bottle appears: if anything fails between
  // the two, nothing is doubled.
  entity.remove();
  const bottle = dimension.spawnItem(new ItemStack(ingredient, stack.amount), location);
  try {
    bottle.clearVelocity();
    bottle.applyImpulse(velocity);
  } catch {
    // Only the throw is lost; the bottle itself is already back.
  }
}

world.afterEvents.playerInventoryItemChange.subscribe((event) => settle(event.player), {
  includeItems: [PENDING_GLASS_BOTTLE, PENDING_XP_BOTTLE],
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
  revertIn(event.block.getComponent("minecraft:inventory")?.container);
});
world.afterEvents.entityContainerOpened.subscribe((event) => {
  // A player's own inventory settles its placeholders; it never turns them back.
  if (!event.entity.isValid || event.entity.typeId === "minecraft:player") return;
  revertIn(event.entity.getComponent("minecraft:inventory")?.container);
});
