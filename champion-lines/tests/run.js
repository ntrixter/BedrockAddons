// Champion Lines test harness.
//
// genes.js has no @minecraft/server import, so it loads straight into Node:
//
//   cd champion-lines/tests && node run.js
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
  COLORS,
  describe,
  FIXED,
  generationOf,
  LINE_WIDTH,
  PAGE_LINES,
  rightAlign,
  textWidth,
  herdName,
  inherit,
  inheritLook,
  MARKINGS,
  jumpBlocks,
  jumpFromHeight,
  blocksPerSecond,
  pick,
  shownStats,
  statParts,
  speedOfStep,
  speedStep,
  VANILLA_MULE,
  wildJump,
} from "../behavior_pack/scripts/genes.js";

// Book text without formatting codes or the padding that right-justifies values.
const plain = (text) => text.replace(/§./g, "").replace(/\n +/g, "\n> ").replace(/: {2,}/g, ": > ");

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
const look = Object.keys(events).filter((e) => /^horsebreed:set_(coat|mark)_/.test(e));
check("one look event per coat and marking", look.length, COLORS.length + MARKINGS.length);
check("coat events set the variant in order", COLORS.map((_, i) =>
  groups[events[`horsebreed:set_coat_${i}`].add.component_groups[0]]["minecraft:variant"].value), COLORS.map((_, i) => i));
check("marking events set the mark in order", MARKINGS.map((_, i) =>
  groups[events[`horsebreed:set_mark_${i}`].add.component_groups[0]]["minecraft:mark_variant"].value), MARKINGS.map((_, i) => i));
const ours = Object.keys(events).filter((e) => e.startsWith("horsebreed:") && !look.includes(e));
check("one event per group", ours.length, 16 + 91 + 61);
check("every event adds its group", ours.every((e) => {
  const g = events[e].add.component_groups[0];
  return e.replace(":set_", ":") === g && g in groups;
}), true);

