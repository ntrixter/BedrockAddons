// Pet Tools test harness.
//
// Loads the shipping pack scripts against a mock of @minecraft/server and
// drives the look-at line and the dog-bite guard. loader.js redirects the
// "@minecraft/server" import, so the scripts load unmodified:
//
//   cd pet-tools/tests && node --import ./register.js run.js
//
// It cannot check what needs the real game: whether tamedToPlayerId matches
// Player.id, whether cancelling the hurt event also cancels knockback, or how
// a dog behaves once its bites stop landing. See README.md "Confirm in-game".

import { describe, speciesName } from "../behavior_pack/scripts/describe.js";
import { control, hooks, reset, makePlayer, makeMob } from "@minecraft/server";

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: got ${JSON.stringify(actual)}${ok ? "" : `, want ${JSON.stringify(expected)}`}`);
}

let generation = 0;
async function load(packSettings = {}) {
  reset();
  control.packSettings = packSettings;
  await import(`../behavior_pack/scripts/main.js?case=${generation++}`);
}

/** Point the player at these mobs, nearest first, and run one update. */
function look(player, ...mobs) {
  player.looking = mobs.map((entity, i) => ({ entity, distance: 2 + i }));
  hooks.interval();
  return player.actionBar;
}

console.log("Lines");
check("species: wolf is a dog", speciesName("minecraft:wolf"), "Dog");
check("species: tidied id", speciesName("minecraft:skeleton_horse"), "Skeleton horse");
check("yours", describe({ typeId: "minecraft:cat", yours: true, hasOwnerId: true, owner: "Alex" }), "§aCat · yours");
check("someone else's, named", describe({ typeId: "minecraft:wolf", nameTag: "Rex", owner: "Steve", hasOwnerId: true }),
  '§bDog "Rex" · owned by Steve');
check("owner never seen", describe({ typeId: "minecraft:parrot", hasOwnerId: true }), "§7Parrot · owner not seen yet");
check("§ codes in a name are dropped", describe({ typeId: "minecraft:wolf", nameTag: "§cRed", owner: "§kSteve", hasOwnerId: true }),
  '§bDog "Red" · owned by Steve');

console.log("Looking at pets");
await load();
{
  const steve = makePlayer("Steve");
  const alex = makePlayer("Alex");
  const dog = makeMob("minecraft:wolf", { owner: steve }, "Rex");
  check("owner sees yours", look(steve, dog), '§aDog "Rex" · yours');
  check("friend sees the owner", look(alex, dog), '§bDog "Rex" · owned by Steve');

  steve.online = false;
  check("owner offline: name kept from before", look(alex, dog), '§bDog "Rex" · owned by Steve');

  const horse = makeMob("minecraft:horse", { owner: steve, component: "minecraft:tamemount" });
  check("offline owner, new pet: name from the player list", look(alex, horse), "§bHorse · owned by Steve");

  const stranger = makePlayer("Kai");
  stranger.online = false;
  const cat = makeMob("minecraft:cat", { owner: stranger });
  check("owner never online while the pack ran", look(alex, cat), "§7Cat · owner not seen yet");

  const wild = makeMob("minecraft:wolf");
  check("wild wolf: line clears", look(alex, wild), "");
  look(alex, dog);
  check("nothing in view: line clears", look(alex), "");
  look(alex, dog);
  check("a cow in front hides the dog", look(alex, makeMob("minecraft:cow"), dog), "");
  alex.actionBar = "another pack's line";
  look(alex);
  check("cleared once, then left alone", alex.actionBar, "another pack's line");
}

await load({ "pet_tools:show_owner": false });
check("show owner off: no update loop", hooks.interval, undefined);

console.log("Dog bites");
await load();
{
  check("subscribed for players only", hooks.hurtOptions?.entityFilter?.type, "minecraft:player");
  check("subscribed for melee only", hooks.hurtOptions?.allowedDamageCauses?.join(), "entityAttack");
  const steve = makePlayer("Steve");
  const bite = (attacker) => {
    const event = { cancel: false, damageSource: { damagingEntity: attacker } };
    hooks.hurt(event);
    return event.cancel;
  };
  check("tamed dog: cancelled", bite(makeMob("minecraft:wolf", { owner: steve })), true);
  check("wild wolf: vanilla", bite(makeMob("minecraft:wolf")), false);
  check("tamed cat: untouched", bite(makeMob("minecraft:cat", { owner: steve })), false);
  check("no attacker: untouched", bite(undefined), false);
}

await load({ "pet_tools:protect_players": false });
check("protection off: not subscribed", hooks.hurt, undefined);

console.log("");
console.log(failures ? `${failures} FAILED` : "All passed");
process.exit(failures ? 1 : 0);
