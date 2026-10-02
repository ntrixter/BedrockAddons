// XP Bottling test harness.
//
// Loads the shipping script against a mock of @minecraft/server (loader.js
// redirects the import) and drives its two event handlers directly:
//
//   cd xp-bottling/tests && node --import ./register.js run.js
//
// The first in-game test broke on experience: a player holding XP had every
// glass bottle refunded. The build had trusted a guess about getTotalXp(), and
// this suite had encoded the same guess, so it passed. Now every case runs
// under every combination of the engine behaviours that are NOT established -
// see `control` in mock-server.js - and the pack must give the exact same
// answer under all of them.
//
// It cannot check what only the game knows: that the event fires when a crafted
// item lands, that the placeholders borrow vanilla's icons, or how the crafting
// screen behaves. See "Testing in game" in the README.

import { control, hooks, makePlayer, ItemStack } from "@minecraft/server";
await import("../behavior_pack/scripts/main.js");

const GLASS = "minecraft:glass_bottle";
const XPB = "minecraft:experience_bottle";
const P_GLASS = "xpbottling:pending_glass_bottle";
const P_XPB = "xpbottling:pending_experience_bottle";

let failures = 0;

/** Fire the inventory event the way the game would after a stack lands in `slot`. */
function land(p, slot) {
  hooks.inventoryChange({ player: p, slot, inventoryType: slot < 9 ? "Hotbar" : "Inventory", itemStack: p.container.getItem(slot) });
}
const put = (p, slot, id, n) => p.container.setItem(slot, new ItemStack(id, n));
const count = (p, id) => p.container.slots.reduce((n, s) => n + (s?.typeId === id ? s.amount : 0), 0);
const dropped = (p, id) => p.dropped.filter((d) => d.typeId === id).reduce((n, d) => n + d.amount, 0);
/** What the player was told, without the test build's [debug] lines. */
const told = (p) => p.messages.filter((m) => !m.startsWith("[debug]"));

/** Every case; `check(label, actual, expected)` records the result. */
function cases(check) {
  {
    const p = makePlayer(0);
    put(p, 3, P_GLASS, 1); land(p, 3);
    check("empty one bottle: a glass bottle", count(p, GLASS), 1);
    check("empty one bottle: exactly +7 XP", p.trueTotal(), 7);
    const q = makePlayer(100);
    put(q, 20, P_GLASS, 64); land(q, 20);
    check("empty a stack of 64: +448 XP", [count(q, GLASS), q.trueTotal()], [64, 548]);
  }
  {
    // The first in-game report, step for step: empty a bottle, then buy one back.
    const p = makePlayer(0);
    put(p, 0, P_GLASS, 1); land(p, 0);
    put(p, 1, P_XPB, 1); land(p, 1);
    check("the reported case: buying back with the 7 XP just earned", [count(p, XPB), count(p, GLASS), p.trueTotal()], [1, 1, 0]);
    check("the reported case: no refund message", told(p).length, 0);
  }
  {
    const p = makePlayer(6);
    put(p, 0, P_XPB, 1); land(p, 0);
    check("6 XP: glass bottle back, XP untouched", [count(p, XPB), count(p, GLASS), p.trueTotal()], [0, 1, 6]);
    check("6 XP: told how much they have", told(p)[0], "Not enough XP: 1 glass bottle returned. You have 6 XP, and each Bottle o' Enchanting costs 7.");
  }
  {
    const p = makePlayer(35);
    put(p, 10, P_XPB, 64); land(p, 10);
    check("64 with 35 XP: 5 bought, 59 back, XP to 0", [count(p, XPB), count(p, GLASS), p.trueTotal(), p.dropped.length], [5, 59, 0, 0]);
  }
  {
    // Spending across many level boundaries, from deep in the curve.
    const p = makePlayer(1000);
    put(p, 4, P_XPB, 64); land(p, 4);
    check("64 bought at 1000 XP: exactly 448 taken", [count(p, XPB), p.trueTotal()], [64, 552]);
    const q = makePlayer(30); // level 3, 3 points into it
    put(q, 4, P_XPB, 1); land(q, 4);
    check("crossing one level boundary: 30 -> 23", [count(q, XPB), q.trueTotal()], [1, 23]);
  }
  {
    const p = makePlayer(35);
    for (let s = 0; s < 36; s++) put(p, s, "minecraft:cobblestone", 64);
    put(p, 5, P_XPB, 64); land(p, 5);
    check("full inventory: 5 bought in place, 59 dropped, cobblestone kept",
      [count(p, XPB), dropped(p, GLASS), count(p, "minecraft:cobblestone")], [5, 59, 35 * 64]);
  }
  {
    const p = makePlayer(0);
    put(p, 0, P_GLASS, 1); put(p, 1, P_XPB, 1);
    land(p, 1);
    check("payout before charge in one sweep", [count(p, GLASS), count(p, XPB), p.trueTotal()], [1, 1, 0]);
    land(p, 0); land(p, 1);
    check("firing again changes nothing", [count(p, GLASS), count(p, XPB), p.trueTotal(), told(p).length], [1, 1, 0, 0]);
  }
  {
    const p = makePlayer(14);
    put(p, 2, P_XPB, 3); put(p, 30, P_GLASS, 2);
    hooks.spawn({ player: p, initialSpawn: true });
    check("spawn sweep settles everything", [count(p, P_GLASS), count(p, P_XPB), count(p, GLASS), count(p, XPB), p.trueTotal()], [0, 0, 2, 3, 7]);
  }
  {
    const p = makePlayer(50);
    put(p, 0, P_GLASS, 3); p.isValid = false; land(p, 0);
    check("a player who has left is not touched", [count(p, P_GLASS), p.trueTotal()], [3, 50]);
  }
  {
    let seed = 20261002;
    const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    let broken = 0;
    for (let run = 0; run < 600; run++) {
      const x0 = rand(3000);
      const p = makePlayer(x0);
      let g = 0, b = 0, glass0 = 0, xpb0 = 0;
      for (let s = 0; s < 36; s++) {
        const roll = rand(10), n = 1 + rand(64);
        if (roll === 0) { put(p, s, P_GLASS, n); g += n; }
        else if (roll === 1) { put(p, s, P_XPB, n); b += n; }
        else if (roll === 2) { put(p, s, GLASS, n); glass0 += n; }
        else if (roll === 3) { put(p, s, XPB, n); xpb0 += n; }
        else if (roll < 8) put(p, s, "minecraft:dirt", n);
      }
      const dirt0 = count(p, "minecraft:dirt");
      try { land(p, 0); } catch { broken++; continue; }
      const paid = Math.min(b, Math.floor((x0 + 7 * g) / 7));
      const glassOut = count(p, GLASS) + dropped(p, GLASS) - glass0;
      const xpbOut = count(p, XPB) + dropped(p, XPB) - xpb0;
      const ok =
        count(p, P_GLASS) === 0 && count(p, P_XPB) === 0 &&
        glassOut === g + (b - paid) && xpbOut === paid &&
        p.trueTotal() === x0 + 7 * g - 7 * paid &&
        count(p, "minecraft:dirt") === dirt0 &&
        (told(p).length === 1) === (b - paid > 0);
      if (!ok) broken++;
    }
    check("600 random inventories: any item or XP point created or lost", broken, 0);
  }
}

