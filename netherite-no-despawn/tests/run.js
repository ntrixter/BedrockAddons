// Drives keeper.js with plain objects. It never imports @minecraft/server, so
// it needs no mock and no install step: `node run.js`.

import assert from "node:assert/strict";
import {
  DESPAWN_TICKS,
  NETHERITE_GEAR,
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

const both = { netherite: true, named_items: true };
const netheriteOnly = { netherite: true, named_items: false };
const namedOnly = { netherite: false, named_items: true };
const neither = { netherite: false, named_items: false };

let nextId = 0;
const entity = () => ({ id: String(nextId++), isValid: true });

test("every netherite tool, weapon and armour piece is kept", () => {
  assert.equal(NETHERITE_GEAR.size, 12);
  for (const typeId of NETHERITE_GEAR) assert.ok(shouldKeep({ typeId }, netheriteOnly), typeId);
});

test("netherite materials are not gear", () => {
  for (const typeId of [
    "minecraft:netherite_ingot",
    "minecraft:netherite_scrap",
    "minecraft:netherite_block",
    "minecraft:netherite_upgrade_smithing_template",
  ]) {
    assert.equal(shouldKeep({ typeId }, both), false, typeId);
  }
});

test("other gear is left alone", () => {
  assert.equal(shouldKeep({ typeId: "minecraft:diamond_sword" }, both), false);
});

test("the netherite toggle switches gear off", () => {
  assert.equal(shouldKeep({ typeId: "minecraft:netherite_sword" }, namedOnly), false);
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
  assert.equal(shouldKeep(undefined, both), false);
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
