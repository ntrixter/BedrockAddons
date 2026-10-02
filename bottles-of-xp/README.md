# Bottles of XP

Trade Bottles o' Enchanting for experience at a crafting table, and back again,
at a fixed **7 XP a bottle**. Put a Bottle o' Enchanting in the crafting grid and
take out a glass bottle and 7 XP. Put a glass bottle in, and if you have 7 XP to
spare, take out a Bottle o' Enchanting. It is a way to keep experience safely in
a chest and get exactly that much back later.

For bulk storage, nine Bottles o' Enchanting also pack into one gilded
blackstone at a crafting table, and one gilded blackstone unpacks into nine.

- **Add-on ID:** `bottles-of-xp` (kebab-case; also the tag prefix, the issue
  label and the artifact filename)
- **Minimum Minecraft version:** 1.26.30 (`min_engine_version` in the manifest)
- **Packs:** behaviour pack only
- **Author:** ntrixter
- **No experiments and no resource pack.** Four recipes, two placeholder items
  and one script.

## How it works

| Put in the grid | The output shows | When it reaches your inventory |
| --- | --- | --- |
| 1 Bottle o' Enchanting | Glass Bottle (+7 XP) | a glass bottle, and 7 XP added |
| 1 glass bottle | Bottle o' Enchanting (-7 XP) | a Bottle o' Enchanting, and 7 XP taken - or your glass bottle back if you have less than 7 XP |
| 9 Bottles o' Enchanting, filling a crafting table's grid | Gilded Blackstone | one gilded blackstone - an ordinary recipe, nothing to settle |
| 1 gilded blackstone | 9 Bottles o' Enchanting | nine Bottles o' Enchanting - an ordinary recipe, nothing to settle |

Shift-click the output to convert a whole stack at once.

**Why the output is a placeholder.** A crafting recipe can turn one item into
another, but it cannot add or take experience, and the game has no stable
"player crafted something" event a script could use instead. So each recipe
makes a placeholder that looks like what you are getting - the bottles borrow
the game's own icons, and the gilded blackstone one is drawn as the real block -
and the pack's script swaps it for the real thing and moves any XP the moment it
lands in your inventory. The placeholder is the
receipt: crafting makes it from a real bottle and the swap consumes it, so
nothing can be paid twice or paid for nothing.

**How it reads and takes XP.** The pack works your total out from your level
and progress and checks it against the game's own bar size, so if an update ever
changed the experience curve, the pack would refuse to charge rather than charge
the wrong amount. It never subtracts across a level boundary, which the game is
reported not to do correctly; it empties the current bar, drops whole levels,
then adds the remainder back. After every charge it checks the result, and if
the game did not land exactly 7 XP per bottle lower, it puts the XP back and
returns your glass bottles.

**Only your inventory completes the trade.** On the ground or in a chest, a
placeholder turns back into what it was crafted from, and no XP moves. That
stops anyone crafting "Bottle o' Enchanting (-7 XP)" and throwing it at another
player to charge them for it.

## Gilded blackstone storage

Nine Bottles o' Enchanting pack into one gilded blackstone, and one gilded
blackstone unpacks into nine. These two are ordinary recipes: they make the real
items, so there is no placeholder and nothing for the script to do. Gilded
blackstone was chosen because nothing crafts it and nothing renews it - it comes
only from bastion remnants, and piglins do not trade it.

- **Gilded blackstone found in bastions unpacks too.** Every block from a
  bastion's walls or chests is worth nine Bottles o' Enchanting. Bastions are
  finite, so that is a one-off haul.
- **Mine placed gilded blackstone with Silk Touch.** Without it, the block has a
  10% chance of breaking into gold nuggets instead, Fortune raises that, and
  Fortune III always does it. Whatever the block was holding is gone. Piglins
  also turn on a player they see mining it.
- **Packing needs a crafting table**, because nine bottles fill a 3x3 grid.
  Unpacking fits the 2x2 grid in your inventory.

## Things worth knowing

**It moves raw experience points, not levels.** 7 points is a big part of the
bar at low levels and barely moves it at high ones, but the points are exactly
what you put in.

**Short of XP, you get your bottles back.** Shift-click 64 glass bottles with 35
XP and you get 5 Bottles o' Enchanting, your 59 glass bottles back, and a chat
message saying why.

**Nothing is deleted.** If a partial refund does not fit in your inventory, the
rest drops at your feet.

