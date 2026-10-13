// Compass Link test harness.
//
// Drives readout.js, the part that turns a position and two biomes into the
// action-bar text, with plain objects. It never imports @minecraft/server:
//
//   cd compass-link/tests && node run.js
//
// It cannot check what needs the game: whether the action bar shows two lines,
// or whether getBiome returns what is expected. See README.md
// "Confirm in-game".

import { biomeName, otherPosition, readout } from "../behavior_pack/scripts/readout.js";

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: got ${JSON.stringify(actual)}${ok ? "" : `, want ${JSON.stringify(expected)}`}`);
}

const ALL = { currentCoords: true, otherCoords: true, biome: true };
const OW = "minecraft:overworld";
const NE = "minecraft:nether";
const END = "minecraft:the_end";
const here = { x: 800.7, y: 64.2, z: -1600.3 };

console.log("Positions");
check("overworld to nether", JSON.stringify(otherPosition(OW, here)), JSON.stringify({ x: 100, y: 64, z: -201 }));
check("nether to overworld", JSON.stringify(otherPosition(NE, { x: 100.5, y: 70, z: -200.5 })),
  JSON.stringify({ x: 804, y: 70, z: -1604 }));
check("end has none", otherPosition(END, here), undefined);

console.log("Readout");
check("everything", readout(OW, here, "minecraft:plains", ALL),
  "Overworld: 800, 64, -1601 · Plains\n§7Nether: 100, 64, -201§r");
check("from the nether", readout(NE, { x: 100, y: 70, z: -200 }, "minecraft:hell", ALL),
  "Nether: 100, 70, -200 · Nether Wastes\n§7Overworld: 800, 70, -1600§r");
check("biome unknown", readout(NE, { x: 1, y: 70, z: 1 }, undefined, ALL),
  "Nether: 1, 70, 1\n§7Overworld: 8, 70, 8§r");
check("the end: one line", readout(END, { x: 5, y: 60, z: 5 }, "minecraft:the_end", ALL),
  "The End: 5, 60, 5 · The End");
check("coords only", readout(OW, here, "minecraft:plains", { ...ALL, biome: false }),
  "Overworld: 800, 64, -1601\n§7Nether: 100, 64, -201§r");
check("old behaviour", readout(OW, here, "minecraft:plains", { currentCoords: false, otherCoords: true, biome: false }),
  "§7Nether: 100, 64, -201§r");
check("biome without coords", readout(OW, here, "minecraft:desert", { currentCoords: false, otherCoords: false, biome: true }),
  "Overworld: Desert");
check("all off", readout(OW, here, "minecraft:plains", { currentCoords: false, otherCoords: false, biome: false }), "");

console.log("Biome names");
check("legacy id", biomeName("minecraft:roofed_forest"), "Dark Forest");
check("soul sand", biomeName("minecraft:soulsand_valley"), "Soul Sand Valley");
check("title-cased", biomeName("minecraft:frozen_peaks"), "Frozen Peaks");
check("custom namespace", biomeName("mypack:glow_marsh"), "Glow Marsh");

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
process.exit(failures ? 1 : 0);
