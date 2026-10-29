// Horse Bloodlines test harness.
//
// genes.js has no @minecraft/server import, so it loads straight into Node:
//
//   cd horse-bloodlines/tests && node run.js
//
// It checks the inheritance roll, the stat grids against entities/horse.json,
// and the action-bar and book text. It cannot check anything that needs the
// game: whether a foal's birth is reported with cause Born, whether feeding is
// reported as an interaction, or whether a component group really overrides
// the stat vanilla blended. See TESTING.md.

import { readFileSync } from "node:fs";
import {
  bookPages,
  bookTitle,
  describe,
  herdName,
  inherit,
  jumpBlocks,
  jumpFromHeight,
  blocksPerSecond,
  pick,
  speedOfStep,
  speedStep,
  wildJump,
} from "../behavior_pack/scripts/genes.js";

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: got ${JSON.stringify(actual)}${ok ? "" : `, want ${JSON.stringify(expected)}`}`);
}

/** A seeded generator, so the statistics below are repeatable. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const seq = (...values) => () => values.shift();

console.log("The 60% rule");
check("roll under chance takes the better", pick(20, 28, 0.6, seq(0.59)), 28);
check("roll at chance takes the worse", pick(20, 28, 0.6, seq(0.6)), 20);
check("order of parents does not matter", pick(28, 20, 0.6, seq(0.1)), 28);
check("each stat rolls on its own",
  inherit({ h: 20, s: 0.2, j: 50 }, { h: 30, s: 0.3, j: 90 }, 0.6, seq(0.1, 0.9, 0.1)),
  { h: 30, s: speedStep(0.2), j: 90 });
{
  const r = rng(42);
  let better = 0;
  const n = 100000;
  for (let i = 0; i < n; i++) if (pick(1, 2, 0.6, r) === 2) better++;
  const share = better / n;
  check("about 60% better over 100k rolls", Math.abs(share - 0.6) < 0.01, true);
}
{
  // Parents of 20 and 30 health: foals average 0.6 * 30 + 0.4 * 20 = 26,
  // where vanilla's blend would sit near the parents' midpoint of 25.
  const r = rng(7);
  let sum = 0;
  for (let i = 0; i < 10000; i++) sum += inherit({ h: 20, s: 0.2, j: 50 }, { h: 30, s: 0.2, j: 50 }, 0.6, r).h;
  check("foals of 20 and 30 average 26 health", Math.abs(sum / 10000 - 26) < 0.1, true);
}

console.log("Unknown jump");
check("unknown parent stands in with a wild roll",
  inherit({ h: 20, s: 0.2, j: null }, { h: 20, s: 0.2, j: 50 }, 0.6, seq(0.5, 0.0, 0.0, 0.0)).j, 70);
check("wild roll covers 40..100", [wildJump(seq(0)), wildJump(seq(0.9999))], [40, 100]);

console.log("Grids match entities/horse.json");
const horse = JSON.parse(readFileSync(new URL("../behavior_pack/entities/horse.json", import.meta.url), "utf8"));
const groups = horse["minecraft:entity"].component_groups;
const events = horse["minecraft:entity"].events;
for (let h = 15; h <= 30; h++) {
  check(`health ${h}`, groups[`horsebreed:health_${h}`]?.["minecraft:health"], { value: h, max: h });
}
for (let k = 0; k <= 90; k++) {
  const g = groups[`horsebreed:speed_${k}`]?.["minecraft:movement"]?.value;
  if (g !== speedOfStep(k)) check(`speed ${k}`, g, speedOfStep(k));
}
check("speed grid ends at vanilla max", speedOfStep(90), 0.3375);
check("speed step of vanilla max", speedStep(0.3375), 90);
check("speed step clamps", [speedStep(0.05), speedStep(0.5)], [0, 90]);
for (let j = 40; j <= 100; j++) {
  const g = groups[`horsebreed:jump_${j}`]?.["minecraft:horse.jump_strength"]?.value;
  if (g !== j / 100) check(`jump ${j}`, g, j / 100);
}
const ours = Object.keys(events).filter((e) => e.startsWith("horsebreed:"));
check("one event per group", ours.length, 16 + 91 + 61);
check("every event adds its group", ours.every((e) => {
  const g = events[e].add.component_groups[0];
  return e.replace(":set_", ":") === g && g in groups;
}), true);

console.log("Conversions");
check("jump 1.00 is about 5.3 blocks", jumpBlocks(100).toFixed(1), "5.3");
check("jump 0.40 is about 1.1 blocks", jumpBlocks(40).toFixed(1), "1.1");
check("best speed is about 14.2 b/s", blocksPerSecond(0.3375).toFixed(1), "14.2");

console.log("Measured jump");
check("every strength round-trips", Array.from({ length: 61 }, (_, i) => 40 + i)
  .every((j) => jumpFromHeight(jumpBlocks(j)) === j), true);
check("5 blocks is strength 0.97", jumpFromHeight(5.0), 97);
check("below the range clamps to 40", jumpFromHeight(0.7), 40);
check("above the range clamps to 100", jumpFromHeight(6.5), 100);
check("estimate is marked with ~",
  describe({ name: "Old", stats: { h: 20, s: 0.2, j: 96, jEst: true } }, { stats: true, parents: false }),
  "§lOld§r · §eHealth 20§r · §eSpeed 8.4§r · §bJump ~4.9§r");

console.log("Action bar");
const stats = { h: 29, s: 0.3375, j: 50 };
check("stats only",
  describe({ name: "Spirit", stats, origin: "bred", parents: ["A", "B"] }, { stats: true, parents: false }),
  "§lSpirit§r · §bHealth 29§r · §bSpeed 14.2§r · §cJump 1.6§r");
check("stats and parents",
  describe({ name: "Spirit", stats, origin: "bred", parents: ["Ace", "Raven Pepper"] }, { stats: true, parents: true }),
  "§lSpirit§r · §bHealth 29§r · §bSpeed 14.2§r · §cJump 1.6§r\n§7Parents: Ace & Raven Pepper§r");
check("parents only, wild",
  describe({ name: "Gray horse", stats, origin: "wild", parents: [] }, { stats: false, parents: true }),
  "§lGray horse§r\n§7Parents: wild-born§r");
check("old horse, foal",
  describe({ name: "Horse", baby: true, stats: { h: 15, s: 0.1125, j: null } }, { stats: true, parents: true }),
  "§lHorse§r §7(foal)§r · §cHealth 15§r · §cSpeed 4.7§r · §7Jump ?§r\n§7Parents: born before Horse Bloodlines§r");

console.log("Generated names");
check("same horse, same name", herdName("-4294967295", 2, 1), herdName("-4294967295", 2, 1));
check("colour word then marking word", /^(Copper|Rust|Amber|Ember|Penny|Ginger) (Blaze|Socks|Boots|Flash|Stripe|Beacon)$/.test(herdName("-12884901887", 2, 1)), true);
{
  const names = new Set();
  let longest = 0;
  for (let id = 0; id < 20000; id++) {
    for (let v = 0; v < 7; v++) for (let m = 0; m < 5; m++) {
      const n = herdName(String(-4294967296 * id - 1), v, m);
      names.add(n);
      longest = Math.max(longest, n.length);
    }
  }
  check("all 7 x 5 x 36 names are reachable", names.size, 7 * 5 * 36);
  check("every name fits a book title", longest <= 16, true);
}
check("unknown coat", herdName("1", 99, 0), "Horse");
check("unknown markings fall back", herdName("1", 0, 99), herdName("1", 0, 0));

console.log("Book");
check("short title kept", bookTitle("Spirit"), "Spirit");
check("long title cut to 16", bookTitle("Sir Gallops-a-Lot the Third"), "Sir Gallops-a-L.");
const pages = bookPages({
  name: "Spirit", stats, origin: "bred", parents: ["Ace", "Raven Pepper"],
  breeder: "Steve", day: 12, variant: 2, mark: 3, today: 40,
});
check("two pages", pages.length, 2);
check("page 1", pages[0],
  "§lSpirit§r\n\nColor: Chestnut\nMarkings: White spots\n\nBorn: day 12\nBred by: Steve\n\nParents:\n Ace\n Raven Pepper");
check("page 2 has every stat", ["Health: 29 of 30", "Speed: 14.2 blocks/s", "Jump: 1.6 blocks", "day 40"]
  .every((t) => pages[1].includes(t)), true);
check("pages stay short", pages.every((p) => p.length < 256 && p.split("\n").length <= 14), true);
const old = bookPages({ name: "Old", stats: { h: 20, s: 0.2, j: null }, variant: 9, mark: 0, today: 3 });
check("old horse says why", old[0].includes("unknown") && old[1].includes("Jump: unknown"), true);
check("unknown color", old[0].includes("Color: Unknown"), true);
check("unknown jump says how to measure", old[1].includes("full charge"), true);
const measured = bookPages({ name: "Old", stats: { h: 20, s: 0.2, j: 96, jEst: true }, variant: 0, mark: 0, today: 3 });
check("measured jump in the book", measured[1].includes("Jump: ~4.9 blocks"), true);

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
process.exit(failures ? 1 : 0);