**Dropping a crafted bottle calls the trade off.** Drop it from the cursor and
the bottle you crafted it from flies out instead: a glass bottle for "Bottle o'
Enchanting (-7 XP)", a Bottle o' Enchanting for "Glass Bottle (+7 XP)". Nobody
is paid or charged, including whoever picks it up. A Crafter can make
placeholders too; any it puts in a chest turn back the same way when the chest
is opened.

**Bundles are the exception.** A placeholder can be clicked into a bundle
straight from the cursor, and the pack does not look inside bundles, so it stays
a placeholder in there. Whoever later takes it out into their inventory gets
the trade on its label. For a "Bottle o' Enchanting (-7 XP)" that is a real
Bottle o' Enchanting for 7 XP, which they can craft straight back into the same
7 XP, so it costs them nothing - but it was not their choice.

**A crafted bottle on the cursor will not join a matching stack.** Until it
lands it is still the placeholder, a different item from the bottles in your
inventory, so clicking it onto a partial stack swaps the two instead of merging
them. Put it in an empty slot, or shift-click the output, and it becomes the
real bottle there; from then on it stacks like any other.

**The bottle trades fit the 2x2 grid in your inventory**, so you do not need a
crafting table for those.

**Throwing a Bottle o' Enchanting is unchanged.** The fixed 7 XP applies only to
the recipes.

**The placeholders are hidden from the Creative inventory.** They still exist
for commands, so `/give @s bottlesofxp:pending_glass_bottle` is a quick way to
test the swap.

## Testing in game

1.0.0 to 1.0.2 were test builds, under the working name XP Bottling.

**Verified in 1.0.1:** the pack loads, the placeholders show the vanilla bottle
icons, and both trades work, including shift-clicked stacks, partial refunds and
charges across many level boundaries, all exact to the point. That build's
`[debug]` chat lines showed the game's own experience numbers matching vanilla's
curve. The same test found that a crafted bottle dropped from the cursor stayed
a placeholder, and charged whoever picked it up.

**Verified in 1.0.2:** both recipes work in the 2x2 inventory grid as well as
at a crafting table; a crafted bottle dropped from the cursor turns back into
the bottle it was crafted from; and placeholders put in a chest have turned
back by the time it opens. 1.0.2 also drops the debug lines.

To repeat the chest check, put placeholders in a chest at `x y z` with
`/replaceitem block x y z slot.container 0 bottlesofxp:pending_experience_bottle 5`
and open it: it should show 5 glass bottles. Stand on the chest to read its
`x y z` from the coordinates display - a chest is less than a block tall, so you
stand inside its block - and for the same reason, `~ ~-1 ~` from on top of a
chest is the block under it, not the chest.

**1.0.3** renamed the add-on, including its item ids. **1.1.0** and **1.1.1**
added gilded blackstone storage behind a world setting, through placeholders; in
1.1.1 the packing placeholder was seen in game drawn as the real block.
**1.1.2** drops the setting: the storage recipes now make the real items
directly, and the script is the one tested in 1.0.2, apart from the rename and a
comment.

**Verified in 1.1.2:** the pack list shows "Bottles of XP" at v1.1.2 with no
gear icon, both bottle trades still work, and nine Bottles o' Enchanting pack
into one gilded blackstone at a crafting table and unpack again, shift-click
included.

**Not yet seen in game:** placeholders in a chest minecart or other entity
container, which turn back through a different event from a chest's; and a
placeholder left on the ground by an earlier build turning back as its chunk
loads.

## Download

