// Villager Inspector test harness.
//
// Drives describe.js, the part that turns an inventory into the action-bar
// line, with plain objects; and links.js, the bed and workstation bookkeeping,
// against a small mock of @minecraft/server. loader.js redirects that import,
// so the shipping scripts load unmodified with no install step:
//
//   cd villager-inspector/tests && node --import ./register.js run.js
//
// It cannot check anything that needs the real game: whether a script may read
// a villager's private inventory at all, whether resupply_trades really fires
// at the job site, whether the raycast finds a villager behind glass, or how
// the line looks on a phone. See README.md "Confirm in-game".

import { describe, describeBlock } from "../behavior_pack/scripts/describe.js";
import * as links from "../behavior_pack/scripts/links.js";
import { world, setBlock, makeVillager, unload, reset } from "@minecraft/server";

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

console.log("Names and link markers");
check("name tag", describe({ profession: UNEMPLOYED, nameTag: "Bob", slots: slots(["bread", 3]) }),
  "§aUnemployed \"Bob\" · Bread ×3 · breed 12/12 ✔");
check("links known", describe({ profession: LIBRARIAN, slots: slots(), links: { bed: true, job: true } }),
  "§7Librarian · Bread ×0 · breed 0/12 · bed ✔ · job ✔");
check("links unknown", describe({ profession: FARMER, slots: full("potato"), links: { bed: false, job: true } }),
  "§aFarmer · Bread ×0 · Potato 8/8 slots ✔ locked · bed ? · job ✔");
check("unemployed has no job marker", describe({ profession: UNEMPLOYED, slots: slots(), links: { bed: true, job: false } }),
  "§7Unemployed · Bread ×0 · breed 0/12 · bed ✔");
check("nitwit has no job marker", describe({ profession: NITWIT, slots: slots(), links: { bed: false, job: false } }),
  "§7Nitwit · Bread ×0 · breed 0/12 · bed ?");
check("baby has no job marker", describe({ profession: UNEMPLOYED, baby: true, slots: slots(), links: { bed: true, job: false } }),
  "§7Baby villager · Bread ×0 · too young to breed · bed ✔");

console.log("Block lines");
check("owned", describeBlock("Composter", { loaded: true, profession: FARMER, distance: 3.4 }),
  "§aComposter · Farmer · 3 blocks");
check("owned, named", describeBlock("Bed", { loaded: true, profession: LIBRARIAN, nameTag: "Bob", distance: 6 }),
  "§aBed · Librarian \"Bob\" · 6 blocks");
check("owned, one block", describeBlock("Lectern", { loaded: true, profession: LIBRARIAN, distance: 1.2 }),
  "§aLectern · Librarian · 1 block");
check("owner away", describeBlock("Bed", { loaded: false }), "§eBed · villager not nearby");
check("never seen", describeBlock("Lectern", undefined), "§7Lectern · no villager linked");

console.log("Link bookkeeping");
{
  reset();
  const composter = setBlock(0, 64, 0, "minecraft:composter");
  const a = makeVillager();
  links.record(a, "job", composter);
  check("job recorded", links.linkOf(a, "job"), "0,64,0,minecraft:overworld");
  check("owner found", links.ownerOf(composter, "job")?.entity, a);

  const b = makeVillager();
  links.record(b, "job", composter);
  check("taken over: new owner", links.ownerOf(composter, "job")?.entity, b);
  check("taken over: old owner loses it", links.linkOf(a, "job"), undefined);

  const other = setBlock(5, 64, 0, "minecraft:composter");
  links.record(b, "job", other);
  check("moved: old block freed", links.ownerOf(composter, "job"), undefined);
  check("moved: new block owned", links.ownerOf(other, "job")?.entity, b);

  // A stale world entry, left by a re-claim while the owner was unloaded,
  // reports no owner and is cleaned up.
  {
    const stale = setBlock(7, 64, 0, "minecraft:composter");
    const staleKey = "vi:o:7,64,0,minecraft:overworld";
    world.setDynamicProperty(staleKey, b.id);
    check("stale entry: no owner", links.ownerOf(stale, "job"), undefined);
    check("stale entry: cleaned up", world.getDynamicProperty(staleKey), undefined);
  }

  unload(b);
  check("owner unloaded", JSON.stringify(links.ownerOf(other, "job")), "{}");

  const c = makeVillager();
  const lectern = setBlock(9, 64, 0, "minecraft:lectern");
  links.record(c, "job", lectern);
  setBlock(9, 64, 0, "minecraft:air");
  check("block broken: link dropped", links.linkOf(c, "job"), undefined);
  check("block broken: index dropped", links.ownerOf(setBlock(9, 64, 0, "minecraft:lectern"), "job"), undefined);

  const d = makeVillager();
  const e = setBlock(20, 64, 0, "minecraft:barrel");
  links.record(d, "job", e);
  links.forget(d.id);
  check("death forgets", links.ownerOf(e, "job"), undefined);
}
{
  reset();
  // Bed facing south (direction 0): foot at z=0, head at z=1.
  const foot = setBlock(0, 64, 0, "minecraft:bed", { direction: 0, head_piece_bit: false });
  const head = setBlock(0, 64, 1, "minecraft:bed", { direction: 0, head_piece_bit: true });
  const v = makeVillager();
  links.record(v, "bed", foot);
  check("bed stored on the head", links.linkOf(v, "bed"), "0,64,1,minecraft:overworld");
  check("head finds owner", links.ownerOf(head, "bed")?.entity, v);
  check("foot finds owner", links.ownerOf(foot, "bed")?.entity, v);

  // A second bed in line behind it, same direction: must not be confused.
  setBlock(0, 64, 2, "minecraft:bed", { direction: 0, head_piece_bit: false });
  const head2 = setBlock(0, 64, 3, "minecraft:bed", { direction: 0, head_piece_bit: true });
  check("bed in line is separate", links.ownerOf(head2, "bed"), undefined);

  const w = makeVillager();
  const lone = setBlock(10, 64, 0, "minecraft:bed", { direction: 0, head_piece_bit: false });
  links.record(w, "bed", lone);
  check("half bed falls back to itself", links.linkOf(w, "bed"), "10,64,0,minecraft:overworld");
}

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
process.exit(failures ? 1 : 0);
