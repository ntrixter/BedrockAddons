/**
 * Creeper Drop All - zones
 * by ntrixter
 *
 * Named boxes, each with its own "doesn't break blocks" list, managed with one
 * custom command: creeperzone. Inside a zone the zone decides whether a blast
 * breaks blocks; outside every zone the pack settings decide, exactly as
 * before. Zones do nothing until an operator runs `creeperzone enable`.
 *
 * Everything here is stable @minecraft/server 2.8.0: the custom command
 * registry, world dynamic properties and spawnParticle. The command is
 * registered with cheatsRequired false at GameDirectors, so an operator can
 * run it in a world with cheats off, and the BDS console can run it too
 * (typed without the slash).
 *
 * Command callbacks run in RESTRICTED execution. Reading the world is fine
 * there, so the reply is built and returned at once; the one write - saving
 * the zones - is deferred with system.run.
 *
 * Persisted as one JSON blob in one world dynamic property, re-validated on
 * load so a malformed entry is dropped rather than carried forward.
 */

import {
  world,
  system,
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
} from "@minecraft/server";
import { ZONE_SOURCES } from "./settings.js";

const PROPERTY = "creeperdropall:zones";
const COMMAND = "creeperdropall:creeperzone";
const ACTION_ENUM = "creeperdropall:zoneaction";
const VALUE_ENUM = "creeperdropall:zonevalue";
const DIMENSION_ENUM = "creeperdropall:zonedimension";

/** 100 zones with 40-character names stay well inside one 32,767-char property. */
const MAX_ZONES = 100;
const MAX_NAME = 40;

const ACTIONS = ["list", "new", "update", "show", "protect", "allow", "remove", "enable", "disable"];
const CORNERS = ["pos1", "pos2"];
const BOOLS = ["true", "false"];
const SOURCES = Object.keys(ZONE_SOURCES);
const VALUES = [...CORNERS, ...BOOLS, ...SOURCES, "all"];

const DIMENSIONS = {
  overworld: "minecraft:overworld",
  nether: "minecraft:nether",
  the_end: "minecraft:the_end",
};
const DIMENSION_LABEL = {
  "minecraft:overworld": "Overworld",
  "minecraft:nether": "Nether",
  "minecraft:the_end": "End",
};

/** Entity typeId -> zone source key, e.g. minecraft:fireball -> ghasts. */
const SOURCE_OF = {};
for (const key of SOURCES) {
  for (const id of ZONE_SOURCES[key]) SOURCE_OF[id] = key;
}

const SOURCE_LIST = SOURCES.join("|") + "|all";
const USAGE = {
  all: "Usage: creeperzone list|new|update|show|protect|allow|remove|enable|disable",
  new: "Usage: creeperzone new <name> [pos1|pos2] [x y z] [overworld|nether|the_end]",
  update: "Usage: creeperzone update <name> pos1|pos2 [x y z]",
  show: "Usage: creeperzone show <name> true|false",
  protect: "Usage: creeperzone protect <name> " + SOURCE_LIST,
  allow: "Usage: creeperzone allow <name> " + SOURCE_LIST,
  remove: "Usage: creeperzone remove <name>",
};

/** Outline particles: drawn once a second, only near a player, with a cap. */
const OUTLINE_PARTICLE = "minecraft:villager_happy";
const OUTLINE_INTERVAL = 20;
const OUTLINE_RANGE = 32;
const OUTLINE_BUDGET = 1500;

function ok(message) {
  return { status: CustomCommandStatus.Success, message };
}
function fail(message) {
  return { status: CustomCommandStatus.Failure, message };
}
function lower(v) {
  return typeof v === "string" ? v.trim().toLowerCase() : undefined;
}
function dimLabel(id) {
  return "the " + (DIMENSION_LABEL[id] || id);
}
function xyz(p) {
  return p[0] + " " + p[1] + " " + p[2];
}

/** min/max box of a zone, kept in memory only, rebuilt when a corner moves. */
function boxOf(zone) {
  const a = zone.pos1, b = zone.pos2;
  return {
    x1: Math.min(a[0], b[0]), y1: Math.min(a[1], b[1]), z1: Math.min(a[2], b[2]),
    x2: Math.max(a[0], b[0]), y2: Math.max(a[1], b[1]), z2: Math.max(a[2], b[2]),
  };
}