Grab the latest `bottles-of-xp-<version>.mcpack` from the
[Releases page](https://github.com/ntrixter/BedrockAddons/releases?q=bottles-of-xp).
Releases in this repository are shared across every add-on, so filter by the
`bottles-of-xp-v` tag prefix.

## Install on a client

1. Download the file.
2. Open it. Minecraft imports the pack automatically.
3. Enable it on the world you want it in, under **Settings → Behaviour Packs**.

## Install on a dedicated server

1. Rename the downloaded file to `.zip` and extract it. A single-pack `.mcpack`
   extracts loose, with `manifest.json` at the top level, so create a
   `bottles-of-xp_BP` folder yourself inside the server's `behavior_packs/`
   directory and put the extracted files in it.
2. Register the pack in the world (below).
3. Restart the server.

Two things that quietly break a server install:

- `level-name` in `server.properties` must match the world's folder name under
  `worlds/` **exactly**, including spaces and letter case. A mismatch is the
  single most common reason a pack appears to be ignored.
- Do not hand-edit `valid_known_packs.json`. Older guides still say to; the
  server maintains that file by scanning the pack directories.

### The one that is specific to a script pack

Scripting has to be allowed for the server at all. Check that
`config/default/permissions.json` lists `@minecraft/server`:

```json
{ "allowed_modules": [ "@minecraft/server", "@minecraft/server-ui", "@minecraft/server-admin" ] }
```

It is there by default on a clean install, but some hosting panels and Docker
images ship it trimmed or missing. When it is absent the script never loads and
**there is no error of any kind**. Here that would leave the recipes working and
the placeholders never swapped, so a stuck "Glass Bottle (+7 XP)" in your
inventory means the script is not running.

The server generates `config/` on its first run, so start the server once before
looking for it.

## Install with the itzg Docker image

`MC_PACK` accepts an archive or directory whose root holds `behavior_packs/`
and `resource_packs/`. The download uses neither shape, because the client
import path decided the layout, so wrap it once:

```sh
mkdir -p packs/behavior_packs/bottles-of-xp_BP
unzip -q bottles-of-xp-<version>.mcpack -d packs/behavior_packs/bottles-of-xp_BP
```

Mount `packs/` into the container and point `MC_PACK` at its in-container path.
The image installs the pack folder but does not register it, so the step below
still applies.

## Register the pack in the world

This file lives in `worlds/<world name>/`. If it already exists, **merge** this
entry into the existing array rather than overwriting the file - replacing it
disables every other pack on that world.

`world_behavior_packs.json`

```json
[
  {
    "pack_id": "82230254-ab17-4cdf-b948-0f433c032018",
    "version": [1, 1, 2]
  }
]
```

That is the **header** UUID from the manifest; the module UUIDs will not work.
Every release's notes carry this same block with the version already filled in.

> **If the pack does not load on a server, try the string form.** This manifest
> is `format_version` 3, where versions are SemVer strings, and it is not yet
> settled whether `world_behavior_packs.json` must match that form - see the
> UNVERIFIED note in [BEDROCK-NOTES.md](../BEDROCK-NOTES.md). If the array above
> is rejected, use `"version": "1.1.2"` instead. The two files have to agree.

## Updating or removing this add-on

Applying a behaviour pack **copies it into the world**, at
`<world>/behavior_packs/<pack folder>/`, independent of the global pack library.
That has three consequences that all present as confusing bugs:

- A world keeps running its embedded copy, so importing a newer `.mcpack` does
  **not** update a world that already has an older one.
- Minecraft's **Settings → Storage → Behaviour Packs** manages only the global
  library, so a world-local leftover cannot be removed there at all. It still
  appears under **Edit World → Behaviour Packs**.
- `<world>/world_behavior_pack_history.json` lists every pack ever applied.
  Delete the folder without clearing that entry and you get a ghost row reading
  "This pack is missing!".

To update a world you already play, turn the pack off under Edit World and on
again, then check the version in the pack list. If the old version persists,
remove the world's own copy - all three of:

1. delete `<world>/behavior_packs/<pack folder>/`
2. remove the entry from `<world>/world_behavior_pack_history.json`
3. remove the entry from `<world>/world_behavior_pack_settings.json`

On a dedicated server, replace the folder under `behavior_packs/` and restart.

**Before removing it, make sure nobody is holding a placeholder.** Without the
pack, a placeholder is an unknown item and is lost. Normally none exist for
more than an instant, so this only matters if one was put in a bundle or the
script was not running.

## Tests

The script's arithmetic and bookkeeping are tested without Minecraft, against a
mock of `@minecraft/server`:

```sh
cd bottles-of-xp/tests && node --import ./register.js run.js
```

Where the game's behaviour is not established - whether taking XP can cross a
level boundary, what `addLevels` does to progress, what the bar size means, and
whether `getTotalXp()` can be relied on - every case runs under every
combination, and the pack must give the same answer under all of them. The first
build passed a suite that modelled the game one way only, then refunded every
glass bottle in game. Placeholders that never reach an inventory get the same
treatment: whether a removed item is gone at once, whether a loading chunk
reports an item twice, what cause a dropped item is reported with, and whether a
thrown item's flight can be copied. A further set checks that when the game
misbehaves outright, nothing is given away and nothing is lost. It cannot cover
what only the game knows - see "Testing in game" above.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Licence

MIT, same as the rest of this repository. See [LICENSE](../LICENSE).
