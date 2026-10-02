import { ItemStack, world } from "@minecraft/server";

/**
 * XP Bottling: trade Bottles o' Enchanting for raw experience at a crafting
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
 */

const XP_PER_BOTTLE = 7;

const GLASS_BOTTLE = "minecraft:glass_bottle";
const XP_BOTTLE = "minecraft:experience_bottle";
const PENDING_GLASS_BOTTLE = "xpbottling:pending_glass_bottle";
const PENDING_XP_BOTTLE = "xpbottling:pending_experience_bottle";

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
  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (item?.typeId !== PENDING_GLASS_BOTTLE) continue;
    // The placeholder goes first: once it is gone it can never be settled twice.
    container.setItem(slot, new ItemStack(GLASS_BOTTLE, item.amount));
    player.addExperience(XP_PER_BOTTLE * item.amount);
  }

  let returned = 0;
  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (item?.typeId !== PENDING_XP_BOTTLE) continue;

    const paid = Math.min(item.amount, Math.floor(player.getTotalXp() / XP_PER_BOTTLE));
    const unpaid = item.amount - paid;

    // Whichever part is non-empty takes the placeholder's own slot, so a full
    // inventory always has room for at least that part.
    container.setItem(
      slot,
      paid > 0 ? new ItemStack(XP_BOTTLE, paid) : new ItemStack(GLASS_BOTTLE, unpaid),
    );
    if (paid > 0) player.addExperience(-XP_PER_BOTTLE * paid);
    if (paid > 0 && unpaid > 0) giveBack(player, container, new ItemStack(GLASS_BOTTLE, unpaid));
    returned += unpaid;
  }

  if (returned > 0) {
    const bottles = returned === 1 ? "1 glass bottle" : `${returned} glass bottles`;
    player.sendMessage(`Not enough XP: ${bottles} returned. Each Bottle o' Enchanting costs ${XP_PER_BOTTLE} XP.`);
  }
}

/** Back into the inventory; whatever does not fit lands at the player's feet. Never deleted. */
function giveBack(player, container, stack) {
  const leftover = container.addItem(stack);
  if (leftover) player.dimension.spawnItem(leftover, player.location);
}

world.afterEvents.playerInventoryItemChange.subscribe((event) => settle(event.player), {
  includeItems: [PENDING_GLASS_BOTTLE, PENDING_XP_BOTTLE],
});

// A placeholder can reach an inventory while nothing is listening - the pack
// switched off and back on, say. Settle everyone as they spawn.
world.afterEvents.playerSpawn.subscribe((event) => settle(event.player));
