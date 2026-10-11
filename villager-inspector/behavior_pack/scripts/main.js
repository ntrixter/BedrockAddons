import { GameMode, system, world } from "@minecraft/server";
import { describe, describeBlock, describeNamed, describeNotNamed } from "./describe.js";
import * as links from "./links.js";

const TICKS_PER_UPDATE = 5;
const TICKS_PER_BED_SCAN = 40;
const BED_SCAN_RADIUS = 48;
const JOB_SEARCH_RADIUS = 2;
const VILLAGER = "minecraft:villager_v2";
const PARTICLE = "minecraft:villager_happy";
const NAME_TAG = "minecraft:name_tag";

/** Read once at load: there is no stable settings-change event yet. */
function readSettings() {
  let values = {};
  try {
    values = world.getPackSettings() ?? {};
  } catch {
    // Older runtimes or a server with no settings file: use the defaults.
  }
  const reach = Number(values["villager_inspector:reach"]);
  return {
    throughBlocks: values["villager_inspector:through_blocks"] !== false,
    reach: Number.isFinite(reach) && reach > 0 ? reach : 8,
    particles: values["villager_inspector:particles"] !== false,
  };
}

const settings = readSettings();

/** The nearest villager the player is pointing at, as a raycast hit. */
function targetVillager(player) {
  const hits = player.getEntitiesFromViewDirection({
    type: VILLAGER,
    maxDistance: settings.reach,
    ignoreBlockCollision: settings.throughBlocks,
  });
  let nearest;
  for (const hit of hits) {
    if (!nearest || hit.distance < nearest.distance) nearest = hit;
  }
  return nearest;
}

/** { name, kind } for a bed or job block, or undefined for anything else. */
function blockInfo(block) {
  if (block.typeId === links.BED) return { name: "Bed", kind: "bed" };
  const name = links.JOB_BLOCKS[block.typeId];
  return name ? { name, kind: "job" } : undefined;
}

/** The bed or job block the player is pointing at, with its distance. */
function targetBlock(player) {
  const hit = player.getBlockFromViewDirection({ maxDistance: settings.reach });
  if (!hit) return undefined;
  const info = blockInfo(hit.block);
  if (!info) return undefined;
  const head = player.getHeadLocation();
  const at = hit.block.location;
  const distance = Math.hypot(at.x + 0.5 - head.x, at.y + 0.5 - head.y, at.z + 0.5 - head.z);
  return { block: hit.block, ...info, distance };
}

function sparkle(dimension, location) {
  if (!settings.particles) return;
  try {
    dimension.spawnParticle(PARTICLE, location);
  } catch {
    // Unloaded chunk, or the particle id changed: the line still shows.
  }
}

function sparkleKey(key) {
  if (!key) return;
  const { dim, location } = links.keyLocation(key);
  sparkle(world.getDimension(dim), location);
}

/** Copy what describe() needs out of the live entity. */
function snapshot(villager) {
  const container = villager.getComponent("minecraft:inventory")?.container;
  if (!container) return undefined;
  const slots = [];
  for (let i = 0; i < container.size; i++) {
    const stack = container.getItem(i);
    slots.push(stack ? { typeId: stack.typeId, amount: stack.amount } : undefined);
  }
  return {
    profession: villager.getComponent("minecraft:variant")?.value ?? 0,
    baby: villager.hasComponent("minecraft:is_baby"),
    nameTag: villager.nameTag || undefined,
    slots,
  };
}

function showVillager(player, villager) {
  const snap = snapshot(villager);
  if (!snap) return false;
  const bed = links.linkOf(villager, "bed");
  const job = links.linkOf(villager, "job");
  snap.links = { bed: !!bed, job: !!job };
  player.onScreenDisplay.setActionBar(describe(snap));
  sparkleKey(bed);
  sparkleKey(job);
  return true;
}

/** What describeBlock() and describeNamed() need about a live owner. */
function ownerInfo(villager, player) {
  const v = villager.location;
  const p = player.location;
  return {
    loaded: true,
    profession: villager.getComponent("minecraft:variant")?.value ?? 0,
    baby: villager.hasComponent("minecraft:is_baby"),
    nameTag: villager.nameTag || undefined,
    distance: Math.hypot(v.x - p.x, v.y - p.y, v.z - p.z),
  };
}

function sparkleVillager(villager) {
  const at = villager.location;
  sparkle(villager.dimension, { x: at.x, y: at.y + 2.2, z: at.z });
}

function showBlock(player, target) {
  const owner = links.ownerOf(target.block, target.kind);
  let info;
  if (owner?.entity) {
    info = ownerInfo(owner.entity, player);
    sparkleVillager(owner.entity);
  } else if (owner) {
    info = { loaded: false };
  }
  player.onScreenDisplay.setActionBar(describeBlock(target.name, info));
}

const showing = new Set();

system.runInterval(() => {
  for (const player of world.getPlayers()) {
    try {
      const villager = targetVillager(player);
      const block = targetBlock(player);
      // A bed or job block in front of the villager wins, so looking at a
      // bed shows its owner rather than whoever is behind it.
      let shown = false;
      if (block && (!villager || block.distance < villager.distance)) {
        showBlock(player, block);
        shown = true;
      } else if (villager) {
        shown = showVillager(player, villager.entity);
      }
      if (shown) showing.add(player.id);
      else if (showing.delete(player.id)) player.onScreenDisplay.setActionBar("");
    } catch {
      // A player can leave, or a villager despawn, while this update runs.
    }
  }
}, TICKS_PER_UPDATE);

