// Villager Inspector test harness.
//
// Drives describe.js, the part that turns an inventory into the action-bar
// line, with plain objects. It never imports @minecraft/server, so it needs no
// mock and no install step:
//
//   cd villager-inspector/tests && node run.js
//
// It cannot check anything that needs the real game: whether a script may read
// a villager's private inventory at all, whether the raycast finds a villager
// behind glass, or how the line looks on a phone. See README.md "Confirm
// in-game".

import { describe } from "../behavior_pack/scripts/describe.js";

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: got ${JSON.stringify(actual)}${ok ? "" : `, want ${JSON.stringify(expected)}`}`);
}

const FARMER = 1;
const UNEMPLOYED = 0;
const LIBRARIAN = 5;
const NITWIT = 14;

/** Eight slots from a short list; the rest are empty. */
function slots(...filled) {
  const out = filled.map(([id, amount]) => ({ typeId: `minecraft:${id}`, amount }));
  while (out.length < 8) out.push(undefined);
  return out;
}
const full = (id, amount = 64) => slots(...Array.from({ length: 8 }, () => [id, amount]));

console.log("Breeders");
check("ready", describe({ profession: UNEMPLOYED, slots: slots(["bread", 3]) }),
  "§aUnemployed · Bread ×3 · breed 12/12 ✔");
check("partial", describe({ profession: UNEMPLOYED, slots: slots(["bread", 1]) }),
  "§eUnemployed · Bread ×1 · breed 4/12");
check("none", describe({ profession: NITWIT, slots: slots() }),
  "§7Nitwit · Bread ×0 · breed 0/12");
check("mixed food", describe({ profession: LIBRARIAN, slots: slots(["carrot", 4], ["bread", 1]) }),
  "§eLibrarian · Bread ×1, Carrot ×4 · breed 8/12");
check("bread split over slots", describe({ profession: UNEMPLOYED, slots: slots(["bread", 2], ["bread", 1]) }),
  "§aUnemployed · Bread ×3 · breed 12/12 ✔");
check("meter caps at 12", describe({ profession: UNEMPLOYED, slots: slots(["bread", 20]) }),
  "§aUnemployed · Bread ×20 · breed 12/12 ✔");
check("many kinds", describe({ profession: UNEMPLOYED,
  slots: slots(["carrot", 9], ["potato", 7], ["beetroot", 5], ["wheat", 2]) }),
  "§aUnemployed · Bread ×0, Carrot ×9, Potato ×7, Beetroot ×5 +1 more · breed 12/12 ✔");
check("baby", describe({ profession: UNEMPLOYED, baby: true, slots: slots(["bread", 2]) }),
  "§7Baby villager · Bread ×2 · too young to breed");
check("unknown profession", describe({ profession: 99, slots: slots() }),
  "§7Villager · Bread ×0 · breed 0/12");

console.log("Farmers");
for (const [id, label] of [["wheat_seeds", "Wheat Seeds"], ["potato", "Potato"],
  ["carrot", "Carrot"], ["beetroot_seeds", "Beetroot Seeds"]]) {
  check(`locked ${id}`, describe({ profession: FARMER, slots: full(id) }),
    `§aFarmer · Bread ×0 · ${label} 8/8 slots ✔ locked`);
}
check("locked with partial stacks", describe({ profession: FARMER, slots: full("potato", 3) }),
  "§aFarmer · Bread ×0 · Potato 8/8 slots ✔ locked");
check("pure with free slots", describe({ profession: FARMER,
  slots: slots(["carrot", 64], ["carrot", 64], ["carrot", 12]) }),
  "§eFarmer · Bread ×0 · Carrot 3/8 slots · 5 free");
check("mixed crops", describe({ profession: FARMER,
  slots: [...full("wheat_seeds").slice(0, 7), { typeId: "minecraft:potato", amount: 2 }] }),
  "§cFarmer · Bread ×0 · MIXED · Wheat Seeds ×7 slots, Potato ×1 slot");
check("given bread", describe({ profession: FARMER,
  slots: [...full("potato").slice(0, 7), { typeId: "minecraft:bread", amount: 3 }] }),
  "§cFarmer · Bread ×3 · breed 12/12 ✔ · MIXED · Potato ×7 slots, Bread ×1 slot");
check("not plantable", describe({ profession: FARMER, slots: slots(["wheat", 20], ["wheat", 20], ["wheat", 5]) }),
  "§cFarmer · Bread ×0 · not plantable · Wheat 3/8 slots");
check("empty", describe({ profession: FARMER, slots: slots() }),
  "§7Farmer · Bread ×0 · empty · 0/8 slots");
check("mixed, many kinds", describe({ profession: FARMER,
  slots: slots(["wheat_seeds", 64], ["wheat_seeds", 64], ["potato", 1], ["carrot", 1], ["beetroot_seeds", 1]) }),
  "§cFarmer · Bread ×0 · MIXED · Wheat Seeds ×2 slots, Potato ×1 slot, Carrot ×1 slot +1 more");

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
process.exit(failures ? 1 : 0);
