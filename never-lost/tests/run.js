// Drives keeper.js with plain objects. It never imports @minecraft/server, so
// it needs no mock and no install step: `node run.js`.

import assert from "node:assert/strict";
import {
  DESPAWN_TICKS,
  hasMending,
  NETHERITE,
  REFRESH_AT,
  shouldKeep,
  Tracker,
} from "../behavior_pack/scripts/keeper.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log("ok - " + name);
}

const all = { netherite: true, mending: true, named_items: true };
const netheriteOnly = { netherite: true, mending: false, named_items: false };
const mendingOnly = { netherite: false, mending: true, named_items: false };
const namedOnly = { netherite: false, mending: false, named_items: true };
const neither = { netherite: false, mending: false, named_items: false };

/** A stack whose enchantable component reports the given enchantments. */
const enchanted = (typeId, ...ids) => ({
  typeId,
  getComponent: (c) =>
    c === "minecraft:enchantable" ? { hasEnchantment: (e) => ids.includes(e) } : undefined,
});

let nextId = 0;
const entity = () => ({ id: String(nextId++), isValid: true });

test("every netherite item is kept", () => {
  assert.equal(NETHERITE.size, 17);
  for (const typeId of NETHERITE) assert.ok(shouldKeep({ typeId }, netheriteOnly), typeId);
});

test("netherite materials are kept, not only the gear", () => {
  for (const typeId of [
    "minecraft:ancient_debris",
    "minecraft:netherite_scrap",
    "minecraft:netherite_ingot",
    "minecraft:netherite_block",
    "minecraft:netherite_upgrade_smithing_template",
  ]) {
    assert.ok(NETHERITE.has(typeId), typeId);
  }
});

test("other gear is left alone", () => {
  assert.equal(shouldKeep({ typeId: "minecraft:diamond_sword" }, netheriteOnly), false);
  assert.equal(shouldKeep(enchanted("minecraft:diamond_sword", "sharpness"), all), false);
});

test("anything with Mending is kept", () => {
  assert.equal(shouldKeep(enchanted("minecraft:diamond_pickaxe", "efficiency", "mending"), mendingOnly), true);
  assert.equal(shouldKeep(enchanted("minecraft:elytra", "mending"), mendingOnly), true);
});

test("the Mending toggle switches it off", () => {
  assert.equal(shouldKeep(enchanted("minecraft:diamond_pickaxe", "mending"), netheriteOnly), false);
});

test("an item that cannot be enchanted is not Mending", () => {
  assert.equal(hasMending({ typeId: "minecraft:dirt", getComponent: () => undefined }), false);
  assert.equal(hasMending({ typeId: "minecraft:dirt" }), false);
  assert.equal(
    hasMending({
      typeId: "minecraft:dirt",
      getComponent: () => {
        throw new Error("engine");
      },
    }),
    false,
  );
});

test("the netherite toggle switches gear off", () => {
  assert.equal(shouldKeep({ typeId: "minecraft:netherite_sword" }, namedOnly), false);
  assert.equal(shouldKeep({ typeId: "minecraft:netherite_ingot" }, mendingOnly), false);
  assert.equal(shouldKeep({ typeId: "minecraft:netherite_sword" }, neither), false);
});

test("renamed items are kept only with the setting on", () => {
  const named = { typeId: "minecraft:dirt", nameTag: "Precious" };
  assert.equal(shouldKeep(named, netheriteOnly), false);
  assert.equal(shouldKeep(named, namedOnly), true);
});

test("an empty or missing name is not a name", () => {
  assert.equal(shouldKeep({ typeId: "minecraft:dirt", nameTag: "" }, namedOnly), false);
  assert.equal(shouldKeep({ typeId: "minecraft:dirt" }, namedOnly), false);
  assert.equal(shouldKeep(undefined, all), false);
});

test("the refresh comes with a minute to spare", () => {
  assert.ok(REFRESH_AT <= DESPAWN_TICKS - 1200);
});

test("a newly dropped item is due at four minutes, not before", () => {
  const t = new Tracker();
  const e = entity();
  t.watch(e, true);
  let ticks = 0;
  while (ticks + 100 < REFRESH_AT) {
    ticks += 100;
    assert.deepEqual(t.step(100), [], "due early at " + ticks);
  }
  assert.deepEqual(t.step(100), [e]);
});

test("an item of unknown age is due at once", () => {
  const t = new Tracker();
  const e = entity();
  t.watch(e, false);
  assert.deepEqual(t.step(100), [e]);
});

test("watching twice does not reset the count", () => {
  const t = new Tracker();
  const e = entity();
  t.watch(e, false);
  t.watch(e, true);
  assert.deepEqual(t.step(100), [e]);
});

test("an item that is gone is forgotten", () => {
  const t = new Tracker();
  const e = entity();
  t.watch(e, true);
  e.isValid = false;
  assert.deepEqual(t.step(100), []);
  assert.equal(t.size, 0);
});

test("a forgotten item can be watched again from zero", () => {
  const t = new Tracker();
  const e = entity();
  t.watch(e, false);
  t.forget(e.id);
  t.watch(e, true);
  assert.deepEqual(t.step(100), []);
});

console.log(`\n${passed} passed`);
