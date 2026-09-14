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

/** Advance one game tick: natural cycle first, then Nightshare's interval. */
export function tick() {
  state.absoluteTime += 1;
  state.tickFn();
}
