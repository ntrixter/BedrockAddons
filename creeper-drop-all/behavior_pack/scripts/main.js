/**
 * Creeper Drop All - by ntrixter
 * Explosions drop 100% of the blocks they destroy.
 *
 * HOW IT WORKS - three strictly separated execution contexts:
 *
 *   P1  world.beforeEvents.explosion  (RESTRICTED execution)
 *       Reads only, plus one permitted mutation. A Block is a location
 *       reference, not a snapshot - once the explosion resolves,
 *       block.permutation reads air. This handler is the ONLY moment the data
 *       exists, so we capture it here and act on it later.
 *
 *   P2  system.run, same tick          (default execution)
 *       Remove every block at once, so the crater appears with the bang.
 *
 *   P3  system.runJob                  (default execution)
 *       Loot generation and item spawning, spread over ticks. This is the
 *       expensive, allocation-heavy half, and it is deliberately kept out of
 *       the engine's own explosion tick so the BDS script watchdog (10s hang
 *       threshold -> saves and shuts down the world) is never near tripping.
 *
 * Items spawn after the blast has resolved, so the explosion cannot destroy
 * its own drops.
 */

import { world, system, BlockPermutation, ItemStack } from "@minecraft/server";
import { DEFAULTS, loadSettings, buildHandledTypes } from "./settings.js";

/* ------------------------------------------------------------------ *
 * Tuning constants - troubleshooting knobs, not player-facing options.
 * ------------------------------------------------------------------ */

/**
 * PRIMARY PATH is "suppress": empty the explosion's block list and do the
 * destruction ourselves. `cancel` is a separate property from
 * setImpactedBlocks(), so emptying the block list leaves entity damage,
 * knockback, sound and particles untouched.
 *
 * CONFIRMED IN-GAME (2026-09-14, Bedrock stable, TESTING.md T1): a creeper
 * detonating next to an unarmored player in Survival still deals its damage
 * while dropping 100% of the blocks. No documentation states this, so do not
 * let a future refactor quietly assume otherwise.
 *
 * FALLBACK is "recreate", now unused: cancel the event outright and re-issue a
 * non-block-breaking explosion from the same source in P2. Kept because it is
 * the only recovery if a future Bedrock release ever couples damage to the
 * impacted-block list.
 */
const EXPLOSION_MODE = "suppress"; // "suppress" | "recreate"

/** Only consulted in "recreate" mode. Mirrors vanilla explosion power. */
const RECREATE_POWER = {
  "minecraft:creeper": 3,
  "minecraft:charged_creeper": 6,
  "minecraft:ender_crystal": 6,
  "minecraft:fireball": 1,
  "minecraft:wither_skull": 1,
  "minecraft:wither_skull_dangerous": 1,
  "minecraft:tnt": 3,
  "minecraft:tnt_minecart": 3,
  default: 3,
};

/**
 * Set true only if testing shows the blast kept its damage but lost its sound
 * or particles - cheaper than switching to "recreate", because it leaves the
 * damage on the engine's own code path.
 */
const FORCE_SOUND = false;
const FORCE_PARTICLES = false;

/** Verbose logging to the content log. Leave off for release. */
const DEBUG = false;

const LOOT_PER_YIELD = 8;
const SPAWN_PER_YIELD = 8;
const MAX_QUEUED_BLOCKS = 20000;

/**
 * Tool ladder. Order matters, and so does the escalation rule - see
 * generateLoot() for why shears and axes are deliberately absent. Netherite
 * clears every harvest-level gate; unenchanted so drops match what a player
 * mining normally would get (no Fortune, no Silk Touch).
 */
const LADDER_TOOL_IDS = ["minecraft:netherite_pickaxe", "minecraft:netherite_shovel"];

/**
 * Shears are kept OUT of the ladder above and built separately, because the
 * one thing they are good for here is also the thing that makes them poison in
 * a ladder: on leaves they return the leaf BLOCK rather than a sapling roll.
 * The "Drop leaf blocks" setting asks for exactly that, on leaves and nothing
 * else. See generateLoot() and leafBlockLoot().
 */
