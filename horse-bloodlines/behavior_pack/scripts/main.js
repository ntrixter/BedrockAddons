import { GameMode, ItemStack, system, world } from "@minecraft/server";
import {
  bookPages,
  bookTitle,
  colorName,
  describe,
  inherit,
  jumpBlocks,
  jumpFromHeight,
  jumpStep,
  lookName,
  speedOfStep,
  wildJump,
} from "./genes.js";

const NS = "horsebreed";
const HORSE = "minecraft:horse";
const DATA = `${NS}:data`;
const BREED_ITEMS = new Set(["minecraft:golden_carrot", "minecraft:golden_apple", "minecraft:enchanted_golden_apple"]);
// A fed horse stays in love for 30 seconds; allow for the walk to its partner.
const LOVE_TICKS = 1200;
const PARENT_SEARCH = 10;
const TICKS_PER_UPDATE = 5;
const REACH = 8;
// Test builds set this to print each birth's roll in chat.
const DEBUG = false;

function debug(text) {
  if (DEBUG) world.sendMessage(`§8[debug] ${text}`);
}

/** Read once at load: there is no stable settings-change event yet. */
function readSettings() {
  let values = {};
  try {
    values = world.getPackSettings() ?? {};
  } catch {
    // Older runtimes or a server with no settings file: use the defaults.
  }
  const chance = Number(values[`${NS}:chance`]);
  return {
    stats: values[`${NS}:show_stats`] !== false,
    parents: values[`${NS}:show_parents`] === true,
    chance: Number.isFinite(chance) ? Math.min(100, Math.max(50, chance)) / 100 : 0.6,
  };
}

const settings = readSettings();

// ---- per-horse record -----------------------------------------------------
// { h, s, j, origin: "bred" | "wild", day, by, p: [{ id, name }] }
// h is hit points, s the movement value, j jump strength in hundredths.

