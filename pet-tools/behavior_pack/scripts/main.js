import { system, world } from "@minecraft/server";
import { describe } from "./describe.js";

const TICKS_PER_UPDATE = 5;
const WOLF = "minecraft:wolf";
// Owner name, saved on the pet whenever it is seen with its owner online.
const PET_OWNER = "pet_tools:owner";
// Player name by player id, saved at world level whenever a player is online.
const PLAYER_NAME = "pet_tools:player:";

/** Read once at load: there is no stable settings-change event yet. */
function readSettings() {
  let values = {};
  try {
    values = world.getPackSettings() ?? {};
  } catch {
    // Older runtimes or a server with no settings file: use the defaults.
  }
  const reach = Number(values["pet_tools:reach"]);
  return {
    showOwner: values["pet_tools:show_owner"] !== false,
    reach: Number.isFinite(reach) && reach > 0 ? reach : 8,
    protectPlayers: values["pet_tools:protect_players"] !== false,
  };
}

const settings = readSettings();

/**
 * The pet's tame component if a player has tamed it, else undefined. Dogs,
 * cats and parrots use minecraft:tameable; horses, donkeys, mules, llamas and
 * camels use minecraft:tamemount.
 */
export function tameOf(entity) {
  const tameable = entity.getComponent("minecraft:tameable");
  if (tameable?.isTamed) return tameable;
  const mount = entity.getComponent("minecraft:tamemount");
  if (mount?.isTamedToPlayer) return mount;
  return undefined;
}

function rememberPlayer(player) {
  try {
    if (world.getDynamicProperty(PLAYER_NAME + player.id) !== player.name) {
      world.setDynamicProperty(PLAYER_NAME + player.id, player.name);
    }
  } catch {
    // Not fatal: the pet's own cache still covers an owner seen with it.
  }
}

/**
 * The owner's name, from the live player if they are online, else from what
 * was saved on the pet or against their id the last time they were.
 */
function ownerName(pet, tame) {
  let ownerId;
  try {
    const owner = tame.tamedToPlayer;
    if (owner) {
      if (pet.getDynamicProperty(PET_OWNER) !== owner.name) pet.setDynamicProperty(PET_OWNER, owner.name);
      return { name: owner.name, id: owner.id };
    }
  } catch {
    // Documented as able to throw; treat it as offline.
  }
  try {
    ownerId = tame.tamedToPlayerId;
  } catch {
    // Same.
  }
  const saved = pet.getDynamicProperty(PET_OWNER);
  if (typeof saved === "string") return { name: saved, id: ownerId };
  const byId = ownerId === undefined ? undefined : world.getDynamicProperty(PLAYER_NAME + ownerId);
  return { name: typeof byId === "string" ? byId : undefined, id: ownerId };
}

/** The tamed pet the player is pointing at, or undefined. */
function targetPet(player) {
  const hits = player.getEntitiesFromViewDirection({ maxDistance: settings.reach });
  let nearest;
  for (const hit of hits) {
    if (!nearest || hit.distance < nearest.distance) nearest = hit;
  }
  // Only the nearest thing counts, so a cow in front hides the dog behind it.
  if (!nearest || nearest.entity.typeId === "minecraft:player") return undefined;
  const tame = tameOf(nearest.entity);
  return tame ? { pet: nearest.entity, tame } : undefined;
}

export function lineFor(player, pet, tame) {
  const owner = ownerName(pet, tame);
  return describe({
    typeId: pet.typeId,
    nameTag: pet.nameTag || undefined,
    owner: owner.name,
    hasOwnerId: owner.id !== undefined,
    yours: owner.id !== undefined && owner.id === player.id,
  });
}

const showing = new Set();

if (settings.showOwner) {
  system.runInterval(() => {
    for (const player of world.getPlayers()) {
      try {
        rememberPlayer(player);
        const target = targetPet(player);
        if (target) {
          player.onScreenDisplay.setActionBar(lineFor(player, target.pet, target.tame));
          showing.add(player.id);
        } else if (showing.delete(player.id)) {
          player.onScreenDisplay.setActionBar("");
        }
      } catch {
        // A player can leave, or a pet despawn, while this update runs.
      }
    }
  }, TICKS_PER_UPDATE);
}

/** Cancel a tamed dog's bite on any player. */
export function onHurt(event) {
  const dog = event.damageSource.damagingEntity;
  if (dog?.typeId !== WOLF) return;
  if (dog.getComponent("minecraft:tameable")?.isTamed) event.cancel = true;
}

if (settings.protectPlayers) {
  world.beforeEvents.entityHurt.subscribe(onHurt, {
    entityFilter: { type: "minecraft:player" },
    allowedDamageCauses: ["entityAttack"],
  });
}
