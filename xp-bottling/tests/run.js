// XP Bottling test harness.
//
// Loads the shipping script against a mock of @minecraft/server (loader.js
// redirects the import) and drives its two event handlers directly:
//
//   cd xp-bottling/tests && node --import ./register.js run.js
//
// It checks the pack's own arithmetic and bookkeeping. It cannot check what only
// the game knows: that the event fires when a crafted item lands, that the
// placeholders borrow vanilla's icons, or how the crafting screen behaves. See
// "Testing in game" in the README.

import { hooks, makePlayer, ItemStack } from "@minecraft/server";
await import("../behavior_pack/scripts/main.js");

const GLASS = "minecraft:glass_bottle";
const XPB = "minecraft:experience_bottle";
const P_GLASS = "xpbottling:pending_glass_bottle";
const P_XPB = "xpbottling:pending_experience_bottle";

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: got ${JSON.stringify(actual)}${ok ? "" : `, want ${JSON.stringify(expected)}`}`);
}

/** Fire the inventory event the way the game would after a stack lands in `slot`. */
function land(player, slot) {
  hooks.inventoryChange({ player, slot, inventoryType: slot < 9 ? "Hotbar" : "Inventory", itemStack: player.container.getItem(slot) });
}
function put(player, slot, typeId, amount) { player.container.setItem(slot, new ItemStack(typeId, amount)); }
function count(player, typeId) {
  return player.container.slots.reduce((n, s) => n + (s?.typeId === typeId ? s.amount : 0), 0);
}
const dropped = (player, typeId) => player.dropped.filter((d) => d.typeId === typeId).reduce((n, d) => n + d.amount, 0);

console.log("\n0. The script listens only for its own two placeholders");
check("includeItems filter", hooks.inventoryChangeOptions?.includeItems, [P_GLASS, P_XPB]);

console.log("\n1. Bottle o' Enchanting -> glass bottle + 7 XP");
{
  const p = makePlayer(0);
  put(p, 3, P_GLASS, 1); land(p, 3);
  check("one placeholder becomes one glass bottle", count(p, GLASS), 1);
  check("+7 XP", p.xp, 7);
  check("no placeholder left", count(p, P_GLASS), 0);

  const q = makePlayer(100);
  put(q, 20, P_GLASS, 64); land(q, 20);
  check("a shift-clicked stack of 64: 64 glass bottles", count(q, GLASS), 64);
  check("+448 XP", q.xp, 548);
}

console.log("\n2. Glass bottle -> Bottle o' Enchanting, paid in XP");
{
  const p = makePlayer(7);
  put(p, 0, P_XPB, 1); land(p, 0);
  check("exactly 7 XP buys one bottle", count(p, XPB), 1);
  check("XP left", p.xp, 0);
  check("no message when paid in full", p.messages.length, 0);

  const q = makePlayer(6);
  put(q, 0, P_XPB, 1); land(q, 0);
  check("6 XP: no XP bottle", count(q, XPB), 0);
  check("6 XP: glass bottle returned", count(q, GLASS), 1);
  check("6 XP: XP untouched", q.xp, 6);
  check("6 XP: told why", q.messages.length, 1);

  const r = makePlayer(35);
  put(r, 10, P_XPB, 64); land(r, 10);
  check("64 with 35 XP: 5 XP bottles", count(r, XPB), 5);
  check("64 with 35 XP: 59 glass bottles back", count(r, GLASS), 59);
  check("64 with 35 XP: XP spent to 0", r.xp, 0);
  check("64 with 35 XP: nothing dropped", r.dropped.length, 0);
  check("message names the count", r.messages[0], "Not enough XP: 59 glass bottles returned. Each Bottle o' Enchanting costs 7 XP.");
}

console.log("\n3. A partial refund that does not fit is dropped, never deleted");
{
  const p = makePlayer(35);
  for (let s = 0; s < 36; s++) put(p, s, "minecraft:cobblestone", 64);
  put(p, 5, P_XPB, 64); land(p, 5);
  check("full inventory: 5 XP bottles in the placeholder's slot", count(p, XPB), 5);
  check("full inventory: 59 glass bottles at the player's feet", dropped(p, GLASS), 59);
  check("cobblestone untouched", count(p, "minecraft:cobblestone"), 35 * 64);

  const q = makePlayer(35);
  for (let s = 0; s < 36; s++) put(q, s, "minecraft:cobblestone", 64);
  put(q, 1, GLASS, 10);
  put(q, 5, P_XPB, 64); land(q, 5);
  check("a part-filled glass stack absorbs what it can", count(q, GLASS), 64);
  check("and only the rest is dropped", dropped(q, GLASS), 5);

  const r = makePlayer(0);
  for (let s = 0; s < 36; s++) put(r, s, "minecraft:cobblestone", 64);
  put(r, 7, P_XPB, 64); land(r, 7);
  check("0 XP and full: the refund takes the placeholder's own slot", count(r, GLASS), 64);
  check("0 XP and full: nothing needs dropping", r.dropped.length, 0);
}

console.log("\n4. Order, idempotence and the spawn sweep");
{
  const p = makePlayer(0);
  put(p, 0, P_GLASS, 1);
  put(p, 1, P_XPB, 1);
  land(p, 1);
  check("payout before charge: the 7 XP just earned buys the bottle", [count(p, GLASS), count(p, XPB), p.xp], [1, 1, 0]);
  land(p, 0); land(p, 1);
  check("firing again changes nothing", [count(p, GLASS), count(p, XPB), p.xp, p.messages.length], [1, 1, 0, 0]);

  const q = makePlayer(14);
  put(q, 2, P_XPB, 3); put(q, 30, P_GLASS, 2);
  hooks.spawn({ player: q, initialSpawn: true });
  check("placeholders present at spawn are settled", [count(q, P_GLASS), count(q, P_XPB)], [0, 0]);
  check("spawn sweep: the payout (+14 XP) lets all 3 bottles be bought", [count(q, GLASS), count(q, XPB), q.xp], [2, 3, 14 + 14 - 21]);

  const gone = makePlayer(50);
  put(gone, 0, P_GLASS, 3); gone.isValid = false; land(gone, 0);
  check("a player who has left is not touched", [count(gone, P_GLASS), gone.xp], [3, 50]);
}

console.log("\n5. Conservation over 5,000 random inventories");
{
  // Deterministic LCG, so a failure reproduces.
  let seed = 20261002;
  const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  let broken = 0;
  for (let run = 0; run < 5000; run++) {
    const x0 = rand(500);
    const p = makePlayer(x0);
    let g = 0, b = 0, glass0 = 0, xpb0 = 0;
    for (let s = 0; s < 36; s++) {
      const roll = rand(10);
      const n = 1 + rand(64);
      if (roll === 0) { put(p, s, P_GLASS, n); g += n; }
      else if (roll === 1) { put(p, s, P_XPB, n); b += n; }
      else if (roll === 2) { put(p, s, GLASS, n); glass0 += n; }
      else if (roll === 3) { put(p, s, XPB, n); xpb0 += n; }
      else if (roll < 8) put(p, s, "minecraft:dirt", n);
    }
    const others0 = count(p, "minecraft:dirt");
    try { land(p, 0); } catch (e) { broken++; continue; }

    const paid = Math.min(b, Math.floor((x0 + 7 * g) / 7));
    const glassOut = count(p, GLASS) + dropped(p, GLASS) - glass0;
    const xpbOut = count(p, XPB) + dropped(p, XPB) - xpb0;
    const ok =
      count(p, P_GLASS) === 0 && count(p, P_XPB) === 0 &&
      glassOut === g + (b - paid) &&
      xpbOut === paid &&
      glassOut + xpbOut === g + b &&
      p.xp === x0 + 7 * g - 7 * paid && p.xp >= 0 &&
      count(p, "minecraft:dirt") === others0 &&
      (p.messages.length === 1) === (b - paid > 0);
    if (!ok) broken++;
  }
  check("random inventories where any item or XP point was created or lost", broken, 0);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
