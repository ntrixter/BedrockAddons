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

import {
  control, hooks, makeBlock, detonate, hurt, startup, registry, dynamicProperties,
  CustomCommandStatus, CommandPermissionLevel,
} from "@minecraft/server";

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
  hooks.entityHurtBefore = null;
  hooks.entityHurtOptions = null;
  hooks.startup = null;
  control.itemStackFailures = new Set();
  await import(`../behavior_pack/scripts/main.js?case=${generation++}`);
  startup();
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

console.log("");
console.log("7. Doesn't break blocks, per mob");
{
  // The point of these toggles is to stand in for mobGriefing=false on
  // explosions only, so a covered blast must leave vanilla nothing to destroy,
  // remove nothing itself and drop nothing - and an uncovered one must be
  // untouched.
  const blast = () => [makeBlock(0, "minecraft:stone"), makeBlock(1, "minecraft:oak_leaves")];
  const cases = [
    ["creepers", "minecraft:creeper"],
    ["ghasts", "minecraft:fireball"],
    ["withers", "minecraft:wither_skull"],
    ["withers", "minecraft:wither_skull_dangerous"],
    ["withers", "minecraft:wither"],
    ["end_crystals", "minecraft:ender_crystal"],
  ];
  for (const [key, source] of cases) {
    // With drops on and off for the same source: no-break must win either way.
    for (const drops of [true, false]) {
      await load({ ["creeperdropall:no_break_" + key]: true, ["creeperdropall:" + key]: drops, "creeperdropall:merge_grid": 1 });
      const spawned = detonate(blast(), source);
      const tag = `[${source}, drops ${drops ? "on" : "off"}]`;
      check(`${tag} vanilla is left no blocks to destroy`, control.impacted.length, 0);
      check(`${tag} the pack removes none itself`, control.removed, 0);
      check(`${tag} nothing drops`, spawned.length, 0);
    }
  }

  // Off by default: a plain creeper still blows a hole and drops it all.
  await load({ "creeperdropall:merge_grid": 1 });
  let spawned = detonate(blast());
  check("default: creeper still removes its blocks", control.removed, 2);
  check("default: and drops them", spawned.length, 2);

  // One mob's toggle leaves the others alone.
  await load({ "creeperdropall:no_break_creepers": true, "creeperdropall:merge_grid": 1 });
  spawned = detonate(blast(), "minecraft:fireball");
  check("creepers-only: a ghast fireball still removes its blocks", control.removed, 2);
  check("creepers-only: and drops them", spawned.length, 2);

  // TNT is not a mob and has no toggle: with drops off for it, it stays vanilla.
  await load({ "creeperdropall:no_break_creepers": true, "creeperdropall:no_break_ghasts": true,
    "creeperdropall:no_break_withers": true, "creeperdropall:no_break_end_crystals": true });
  detonate(blast(), "minecraft:tnt");
  check("all four on: TNT is still handed to vanilla untouched", control.impacted.length, 2);
}

console.log("");
console.log("8. Drop glass: every glass and pane id, every colour");
{
  // All 69 ids containing "glass" in the 1.26.50 palette, from
  // metadata/vanilladata_modules/mojang-blocks.json. Built from the colour list
  // rather than typed out, but the count is asserted so a missed colour shows.
  const COLOURS = ["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray",
    "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black"];
  const GLASS = ["minecraft:glass", "minecraft:glass_pane", "minecraft:tinted_glass",
    "minecraft:hard_glass", "minecraft:hard_glass_pane"];
  for (const c of COLOURS) {
    GLASS.push(`minecraft:${c}_stained_glass`, `minecraft:${c}_stained_glass_pane`,
      `minecraft:hard_${c}_stained_glass`, `minecraft:hard_${c}_stained_glass_pane`);
  }
  check("the list covers all 69 palette ids", GLASS.length, 69);

  await load({ "creeperdropall:merge_grid": 1 });
  let spawned = detonate(GLASS.map((id, i) => makeBlock(i, id)));
  let wrong = 0;
  for (let i = 0; i < GLASS.length; i++) {
    const got = spawned.filter((s) => s.x === i);
    if (got.length !== 1 || got[0].typeId !== GLASS[i]) wrong++;
  }
  check("on by default: each drops exactly itself, colour intact", wrong, 0);

  await load({ "creeperdropall:glass_blocks": false, "creeperdropall:merge_grid": 1 });
  spawned = detonate([makeBlock(0, "minecraft:glass"), makeBlock(1, "minecraft:red_stained_glass_pane"), makeBlock(2, "minecraft:stone")]);
  check("off: glass drops nothing, as vanilla", countOf(spawned, (s) => s.typeId.includes("glass")), 0);
  check("off: stone is unaffected", countOf(spawned, (s) => s.typeId === "minecraft:cobblestone"), 1);

  await load({ "creeperdropall:merge_grid": 1 });
  control.itemStackFailures = new Set(["minecraft:glass"]);
  spawned = detonate([makeBlock(0, "minecraft:glass"), makeBlock(1, "minecraft:stone")]);
  check("item unbuildable: falls through to vanilla, does not crash", countOf(spawned, (s) => s.typeId === "minecraft:glass"), 0);
  check("stone still handled afterwards", countOf(spawned, (s) => s.typeId === "minecraft:cobblestone"), 1);
}