const SHEARS_ID = "minecraft:shears";

/**
 * Containers whose own loot table already carries their contents as item data.
 * Snapshotting these would DUPLICATE the contents.
 */
const SELF_CONTAINED = ["shulker_box"];

/**
 * Treated as containers by the protection toggle despite having no
 * "minecraft:inventory" component. An ender chest stores per-player, so it
 * would otherwise fall through despite obviously being a chest.
 */
const PROTECT_EXTRA = ["minecraft:ender_chest"];

/* ------------------------------------------------------------------ *
 * Module state
 * ------------------------------------------------------------------ */

let settings;
let handledTypes;
let lootManager;
let toolLadder;
let shears;
let AIR;

/** Shared FIFO of pending loot work, drained by ONE job. */
const queue = [];
let queuedBlocks = 0;
let jobHandle;

/** Guards against our own createExplosion re-entering the before-event. */
let reentryGuard = false;

/**
 * Two tick-scoped ledgers, both keyed by dimension + position.
 *
 * Every before-event in a tick fires before ANY deferred callback runs, so when
 * two explosions overlap, both snapshot the shared region while it is still
 * intact. Per-explosion bookkeeping cannot see that. Hence tick scope.
 *
 *   takenBlocks     - this block is already in someone's snapshot. Skip it
 *                     entirely, or overlapping blasts drop it twice.
 *   contentsClaimed - this container's contents are already captured. Still
 *                     snapshot the block (it must be destroyed, and its block
 *                     item must drop) but do not read the inventory again.
 *
 * The second is what handles double chests, where BOTH halves report the same
 * merged 54-slot container: read once, mark both halves, destroy both, drop two
 * chest items and one set of contents.
 */
const takenBlocks = new Set();
const contentsClaimed = new Set();
let ledgerTick = -1;

function resetLedgersIfNewTick() {
  const tick = system.currentTick;
  if (tick !== ledgerTick) {
    takenBlocks.clear();
    contentsClaimed.clear();
    ledgerTick = tick;
  }
}

function posKey(dimensionId, x, y, z) {
  return dimensionId + ":" + x + "," + y + "," + z;
}

/* ------------------------------------------------------------------ *
 * Startup
 * ------------------------------------------------------------------ */

// Subscribing is legal in early-execution mode; nothing here touches world state.
world.beforeEvents.explosion.subscribe(onExplosionBefore);
world.afterEvents.worldLoad.subscribe(init);

function init() {
  settings = loadSettings();
  handledTypes = buildHandledTypes(settings);
  ensureRuntime();

  // This line is the canary. If it does NOT appear in the content log (or in
  // BDS stdout), the script never loaded at all - on a dedicated server the
  // usual cause is config/default/permissions.json missing "@minecraft/server"
  // from allowed_modules, which otherwise fails completely silently.
  console.warn(
    "[CreeperDropAll] loaded. sources=[" +
      Array.from(handledTypes).join(", ") +
      "] leafBlocks=" + settings.leaf_blocks +
      " protectContainers=" + settings.protect_containers +
      " mergeGrid=" + settings.merge_grid +
      " maxBlocks=" + settings.max_blocks +
      " mode=" + EXPLOSION_MODE
  );
}

/** Pure-JS guard, safe to call from restricted execution. */
function ensureSettings() {
  if (!settings) {
    settings = Object.assign({}, DEFAULTS);
    handledTypes = buildHandledTypes(settings);
  }
}

