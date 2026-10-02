// Bottles of XP test harness.
//
// Loads the shipping script against a mock of @minecraft/server (loader.js
// redirects the import) and drives its event handlers directly:
//
//   cd bottles-of-xp/tests && node --import ./register.js run.js
//
// The first in-game test refunded every glass bottle, from a build this suite
// had passed while modelling the game one way only. Now every case runs under
// every combination of the engine behaviours that are NOT established - see
// `control` in mock-server.js - and the pack must give the exact same answer
// under all of them.
//
// The same goes for placeholders that never reach an inventory: what happens to
// one dropped from the cursor or found in a chest depends on entity behaviour
// that is not established either, so those cases run under every combination
// of that too.
//
// It cannot check what only the game knows: that the events fire when a crafted
// item lands or is dropped, that the placeholders borrow vanilla's icons, or how
// the crafting screen behaves. See "Testing in game" in the README.

import {
  control, hooks, makePlayer, ItemStack,
  makeDimension, makeContainer, makeBlock, makeEntity, dropItem, loadChunk,
  queue, endTick, discardPending, scriptErrors,
} from "@minecraft/server";
await import("../behavior_pack/scripts/main.js");

const GLASS = "minecraft:glass_bottle";
const XPB = "minecraft:experience_bottle";
const P_GLASS = "bottlesofxp:pending_glass_bottle";
const P_XPB = "bottlesofxp:pending_experience_bottle";

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
/** What lies on the ground in a dimension, as [item, amount]. */
const ground = (d) => d.items.map((e) => [e.stack.typeId, e.stack.amount]);
/** A container's non-empty slots, as { slot: [item, amount] }. */
const slotsOf = (c) => Object.fromEntries(c.slots.flatMap((s, i) => (s ? [[i, [s.typeId, s.amount]]] : [])));

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

