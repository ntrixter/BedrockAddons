import { GameMode, ItemStack, system, world } from "@minecraft/server";
import {
  bookPages,
  bookTitle,
  COLORS,
  describe,
  FIXED,
  generationOf,
  inherit,
  inheritLook,
  jumpBlocks,
  jumpFromHeight,
  jumpStep,
  herdName,
  KINDS,
  VANILLA_MULE,
  shownStats,
  MARKINGS,
  speedOfStep,
  wildJump,
} from "./genes.js";

const NS = "horsebreed";
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
    wild: values[`${NS}:wild_stats`] === true,
    learn: values[`${NS}:learn_by_riding`] !== false,
    donkeys: values[`${NS}:donkeys_mules`] !== false,
    sneakBook: values[`${NS}:sneak_for_book`] === true,
    chance: Number.isFinite(chance) ? Math.min(100, Math.max(25, chance)) / 100 : 0.6,
  };
}

const settings = readSettings();

// Horses, plus donkeys and mules when that setting is on. "Horse" in this
// file means any of them.
const EQUINES = Object.keys(KINDS).filter((t) => settings.donkeys || KINDS[t] === "horse");
const isEquine = (entity) => EQUINES.includes(entity.typeId);
const kindOf = (entity) => KINDS[entity.typeId];

// ---- per-horse record -----------------------------------------------------
// { rn, nn, h, s, j, origin: "bred" | "wild", day, by, tb, g, c, m, p: [{ id, name, first, origin, g }] }
// rn is the registry number, nn the generated name's number, h hit points, s the movement value, j jump
// strength in hundredths, tb the player who tamed it, g the generation, and
// c and m a foal's coat and markings, rd whether it has been ridden, jm its
// best jump seen, in blocks.