function readData(horse) {
  try {
    const raw = horse.getDynamicProperty(DATA);
    return typeof raw === "string" ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function writeData(horse, data) {
  horse.setDynamicProperty(DATA, JSON.stringify(data));
}

function liveHealth(horse) {
  return horse.getComponent("minecraft:health")?.effectiveMax;
}

function liveSpeed(horse) {
  return horse.getComponent("minecraft:movement")?.currentValue;
}

/** Jump strength is not in the documented component list; try it anyway. */
function liveJump(horse) {
  try {
    const v = horse.getComponent("minecraft:horse.jump_strength")?.currentValue;
    return typeof v === "number" ? jumpStep(v * 100) : undefined;
  } catch {
    return undefined;
  }
}

function statsOf(horse, data = readData(horse)) {
  return {
    h: data?.h ?? liveHealth(horse) ?? 15,
    s: data?.s ?? liveSpeed(horse) ?? 0.1125,
    j: data?.j ?? liveJump(horse) ?? null,
    jEst: data?.jEst === true,
  };
}

function variantOf(horse) {
  return horse.getComponent("minecraft:variant")?.value;
}

function markOf(horse) {
  return horse.getComponent("minecraft:mark_variant")?.value;
}

/** Name tag, or "Chestnut horse" when it has none. */
function displayName(horse) {
  if (horse.nameTag) return horse.nameTag;
  return `${colorName(variantOf(horse))} horse`;
}

/** Name tag, or "unnamed chestnut": for naming a parent. */
function parentLabel(horse) {
  return horse.nameTag || lookName(variantOf(horse));
}

function applyStat(horse, stat, step) {
  horse.triggerEvent(`${NS}:set_${stat}_${step}`);
}

// ---- breeding ---------------------------------------------------------------

// horse id -> { tick, player } for the last breeding food it was given.
const fed = new Map();

world.afterEvents.playerInteractWithEntity.subscribe(({ player, target, beforeItemStack }) => {
  if (target.typeId !== HORSE || !beforeItemStack || !BREED_ITEMS.has(beforeItemStack.typeId)) return;
  fed.set(target.id, { tick: system.currentTick, player: player.name });
});

function recentlyFed(id) {
  const f = fed.get(id);
  return f && system.currentTick - f.tick <= LOVE_TICKS ? f : undefined;
}

/**
 * The foal's parents: the two nearest adults that were fed breeding food in
 * the last minute. Feeding is the only way a horse comes into love, so an
 * adult nobody fed is never counted - a foal from a spawn egg finds none.
 */
function findParents(foal) {
  const at = foal.location;
  const dist = (h) => (h.location.x - at.x) ** 2 + (h.location.y - at.y) ** 2 + (h.location.z - at.z) ** 2;
  return foal.dimension
    .getEntities({ type: HORSE, location: at, maxDistance: PARENT_SEARCH })
    .filter((h) => h.id !== foal.id && !h.hasComponent("minecraft:is_baby") && recentlyFed(h.id))
    .sort((a, b) => dist(a) - dist(b))
    .slice(0, 2);
}

function onBorn(foal) {
  const parents = findParents(foal);
  const day = world.getDay();
  if (parents.length < 2) {
    // No fed pair nearby: keep what vanilla gave it, and give it a known jump.
    console.warn(`[Horse Bloodlines] foal born with ${parents.length} fed parent(s) in range; stats left to vanilla`);
    const j = wildJump(Math.random);
    applyStat(foal, "jump", j);
    writeData(foal, { h: liveHealth(foal), s: liveSpeed(foal), j, origin: "bred", day });
    return;
  }
  const [a, b] = parents;
  const child = inherit(statsOf(a), statsOf(b), settings.chance, Math.random);
  applyStat(foal, "health", child.h);
  applyStat(foal, "speed", child.s);
  applyStat(foal, "jump", child.j);
  const breeders = [...new Set(parents.map((p) => recentlyFed(p.id)?.player).filter(Boolean))];
  writeData(foal, {
    h: child.h,
    s: speedOfStep(child.s),
    j: child.j,
    origin: "bred",
    day,
    by: breeders.length ? breeders.join(" & ") : undefined,
    p: parents.map((p) => ({ id: p.id, name: parentLabel(p) })),
  });
  for (const p of parents) fed.delete(p.id);
  const fmt = (st) => `${st.h}/${Number(st.s).toFixed(4)}/${st.j ?? "?"}`;
  debug(`born: ${fmt(statsOf(a))} x ${fmt(statsOf(b))} -> ${child.h}/${speedOfStep(child.s)}/${child.j}`);
  system.runTimeout(() => {
    if (foal.isValid) debug(`foal now reads health ${liveHealth(foal)}, speed ${liveSpeed(foal)}, jump ${liveJump(foal) ?? "unreadable"}`);
  }, 20);
}

function onSpawned(horse) {
  // Vanilla's jump cannot be read back, so roll it here, the same way vanilla
  // does, and remember it. Health and speed are vanilla's own rolls.
  const j = wildJump(Math.random);
  debug(`spawned: health ${liveHealth(horse)}, speed ${liveSpeed(horse)}, vanilla jump ${liveJump(horse) ?? "unreadable"}, setting ${j}`);
  applyStat(horse, "jump", j);
  writeData(horse, { h: liveHealth(horse), s: liveSpeed(horse), j, origin: "wild", day: world.getDay() });
}

world.afterEvents.entitySpawn.subscribe(({ entity, cause }) => {
  try {
    if (entity.typeId !== HORSE || readData(entity)) return;
    if (cause === "Born") onBorn(entity);
    else if (cause === "Spawned" || cause === "Event") onSpawned(entity);
  } catch (err) {
    if (entity.isValid) console.warn(`[Horse Bloodlines] ${err}`);
  }
});

// ---- measuring jump ----------------------------------------------------------
// A horse's jump strength cannot be read, so for a horse that predates the
// pack it is measured: while a player rides it, each jump's rise from take-off
// to peak is recorded, and the best one is turned back into a strength. A
// partly charged jump only rises less, so the best jump converges on a full
// one. Horses whose jump the pack set itself are only checked against the
// formula, in debug output.

const MIN_RISE = 0.6;
const BOUNCY = new Set(["minecraft:slime", "minecraft:bed"]);
// horse id -> { groundY, airborne, startY, peak, clean }
const flights = new Map();

function bouncyUnder(horse, y) {
  const { x, z } = horse.location;
  const block = horse.dimension.getBlock({ x: Math.floor(x), y: Math.floor(y - 0.05), z: Math.floor(z) });
  return BOUNCY.has(block?.typeId);
}

function trackJump(rider, horse) {
  const y = horse.location.y;
  let f = flights.get(horse.id);
  if (!f) {
    f = { groundY: y, airborne: false };
    flights.set(horse.id, f);
  }
  if (horse.isOnGround) {
    if (f.airborne && f.clean) recordJump(rider, horse, f.peak - f.startY);
    f.airborne = false;
    f.groundY = y;
    return;
  }
  if (!f.airborne) {
    f.airborne = true;
    f.startY = f.groundY;
    f.peak = y;
    // Water, Jump Boost and bouncy blocks all change the height of a jump.
    f.clean = !horse.isInWater && !horse.getEffect("jump_boost") && !bouncyUnder(horse, f.groundY);
  } else {
    f.peak = Math.max(f.peak, y);
    if (horse.isInWater) f.clean = false;
  }
}

function recordJump(rider, horse, rise) {
  if (rise < MIN_RISE) return;
  const data = readData(horse) ?? {};
  const est = jumpFromHeight(rise);
  if (data.j != null && !data.jEst) {
    debug(`jump rose ${rise.toFixed(2)}; set strength ${data.j} predicts ${jumpBlocks(data.j).toFixed(2)} at full charge`);
    return;
  }
  debug(`jump rose ${rise.toFixed(2)} -> strength ~${est} (best so far ${data.jm?.toFixed(2) ?? "none"})`);
  if (data.jm != null && rise <= data.jm) return;
  writeData(horse, { ...data, j: est, jEst: true, jm: rise });
  rider.onScreenDisplay.setActionBar(`§aNew best jump: ${rise.toFixed(1)} blocks`);
}

system.runInterval(() => {
  const riding = new Set();
  for (const player of world.getPlayers()) {
    try {
      const horse = player.getComponent("minecraft:riding")?.entityRidingOn;
      if (horse?.typeId !== HORSE) continue;
      riding.add(horse.id);
      trackJump(player, horse);
    } catch {
      // The rider or horse can go away mid-update.
    }
  }
  for (const id of flights.keys()) if (!riding.has(id)) flights.delete(id);
}, 1);

// ---- what the player is looking at ------------------------------------------

/** Names of a bred horse's parents, live name tags first. */
function parentNames(data) {
  return (data?.p ?? []).map((p) => {
    let live;
    try {
      live = world.getEntity(p.id);
    } catch {
      live = undefined;
    }
    return live?.isValid && live.nameTag ? live.nameTag : p.name;
  });
}

function infoOf(horse) {
  const data = readData(horse);
  return {
    data,
    name: displayName(horse),
    baby: horse.hasComponent("minecraft:is_baby"),
    stats: statsOf(horse, data),
    origin: data?.origin,
    parents: parentNames(data),
  };
}

/** The nearest horse the player is pointing at, other than the one ridden. */
function targetHorse(player) {
  const mount = player.getComponent("minecraft:riding")?.entityRidingOn;
  let nearest;
  for (const hit of player.getEntitiesFromViewDirection({
    type: HORSE,
    maxDistance: REACH,
    ignoreBlockCollision: true,
  })) {
    if (hit.entity.id === mount?.id) continue;
    if (!nearest || hit.distance < nearest.distance) nearest = hit;
  }
  return nearest?.entity;
}

const showing = new Set();

if (settings.stats || settings.parents) {
  system.runInterval(() => {
    for (const player of world.getPlayers()) {
      try {
        const horse = targetHorse(player);
        if (horse) {
          player.onScreenDisplay.setActionBar(describe(infoOf(horse), settings));
          showing.add(player.id);
        } else if (showing.delete(player.id)) {
          player.onScreenDisplay.setActionBar("");
        }
      } catch {
        // A player can leave, or a horse despawn, while this update runs.
      }
    }
  }, TICKS_PER_UPDATE);
}

// ---- the book -----------------------------------------------------------------

const lastBook = new Map();

world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
  if (ev.target.typeId !== HORSE || ev.itemStack?.typeId !== "minecraft:book") return;
  // Without this a book in hand mounts the horse, or feeds a wild one's temper.
  ev.cancel = true;
  const { player, target } = ev;
  const now = system.currentTick;
  if (now - (lastBook.get(player.id) ?? -100) < 10) return;
  lastBook.set(player.id, now);
  system.run(() => {
    try {
      writeBook(player, target);
    } catch (err) {
      console.warn(`[Horse Bloodlines] could not write the book: ${err}`);
    }
  });
});

function writeBook(player, horse) {
  if (!player.isValid || !horse.isValid) return;
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (!inv) return;
  const slot = player.selectedSlotIndex;
  const held = inv.getItem(slot);
  if (held?.typeId !== "minecraft:book") return;

  const info = infoOf(horse);
  const book = new ItemStack("minecraft:written_book", 1);
  const pages = bookPages({
    ...info,
    breeder: info.data?.by,
    day: info.data?.day,
    variant: variantOf(horse),
    mark: markOf(horse),
    today: world.getDay(),
  });
  const component = book.getComponent("minecraft:book");
  component.setContents(pages);
  component.signBook(bookTitle(info.name), player.name);

  if (player.getGameMode() !== GameMode.Creative) {
    if (held.amount > 1) {
      held.amount -= 1;
      inv.setItem(slot, held);
    } else {
      inv.setItem(slot, undefined);
    }
  }
  const left = inv.addItem(book);
  if (left) player.dimension.spawnItem(left, player.location);
  player.playSound("item.book.page_turn");
}