/** Calls real APIs - default execution only. */
function ensureRuntime() {
  ensureSettings();
  if (!lootManager) {
    try { lootManager = world.getLootTableManager(); } catch (e) { warn("lootManager: " + e); }
  }
  if (!AIR) {
    try { AIR = BlockPermutation.resolve("minecraft:air"); } catch (e) { warn("air: " + e); }
  }
  if (!toolLadder) {
    toolLadder = [undefined]; // index 0 is the no-tool probe
    for (const id of LADDER_TOOL_IDS) {
      try { toolLadder.push(new ItemStack(id, 1)); } catch (e) { warn("tool " + id + ": " + e); }
    }
  }
  if (!shears) {
    try { shears = new ItemStack(SHEARS_ID, 1); } catch (e) { warn("shears: " + e); }
  }
}

function warn(msg) {
  if (DEBUG) console.warn("[CreeperDropAll] " + msg);
}

/* ------------------------------------------------------------------ *
 * P1 - the snapshot. RESTRICTED EXECUTION: reads only.
 * ------------------------------------------------------------------ */

function onExplosionBefore(ev) {
  if (reentryGuard) return; // our own recreate-mode explosion

  const source = ev.source;
  if (!source) return; // no owning entity (e.g. dimension.createExplosion)

  ensureSettings();
  if (!handledTypes.has(source.typeId)) return;

  let blocks;
  try {
    blocks = ev.getImpactedBlocks();
  } catch (e) {
    warn("getImpactedBlocks: " + e);
    return;
  }

  // mobGriefing=false means the explosion destroys nothing. Return WITHOUT
  // touching setImpactedBlocks, so we stay perfectly transparent.
  if (!blocks || blocks.length === 0) return;

  // Fail open rather than half-process: a degraded-but-vanilla explosion beats
  // a partially handled one.
  if (blocks.length > settings.max_blocks) {
    warn(blocks.length + " blocks exceeds maxBlocks; deferring to vanilla");
    return;
  }
  if (queuedBlocks + blocks.length > MAX_QUEUED_BLOCKS) {
    warn("loot backlog full; deferring to vanilla");
    return;
  }

  const dimension = ev.dimension;
  const dimensionId = dimension.id;
  const protect = settings.protect_containers === true;
  const snapshot = [];
  resetLedgersIfNewTick();

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    try {
      const loc = block.location;
      const x = loc.x, y = loc.y, z = loc.z;
      const key = posKey(dimensionId, x, y, z);

      // Another explosion this tick already owns this block. Without this,
      // overlapping blasts each snapshot it and it drops twice.
      if (takenBlocks.has(key)) continue;

      // MUST be read now - after this tick block.permutation reads air.
      const perm = block.permutation;
      const typeId = perm.type.id;

      const isContainer =
        PROTECT_EXTRA.indexOf(typeId) !== -1 || block.hasComponent("minecraft:inventory");

      // Protection is simply "leave it out of our removal list". Because the
      // impacted-block list was emptied, nothing else will touch it either.
      // Deliberately not marked as taken: no explosion should claim it.
      if (protect && isContainer) continue;

      let items;
      if (!protect && isContainer && !contentsClaimed.has(key) && !isSelfContained(typeId)) {
        const container = getContainer(block);
        if (container) {
          items = readContainer(container);
          contentsClaimed.add(key);
          claimPairedHalf(block, container, dimensionId);
        }
      }

      takenBlocks.add(key);
      snapshot.push({ x: x, y: y, z: z, perm: perm, items: items });
    } catch (e) {
      // Unloaded chunk or invalid block reference. Skip this one block - never
      // let a single bad block abort the whole explosion.
      warn("snapshot: " + e);
    }
  }

  if (snapshot.length === 0) return;

  if (EXPLOSION_MODE === "recreate") {
    ev.cancel = true;
  } else {
    ev.setImpactedBlocks([]); // kill vanilla destruction and its partial drops
  }

  system.run(function () {
    onExplosionDeferred(dimension, snapshot, source);
  });
}

function isSelfContained(typeId) {
  for (const suffix of SELF_CONTAINED) {
    if (typeId.indexOf(suffix) !== -1) return true;
  }
  return false;
}

