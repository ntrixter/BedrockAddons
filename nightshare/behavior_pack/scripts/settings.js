import { world } from "@minecraft/server";
import * as cfg from "./config.js";

/**
 * Resolves Nightshare's four tunable settings from, in order of precedence:
 *
 *   1. a runtime override set with `scriptevent nightshare:config`, stored in
 *      the world so it survives a restart
 *   2. the pack settings screen - the gear beside Nightshare in the world's
 *      Behavior Packs list. On a server with no UI this still reports the
 *      `default` values declared in manifest.json
 *   3. the constants in config.js
 *
 * A note on why there is no config file to edit: Bedrock scripts have no
 * filesystem access, so a plain JSON file dropped in the pack could never be
 * read back. The only files that can reach a script are manifest.json (through
 * getPackSettings) and the scripts themselves. The documented server-side
 * alternative, config/<uuid>/variables.json via @minecraft/server-admin, needs
 * the Beta APIs experiment and cannot be used on clients or Realms at all - see
 * README.md.
 */

const GUARDS = ["off", "auto", "always"];

/** Shared by every on/off setting, so they all accept the same words. */
function parseBool(raw) {
  if (typeof raw === "boolean") return raw;
  const s = String(raw).toLowerCase();
  if (s === "true" || s === "on" || s === "yes") return true;
  if (s === "false" || s === "off" || s === "no") return false;
  return undefined;
}

/**
 * One entry per admin-facing key. `pack` is the manifest setting name, `parse`
 * turns arbitrary text or a screen value into something valid, or undefined to
 * reject it.
 */
const SETTINGS = {
  guard: {
    pack: "nightshare:vanilla_guard",
    fallback: () => cfg.VANILLA_GUARD,
    parse: (raw) => (GUARDS.includes(String(raw)) ? String(raw) : undefined),
    show: (v) => v,
    hint: GUARDS.join(" | "),
  },
  skip: {
    pack: "nightshare:skip_seconds",
    fallback: () => cfg.BURN_DURATION_TICKS / 20,
    parse: (raw) => {
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 && n <= 60 ? n : undefined;
    },
    show: (v) => `${v}s`,
    hint: "seconds, 1-60",
  },
  announce: {
    pack: "nightshare:announce",
    fallback: () => cfg.ANNOUNCE,
    parse: parseBool,
    show: (v) => String(v),
    hint: "true | false",
  },
  handoff: {
    pack: "nightshare:dawn_handoff",
    fallback: () => cfg.DAWN_HANDOFF,
    parse: parseBool,
    show: (v) => String(v),
    hint: "true | false",
  },
};

export const KEYS = Object.keys(SETTINGS);

/** @type {Record<string, unknown>} */
let packValues = {};
/** @type {Record<string, unknown>} */
let overrides = {};

export function init() {
  try {
    // Absent on older engines and on any pack loaded under an older API
    // version. Falling back is correct, not an error worth shouting about.
    packValues = world.getPackSettings?.() ?? {};
  } catch (e) {
    console.warn(`[Nightshare] could not read pack settings, using defaults: ${e}`);
    packValues = {};
  }

  overrides = {};
  try {
    const raw = world.getDynamicProperty(cfg.OVERRIDE_KEY);
    if (typeof raw === "string") {
      const parsed = JSON.parse(raw);
      // Re-validate on load: the pack may have shipped a narrower range since
      // this was written, and a stale value should not survive that.
      for (const key of KEYS) {
        const v = SETTINGS[key].parse(parsed[key]);
        if (v !== undefined) overrides[key] = v;
      }
    }
  } catch (e) {
    console.warn(`[Nightshare] ignoring unreadable config overrides: ${e}`);
  }
}

/**
 * @param {string} key
 * @returns {{value: any, source: string}}
 */
export function resolve(key) {
  const def = SETTINGS[key];
  if (overrides[key] !== undefined) return { value: overrides[key], source: "command" };

  const fromPack = def.parse(packValues[def.pack]);
  if (fromPack !== undefined) return { value: fromPack, source: "manifest" };

  return { value: def.fallback(), source: "config.js" };
}

export function vanillaGuard() {
  return resolve("guard").value;
}

export function burnDurationTicks() {
  return Math.max(1, Math.round(resolve("skip").value * 20));
}

export function announce() {
  return resolve("announce").value;
}

export function dawnHandoff() {
  return resolve("handoff").value;
}

/**
 * Apply and persist an override.
 * @returns {{ok: boolean, message: string}}
 */
export function set(key, raw) {
  const def = SETTINGS[key];
  if (!def) return { ok: false, message: `unknown setting "${key}". Try: ${KEYS.join(", ")}` };

  const parsed = def.parse(raw);
  if (parsed === undefined) return { ok: false, message: `"${raw}" is not valid for ${key} (${def.hint})` };

  overrides[key] = parsed;
  world.setDynamicProperty(cfg.OVERRIDE_KEY, JSON.stringify(overrides));
  return { ok: true, message: `${key} = ${def.show(parsed)}` };
}

/** Drop every override, handing control back to the manifest and config.js. */
export function clear() {
  overrides = {};
  world.setDynamicProperty(cfg.OVERRIDE_KEY, undefined);
}

/** One "key = value (source)" line per setting, for the config command. */
export function report() {
  return KEYS.map((key) => {
    const { value, source } = resolve(key);
    return { key, shown: SETTINGS[key].show(value), source, hint: SETTINGS[key].hint };
  });
}