console.log("");
console.log("9. Protect dropped items from explosions");
{
  await load();
  check("on by default: subscribed to entityHurt", hooks.entityHurtBefore !== null, true);
  const opts = hooks.entityHurtOptions || {};
  check("filter asks the engine for items only", opts.entityFilter && opts.entityFilter.type, "minecraft:item");
  check("filter asks for both explosion causes",
    JSON.stringify((opts.allowedDamageCauses || []).slice().sort()),
    JSON.stringify(["blockExplosion", "entityExplosion"]));
  check("item, creeper/TNT blast: cancelled", hurt("minecraft:item", "entityExplosion"), true);
  check("item, bed/anchor blast: cancelled", hurt("minecraft:item", "blockExplosion"), true);
  // The callback must not lean on the filters alone.
  check("item in lava: left alone", hurt("minecraft:item", "lava"), false);
  check("item in fire: left alone", hurt("minecraft:item", "fire"), false);
  check("player in a blast: still hurt", hurt("minecraft:player", "entityExplosion"), false);
  check("mob in a blast: still hurt", hurt("minecraft:zombie", "blockExplosion"), false);

  await load({ "creeperdropall:protect_items": false });
  check("off: never subscribes, so items behave as vanilla", hooks.entityHurtBefore, null);
}


console.log("");
console.log("10. Zones: the creeperzone command");
{
  dynamicProperties.clear();
  await load({ "creeperdropall:merge_grid": 1 });
  const reg = registry.commands.get("creeperdropall:creeperzone");
  check("registered", !!reg, true);
  check("no cheats needed", reg && reg.def.cheatsRequired, false);
  check("operators only", reg && reg.def.permissionLevel, CommandPermissionLevel.GameDirectors);
  check("action enum registered", (registry.enums.get("creeperdropall:zoneaction") || []).join("|"),
    "list|new|update|show|protect|allow|remove|enable|disable");

  const CONSOLE = { sourceType: "Server" };
  const player = (dim, x, y, z) => ({
    sourceType: "Entity",
    sourceEntity: { typeId: "minecraft:player", dimension: { id: dim }, location: { x, y, z } },
  });
  // Every write is deferred with system.run, as command callbacks are restricted.
  const cmd = (origin, ...args) => {
    const r = reg.fn(origin, ...args);
    while (control.pendingRuns.length) control.pendingRuns.shift()();
    return r;
  };
  const okay = (r) => r.status === CustomCommandStatus.Success;

  let r = cmd(CONSOLE, "new", "Base");
  check("console without x y z is refused", r.message, "The console must give x y z.");
  check("and nothing was added", okay(cmd(CONSOLE, "list")) && cmd(CONSOLE, "list").message.includes("No zones yet"), true);

  r = cmd(CONSOLE, "new", "Base", "pos1", { x: 2.5, y: 70.5, z: -0.5 });
  check("console new: floored, one block", r.message.startsWith("Added zone Base in the Overworld at 2 70 -1, one block."), true);
  r = cmd(CONSOLE, "new", "base", "pos2", { x: 4.5, y: 70.5, z: 0.5 });
  check("new on an existing zone sets that corner, names case-insensitive", r.message, "Base now runs from 2 70 -1 to 4 70 0, 3x1x2 blocks.");

  check("unknown action re-checked in script", okay(cmd(CONSOLE, "explode", "Base")), false);
  check("show needs true|false", okay(cmd(CONSOLE, "show", "Base", "pos1")), false);
  check("protect needs a source", okay(cmd(CONSOLE, "protect", "Base", "true")), false);
  check("a name with | is refused", okay(cmd(CONSOLE, "new", "a|b", "pos1", { x: 0, y: 0, z: 0 })), false);
  check("a 41-character name is refused", okay(cmd(CONSOLE, "new", "x".repeat(41), "pos1", { x: 0, y: 0, z: 0 })), false);
  check("a missing zone is named", cmd(CONSOLE, "show", "Nope", "true").message, "No zone named Nope. creeperzone list names them.");
  check("show true", cmd(CONSOLE, "show", "Base", "true").message, "Base is shown in game.");

  // Blocks 0..6 at y 70 z 0; the zone covers x 2..4.
  const row = () => [0, 1, 2, 3, 4, 5, 6].map((i) => makeBlock(i, "minecraft:stone"));

  detonate(row());
  check("zones off by default: the creeper breaks everything", control.removed, 7);

  check("enable", cmd(CONSOLE, "enable").message, "Zones are on. 1 zone now protects its blocks.");
  let spawned = detonate(row());
  check("zones on: the three blocks inside stand", control.removed, 4);
  check("and only the blocks outside drop", spawned.filter((s) => s.x >= 2 && s.x <= 4).length, 0);
  check("vanilla is handed nothing", control.impacted.length, 0);

  detonate(row(), "minecraft:tnt");
  check("TNT (not handled): vanilla gets only the outside blocks", control.impacted.length, 4);
  check("and none of the protected ones", control.impacted.filter((b) => b.index >= 2 && b.index <= 4).length, 0);

  detonate(row(), "minecraft:creeper", "minecraft:nether");
  check("a zone in the Overworld does nothing in the Nether", control.removed, 7);

  r = cmd(CONSOLE, "allow", "Base", "creepers");
  check("allow creepers", r.message, "Base now lets creepers break its blocks. It is protected from ghasts, withers, end_crystals, tnt.");
  detonate(row());
  check("creepers allowed: everything breaks", control.removed, 7);
  detonate(row(), "minecraft:fireball");
  check("ghasts still kept out", control.removed, 4);

  check("protect all", okay(cmd(CONSOLE, "protect", "Base", "all")), true);
  detonate(row(), "minecraft:wither");
  // Not a drop source, so vanilla does the breaking - of the outside blocks only.
  check("the wither spawn blast counts as withers", control.impacted.length, 4);

  check("update pos2 by console", cmd(CONSOLE, "update", "Base", "pos2", { x: 2, y: 70, z: 0 }).message,
    "Base now runs from 2 70 -1 to 2 70 0, 1x1x2 blocks.");
  detonate(row());
  check("smaller zone: one block stands", control.removed, 6);
}