function getContainer(block) {
  try {
    const comp = block.getComponent("minecraft:inventory");
    return comp ? comp.container : undefined;
  } catch (e) {
    warn("getContainer: " + e);
    return undefined;
  }
}

/** Container.getItem() returns a COPY, so these survive the tick boundary. */
function readContainer(container) {
  const out = [];
  try {
    const size = container.size;
    for (let s = 0; s < size; s++) {
      const it = container.getItem(s);
      if (it) out.push(it);
    }
  } catch (e) {
    warn("readContainer: " + e);
  }
  return out.length ? out : undefined;
}

/**
 * A double chest reports the SAME merged 54-slot Container from BOTH halves.
 * Without this, an explosion swallowing both halves reads 54 items twice and
 * spawns 108. Whichever half we reach first marks the other; the mark is
 * symmetric, so ordering within getImpactedBlocks() does not matter.
 *
 * Only the CONTENTS are claimed - the other half is still snapshotted and
 * destroyed normally, and still drops its own chest item.
 */
function claimPairedHalf(block, container, dimensionId) {
  try {
    if (container.size <= 27) return; // single chest / barrel / hopper / furnace
    const sides = [block.north(), block.south(), block.east(), block.west()];
    for (const n of sides) {
      if (!n) continue;
      try {
        if (n.typeId !== block.typeId) continue;
        const nc = getContainer(n);
        if (nc && nc.size === container.size) {
          const l = n.location;
          contentsClaimed.add(posKey(dimensionId, l.x, l.y, l.z));
          return;
        }
      } catch (e) { /* neighbour unreadable - ignore */ }
    }
  } catch (e) {
    warn("claimPairedHalf: " + e);
  }
}

/* ------------------------------------------------------------------ *
 * P2 - same tick, default execution. Remove the blocks NOW.
 * ------------------------------------------------------------------ */

function onExplosionDeferred(dimension, snapshot, source) {
  ensureRuntime();

  if (EXPLOSION_MODE === "recreate") {
    reentryGuard = true;
    try {
      let power = RECREATE_POWER[source.typeId];
      if (source.typeId === "minecraft:creeper" && source.hasComponent("minecraft:is_charged")) {
        power = RECREATE_POWER["minecraft:charged_creeper"];
      }
      dimension.createExplosion(source.location, power || RECREATE_POWER.default, {
        breaksBlocks: false,
        causesFire: false,
        source: source,
      });
    } catch (e) {
      warn("recreate failed: " + e);
    } finally {
      reentryGuard = false;
    }
  }

  // One tick, all of it, so the crater appears with the bang. A vanilla
  // explosion performs this same set of block updates in a single tick - we are
  // not adding work, only moving it by one tick.
  for (let i = 0; i < snapshot.length; i++) {
    const e = snapshot[i];
    try {
      const b = dimension.getBlock(e);
      if (!b) continue;
      // Clear the container BEFORE removing the block, so removal cannot spill
      // contents a second time on top of the copies we already hold.
      if (e.items) {
        const c = getContainer(b);
        if (c) c.clearAll();
      }
      b.setPermutation(AIR);
    } catch (err) {
      warn("remove @" + e.x + "," + e.y + "," + e.z + ": " + err);
    }
  }

  const at = { x: snapshot[0].x + 0.5, y: snapshot[0].y + 0.5, z: snapshot[0].z + 0.5 };
  if (FORCE_SOUND) {
    try { dimension.playSound("random.explode", at); } catch (e) { /* ignore */ }
  }
  if (FORCE_PARTICLES) {
    try { dimension.spawnParticle("minecraft:huge_explosion_emitter", at); } catch (e) { /* ignore */ }
  }

  enqueue(dimension, snapshot);
}

/* ------------------------------------------------------------------ *
 * P3 - the drain job. One shared job, never one per explosion.
 * ------------------------------------------------------------------ */

