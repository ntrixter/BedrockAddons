// Mock of the parts of @minecraft/server that main.js touches: pack settings,
// world dynamic properties, players, a raycast, and the two subscriptions.
// control lets a test set the scene; hooks hands back what main.js registered.

const worldProps = new Map();

export const control = {
  packSettings: {},
  players: [],
};

export const hooks = {
  interval: undefined,
  hurt: undefined,
  hurtOptions: undefined,
};

export function reset() {
  worldProps.clear();
  control.players = [];
  hooks.interval = undefined;
  hooks.hurt = undefined;
  hooks.hurtOptions = undefined;
}

export const world = {
  getPackSettings: () => control.packSettings,
  getDynamicProperty: (id) => worldProps.get(id),
  setDynamicProperty: (id, v) => (v === undefined ? worldProps.delete(id) : worldProps.set(id, v)),
  getPlayers: () => control.players.filter((p) => p.online),
  beforeEvents: {
    entityHurt: {
      subscribe(callback, options) {
        hooks.hurt = callback;
        hooks.hurtOptions = options;
        return callback;
      },
    },
  },
};

export const system = {
  runInterval(callback) {
    hooks.interval = callback;
    return 1;
  },
};

let nextId = 1;

export function makePlayer(name) {
  const p = {
    id: `-${nextId++}`,
    typeId: "minecraft:player",
    name,
    online: true,
    actionBar: undefined,
    looking: [],
    onScreenDisplay: {
      setActionBar(text) {
        p.actionBar = text;
      },
    },
    getEntitiesFromViewDirection: () => p.looking,
  };
  control.players.push(p);
  return p;
}

/**
 * A mob. tame is undefined (wild), or { owner, component } where component is
 * "minecraft:tameable" or "minecraft:tamemount".
 */
export function makeMob(typeId, tame, nameTag = "") {
  const props = new Map();
  const component = tame && {
    isTamed: true,
    isTamedToPlayer: true,
    get tamedToPlayer() {
      return tame.owner.online ? tame.owner : undefined;
    },
    get tamedToPlayerId() {
      return tame.owner.id;
    },
  };
  return {
    id: `${nextId++}`,
    typeId,
    nameTag,
    getComponent: (id) => (tame && id === (tame.component ?? "minecraft:tameable") ? component : undefined),
    getDynamicProperty: (id) => props.get(id),
    setDynamicProperty: (id, v) => (v === undefined ? props.delete(id) : props.set(id, v)),
  };
}