console.log("\n0. The script listens only for its own two placeholders");
{
  const ok = JSON.stringify(hooks.inventoryChangeOptions?.includeItems) === JSON.stringify([P_GLASS, P_XPB]);
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  includeItems filter`);
}

console.log("\n1. Every case, under every combination of unestablished engine behaviour");
for (const totalXpMode of ["total", "level", "zero"]) {
  for (const negativeMode of ["crosses", "clamps"]) {
    for (const addLevelsMode of ["fraction", "points"]) {
      for (const barMode of ["cost", "cumulative"]) {
        Object.assign(control, { totalXpMode, negativeMode, addLevelsMode, barMode });
        const bad = [];
        let n = 0;
        cases((label, actual, expected) => {
          n++;
          if (JSON.stringify(actual) !== JSON.stringify(expected)) bad.push(`${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
        });
        failures += bad.length;
        const tag = `getTotalXp=${totalXpMode} subtract=${negativeMode} addLevels=${addLevelsMode} bar=${barMode}`;
        console.log(`  ${bad.length ? "FAIL" : "PASS"}  ${tag.padEnd(70)} ${n - bad.length}/${n}`);
        for (const line of bad) console.log(`          ${line}`);
      }
    }
  }
}

console.log("\n2. When the game does not behave at all, nothing is free and nothing is lost");
function failSafe(label, modes, setup) {
  Object.assign(control, { totalXpMode: "total", negativeMode: "crosses", addLevelsMode: "fraction", barMode: "cost" }, modes);
  const p = makePlayer(30);
  setup(p);
  land(p, 0);
  const got = [count(p, XPB), count(p, GLASS), p.trueTotal(), told(p).some((m) => m.startsWith("XP Bottling could not"))];
  const ok = JSON.stringify(got) === JSON.stringify([0, 3, 30, true]);
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(64)} [XP bottles, glass, XP, warned] = ${JSON.stringify(got)}`);
}
failSafe("bar size fits no known curve: refuse to charge", { barMode: "weird" }, (p) => put(p, 0, P_XPB, 3));
failSafe("negative addExperience ignored: undo, bottles back", { negativeMode: "ignored" }, (p) => put(p, 0, P_XPB, 3));
failSafe("addLevels ignored: undo, bottles back", { addLevelsMode: "ignored" }, (p) => put(p, 0, P_XPB, 3));

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