function enqueue(dimension, entries) {
  queue.push({ dimension: dimension, entries: entries, i: 0, buckets: new Map() });
  queuedBlocks += entries.length;
  if (jobHandle === undefined) {
    try {
      jobHandle = system.runJob(lootDrainJob());
    } catch (e) {
      warn("runJob: " + e);
      jobHandle = undefined;
    }
  }
}

function* lootDrainJob() {
  while (queue.length > 0) {
    const task = queue[0];
    const dimension = task.dimension;
    const entries = task.entries;
    const buckets = task.buckets;

    // Phase A: generate loot, accumulate into spatial buckets.
    while (task.i < entries.length) {
      const e = entries[task.i++];
      try {
        const loot = generateLoot(e.perm);
        if ((loot && loot.length) || e.items) {
          const key = bucketKey(e.x, e.y, e.z);
          let b = buckets.get(key);
          if (!b) {
            // Spawn at the FIRST block that landed in this bucket, not the
            // geometric bucket centre: that block was cleared to air in P2, so
            // the spawn point is guaranteed non-solid even at mergeGrid > 1.
            b = { at: { x: e.x + 0.5, y: e.y + 0.5, z: e.z + 0.5 }, stacks: [] };
            buckets.set(key, b);
          }
          if (loot) for (const s of loot) b.stacks.push(s);
          if (e.items) for (const s of e.items) b.stacks.push(s);
        }
      } catch (err) {
        warn("loot @" + e.x + "," + e.y + "," + e.z + ": " + err);
      }
      if (task.i % LOOT_PER_YIELD === 0) yield;
    }

    // Phase B: merge and spawn.
    let n = 0;
    for (const b of buckets.values()) {
      const merged = mergeStacks(b.stacks);
      for (const st of merged) {
        try {
          dimension.spawnItem(st, b.at);
        } catch (err) {
          warn("spawnItem: " + err);
        }
        if (++n % SPAWN_PER_YIELD === 0) yield;
      }
    }

    queuedBlocks -= entries.length;
    if (queuedBlocks < 0) queuedBlocks = 0;
    queue.shift();
    yield;
  }
  jobHandle = undefined;
}

/**
 * `undefined` => the tool was INSUFFICIENT to mine the block  -> escalate.
 * `[]`        => the tool WAS sufficient; the table rolled nothing -> STOP.
 *
 * Retrying on `[]` is the bug that looks like a feature. Loot tables are
 * stochastic: bare-handed leaves legitimately return `[]` roughly 95% of the
 * time, because sapling / stick / apple are all low-probability rolls. Leaves
 * do not REQUIRE a tool, so they never return `undefined` - an
 * escalate-on-empty ladder would sail straight past pickaxe and shovel (both
 * also `[]`) all the way to shears, which returns THE LEAF BLOCK ITSELF.
 * Result: near-every exploded leaf drops a leaf block instead of an occasional
 * sapling. Same failure shape for grass, vines and cobweb.
 *
 * So: escalate ONLY on `undefined`, and keep shears and axes out of the ladder.
 * Nothing in vanilla is axe-gated or shears-gated at the `undefined` level -
 * only pickaxe-gated (stone, ores, obsidian) and shovel-gated (snow).
 *
 * DO NOT "fix" this by adding shears. See TESTING.md T5. The "Drop leaf blocks"
 * setting does use shears, but as a deliberate short-circuit for leaves alone,
 * never as a rung - grass, vines and cobweb still take the ladder above.
 */
function generateLoot(perm) {
  if (!lootManager || !toolLadder) return [];

  if (settings.leaf_blocks && isLeafBlock(perm.type.id)) {
    const leaf = leafBlockLoot(perm);
    if (leaf) return leaf;
    // Both routes came up empty: fall through, so the worst case is a vanilla
    // sapling roll rather than a leaf that drops nothing at all.
  }

  for (let i = 0; i < toolLadder.length; i++) {
    let out;
    try {
      out = lootManager.generateLootFromBlockPermutation(perm, toolLadder[i]);
    } catch (err) {
      warn("loot gen threw: " + err);
      return [];
    }
    if (out !== undefined) return out; // includes the legitimate empty case
  }
  return [];
}