/** Placeholders that never reach an inventory; `check` as above. */
function revertCases(check) {
  const at = { x: 3.5, y: 70.25, z: -8.75 };
  const thrown = { x: 0.31, y: 0.18, z: -0.27 };
  const pop = { x: 0.02, y: 0.2, z: -0.02 }; // what the mock's spawnItem gives an item of its own
  {
    // The reported exploit, step for step: craft "Bottle o' Enchanting (-7 XP)",
    // throw it from the cursor, and let someone else pick it up.
    discardPending();
    const other = makePlayer(100);
    const d = other.dimension;
    const placeholder = dropItem(d, new ItemStack(P_XPB, 3), at, thrown);
    endTick();
    check("thrown -7 XP placeholder: it is gone", placeholder.isValid, false);
    check("thrown -7 XP placeholder: 3 glass bottles where it was", d.items.map((e) => [e.stack.typeId, e.stack.amount, e.location]), [[GLASS, 3, at]]);
    check("thrown -7 XP placeholder: still flying as thrown", d.items[0]?.velocity, control.impulseMode === "works" ? thrown : pop);
    const [bottle] = d.items;
    other.container.setItem(0, bottle.stack);
    bottle.remove();
    land(other, 0);
    endTick();
    check("whoever picks it up: 3 glass bottles, XP untouched, nothing said",
      [count(other, GLASS), count(other, XPB), other.trueTotal(), told(other).length], [3, 0, 100, 0]);
  }
  {
    discardPending();
    const d = makeDimension();
    dropItem(d, new ItemStack(P_GLASS, 64), at, thrown);
    endTick();
    endTick(); // the bottle it became is reported too, and must be left alone
    check("thrown +7 XP placeholder: 64 Bottles o' Enchanting, left alone after", ground(d), [[XPB, 64]]);
  }
  {
    discardPending();
    const d = makeDimension();
    const dirt = dropItem(d, new ItemStack("minecraft:dirt", 5), at, thrown);
    endTick();
    check("an ordinary dropped item is not touched", [dirt.isValid, ground(d), dirt.velocity], [true, [["minecraft:dirt", 5]], thrown]);
  }
  {
    // Picked up, or despawned, before the event was delivered.
    discardPending();
    const d = makeDimension();
    const placeholder = dropItem(d, new ItemStack(P_XPB, 2), at, thrown);
    placeholder.finishRemoval();
    endTick();
    check("a placeholder already gone when the event arrives: no bottle", ground(d), []);
  }
  {
    // Left on the ground while the script was not running, and loaded with its chunk.
    discardPending();
    const d = makeDimension();
    loadChunk(d, [new ItemStack(P_XPB, 4)], at);
    endTick();
    endTick();
    check("a placeholder loaded with its chunk: exactly 4 glass bottles", ground(d), [[GLASS, 4]]);
  }
  {
    discardPending();
    const d = makeDimension();
    loadChunk(d, [new ItemStack(P_XPB, 4), new ItemStack(P_GLASS, 3)], at);
    endTick();
    endTick();
    check("two placeholders loaded together: 3 Bottles o' Enchanting and 4 glass bottles, no more",
      ground(d).sort(), [[XPB, 3], [GLASS, 4]]);
  }
  {
    // A mob spawning, which has no item to read.
    discardPending();
    queue("entitySpawn", { entity: makeEntity("minecraft:zombie"), cause: "Spawned" });
    endTick();
  }
  {
    // A chest a Crafter filled, opened by someone else.
    const chest = makeContainer(27);
    chest.setItem(0, new ItemStack(P_XPB, 5));
    chest.setItem(4, new ItemStack("minecraft:dirt", 12));
    chest.setItem(13, new ItemStack(GLASS, 3));
    chest.setItem(26, new ItemStack(P_GLASS, 64));
    const opener = makePlayer(50);
    queue("blockContainerOpened", { block: makeBlock(chest), dimension: opener.dimension, openSource: { entity: opener } });
    endTick();
    check("a chest's placeholders turn back in their slots",
      slotsOf(chest), { 0: [GLASS, 5], 4: ["minecraft:dirt", 12], 13: [GLASS, 3], 26: [XPB, 64] });
    check("opening it moves no XP", [opener.trueTotal(), told(opener).length], [50, 0]);
  }
  {
    // A crafting table: opened like a container, but it holds nothing.
    const opener = makePlayer(0);
    queue("blockContainerOpened", { block: makeBlock(undefined), dimension: opener.dimension, openSource: { entity: opener } });
    endTick();
  }
  {
    const cart = makeContainer(27);
    cart.setItem(3, new ItemStack(P_XPB, 2));
    const opener = makePlayer(0);
    queue("entityContainerOpened", { entity: makeEntity("minecraft:chest_minecart", cart), openSource: { entity: opener } });
    endTick();
    check("a chest minecart's placeholders turn back", slotsOf(cart), { 3: [GLASS, 2] });
  }
  {
    // Only a player's own inventory settles; it is never turned back.
    const p = makePlayer(50);
    put(p, 0, P_XPB, 1);
    queue("entityContainerOpened", { entity: p, openSource: { entity: p } });
    endTick();
    check("a player's own inventory is left to settle", [count(p, P_XPB), count(p, GLASS)], [1, 0]);
  }
  {
    // Gone by the time the event arrives - broken, say.
    const gone = makeEntity("minecraft:chest_minecart", makeContainer(27));
    gone.isValid = false;
    const opener = makePlayer(0);
    queue("entityContainerOpened", { entity: gone, openSource: { entity: opener } });
    endTick();
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
  const got = [count(p, XPB), count(p, GLASS), p.trueTotal(), told(p).some((m) => m.startsWith("Bottles of XP could not"))];
  const ok = JSON.stringify(got) === JSON.stringify([0, 3, 30, true]);
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(64)} [XP bottles, glass, XP, warned] = ${JSON.stringify(got)}`);
}
failSafe("bar size fits no known curve: refuse to charge", { barMode: "weird" }, (p) => put(p, 0, P_XPB, 3));
failSafe("negative addExperience ignored: undo, bottles back", { negativeMode: "ignored" }, (p) => put(p, 0, P_XPB, 3));
failSafe("addLevels ignored: undo, bottles back", { addLevelsMode: "ignored" }, (p) => put(p, 0, P_XPB, 3));

console.log("\n3. Placeholders that never reach an inventory turn back, under every combination of unestablished entity behaviour");
for (const removeMode of ["immediate", "deferred"]) {
  for (const spawnOnLoad of [false, true]) {
    for (const dropCause of ["Spawned", "Loaded"]) {
      for (const impulseMode of ["works", "throws"]) {
        Object.assign(control, { totalXpMode: "total", negativeMode: "crosses", addLevelsMode: "fraction", barMode: "cost" });
        Object.assign(control, { removeMode, spawnOnLoad, dropCause, impulseMode });
        const bad = [];
        let n = 0;
        revertCases((label, actual, expected) => {
          n++;
          if (JSON.stringify(actual) !== JSON.stringify(expected)) bad.push(`${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
        });
        // A handler that throws is a failure too, including the cases above that
        // only check nothing goes wrong.
        n++;
        const errors = scriptErrors.splice(0);
        if (errors.length) bad.push(`script errors: ${errors.join("; ")}`);
        failures += bad.length;
        const tag = `remove=${removeMode} spawnOnLoad=${spawnOnLoad} dropCause=${dropCause} impulse=${impulseMode}`;
        console.log(`  ${bad.length ? "FAIL" : "PASS"}  ${tag.padEnd(70)} ${n - bad.length}/${n}`);
        for (const line of bad) console.log(`          ${line}`);
      }
    }
  }
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
