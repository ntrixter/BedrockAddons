// Creeper Drop All test harness.
//
// Runs the shipping pack scripts against a mock of @minecraft/server, driving a
// fake explosion so the drop rules can be checked without launching Minecraft.
// loader.js redirects the pack's "@minecraft/server" imports to mock-server.js,
// so the shipping scripts load unmodified with no install step.
//
//   cd creeper-drop-all/tests && node --import ./register.js run.js
//
// It cannot verify anything that depends on the real game: what the engine's
// loot tables actually return, whether an explosion keeps its damage, or how a
// blast looks. See TESTING.md for the in-game matrix.
//
// Two bugs reached a player before this existed, both of the same shape - a
// guess about engine behaviour, written into the pack and never exercised. So
// where the engine's behaviour is not established, the suite runs under EVERY
// possibility rather than the one that seemed likely. See control.bedLootHalves.

import { control, hooks, makeBlock, detonate } from "@minecraft/server";

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: got ${actual}${ok ? "" : `, want ${expected}`}`);
}

/** Load a fresh copy of the pack so module state does not leak between cases. */
let generation = 0;
async function load(packSettings = {}) {
  control.packSettings = packSettings;
  control.itemStackFailures = new Set();
  await import(`../behavior_pack/scripts/main.js?case=${generation++}`);
  hooks.worldLoad();
}

const countOf = (spawned, pred) => spawned.filter(pred).length;

/**
 * Every leaf id in the 1.26.50 palette, from
 * metadata/vanilladata_modules/mojang-blocks.json, plus the three near-misses
 * spelled "leaf" that must NOT match. 1.26.40 added the three poplars without
 * warning, which is why the pack matches a substring rather than a list.
 */
const LEAVES = [
  "minecraft:acacia_leaves", "minecraft:azalea_leaves", "minecraft:azalea_leaves_flowered",
  "minecraft:birch_leaves", "minecraft:cherry_leaves", "minecraft:dark_oak_leaves",
  "minecraft:jungle_leaves", "minecraft:mangrove_leaves", "minecraft:oak_leaves",
  "minecraft:orange_poplar_leaves", "minecraft:pale_oak_leaves", "minecraft:red_poplar_leaves",
  "minecraft:spruce_leaves", "minecraft:yellow_poplar_leaves",
];
const NOT_LEAVES = ["minecraft:leaf_litter", "minecraft:big_dripleaf", "minecraft:small_dripleaf_block"];

console.log("");
console.log("1. Drop leaf blocks ON: every leaf kind hands back its own leaf");
{
  // A hardcoded list of leaf ids would have silently missed the poplars for a
  // whole release, so the pack matches the substring. This checks the whole
  // palette rather than a sample.
  await load({ "creeperdropall:merge_grid": 1 });
  const blocks = LEAVES.map((id, i) => makeBlock(i, id));
  const spawned = detonate(blocks);

  let wrong = 0;
  for (let i = 0; i < LEAVES.length; i++) {
    const got = spawned.find((s) => s.x === i);
    if (!got || got.typeId !== LEAVES[i]) wrong++;
  }
  check("all 14 leaf ids drop themselves", wrong, 0);
}

console.log("");
console.log("2. Blocks spelled 'leaf' are not canopy and take the ordinary ladder");
{
  await load({ "creeperdropall:merge_grid": 1 });
  const blocks = NOT_LEAVES.map((id, i) => makeBlock(i, id));
  const spawned = detonate(blocks);
  check("leaf_litter / dripleaf never hand themselves back", countOf(spawned, (s) => NOT_LEAVES.includes(s.typeId)), 0);
}

console.log("");
console.log("3. Drop leaf blocks OFF: the vanilla roll, and no leaf blocks at all");
{
  // The regression that matters if the loot code is ever touched: escalating on
  // an empty array would reach shears and hand back the leaf block.
  await load({ "creeperdropall:leaf_blocks": false, "creeperdropall:merge_grid": 1 });
  const spawned = detonate([
    makeBlock(0, "minecraft:oak_leaves"),
    makeBlock(1, "minecraft:birch_leaves"),
    makeBlock(2, "minecraft:stone"),
  ]);
  check("no leaf blocks", countOf(spawned, (s) => s.typeId.includes("leaves")), 0);
  check("stone still ladders up to cobblestone", countOf(spawned, (s) => s.typeId === "minecraft:cobblestone"), 1);
}

console.log("");
console.log("4. Leaf fallbacks degrade to vanilla rather than eating the drop");
{
  await load({ "creeperdropall:merge_grid": 1 });
  control.itemStackFailures = new Set(["minecraft:shears"]);
  let spawned = detonate([makeBlock(0, "minecraft:oak_leaves"), makeBlock(1, "minecraft:stone")]);
  check("shears unbuildable: the direct route still yields the leaf", countOf(spawned, (s) => s.typeId === "minecraft:oak_leaves"), 1);
  check("and the ladder is unharmed", countOf(spawned, (s) => s.typeId === "minecraft:cobblestone"), 1);

  await load({ "creeperdropall:merge_grid": 1 });
  control.itemStackFailures = new Set(["minecraft:shears", "minecraft:oak_leaves"]);
  spawned = detonate([makeBlock(0, "minecraft:oak_leaves"), makeBlock(1, "minecraft:stone")]);
  check("both routes gone: falls through to vanilla, does not crash", countOf(spawned, (s) => s.typeId === "minecraft:oak_leaves"), 0);
  check("stone still handled afterwards", countOf(spawned, (s) => s.typeId === "minecraft:cobblestone"), 1);
}

// ---------------------------------------------------------------------------
// Beds and banners: identity in block entity data.
//
// minecraft:bed is one id whose only states are direction, head_piece_bit and
// occupied_bit - the colour is not among them, so a permutation cannot describe
// it and the loot table hands back the same colour every time.
//
// A bed is also TWO blocks. Whether the engine yields loot for one half or for
// both is NOT established, so every case below runs under both possibilities.
// Shipping a fix that assumed "foot only" is what put two beds per bed into a
// player's world.
// ---------------------------------------------------------------------------
for (const halves of ["foot", "both"]) {
  console.log("");
  console.log(`5. Bed colour and count — engine yields bed loot for: ${halves.toUpperCase()}`);
  control.bedLootHalves = halves;

  await load({ "creeperdropall:merge_grid": 1 });
  const spawned = detonate([
    makeBlock(0, "minecraft:bed", "blue", { head_piece_bit: false }),
    makeBlock(1, "minecraft:bed", "blue", { head_piece_bit: true }),
    makeBlock(2, "minecraft:bed", "red", { head_piece_bit: false }),
    makeBlock(3, "minecraft:bed", "red", { head_piece_bit: true }),
    makeBlock(4, "minecraft:standing_banner", "green"),
    makeBlock(5, "minecraft:stone"),
  ]);
  const beds = spawned.filter((s) => s.typeId === "minecraft:bed");

  check("two beds blown up give TWO beds, not four", beds.length, 2);
  check("exactly one blue", countOf(beds, (b) => b.data === "blue"), 1);
  check("exactly one red", countOf(beds, (b) => b.data === "red"), 1);
  check("colours did not merge despite one shared typeId", new Set(beds.map((b) => b.data)).size, 2);
  check("a banner keeps its data", (spawned.find((s) => s.x === 4) || {}).data, "green");
  check("stone is untouched: cobblestone, not stone", countOf(spawned, (s) => s.typeId === "minecraft:cobblestone"), 1);
  check("getItemStack never hijacked a block that drops something else", countOf(spawned, (s) => s.typeId === "minecraft:stone"), 0);
}

console.log("");
console.log("6. A lone bed half");
{
  // Suppressing the head is what makes the pair yield one bed whatever the
  // engine does per half. The documented cost is a blast that takes only the
  // head: nothing drops. Asserted so it stays a known cost rather than a
  // surprise, and so a future change to the rule shows up here.
  for (const halves of ["foot", "both"]) {
    control.bedLootHalves = halves;

    await load({ "creeperdropall:merge_grid": 1 });
    let spawned = detonate([makeBlock(0, "minecraft:bed", "blue", { head_piece_bit: false })]);
    check(`[${halves}] foot alone still yields its own colour`, (spawned.find((s) => s.typeId === "minecraft:bed") || {}).data, "blue");

    await load({ "creeperdropall:merge_grid": 1 });
    spawned = detonate([makeBlock(0, "minecraft:bed", "blue", { head_piece_bit: true })]);
    check(`[${halves}] head alone yields nothing (known cost, TESTING.md T9c)`, countOf(spawned, (s) => s.typeId === "minecraft:bed"), 0);
  }
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