console.log("");
console.log("11. Zones against the per-mob settings, and from a player");
{
  dynamicProperties.clear();
  await load({ "creeperdropall:merge_grid": 1, "creeperdropall:no_break_creepers": true });
  const reg = registry.commands.get("creeperdropall:creeperzone");
  const cmd = (origin, ...args) => {
    const r = reg.fn(origin, ...args);
    while (control.pendingRuns.length) control.pendingRuns.shift()();
    return r;
  };
  const steve = (dim, x, y, z) => ({
    sourceType: "Entity",
    sourceEntity: { typeId: "minecraft:player", dimension: { id: dim }, location: { x, y, z } },
  });

  let r = cmd(steve("minecraft:overworld", 1.5, 71, 0.5), "new", "Quarry");
  check("player with no position: the block under their feet", r.message.startsWith("Added zone Quarry in the Overworld at 1 70 0, one block."), true);
  check("it starts protected from everything", r.message.includes("It protects its blocks from every explosion"), true);
  check("and says zones are off", r.message.includes("Zones are off"), true);
  cmd(steve("minecraft:overworld", 0, 0, 0), "new", "Quarry", "pos2", { x: 3, y: 70, z: 0 });
  cmd(steve("minecraft:overworld", 0, 0, 0), "allow", "Quarry", "all");
  r = cmd(steve("minecraft:nether", 0, 0, 0), "update", "Quarry", "pos1", { x: 0, y: 70, z: 0 });
  check("a corner from another dimension is refused", r.message, "Quarry is in the Overworld. Both corners must be in the same dimension.");

  const row = () => [0, 1, 2, 3, 4, 5, 6].map((i) => makeBlock(i, "minecraft:stone"));
  cmd({ sourceType: "Server" }, "enable");
  const spawned = detonate(row());
  check("creepers don't break blocks, but the quarry lets them: x 1..3 break", control.removed, 3);
  check("and drop", spawned.length, 3);

  // Saved and read back on the next world load, with a bad entry dropped.
  const saved = JSON.parse(dynamicProperties.get("creeperdropall:zones"));
  saved.zones.push({ name: "bad", dim: "minecraft:moon", pos1: [0, 0, 0], pos2: [0, 0, 0] });
  dynamicProperties.set("creeperdropall:zones", JSON.stringify(saved));
  await load({ "creeperdropall:merge_grid": 1, "creeperdropall:no_break_creepers": true });
  const reg2 = registry.commands.get("creeperdropall:creeperzone");
  const list = reg2.fn({ sourceType: "Server" }, "list").message;
  check("persisted across a reload", list,
    "Zones are on. 1 zone:\nQuarry: 1 70 0 to 3 70 0 in the Overworld, hidden, protects nothing");
  detonate(row());
  check("and still applied after it", control.removed, 3);

  reg2.fn({ sourceType: "Server" }, "remove", "Quarry");
  detonate(row());
  check("removed: the pack setting decides everywhere again", control.removed, 0);
  dynamicProperties.clear();
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