function extentText(zone) {
  const b = zone.box;
  const size = (b.x2 - b.x1 + 1) + "x" + (b.y2 - b.y1 + 1) + "x" + (b.z2 - b.z1 + 1);
  return xyz([b.x1, b.y1, b.z1]) + " to " + xyz([b.x2, b.y2, b.z2]) + ", " + size + " blocks";
}

function protectsText(zone) {
  if (zone.protect.length === 0) return "protects nothing";
  if (zone.protect.length === SOURCES.length) return "protected from every explosion";
  return "protected from " + zone.protect.join(", ");
}

function isCoord(n) {
  return typeof n === "number" && Number.isInteger(n) && Math.abs(n) <= 30000000;
}

/** Re-validate one persisted zone; undefined drops it. */
function reviveZone(raw) {
  if (!raw || typeof raw.name !== "string") return undefined;
  const name = raw.name.trim();
  if (!name || name.length > MAX_NAME || /[|\r\n]/.test(name)) return undefined;
  if (!DIMENSION_LABEL[raw.dim]) return undefined;
  for (const p of [raw.pos1, raw.pos2]) {
    if (!Array.isArray(p) || p.length !== 3 || !p.every(isCoord)) return undefined;
  }
  const protect = Array.isArray(raw.protect) ? SOURCES.filter((s) => raw.protect.indexOf(s) !== -1) : [];
  const zone = {
    name, dim: raw.dim, pos1: raw.pos1.slice(), pos2: raw.pos2.slice(),
    shown: raw.shown === true, protect,
  };
  zone.box = boxOf(zone);
  return zone;
}

/**
 * One instance per pack load. A factory rather than module state, so the test
 * harness can load the pack repeatedly without zones leaking between cases.
 */