console.log("Donkeys and mules");
const mule = JSON.parse(readFileSync(new URL("../behavior_pack/entities/mule.json", import.meta.url), "utf8"))["minecraft:entity"];
const muleEvents = Object.keys(mule.events).filter((e) => e.startsWith("horsebreed:") && !e.includes("_mark_"));
check("mule: same stat events as the horse", muleEvents.sort(), ours.slice().sort());
check("mule: each adds its group", muleEvents.every((e) => {
  const g = mule.events[e].add.component_groups[0];
  return JSON.stringify(mule.component_groups[g]) === JSON.stringify(groups[g]);
}), true);
check("vanilla mule speed and jump", [
  mule.components["minecraft:movement"].value,
  mule.components["minecraft:horse.jump_strength"].value * 100,
], [VANILLA_MULE.s, VANILLA_MULE.j]);
check("vanilla mule speed is on the grid", speedOfStep(speedStep(VANILLA_MULE.s)), VANILLA_MULE.s);
check("donkey speed and jump match vanilla mule's", FIXED.donkey, VANILLA_MULE);
check("no donkey override: donkeys stay vanilla", (() => {
  try { readFileSync(new URL("../behavior_pack/entities/donkey.json", import.meta.url)); return true; } catch { return false; }
})(), false);
const perfect = { h: 30, s: 0.3375, j: 100 };
const donkey = { h: 15, ...FIXED.donkey };
check("mule: perfect horse x donkey, all rolls won", inherit(perfect, donkey, 0.6, seq(0.1, 0.1, 0.1)), { h: 30, s: 90, j: 100 });
check("mule: a lost roll takes the donkey's", inherit(perfect, donkey, 0.6, seq(0.1, 0.9, 0.1)).s, speedStep(0.175));
check("donkey name", /^\S+ \S+ #4$/.test(herdName("9", undefined, undefined, 4, "donkey")), true);
check("donkey and mule names differ from horse words", herdName("9", 2, 1, 0, "donkey") !== herdName("9", 2, 1, 0, "mule"), true);
const donkeyBook = bookPages({ name: "Dusty Jack #4", kind: "donkey", stats: { h: 22, s: 0.175, j: 50, fixed: true }, origin: "wild", today: 1 });
check("donkey book says Donkey, no colour", donkeyBook[0].includes("\nDonkey\n") && !donkeyBook[0].includes("Color"), true);
const muleBook = bookPages({ name: "Russet Packer #5", kind: "mule", mark: 3, stats: { h: 22, s: 0.2, j: 60 }, origin: "bred", today: 1 });
check("mule book shows its markings", plain(muleBook[0]).includes("\nMule\nMarkings: > White spots\n"), true);
check("plain mule book has no markings line", !bookPages({ name: "M", kind: "mule", mark: 0, stats: { h: 22, s: 0.2, j: 60 }, origin: "wild", today: 1 })[0].includes("Markings"), true);
check("mule: one marking event per marking, each clearing the others", MARKINGS.every((_, i) => {
  const ev = mule.events[`horsebreed:set_mark_${i}`];
  return ev.add.component_groups[0] === `horsebreed:mark_${i}` && ev.remove.component_groups.length === MARKINGS.length - 1
    && mule.component_groups[`horsebreed:mark_${i}`]["minecraft:mark_variant"].value === i;
}), true);
const client = JSON.parse(readFileSync(new URL("../resource_pack/entity/mule_v3.entity.json", import.meta.url), "utf8"))["minecraft:client_entity"].description;
const controllers = JSON.parse(readFileSync(new URL("../resource_pack/render_controllers/champion_lines_mule.render_controllers.json", import.meta.url), "utf8")).render_controllers;
check("mule client entity uses the pack's controller", client.render_controllers.every((c) => c in controllers), true);
check("every marking texture the controller names is defined", Object.values(controllers)[0].arrays.textures["Array.markings"]
  .every((t) => t.replace("Texture.", "") in client.textures), true);
check("controller lists one texture per marking", Object.values(controllers)[0].arrays.textures["Array.markings"].length, MARKINGS.length);
check("fixed stats shown plain", statParts({ h: 30, s: 0.175, j: 50, fixed: true }).slice(1).every((p) => p.startsWith("§f")), true);

console.log("Coat, markings and generation");
check("look from parent A", inheritLook(2, 5, 7, seq(0.1)), 2);
check("look from parent B", inheritLook(2, 5, 7, seq(0.6)), 5);
check("look at random", inheritLook(2, 5, 7, seq(0.95, 0.0)), 0);
check("unknown parent look is random", inheritLook(undefined, 5, 7, seq(0.1, 0.99)), 6);
check("parent white (0) is kept", inheritLook(0, 5, 7, seq(0.1)), 0);
check("foal of two wild horses", generationOf(0, 0), 1);
check("one more than the older line", generationOf(3, 1), 4);
check("unknown parents", generationOf(undefined, undefined), 1);

console.log("Learning stats by riding");
const truth = { h: 28, s: 0.3, j: 90 };
check("untamed hidden", shownStats(truth, { tamed: false }, { wild: false, learn: true }), null);
check("untamed shown with the wild setting", shownStats(truth, { tamed: false }, { wild: true, learn: false }), truth);
check("learn off shows the truth", shownStats(truth, { tamed: true }, { wild: false, learn: false }), truth);
check("not ridden yet", shownStats(truth, { tamed: true }, { learn: true }), { h: null, s: null, j: null, jEst: true });
const learnt = shownStats(truth, { tamed: true, ridden: true, jm: 3.0 }, { learn: true });
check("ridden: health and speed, best jump", [learnt.h, learnt.s, learnt.jEst], [28, 0.3, true]);
check("best jump, not the true jump", Math.abs(jumpBlocks(learnt.j) - 3.0) < 0.1, true);
check("action bar with nothing learnt", statParts(shownStats(truth, { tamed: true }, { learn: true })), ["§7Health ?§r", "§7Speed ?§r", "§7Jump ?§r"]);
check("action bar for a hidden horse", describe({ name: "W", stats: null }, { stats: true }), "§lW§r");
const hiddenBook = bookPages({ name: "W", stats: null, origin: "wild", today: 1 });
check("book for a hidden horse", hiddenBook[1].includes("Tame it to learn"), true);
const unridden = bookPages({ name: "R", stats: { h: null, s: null, j: null, jEst: true }, origin: "wild", today: 1 });
check("book before riding", ["Health: ?", "Speed: ?", "ride it to find out", "Jump: unknown"].every((t) => unridden[1].includes(t)), true);

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
  "§lHorse§r §7(foal)§r · §cHealth 15§r · §cSpeed 4.7§r · §7Jump ?§r\n§7Parents: born before Champion Lines§r");

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
check("registry number appended", /^\S+ \S+ #27$/.test(herdName("1", 2, 1, 27)), true);
check("same words with or without a number", herdName("1", 2, 1, 27).startsWith(herdName("1", 2, 1) + " "), true);
check("unknown markings fall back", herdName("1", 0, 99), herdName("1", 0, 0));

console.log("Book");
check("short title kept", bookTitle("Spirit"), "Spirit");
check("long title cut to 16", bookTitle("Sir Gallops-a-Lot the Third"), "Sir Gallops-a-L.");
check("numbered name that fits", bookTitle("Copper Blaze #27"), "Copper Blaze #27");
check("long numbered name keeps colour and number", bookTitle("Biscuit Freckle #1234"), "Biscuit #1234");
const pages = bookPages({
  name: "Spirit", stats, origin: "bred", breeder: "Steve", day: 12, variant: 2, mark: 3, today: 40, reg: 27,
  parentEntries: [{ name: "Thunder", first: "Copper Blaze #3", origin: "wild" }, { name: "Raven Pepper #8" }],
});
check("three pages for a bred horse", pages.length, 3);
check("page 1", plain(pages[0]),
  "Spirit\nHorse\nColor: > Chestnut\nMarkings: > White spots\nRegistry No.: > 27\n\nBorn: > day 12\nBred by: > Steve");
check("colour word keeps its colour", pages[0].includes("§6Chestnut§r"), true);
check("values reach the right edge", pages[0].split("\n").filter((l) => / {2,}/.test(l))
  .every((l) => textWidth(l) <= LINE_WIDTH && textWidth(l) > LINE_WIDTH - 4), true);
check("a long pair puts its value on the next line", plain(bookPages({ name: "T", stats, origin: "wild", tamer: "Sir_Longname_3rd", today: 1 })[0]).includes("\nTamed by:\n> Sir_Longname_3rd"), true);
check("a value too long to pad is left as it is", rightAlign("W".repeat(30)), "W".repeat(30));
check("page 3: lineage, renamed one with its first name", pages[2],
  "§lLineage§r\n\nThunder\n§7 wild name: Copper Blaze #3§r\n\nRaven Pepper §8#8§r");
check("page 2 has every stat", ["Health: 29\n", "Speed: 14.2 blocks/s\n", "Jump: 1.6 blocks", "day 40"]
  .every((t) => pages[1].includes(t)), true);
check("no maximums", /of 30|of 1\.00|best is/.test(pages[1]), false);
check("tamer listed", plain(bookPages({ name: "T", stats, origin: "wild", tamer: "Alex", today: 1 })[0]).includes("\nTamed by: > Alex"), true);
const both = bookPages({ name: "B", stats, origin: "bred", breeder: "Alex", tamer: "Alex", day: 2, today: 3 });
check("same breeder and tamer: one line", plain(both[0]).includes("\nBred and tamed by:\n> Alex") && !both[0].includes("Tamed by"), true);
const differ = bookPages({ name: "B", stats, origin: "bred", breeder: "Alex", tamer: "Steve", day: 2, today: 3 });
check("different breeder and tamer", plain(differ[0]).includes("\nBred by: > Alex\nTamed by: > Steve"), true);
check("generated name's number in dark gray", bookPages({ name: "Oak Dancer #1", stats, origin: "wild", today: 1 })[0]
  .startsWith("§lOak Dancer §8#1§r"), true);
check("plain parent names still work", bookPages({ name: "A", stats, origin: "bred", parents: ["X", "Y"], today: 1 })[2],
  "§lLineage§r\n\nX\n\nY");
check("wild horse has no parents page", bookPages({ name: "W", stats, origin: "wild", today: 1 }).length, 2);
check("pages stay short", pages.every((p) => p.length < 256 && p.split("\n").length <= 14), true);
const old = bookPages({ name: "Old", stats: { h: 20, s: 0.2, j: null }, variant: 9, mark: 0, today: 3 });
check("old horse says why, in light gray", old[0].includes("§7Born before") && old[0].includes("unknown") && old[1].includes("Jump: unknown"), true);
check("unknown color", plain(old[0]).includes("Color: > Unknown"), true);
check("unknown jump says how to measure", old[1].includes("full charge"), true);
const measured = bookPages({ name: "Old", stats: { h: 20, s: 0.2, j: 96, jEst: true }, variant: 0, mark: 0, today: 3 });
const renamed = bookPages({ name: "Thunder", firstName: "Copper Blaze #27", reg: 27, stats, origin: "wild", variant: 2, mark: 1, today: 9 });
check("renamed wild horse keeps its wild name", plain(renamed[0]).startsWith("Thunder\nWild name:\n> Copper Blaze #27\nHorse\n"), true);
const renamedFoal = bookPages({ name: "Bolt", firstName: "Ember Socks #40", reg: 40, stats, origin: "bred", variant: 2, mark: 1, today: 9 });
check("renamed foal keeps its birth name", plain(renamedFoal[0]).startsWith("Bolt\nBirth name:\n> Ember Socks #40\n"), true);
const genPages = bookPages({
  name: "Bolt", gen: 2, stats, origin: "bred", day: 5, today: 9,
  parentEntries: [{ name: "Swan Boots #1", gen: 1 }, { name: "Coal Dapple #8", gen: 0 }],
});
check("bred horse shows its generation", plain(genPages[0]).includes("\nGeneration: 2\nBorn: > day 5"), true);
const full = bookPages({ name: "Bolt", firstName: "Ember Socks #40", reg: 40, gen: 3, stats, origin: "bred", breeder: "A", tamer: "B", day: 5, variant: 2, mark: 1, today: 9 });
check("a full horse fits its page", [full.length, full.every((p) => p.split("\n").length <= PAGE_LINES)], [3, true]);
check("its stats follow", full[1].startsWith("§lStats"), true);
const statPages = bookPages({ name: "Bolt", gen: 2, stats, origin: "bred", day: 5, today: 9,
  parentEntries: [{ name: "Swan Boots #1", gen: 1, stats: { h: 28, s: 0.29, j: 90, jEst: true } }, { name: "Coal", gen: 0, stats: null }] });
check("parents' stats on the Lineage page", plain(statPages[2]).includes("\n> H 28 · S 12.2 · J ~4.4\n"), true);
check("a parent's hidden stats", plain(statPages[2]).endsWith("\n> ?"), true);
check("parents show their generation", genPages[2].includes("Swan Boots §8#1§r\n§7 generation 1§r"), true);
check("wild parent is generation 0", genPages[2].includes("§7 generation 0§r"), true);
check("measured jump in the book", measured[1].includes("Jump: ~4.9 blocks"), true);

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
process.exit(failures ? 1 : 0);
