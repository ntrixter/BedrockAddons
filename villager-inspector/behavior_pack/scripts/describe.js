/**
 * Turns a villager's inventory into the one line shown on the action bar.
 *
 * Pure: it never touches @minecraft/server, so tests/run.js can drive it with
 * plain objects. main.js does the reading and hands over a snapshot.
 *
 * A snapshot is { profession, baby, slots }, where `profession` is the value of
 * the villager's minecraft:variant component and `slots` has one entry per
 * inventory slot: { typeId, amount } or undefined for an empty slot.
 */

// minecraft:variant values, from the profession component groups in vanilla
// villager_v2.json. Not minecraft:mark_variant - that one is the biome skin.
export const PROFESSIONS = [
  "Unemployed",
  "Farmer",
  "Fisherman",
  "Shepherd",
  "Fletcher",
  "Librarian",
  "Cartographer",
  "Cleric",
  "Armorer",
  "Weaponsmith",
  "Toolsmith",
  "Butcher",
  "Leatherworker",
  "Mason",
  "Nitwit",
];
const FARMER = 1;

// Points toward willingness to breed. Vanilla's shareables ask for 3 bread or
// 12 of a crop, so one bread is worth four crops and 12 points is ready.
const FOOD_POINTS = {
  "minecraft:bread": 4,
  "minecraft:carrot": 1,
  "minecraft:potato": 1,
  "minecraft:beetroot": 1,
};
export const BREED_POINTS = 12;

// What a farmer plants. A farm farmer should hold exactly one of these, in
// every slot, so it has no room to pick up anything else.
const PLANTABLE = new Set([
  "minecraft:wheat_seeds",
  "minecraft:potato",
  "minecraft:carrot",
  "minecraft:beetroot_seeds",
]);

// English names for everything a villager picks up by itself. Anything else
// can only have been handed to it, and falls back to its id.
const NAMES = {
  "minecraft:bread": "Bread",
  "minecraft:carrot": "Carrot",
  "minecraft:potato": "Potato",
  "minecraft:beetroot": "Beetroot",
  "minecraft:wheat": "Wheat",
  "minecraft:wheat_seeds": "Wheat Seeds",
  "minecraft:beetroot_seeds": "Beetroot Seeds",
};

const MAX_KINDS = 3;

const GREEN = "§a";
const YELLOW = "§e";
const RED = "§c";
const GREY = "§7";

export function itemName(typeId) {
  if (NAMES[typeId]) return NAMES[typeId];
  return typeId
    .replace(/^minecraft:/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Group slots by item: Map<typeId, { amount, slots }>, most first. */
function tally(slots) {
  const kinds = new Map();
  for (const slot of slots) {
    if (!slot) continue;
    const kind = kinds.get(slot.typeId) ?? { amount: 0, slots: 0 };
    kind.amount += slot.amount;
    kind.slots += 1;
    kinds.set(slot.typeId, kind);
  }
  return new Map([...kinds].sort((a, b) => b[1].slots - a[1].slots || b[1].amount - a[1].amount));
}

/** Join up to MAX_KINDS parts, then "+N more". */
function capped(parts) {
  if (parts.length <= MAX_KINDS) return parts.join(", ");
  return `${parts.slice(0, MAX_KINDS).join(", ")} +${parts.length - MAX_KINDS} more`;
}

export function foodPoints(kinds) {
  let points = 0;
  for (const [typeId, kind] of kinds) points += (FOOD_POINTS[typeId] ?? 0) * kind.amount;
  return points;
}

/** "breed 8/12", or "breed 12/12 ✔" once ready. Capped so it never reads 512/12. */
function breedText(points) {
  if (points >= BREED_POINTS) return `breed ${BREED_POINTS}/${BREED_POINTS} ✔`;
  return `breed ${points}/${BREED_POINTS}`;
}

function breadText(kinds) {
  return `Bread ×${kinds.get("minecraft:bread")?.amount ?? 0}`;
}

/**
 * Everyone but a farmer: bread first, always, so it sits in the same place on
 * the bar while you walk a breeder; then any other items; then the meter.
 */
function describeBreeder(name, kinds) {
  const others = [...kinds]
    .filter(([typeId]) => typeId !== "minecraft:bread")
    .sort((a, b) => b[1].amount - a[1].amount)
    .map(([typeId, kind]) => `${itemName(typeId)} ×${kind.amount}`);
  const items = others.length ? `${breadText(kinds)}, ${capped(others)}` : breadText(kinds);
  const points = foodPoints(kinds);
  const colour = points >= BREED_POINTS ? GREEN : points > 0 ? YELLOW : GREY;
  return `${colour}${name} · ${items} · ${breedText(points)}`;
}

/**
 * A farmer: the colour is whether it is locked to one crop, because that is
 * what keeps a farm working. Bread is still shown, and counts as mixing - it
 * takes a slot a crop should be in. The meter appears only while it holds
 * bread, which is what you feed a breeder; a locked potato farmer is always
 * willing and saying so on every look would be noise.
 */
function describeFarmer(name, kinds, size) {
  const used = [...kinds.values()].reduce((n, k) => n + k.slots, 0);
  const parts = [`${name}`, breadText(kinds)];
  if (kinds.has("minecraft:bread")) parts.push(breedText(foodPoints(kinds)));

  let colour;
  if (kinds.size === 0) {
    colour = GREY;
    parts.push(`empty · 0/${size} slots`);
  } else if (kinds.size > 1) {
    colour = RED;
    const list = [...kinds].map(
      ([typeId, k]) => `${itemName(typeId)} ×${k.slots} slot${k.slots === 1 ? "" : "s"}`,
    );
    parts.push(`MIXED · ${capped(list)}`);
  } else {
    const [typeId] = kinds.keys();
    const label = itemName(typeId);
    if (!PLANTABLE.has(typeId)) {
      colour = RED;
      parts.push(`not plantable · ${label} ${used}/${size} slots`);
    } else if (used >= size) {
      colour = GREEN;
      parts.push(`${label} ${used}/${size} slots ✔ locked`);
    } else {
      colour = YELLOW;
      parts.push(`${label} ${used}/${size} slots · ${size - used} free`);
    }
  }
  return colour + parts.join(" · ");
}

export function describe({ profession, baby, slots }) {
  const kinds = tally(slots);
  if (baby) {
    return `${GREY}Baby villager · ${breadText(kinds)} · too young to breed`;
  }
  const name = PROFESSIONS[profession] ?? "Villager";
  if (profession === FARMER) return describeFarmer(name, kinds, slots.length);
  return describeBreeder(name, kinds);
}