export function createZones() {
  let enabled = false;
  let zones = [];
  let loaded = false;
  let saveQueued = false;

  function find(name) {
    const key = name.toLowerCase();
    return zones.find((z) => z.name.toLowerCase() === key);
  }

  function load() {
    enabled = false;
    zones = [];
    try {
      const raw = world.getDynamicProperty(PROPERTY);
      if (typeof raw === "string") {
        const data = JSON.parse(raw);
        enabled = data.enabled === true;
        const seen = new Set();
        for (const r of Array.isArray(data.zones) ? data.zones : []) {
          const z = reviveZone(r);
          if (!z || seen.has(z.name.toLowerCase()) || zones.length >= MAX_ZONES) continue;
          seen.add(z.name.toLowerCase());
          zones.push(z);
        }
      }
    } catch (e) {
      console.warn("[CreeperDropAll] zones could not be read, starting with none: " + e);
    }
    loaded = true;
  }

  /** Deferred: command callbacks are restricted execution. */
  function save() {
    if (saveQueued) return;
    saveQueued = true;
    system.run(() => {
      saveQueued = false;
      const data = {
        enabled,
        zones: zones.map((z) => ({
          name: z.name, dim: z.dim, pos1: z.pos1, pos2: z.pos2, shown: z.shown, protect: z.protect,
        })),
      };
      try {
        world.setDynamicProperty(PROPERTY, JSON.stringify(data));
      } catch (e) {
        console.warn("[CreeperDropAll] zones could not be saved: " + e);
      }
    });
  }

  /* ---------------------------------------------------------------- *
   * Explosions
   * ---------------------------------------------------------------- */

  function active() {
    return enabled && zones.length > 0;
  }

  /**
   * The blocks an explosion may still break, given the zones. Pure JS plus
   * Block.location reads, so it is safe in the explosion before-event.
   *
   * Inside a zone the zone decides: protected if ANY zone covering the block
   * protects against this source, otherwise it breaks - even if the pack
   * setting for that mob says it doesn't. Outside every zone, globalNoBreak
   * (that mob's pack setting) decides. Returns `blocks` itself when nothing
   * is filtered, so the caller can tell by identity.
   */
  function keepBlocks(dimensionId, blocks, sourceTypeId, globalNoBreak) {
    const source = SOURCE_OF[sourceTypeId];

    // Only zones that could contain one of these blocks.
    let x1 = Infinity, y1 = Infinity, z1 = Infinity, x2 = -Infinity, y2 = -Infinity, z2 = -Infinity;
    const locs = new Array(blocks.length);
    for (let i = 0; i < blocks.length; i++) {
      let l;
      try { l = blocks[i].location; } catch (e) { l = undefined; }
      locs[i] = l;
      if (!l) continue;
      if (l.x < x1) x1 = l.x; if (l.x > x2) x2 = l.x;
      if (l.y < y1) y1 = l.y; if (l.y > y2) y2 = l.y;
      if (l.z < z1) z1 = l.z; if (l.z > z2) z2 = l.z;
    }
    const near = zones.filter((z) => z.dim === dimensionId &&
      z.box.x1 <= x2 && z.box.x2 >= x1 && z.box.y1 <= y2 && z.box.y2 >= y1 &&
      z.box.z1 <= z2 && z.box.z2 >= z1);
    if (near.length === 0) return globalNoBreak ? [] : blocks;

    const keep = [];
    for (let i = 0; i < blocks.length; i++) {
      const l = locs[i];
      // An unreadable block is left standing: in a zone, wrong that way is safe.
      if (!l) continue;
      let covered = false;
      let prot = false;
      for (const z of near) {
        const b = z.box;
        if (l.x < b.x1 || l.x > b.x2 || l.y < b.y1 || l.y > b.y2 || l.z < b.z1 || l.z > b.z2) continue;
        covered = true;
        if (source && z.protect.indexOf(source) !== -1) { prot = true; break; }
      }
      if (!(covered ? prot : globalNoBreak)) keep.push(blocks[i]);
    }
    return keep.length === blocks.length ? blocks : keep;
  }

  /* ---------------------------------------------------------------- *
   * The command
   * ---------------------------------------------------------------- */

  function register(startupEvent) {
    try {
      const reg = startupEvent.customCommandRegistry;
      reg.registerEnum(ACTION_ENUM, ACTIONS);
      reg.registerEnum(VALUE_ENUM, VALUES);
      reg.registerEnum(DIMENSION_ENUM, Object.keys(DIMENSIONS));
      reg.registerCommand(
        {
          name: COMMAND,
          description: "Creeper Drop All zones: areas with their own explosion block protection.",
          permissionLevel: CommandPermissionLevel.GameDirectors,
          cheatsRequired: false,
          mandatoryParameters: [{ name: ACTION_ENUM, type: CustomCommandParamType.Enum }],
          optionalParameters: [
            { name: "name", type: CustomCommandParamType.String },
            { name: VALUE_ENUM, type: CustomCommandParamType.Enum },
            { name: "position", type: CustomCommandParamType.Location },
            { name: DIMENSION_ENUM, type: CustomCommandParamType.Enum },
          ],
        },
        (origin, action, name, value, position, dimension) =>
          run(origin, action, name, value, position, dimension)
      );
    } catch (e) {
      // The pack still runs without the command; zones just cannot be managed.
      console.warn("[CreeperDropAll] creeperzone command unavailable: " + e);
    }
  }

  /** Never throws: an exception in a command callback reaches the player as noise. */
  function run(origin, action, name, value, position, dimension) {
    try {
      return handle(origin, action, name, value, position, dimension);
    } catch (e) {
      console.warn("[CreeperDropAll] creeperzone: " + e);
      return fail("creeperzone failed: " + e);
    }
  }

  function handle(origin, rawAction, rawName, rawValue, position, rawDimension) {
    if (!loaded) return fail("Creeper Drop All is still loading. Try again in a moment.");

    // The console does not enforce enum values, so every enum is re-checked.
    const action = lower(rawAction);
    if (ACTIONS.indexOf(action) === -1) return fail(USAGE.all);

    if (action === "list") return list();
    if (action === "enable" || action === "disable") {
      enabled = action === "enable";
      save();
      if (!enabled) return ok("Zones are off. Explosions follow the pack settings everywhere; your zones are kept.");
      return ok("Zones are on. " + (zones.length === 0
        ? "There are none yet. creeperzone new <name> adds one."
        : countText(zones.length) + (zones.length === 1 ? " now protects its blocks." : " now protect their blocks.")));
    }

    const name = typeof rawName === "string" ? rawName.trim() : "";
    if (!name) return fail(USAGE[action]);
    if (name.length > MAX_NAME) return fail("A zone name can be at most " + MAX_NAME + " characters.");
    if (/[|\r\n]/.test(name)) return fail("A zone name cannot contain | or a line break.");

    const value = lower(rawValue);
    const zone = find(name);
    const ctx = originContext(origin);

    if (action === "new") {
      if (value !== undefined && CORNERS.indexOf(value) === -1) return fail(USAGE.new);
      if (zone) {
        if (value === undefined) {
          return fail("There is already a zone named " + zone.name + ". Move a corner with creeperzone new " +
            zone.name + " pos1|pos2, or remove it first.");
        }
        return moveCorner(zone, value, ctx, position, rawDimension);
      }
      if (zones.length >= MAX_ZONES) return fail("There are already " + MAX_ZONES + " zones. Remove one first.");
      const dim = pickDimension(ctx, rawDimension);
      if (dim.error) return fail(dim.error);
      const pos = pickPosition(ctx, position);
      if (pos.error) return fail(pos.error);
      const created = { name, dim: dim.id, pos1: pos.at, pos2: pos.at.slice(), shown: false, protect: SOURCES.slice() };
      created.box = boxOf(created);
      zones.push(created);
      save();
      let msg = "Added zone " + name + " in " + dimLabel(dim.id) + " at " + xyz(pos.at) +
        ", one block. Set its other corner with creeperzone new " + name + " pos2." +
        "\nIt protects its blocks from every explosion; creeperzone allow " + name + " <source> lets one through.";
      if (!enabled) msg += "\nZones are off, so it has no effect until creeperzone enable.";
      return ok(msg);
    }

    if (!zone) return fail("No zone named " + name + ". creeperzone list names them.");

    switch (action) {
      case "update":
        if (CORNERS.indexOf(value) === -1) return fail(USAGE.update);
        return moveCorner(zone, value, ctx, position, rawDimension);

      case "show":
        if (BOOLS.indexOf(value) === -1) return fail(USAGE.show);
        zone.shown = value === "true";
        save();
        return ok(zone.name + (zone.shown ? " is shown in game." : " is hidden in game."));

      case "protect":
      case "allow": {
        if (value !== "all" && SOURCES.indexOf(value) === -1) return fail(USAGE[action]);
        const picked = value === "all" ? SOURCES : [value];
        const set = new Set(zone.protect);
        for (const s of picked) action === "protect" ? set.add(s) : set.delete(s);
        zone.protect = SOURCES.filter((s) => set.has(s));
        save();
        const what = value === "all" ? "every explosion" : value;
        return ok(action === "protect"
          ? zone.name + " now protects its blocks from " + what + ". It is " + protectsText(zone) + "."
          : zone.name + " now lets " + what + " break its blocks. It is " + protectsText(zone) + ".");
      }

      case "remove":
        zones = zones.filter((z) => z !== zone);
        save();
        return ok("Removed zone " + zone.name + ".");
    }
    return fail(USAGE.all);
  }

  function moveCorner(zone, corner, ctx, position, rawDimension) {
    // Same dimension only: a zone never spans two.
    if (rawDimension !== undefined) {
      const dim = pickDimension(ctx, rawDimension);
      if (dim.error) return fail(dim.error);
      if (dim.id !== zone.dim) return fail(zone.name + " is in " + dimLabel(zone.dim) + ". Both corners must be in the same dimension.");
    } else if (ctx.dim && ctx.dim !== zone.dim) {
      return fail(zone.name + " is in " + dimLabel(zone.dim) + ". Both corners must be in the same dimension.");
    }
    const pos = pickPosition(ctx, position);
    if (pos.error) return fail(pos.error);
    zone[corner] = pos.at;
    zone.box = boxOf(zone);
    save();
    return ok(zone.name + " now runs from " + extentText(zone) + ".");
  }

  function list() {
    const head = "Zones are " + (enabled ? "on" : "off") + ". ";
    if (zones.length === 0) return ok(head + "No zones yet. creeperzone new <name> adds one.");
    const lines = [head + countText(zones.length) + ":"];
    for (const z of zones) {
      const b = z.box;
      lines.push(z.name + ": " + xyz([b.x1, b.y1, b.z1]) + " to " + xyz([b.x2, b.y2, b.z2]) + " in " +
        dimLabel(z.dim) + ", " + (z.shown ? "shown" : "hidden") + ", " + protectsText(z));
    }
    return ok(lines.join("\n"));
  }

  /* ---------------------------------------------------------------- *
   * Outlines
   * ---------------------------------------------------------------- */

  function startOutlines() {
    try {
      system.runInterval(drawOutlines, OUTLINE_INTERVAL);
    } catch (e) {
      console.warn("[CreeperDropAll] zone outlines unavailable: " + e);
    }
  }

  /**
   * The edges of every shown zone, as particles at block corners, only within
   * OUTLINE_RANGE of a player and never more than OUTLINE_BUDGET a second - a
   * zone the size of a town must not cost the server anything when nobody is
   * near it.
   */
  function drawOutlines() {
    const shown = zones.filter((z) => z.shown);
    if (shown.length === 0) return;
    let players;
    try { players = world.getAllPlayers(); } catch (e) { return; }
    let budget = OUTLINE_BUDGET;
    for (const z of shown) {
      const points = new Map();
      for (const p of players) {
        let loc, dim;
        try { loc = p.location; dim = p.dimension; } catch (e) { continue; }
        if (!dim || dim.id !== z.dim) continue;
        edgePointsNear(z.box, loc, points, dim);
      }
      for (const { dim, at } of points.values()) {
        if (budget-- <= 0) return;
        try { dim.spawnParticle(OUTLINE_PARTICLE, at); } catch (e) { /* unloaded chunk */ }
      }
    }
  }

  return { load, register, active, keepBlocks, startOutlines, run, get count() { return zones.length; } };
}

