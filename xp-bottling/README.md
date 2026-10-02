# XP Bottling

Trade Bottles o' Enchanting for experience at a crafting table, and back again,
at a fixed **7 XP a bottle**. Put a Bottle o' Enchanting in the crafting grid and
take out a glass bottle and 7 XP. Put a glass bottle in, and if you have 7 XP to
spare, take out a Bottle o' Enchanting. It is a way to keep experience safely in
a chest and get exactly that much back later.

- **Add-on ID:** `xp-bottling` (kebab-case; also the tag prefix, the issue label
  and the artifact filename)
- **Minimum Minecraft version:** 1.26.30 (`min_engine_version` in the manifest)
- **Packs:** behaviour pack only
- **Author:** ntrixter
- **No experiments and no resource pack.** Two recipes, two placeholder items
  and one script.

## How it works

| Put in the grid | The output shows | When it reaches your inventory |
| --- | --- | --- |
| 1 Bottle o' Enchanting | Glass Bottle (+7 XP) | a glass bottle, and 7 XP added |
| 1 glass bottle | Bottle o' Enchanting (-7 XP) | a Bottle o' Enchanting, and 7 XP taken - or your glass bottle back if you have less than 7 XP |

Shift-click the output to convert a whole stack at once.

**Why the output is a placeholder.** A crafting recipe can turn one item into
another, but it cannot add or take experience, and the game has no stable
"player crafted something" event a script could use instead. So each recipe
makes a placeholder that looks like the bottle you are getting - it borrows the
game's own bottle icons - and the pack's script swaps it for the real bottle and
moves the XP the moment it lands in your inventory. The placeholder is the
receipt: crafting makes it from a real bottle and the swap consumes it, so
nothing can be paid twice or paid for nothing.

**How it reads and takes XP.** The pack works your total out from your level
and progress, checked against the game's own bar size, rather than asking the
game for the total: in the first in-game test that call reported less than the
player had, and every glass bottle came straight back. It also never subtracts
across a level boundary, which the game is reported not to do correctly; it
empties the current bar, drops whole levels, then adds the remainder back. After
every charge it checks the result, and if the game did not land exactly 7 XP per
bottle lower, it puts the XP back and returns your glass bottles.

## Things worth knowing

**It moves raw experience points, not levels.** 7 points is a big part of the
bar at low levels and barely moves it at high ones, but the points are exactly
what you put in.

**Short of XP, you get your bottles back.** Shift-click 64 glass bottles with 35
XP and you get 5 Bottles o' Enchanting, your 59 glass bottles back, and a chat
message saying why.

**Nothing is deleted.** If a partial refund does not fit in your inventory, the
rest drops at your feet.

**The swap happens when the placeholder reaches an inventory, not on the click.**
Drop one from the cursor onto the ground and whoever picks it up gets the
conversion - including the 7 XP cost of a "Bottle o' Enchanting (-7 XP)". A
Crafter block can make placeholders too, with the same result.

**One-item recipes fit the 2x2 grid in your inventory**, so a crafting table
should not be needed.

**Throwing a Bottle o' Enchanting is unchanged.** The fixed 7 XP applies only to
the recipes.

**The placeholders are hidden from the Creative inventory.** They still exist
for commands, so `/give @s xpbottling:pending_glass_bottle` is a quick way to
test the swap.

## Testing in game

1.0.0, the first test build, emptied bottles correctly but refunded every glass
bottle. This build carries the fix and has not been run in Minecraft yet.

**It also prints `[debug]` chat lines** whenever XP moves: the numbers the game
itself reports for your level, progress and total. If anything below goes
wrong, those lines show exactly what the game returned. They come out before
release.

These are the things only the game can confirm:

1. The pack loads with no content errors, and the two placeholders show the
   vanilla glass-bottle and Bottle o' Enchanting icons, with their names.
2. Crafting a Bottle o' Enchanting gives a glass bottle and exactly 7 XP.
3. Crafting a glass bottle with 7 or more XP gives a Bottle o' Enchanting and
   takes 7 XP. With 0-6 XP, the glass bottle comes back with a message.
4. Shift-clicking a stack converts all of it, and a partial refund (e.g. 64
   glass bottles with 35 XP) gives 5 + 59.
5. Taking XP across a level boundary lowers the level properly.
6. Both recipes work in the 2x2 inventory grid as well as a crafting table.
7. A placeholder never stays in your inventory.

## Download

Grab the latest `xp-bottling-<version>.mcpack` from the
[Releases page](https://github.com/ntrixter/BedrockAddons/releases?q=xp-bottling).
Releases in this repository are shared across every add-on, so filter by the
`xp-bottling-v` tag prefix.

## Install on a client

1. Download the file.
2. Open it. Minecraft imports the pack automatically.
3. Enable it on the world you want it in, under **Settings → Behaviour Packs**.

## Install on a dedicated server

1. Rename the downloaded file to `.zip` and extract it. A single-pack `.mcpack`
   extracts loose, with `manifest.json` at the top level, so create a
   `xp-bottling_BP` folder yourself inside the server's `behavior_packs/`
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
mkdir -p packs/behavior_packs/xp-bottling_BP
unzip -q xp-bottling-<version>.mcpack -d packs/behavior_packs/xp-bottling_BP
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
    "version": [1, 0, 1]
  }
]
```

That is the **header** UUID from the manifest; the module UUIDs will not work.
Every release's notes carry this same block with the version already filled in.

> **If the pack does not load on a server, try the string form.** This manifest
> is `format_version` 3, where versions are SemVer strings, and it is not yet
> settled whether `world_behavior_packs.json` must match that form - see the
> UNVERIFIED note in [BEDROCK-NOTES.md](../BEDROCK-NOTES.md). If the array above
> is rejected, use `"version": "1.0.1"` instead. The two files have to agree.

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
more than an instant, so this only matters if the script was not running.

## Tests

The script's arithmetic and bookkeeping are tested without Minecraft, against a
mock of `@minecraft/server`:

```sh
cd xp-bottling/tests && node --import ./register.js run.js
```

Where the game's behaviour is not established - what `getTotalXp()` returns,
whether taking XP can cross a level boundary, what `addLevels` does to progress,
and what the bar size means - every case runs under every combination, and the
pack must give the same answer under all of them. The first build trusted one
guess, and so did this suite, which is how a broken build passed. A further set
checks that when the game misbehaves outright, nothing is given away and nothing
is lost. It cannot cover what only the game knows - see "Testing in game"
above.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Licence

MIT, same as the rest of this repository. See [LICENSE](../LICENSE).