/**
 * Bedrock flattened leaves to one id per wood type (minecraft:oak_leaves,
 * minecraft:cherry_leaves, ...); before that, minecraft:leaves and
 * minecraft:leaves2 carried the wood type in a block state instead. Matching on
 * the substring covers both shapes and the odd one out,
 * minecraft:azalea_leaves_flowered.
 *
 * It also covers trees Mojang has not shipped yet, which is the point: 1.26.40
 * added three poplars without warning, and a hardcoded list would have silently
 * skipped them. Checked against the whole 1,463-block palette at 1.26.50, this
 * matches all 14 leaf ids and nothing else. The near-misses it correctly skips
 * are spelled "leaf" rather than "leaves" - minecraft:leaf_litter,
 * minecraft:big_dripleaf, minecraft:small_dripleaf_block - and none of them is
 * canopy.
 */
function isLeafBlock(typeId) {
  return typeId.indexOf("leaves") !== -1;
}

/**
 * "Drop leaf blocks" ON: hand the leaf itself back, placeable on a tree again,
 * instead of the sapling-or-nothing roll vanilla gives.
 *
 * Shears first, because the loot table knows which leaf a permutation is. That
 * matters for the legacy minecraft:leaves id, where the wood type lives in a
 * block state that a bare id lookup cannot see.
 *
 * Building the item from the block id is the fallback. It is exact for the
 * flattened ids 1.26 actually ships, and it covers a shears probe that comes
 * back empty - this setting being the whole point of the feature, failing it
 * quietly would read to a player as "the pack ate my leaves".
 *
 * Returns undefined only if neither route produced anything.
 */
function leafBlockLoot(perm) {
  if (shears) {
    try {
      const out = lootManager.generateLootFromBlockPermutation(perm, shears);
      if (out && out.length) return out;
    } catch (err) {
      warn("shears loot threw: " + err);
    }
  }
  try {
    return [new ItemStack(perm.type.id, 1)];
  } catch (err) {
    warn("leaf item " + perm.type.id + ": " + err);
    return undefined;
  }
}

/**
 * Collapse a flat list into the fewest stacks that respect each item's OWN
 * maxAmount (64 cobble, 16 eggs, 1 tool). Group by typeId, then confirm with
 * isStackableWith, so enchanted / renamed / damaged items pulled out of a chest
 * are never merged together.
 *
 * Runs in DEFAULT execution - `.amount =` throws in restricted execution.
 */
function mergeStacks(stacks) {
  const groups = new Map();
  for (const s of stacks) {
    let bucket = groups.get(s.typeId);
    if (!bucket) { bucket = []; groups.set(s.typeId, bucket); }
    let placed = false;
    for (const g of bucket) {
      try {
        if (g.proto.isStackableWith(s)) { g.count += s.amount; placed = true; break; }
      } catch (e) { /* treat as not stackable */ }
    }
    if (!placed) bucket.push({ proto: s, count: s.amount });
  }

  const out = [];
  for (const bucket of groups.values()) {
    for (const g of bucket) {
      let max = 64;
      try { max = g.proto.maxAmount || 64; } catch (e) { /* keep 64 */ }
      let left = g.count;
      while (left > 0) {
        const take = Math.min(left, max);
        try {
          const st = g.proto.clone(); // preserves durability / enchants / name
          st.amount = take;
          out.push(st);
        } catch (e) {
          warn("mergeStacks: " + e);
        }
        left -= take;
      }
    }
  }
  return out;
}

/** Math.floor handles negative coordinates correctly: floor(-3/4) === -1. */
function bucketKey(x, y, z) {
  const g = settings.merge_grid;
  return Math.floor(x / g) + "," + Math.floor(y / g) + "," + Math.floor(z / g);
}