function countText(n) {
  return n + (n === 1 ? " zone" : " zones");
}

/** Edge points of the box (block corners, so the outline hugs the blocks). */
function edgePointsNear(box, loc, out, dim) {
  const lo = [box.x1, box.y1, box.z1];
  const hi = [box.x2 + 1, box.y2 + 1, box.z2 + 1];
  const p = [loc.x, loc.y, loc.z];
  const r = OUTLINE_RANGE;
  for (let axis = 0; axis < 3; axis++) {
    const a = (axis + 1) % 3, b = (axis + 2) % 3;
    const from = Math.max(lo[axis], Math.floor(p[axis] - r));
    const to = Math.min(hi[axis], Math.ceil(p[axis] + r));
    for (const va of [lo[a], hi[a]]) {
      if (Math.abs(va - p[a]) > r) continue;
      for (const vb of [lo[b], hi[b]]) {
        if (Math.abs(vb - p[b]) > r) continue;
        for (let t = from; t <= to; t++) {
          const v = [0, 0, 0];
          v[axis] = t; v[a] = va; v[b] = vb;
          const key = v[0] + "," + v[1] + "," + v[2];
          if (!out.has(key)) out.set(key, { dim, at: { x: v[0], y: v[1], z: v[2] } });
        }
      }
    }
  }
}