// Workstation: every vanilla work goal fires this on arrival at the job site.
world.afterEvents.dataDrivenEntityTrigger.subscribe(
  ({ entity, eventId }) => {
    if (eventId !== "minecraft:resupply_trades") return;
    try {
      const job = nearestJobBlock(entity);
      if (job) links.record(entity, "job", job);
    } catch {
      // The villager can be removed in the same tick.
    }
  },
  { entityTypes: [VILLAGER], eventTypes: ["minecraft:resupply_trades"] },
);

function nearestJobBlock(villager) {
  const { dimension } = villager;
  const c = villager.location;
  let best;
  let bestDist = Infinity;
  for (let dx = -JOB_SEARCH_RADIUS; dx <= JOB_SEARCH_RADIUS; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -JOB_SEARCH_RADIUS; dz <= JOB_SEARCH_RADIUS; dz++) {
        const pos = { x: Math.floor(c.x) + dx, y: Math.floor(c.y) + dy, z: Math.floor(c.z) + dz };
        const block = dimension.getBlock(pos);
        if (!block || !(block.typeId in links.JOB_BLOCKS)) continue;
        const d = (pos.x + 0.5 - c.x) ** 2 + (pos.y - c.y) ** 2 + (pos.z + 0.5 - c.z) ** 2;
        if (d < bestDist) {
          best = block;
          bestDist = d;
        }
      }
    }
  }
  return best;
}

// Bed: villagers sleep on their own bed at night. isSleeping is tried first;
// whether it reports mobs is unverified, so a villager found on the same bed
// block in two scans in a row at night counts too.
function isNight() {
  const t = world.getTimeOfDay();
  return t >= 12500 && t <= 23500;
}

function bedUnder(villager) {
  const { dimension, location: l } = villager;
  for (const dy of [0, -1]) {
    const block = dimension.getBlock({ x: Math.floor(l.x), y: Math.floor(l.y) + dy, z: Math.floor(l.z) });
    if (block?.typeId === links.BED) return block;
  }
  return undefined;
}

// villager id -> bed block key from the previous scan. A villager merely
// walking across a bed is gone by the next scan; a sleeper is still there.
let lastOnBed = new Map();

system.runInterval(() => {
  if (!isNight()) {
    lastOnBed = new Map();
    return;
  }
  const onBed = new Map();
  const seen = new Set();
  for (const player of world.getPlayers()) {
    let villagers;
    try {
      villagers = player.dimension.getEntities({
        type: VILLAGER,
        location: player.location,
        maxDistance: BED_SCAN_RADIUS,
      });
    } catch {
      continue;
    }
    for (const v of villagers) {
      if (seen.has(v.id)) continue;
      seen.add(v.id);
      try {
        const bed = bedUnder(v);
        if (!bed) continue;
        const key = links.blockKey(bed);
        onBed.set(v.id, key);
        if (v.isSleeping === true || lastOnBed.get(v.id) === key) links.record(v, "bed", bed);
      } catch {
        // Despawned or unloaded mid-scan.
      }
    }
  }
  lastOnBed = onBed;
}, TICKS_PER_BED_SCAN);

world.afterEvents.entityDie.subscribe(
  ({ deadEntity }) => {
    try {
      links.forget(deadEntity.id);
    } catch {
      // Nothing to clean up.
    }
  },
  { entityTypes: [VILLAGER] },
);

// A renamed name tag used on a bed or job block names the villager using it.
// Before-events run in restricted execution: decide and cancel here, write in
// system.run. Only a live owner cancels the click, so a tag with nowhere to go
// falls through to vanilla and is not used up.
world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const { player, block, itemStack, isFirstEvent } = event;
  if (itemStack?.typeId !== NAME_TAG) return;
  const name = itemStack.nameTag;
  if (!name) return;
  let info;
  let owner;
  try {
    info = blockInfo(block);
    if (!info) return;
    owner = links.ownerOf(block, info.kind, { readOnly: true });
  } catch {
    return;
  }
  if (!owner?.entity) {
    if (isFirstEvent) {
      system.run(() => {
        try {
          player.onScreenDisplay.setActionBar(describeNotNamed(info.name, !!owner));
        } catch {
          // Player left.
        }
      });
    }
    return;
  }
  event.cancel = true;
  if (!isFirstEvent) return;
  const villager = owner.entity;
  system.run(() => {
    try {
      villager.nameTag = name;
      if (player.getGameMode() !== GameMode.Creative) useOneNameTag(player);
      player.onScreenDisplay.setActionBar(describeNamed(ownerInfo(villager, player)));
      sparkleVillager(villager);
    } catch {
      // The villager or player went away in the meantime.
    }
  });
});

function useOneNameTag(player) {
  const container = player.getComponent("minecraft:inventory")?.container;
  if (!container) return;
  const slot = player.selectedSlotIndex;
  const stack = container.getItem(slot);
  if (stack?.typeId !== NAME_TAG) return;
  if (stack.amount > 1) {
    stack.amount -= 1;
    container.setItem(slot, stack);
  } else {
    container.setItem(slot, undefined);
  }
}
