// Mock of the bits of @minecraft/server that Nightshare touches.
// Time model mirrors Bedrock: setTimeOfDay moves the clock WITHIN the current
// day, so setting 0 from 23999 rewinds without advancing the day counter.

export const state = {
  absoluteTime: 0,
  props: new Map(),
  players: [],
  messages: [],
  actionBars: [],
  gameRules: { playersSleepingPercentage: 100, doDayLightCycle: true },
  rested: [],              // names woken by a vanilla skip - stands in for the
                           // per-player "time since rest" a real sleep clears
  vanillaSkips: 0,
  // Scenarios 1-12 predate this mock modelling Minecraft's own night skip, and
  // were written for a world where only Nightshare ever moves the clock. Some
  // of them (solo play especially) would read differently with it on, so it is
  // opt-in per scenario rather than a global change to what they assert.
  // Revisiting them against a vanilla-aware mock is worth doing separately.
  vanillaSkipEnabled: false,
  packSettings: {},        // what the gear screen would supply
  packSettingsSupported: true,
};

export const world = {
  gameRules: state.gameRules,
  getTimeOfDay: () => state.absoluteTime % 24000,
  setTimeOfDay: (t) => {
    if (t < 0 || t > 24000) throw new Error(`time out of range: ${t}`);
    const day = Math.floor(state.absoluteTime / 24000);
    state.absoluteTime = day * 24000 + t;
  },
  getDay: () => Math.floor(state.absoluteTime / 24000),
  getAllPlayers: () => state.players.filter((p) => p.online),
  getPackSettings: () => {
    if (!state.packSettingsSupported) throw new Error("not supported on this engine");
    return state.packSettings;
  },
  getDynamicProperty: (k) => state.props.get(k),
  setDynamicProperty: (k, v) => (v === undefined ? state.props.delete(k) : state.props.set(k, v)),
  sendMessage: (m) => state.messages.push(m),
  afterEvents: { playerLeave: { subscribe: (fn) => (state.onLeave = fn) } },
};

export const system = {
  runInterval: (fn) => (state.tickFn = fn),
  afterEvents: { scriptEventReceive: { subscribe: (fn) => (state.onScriptEvent = fn) } },
};

export function makePlayer(name, dim = "minecraft:overworld") {
  return {
    id: `id-${name}`,
    name,
    online: true,
    isSleeping: false,
    dimension: { id: dim },
    onScreenDisplay: { setActionBar: (t) => state.actionBars.push(`${name}: ${t}`) },
  };
}

/**
 * Minecraft's own night skip, which the pack now deliberately provokes.
 *
 * Fires when the share of Overworld players in bed meets
 * playersSleepingPercentage, sending the clock to dawn and waking the sleepers.
 * Those sleepers are recorded in state.rested: the real game clears their
 * "time since rest" here, and that clearing is the entire point of the handoff,
 * so the mock has to model who it happens to rather than just that time moved.
 */
function vanillaNightSkip() {
  if (!state.vanillaSkipEnabled) return;
  if (world.getTimeOfDay() < 12542) return;            // not night, no skip
  const here = state.players.filter((p) => p.online && p.dimension.id === "minecraft:overworld");
  if (here.length === 0) return;
  const abed = here.filter((p) => p.isSleeping);
  if (abed.length === 0) return;                       // nobody sleeping, never fires

  const pct = state.gameRules.playersSleepingPercentage;
  if ((abed.length / here.length) * 100 < pct) return;

  for (const p of abed) {
    p.isSleeping = false;
    state.rested.push(p.name);
  }
  const day = Math.floor(state.absoluteTime / 24000);
  state.absoluteTime = (day + 1) * 24000;              // morning of the next day
  state.vanillaSkips += 1;
}

/** Advance one game tick: natural cycle, vanilla's own rules, then Nightshare. */
export function tick() {
  state.absoluteTime += 1;
  vanillaNightSkip();
  state.tickFn();
}