/**
 * Who ran the command, and where. A player (or any entity) gives a dimension
 * and a default position; a command block gives a dimension; the server
 * console gives neither.
 */
function originContext(origin) {
  const e = origin && origin.sourceEntity;
  if (e) {
    try { return { kind: "entity", dim: e.dimension.id, feet: e.location }; } catch (err) { /* fall through */ }
  }
  const b = origin && origin.sourceBlock;
  if (b) {
    try { return { kind: "block", dim: b.dimension.id }; } catch (err) { /* fall through */ }
  }
  return { kind: "console" };
}

function pickDimension(ctx, rawDimension) {
  if (rawDimension !== undefined) {
    const id = DIMENSIONS[lower(rawDimension)];
    if (!id) return { error: "Dimension must be overworld, nether or the_end." };
    return { id };
  }
  return { id: ctx.dim || DIMENSIONS.overworld };
}

/**
 * Every coordinate is floored: a Location arrives block-centred. With no
 * position, an entity's own position is the block under its feet.
 */
function pickPosition(ctx, position) {
  if (position) {
    const at = [Math.floor(position.x), Math.floor(position.y), Math.floor(position.z)];
    if (!at.every(isCoord)) return { error: "That position is out of range." };
    return { at };
  }
  if (ctx.feet) {
    return { at: [Math.floor(ctx.feet.x), Math.floor(ctx.feet.y) - 1, Math.floor(ctx.feet.z)] };
  }
  return { error: (ctx.kind === "block" ? "A command block" : "The console") + " must give x y z." };
}