function readData(horse) {
  try {
    const raw = horse.getDynamicProperty(DATA);
    return typeof raw === "string" ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

// Test builds before 1.0.0 numbered every horse the pack met, under other
// keys; those numbers are ignored so the first horse registered is #1.
const NEXT_REG = `${NS}:registry_next`;

/**
 * The next registry number, world-wide. A horse is registered when it is
 * tamed or first written up in a book, in that order, so a generated name
 * never repeats in one world and wild horses do not use numbers up.
 */
function nextRegistry() {
  const n = world.getDynamicProperty(NEXT_REG);
  const reg = typeof n === "number" && n >= 1 ? n : 1;
  world.setDynamicProperty(NEXT_REG, reg + 1);
  return reg;
}

const NAME_COUNTS = `${NS}:name_counts`;

/**
 * The next number for a generated name, counted per name: the first
 * "Copper Blaze" registered is #1, the second #2, whatever their registry
 * numbers are.
 */
function nextNameNumber(words) {
  let counts = {};
  try {
    counts = JSON.parse(world.getDynamicProperty(NAME_COUNTS) ?? "{}");
  } catch {
    counts = {};
  }
  const n = (counts[words] ?? 0) + 1;
  counts[words] = n;
  world.setDynamicProperty(NAME_COUNTS, JSON.stringify(counts));
  return n;
}

/** Saves a horse's record. A horse keeps its registry and name numbers for life. */
function writeData(horse, data) {
  const old = readData(horse);
  const rn = data.rn ?? old?.rn;
  const nn = data.nn ?? old?.nn;
  horse.setDynamicProperty(DATA, JSON.stringify({ ...data, rn, nn }));
}

/** Registers the horse if it is not yet registered; returns its registry number. */
function register(horse, extra = {}) {
  const data = readData(horse) ?? {};
  const rn = data.rn ?? nextRegistry();
  const nn = data.nn ?? nextNameNumber(herdName(horse.id, variantOf(horse), markOf(horse), undefined, kindOf(horse)));
  writeData(horse, { ...data, ...extra, rn, nn });
  return rn;
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
  const fixed = FIXED[kindOf(horse)];
  if (fixed) return { h: data?.h ?? liveHealth(horse) ?? 15, s: fixed.s, j: fixed.j, jEst: false, fixed: true };
  // A mule the pack did not breed has vanilla's fixed speed and jump.
  const vanilla = kindOf(horse) === "mule" ? VANILLA_MULE : {};
  return {
    h: data?.h ?? liveHealth(horse) ?? 15,
    s: data?.s ?? liveSpeed(horse) ?? vanilla.s ?? 0.1125,
    j: data?.j ?? liveJump(horse) ?? vanilla.j ?? null,
    jEst: data?.jEst === true,
  };
}

// A foal's coat and markings are set by the pack at birth (see setLook) and
// recorded, so the record covers the tick before the components appear.
function variantOf(horse) {
  return horse.getComponent("minecraft:variant")?.value ?? readData(horse)?.c;
}

function markOf(horse) {
  return horse.getComponent("minecraft:mark_variant")?.value ?? readData(horse)?.m;
}

/** A horse's generation: wild horses and horses of unknown birth are 0. */
function genOf(horse) {
  return readData(horse)?.g ?? 0;
}

/**
 * Picks a foal's coat and markings and applies them. The engine gives a foal
 * a look of its own, but leaves no component a script can read, so the pack
 * chooses instead, by the same odds.
 */
function setLook(foal, parents) {
  const [a, b] = parents;
  const c = inheritLook(a && variantOf(a), b && variantOf(b), COLORS.length, Math.random);
  const m = inheritLook(a && markOf(a), b && markOf(b), MARKINGS.length, Math.random);
  foal.triggerEvent(`${NS}:set_coat_${c}`);
  foal.triggerEvent(`${NS}:set_mark_${m}`);
  return { c, m };
}

/** Name tag, or a generated name such as "Copper Blaze #27" when it has none. */
function displayName(horse) {
  return horse.nameTag || firstNameOf(horse);
}

/** The generated name the horse was given in the wild or at birth. */
function firstNameOf(horse) {
  return herdName(horse.id, variantOf(horse), markOf(horse), readData(horse)?.nn, kindOf(horse));
}

function applyStat(horse, stat, step) {
  horse.triggerEvent(`${NS}:set_${stat}_${step}`);
}

// ---- breeding ---------------------------------------------------------------

// horse id -> { tick, player } for the last breeding food it was given.
const fed = new Map();

world.afterEvents.playerInteractWithEntity.subscribe(({ player, target, beforeItemStack }) => {
  if (!isEquine(target) || !beforeItemStack || !BREED_ITEMS.has(beforeItemStack.typeId)) return;
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
    .getEntities({ location: at, maxDistance: PARENT_SEARCH })
    .filter((h) => isEquine(h) && h.id !== foal.id && !h.hasComponent("minecraft:is_baby") && recentlyFed(h.id))
    .sort((a, b) => dist(a) - dist(b))
    .slice(0, 2);
}

function onBorn(foal) {
  const parents = findParents(foal);
  const day = world.getDay();
  const kind = kindOf(foal);
  const isHorse = kind === "horse";
  if (kind === "donkey") return onDonkeyBorn(foal, parents, day);
  if (parents.length < 2) {
    // No fed pair nearby: keep what vanilla gave it, and give it a known jump.
    console.warn(`[Champion Lines] foal born with ${parents.length} fed parent(s) in range; stats left to vanilla`);
    const g = generationOf(...parents.map(genOf));
    if (!isHorse) {
      writeData(foal, { h: liveHealth(foal), s: VANILLA_MULE.s, j: VANILLA_MULE.j, origin: "bred", day, g });
      return;
    }
    const j = wildJump(Math.random);
    writeData(foal, { h: liveHealth(foal), s: liveSpeed(foal), j, origin: "bred", day, g });
    applyStat(foal, "jump", j);
    writeData(foal, { ...readData(foal), ...setLook(foal, parents) });
    return;
  }
  const [a, b] = parents;
  const child = inherit(statsOf(a), statsOf(b), settings.chance, Math.random);
  const breeders = [...new Set(parents.map((p) => recentlyFed(p.id)?.player).filter(Boolean))];
  // A mule rolls every stat like a horse, from its horse and donkey parents.
  writeData(foal, {
    h: child.h,
    s: speedOfStep(child.s),
    j: child.j,
    origin: "bred",
    day,
    g: generationOf(genOf(a), genOf(b)),
    by: breeders.length ? breeders.join(" & ") : undefined,
    p: parents.map((p) => ({ id: p.id, name: displayName(p), first: firstNameOf(p), origin: readData(p)?.origin, g: genOf(p), st: shownOf(p) })),
  });
  applyStat(foal, "health", child.h);
  applyStat(foal, "speed", child.s);
  applyStat(foal, "jump", child.j);
  if (isHorse) writeData(foal, { ...readData(foal), ...setLook(foal, parents) });

  for (const p of parents) fed.delete(p.id);
  const fmt = (st) => `${st.h}/${Number(st.s).toFixed(4)}/${st.j ?? "?"}`;
  debug(`born: ${fmt(statsOf(a))} x ${fmt(statsOf(b))} -> ${child.h}/${speedOfStep(child.s)}/${child.j}`);
  system.runTimeout(() => {
    if (foal.isValid) debug(`foal now reads health ${liveHealth(foal)}, speed ${liveSpeed(foal)}, jump ${liveJump(foal) ?? "unreadable"}`);
  }, 20);
}

/**
 * Donkeys are bred the vanilla way; the pack only records the foal's family,
 * so it gets a name, a generation and papers like any other.
 */
function onDonkeyBorn(foal, parents, day) {
  const breeders = [...new Set(parents.map((p) => recentlyFed(p.id)?.player).filter(Boolean))];
  writeData(foal, {
    h: liveHealth(foal),
    origin: "bred",
    day,
    g: generationOf(...parents.map(genOf)),
    by: breeders.length ? breeders.join(" & ") : undefined,
    p: parents.map((p) => ({ id: p.id, name: displayName(p), first: firstNameOf(p), origin: readData(p)?.origin, g: genOf(p), st: shownOf(p) })),
  });
  for (const p of parents) fed.delete(p.id);
  debug(`donkey born, health ${liveHealth(foal)} (vanilla)`);
}

function onSpawned(horse) {
  // Donkeys and mules from the wild or a spawn egg are vanilla: their speed
  // and jump are the same for every animal, and health is read as it is.
  if (kindOf(horse) !== "horse") {
    writeData(horse, { h: liveHealth(horse), origin: "wild", day: world.getDay() });
    debug(`spawned ${kindOf(horse)}: health ${liveHealth(horse)}`);
    return;
  }
  // Vanilla's jump cannot be read back, so roll it here, the same way vanilla
  // does, and remember it. Health and speed are vanilla's own rolls.
  const j = wildJump(Math.random);
  debug(`spawned: health ${liveHealth(horse)}, speed ${liveSpeed(horse)}, vanilla jump ${liveJump(horse) ?? "unreadable"}, setting ${j}`);
  // Record first, so a failure setting the jump cannot leave the horse
  // looking as if it predates the pack.
  writeData(horse, { h: liveHealth(horse), s: liveSpeed(horse), j, origin: "wild", day: world.getDay() });
  applyStat(horse, "jump", j);
}

world.afterEvents.entitySpawn.subscribe(({ entity, cause }) => {
  try {
    // A record without an origin is only a registry number; still record the spawn.
    if (!isEquine(entity) || readData(entity)?.origin) return;
    if (cause === "Born") onBorn(entity);
    else if (cause === "Spawned" || cause === "Event") onSpawned(entity);
  } catch (err) {
    if (entity.isValid) console.warn(`[Champion Lines] ${err}`);
  }
});

// ---- measuring jump ----------------------------------------------------------
// While a player rides a horse, each jump's rise from take-off to peak is
// recorded, and the best one kept (jm). A partly charged jump only rises less,
// so the best jump converges on a full one. With "learn by riding" on, that
// best jump is what players see. A horse's jump strength cannot be read, so
// for a horse that predates the pack the best jump is also turned back into a
// strength and used for breeding; a horse whose jump the pack set keeps it.

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

/** Riding a horse once shows its health and speed, with "learn by riding" on. */
function markRidden(horse) {
  const data = readData(horse);
  if (data?.rd) return;
  writeData(horse, { ...data, rd: true });
}

function recordJump(rider, horse, rise) {
  if (rise < MIN_RISE) return;
  const data = readData(horse) ?? {};
  const { j, jEst } = statsOf(horse, data);
  const known = j != null && !jEst;
  if (known) debug(`jump rose ${rise.toFixed(2)}; set strength ${j} predicts ${jumpBlocks(j).toFixed(2)} at full charge`);
  else debug(`jump rose ${rise.toFixed(2)} -> strength ~${jumpFromHeight(rise)} (best so far ${data.jm?.toFixed(2) ?? "none"})`);
  if (data.jm != null && rise <= data.jm) return;
  writeData(horse, known ? { ...data, jm: rise } : { ...data, j: jumpFromHeight(rise), jEst: true, jm: rise });
  if (!known || settings.learn) rider.onScreenDisplay.setActionBar(`§aNew best jump: ${rise.toFixed(1)} blocks`);
}

system.runInterval(() => {
  const riding = new Set();
  for (const player of world.getPlayers()) {
    try {
      const horse = player.getComponent("minecraft:riding")?.entityRidingOn;
      if (!horse || !isEquine(horse)) continue;
      riding.add(horse.id);
      markRidden(horse);
      trackJump(player, horse);
    } catch {
      // The rider or horse can go away mid-update.
    }
  }
  for (const id of flights.keys()) if (!riding.has(id)) flights.delete(id);
}, 1);

// ---- what the player is looking at ------------------------------------------

/**
 * A bred horse's parents as { name, first, origin, gen, stats }. A parent
 * that is loaded is read live, so a later name tag, registry number or what
 * riders have learnt of it shows; otherwise what was recorded at the foal's
 * birth is used.
 */
function parentsOf(data) {
  return (data?.p ?? []).map((p) => {
    let live;
    try {
      live = world.getEntity(p.id);
    } catch {
      live = undefined;
    }
    if (live?.isValid) {
      const name = displayName(live);
      const first = firstNameOf(live);
      return { name, first: first !== name ? first : undefined, origin: readData(live)?.origin, gen: genOf(live), stats: shownOf(live) };
    }
    return { name: p.name, first: p.first && p.first !== p.name ? p.first : undefined, origin: p.origin, gen: p.g, stats: p.st ?? null };
  });
}

/** What players may see of a horse's stats: not always the true ones breeding uses. */
function shownOf(horse, data = readData(horse)) {
  return shownStats(
    statsOf(horse, data),
    { tamed: horse.hasComponent("minecraft:is_tamed") || data?.origin === "bred", ridden: data?.rd === true, jm: data?.jm },
    settings,
  );
}

function infoOf(horse) {
  const name = displayName(horse);
  const data = readData(horse);
  // The generated name is the horse's first name, from the day it spawned or
  // was born; a name tag renames it, and the book keeps both.
  const firstName = firstNameOf(horse);
  const parents = parentsOf(data);
  return {
    data,
    name,
    kind: kindOf(horse),
    firstName: firstName !== name ? firstName : undefined,
    reg: data?.rn,
    gen: data?.g,
    tamer: data?.tb,
    baby: horse.hasComponent("minecraft:is_baby"),
    stats: shownOf(horse, data),
    origin: data?.origin,
    parents: parents.map((p) => p.name),
    parentEntries: parents,
  };
}

/** The nearest horse the player is pointing at, other than the one ridden. */
function targetHorse(player) {
  const mount = player.getComponent("minecraft:riding")?.entityRidingOn;
  let nearest;
  for (const hit of player.getEntitiesFromViewDirection({
    maxDistance: REACH,
    ignoreBlockCollision: true,
  })) {
    if (!isEquine(hit.entity) || hit.entity.id === mount?.id) continue;
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

// ---- taming -----------------------------------------------------------------

// Taming registers a horse and records who tamed it. The tame-mount component
// may already be gone by the time this runs, but taming only finishes while a
// player is riding, so the rider at that moment is the tamer.
world.afterEvents.dataDrivenEntityTrigger.subscribe(
  ({ entity, eventId }) => {
    if (eventId !== "minecraft:on_tame") return;
    try {
      const rider =
        entity.getComponent("minecraft:tamemount")?.tamedToPlayer ??
        entity.getComponent("minecraft:rideable")?.getRiders().find((r) => r.typeId === "minecraft:player");
      register(entity, rider ? { tb: rider.name, td: world.getDay() } : {});
      debug(`tamed ${displayName(entity)} by ${rider?.name ?? "unknown"}`);
    } catch (err) {
      if (entity.isValid) console.warn(`[Champion Lines] recording a tame failed: ${err}`);
    }
  },
  { entityTypes: EQUINES, eventTypes: ["minecraft:on_tame"] },
);

// ---- the book -----------------------------------------------------------------

const BOOK_OF = `${NS}:horse`;
const lastBook = new Map();

const registryLore = (rn) => `§8Registry No. ${rn}`;

/** Whether a written book is this horse's papers. */
function isPapersFor(book, horse) {
  let owner;
  try {
    owner = book.getDynamicProperty(BOOK_OF);
  } catch {
    owner = undefined;
  }
  if (owner !== undefined) return owner === horse.id;
  const rn = readData(horse)?.rn;
  return rn !== undefined && book.getLore().includes(registryLore(rn));
}

world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
  const { player, target, itemStack } = ev;
  if (!isEquine(target) || !itemStack) return;
  let mode;
  // With the sneak setting on, a plain book needs sneaking too, so riding or
  // feeding with a book in hand does not use it up by mistake.
  if (itemStack.typeId === "minecraft:book" && (player.isSneaking || !settings.sneakBook)) mode = "new";
  else if (itemStack.typeId === "minecraft:written_book" && player.isSneaking && isPapersFor(itemStack, target)) mode = "update";
  else return;
  // Without this a book in hand mounts the horse, feeds a wild one's temper,
  // or (sneaking) opens the horse's inventory.
  ev.cancel = true;
  const now = system.currentTick;
  if (now - (lastBook.get(player.id) ?? -100) < 10) return;
  lastBook.set(player.id, now);
  system.run(() => {
    try {
      writeBook(player, target, mode);
    } catch (err) {
      console.warn(`[Champion Lines] could not write the book: ${err}`);
    }
  });
});

/**
 * "new": turns one plain book in hand into the horse's papers.
 * "update": rewrites the papers in hand with the horse's current details.
 */
function writeBook(player, horse, mode) {
  if (!player.isValid || !horse.isValid) return;
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (!inv) return;
  const slot = player.selectedSlotIndex;
  const held = inv.getItem(slot);
  if (mode === "new" && held?.typeId !== "minecraft:book") return;
  if (mode === "update" && !(held?.typeId === "minecraft:written_book" && isPapersFor(held, horse))) return;

  const rn = register(horse);
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
  book.setLore([registryLore(rn)]);
  try {
    book.setDynamicProperty(BOOK_OF, horse.id);
  } catch {
    // Stackable items cannot hold dynamic properties; the lore still matches.
  }

  if (mode === "update") {
    inv.setItem(slot, book);
    player.onScreenDisplay.setActionBar(`§aPapers updated: ${info.name}`);
  } else {
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
  }
  player.playSound("item.book.page_turn");
}
