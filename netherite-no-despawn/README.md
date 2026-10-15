# Netherite No Despawn

A dropped item vanishes after five minutes on the ground. Lose a fight in the
Nether and walk back too slowly, and your netherite gear is gone for good. With
this pack, dropped netherite tools, weapons and armour stay where they fell
until someone picks them up. A setting extends the same protection to any item
you have renamed at an anvil.

- **Add-on ID:** `netherite-no-despawn` (kebab-case; also the tag prefix, the
  issue label and the artifact filename)
- **Minimum Minecraft version:** 1.26.30 (`min_engine_version` in the manifest)
- **Packs:** behaviour pack only
- **Author:** ntrixter
- **No experiments and no resource pack.** Both kinds of protection can be
  switched on or off under the gear icon.

## What is kept

With the default settings, every netherite item that is a tool, a weapon or
armour:

| Kind | Items |
| --- | --- |
| Weapons | sword, spear |
| Tools | pickaxe, axe, shovel, hoe |
| Armour | helmet, chestplate, leggings, boots |
| Mount armour | netherite horse armour, netherite nautilus armour |

Netherite ingots, scrap, blocks and upgrade templates are materials, not gear,
and despawn as usual.

With **Renamed items** on, anything with a custom name is kept too, whatever it
is made of.

## How it works

Minecraft has no setting for how long an item lasts on the ground, and no
script can read or reset the timer. What a script can do is swap a dropped item
for an identical copy, whose timer starts again from zero. This pack does that
for every item it keeps once it has been on the ground for four minutes, a
minute before it would vanish.

The copy is the same stack: enchantments, durability, name and lore all carry
across, in the same place, moving the same way. You will not normally see it
happen.

An item already lying on the ground when the world loads, or in a chunk that
has just loaded, has an age the pack cannot know, so it is swapped straight
away to be safe.

## Settings

Open the **gear icon** beside Netherite No Despawn in the world's Behaviour
Packs list. No experimental toggle is needed.

| Control | Default | What it does |
| --- | --- | --- |
| Netherite tools, weapons and armour | On | Keeps the items in the table above |
| Renamed items | Off | Keeps any item given a name at an anvil |

**Renamed items** is off by default because it covers everything: a renamed
stack of dirt would never go away either.

Settings are per world, and the pack reads them when the world loads. **A
change applies on the next load.** On a dedicated server there is no gear
icon, so write the values into
`worlds/<world name>/world_behavior_pack_settings.json`:

```json
{
  "format_version": "1.21.100",
  "minecraft:pack_settings": {
    "settings": [
      {
        "pack_id": "8a0e40f4-750a-45fc-9975-96382613e356",
        "values": { "netherite_no_despawn:named_items": true }
      }
    ]
  }
}
```

## Things worth knowing

**Kept items still die the usual ways.** The pack stops the five-minute timer
and nothing else. An item that falls into the void or onto a cactus is still
destroyed. Netherite already survives fire and lava; a renamed item that is
not netherite does not.

**Only items on the ground are covered.** Items in a chest, a hopper or a
player's inventory never despawn anyway.

**A kept item can be picked up a moment late.** The fresh copy has the short
pickup delay of any newly dropped item. It happens once every four minutes, so
you are unlikely to notice.

**Many kept items in one place is not free.** Each one is swapped once every
four minutes. A handful is nothing; a renamed-item farm leaving thousands on
the ground would be work for the game.

**Removing the pack lets the timers run again.** Anything still on the ground
despawns five minutes later, as normal.

## Confirm in-game

The unit tests cover which items are kept and when each is due. These need the
real game:

1. A dropped netherite sword is still on the ground after six minutes, while a
   diamond sword dropped beside it at the same time has gone.
2. An enchanted, damaged netherite item keeps its enchantments and durability.
3. With **Renamed items** on, an anvil-named item is still there after six
   minutes; with it off, it despawns.
4. Netherite dropped before saving and quitting is still there six minutes
   after the world is reloaded.

Record what you find in [BEDROCK-NOTES.md](../BEDROCK-NOTES.md).

## Tests

```sh
cd netherite-no-despawn/tests && node run.js
```

This drives `keeper.js` with plain objects; it never imports
`@minecraft/server`, so it needs no mock and no install step. CI does not run
it.

## Download

Grab the latest `netherite-no-despawn-<version>.mcpack` from the
[Releases page](https://github.com/ntrixter/BedrockAddons/releases?q=netherite-no-despawn).
Releases in this repository are shared across every add-on, so filter by the
`netherite-no-despawn-v` tag prefix.

## Install on a client

1. Download the file.
2. Open it. Minecraft imports the pack automatically.
3. Enable it on the world you want it in, under **Settings → Behaviour Packs**.

## Install on a dedicated server

1. Rename the downloaded file to `.zip` and extract it. A single-pack `.mcpack`
   extracts loose, with `manifest.json` at the top level, so create a
   `netherite-no-despawn_BP` folder yourself inside the server's `behavior_packs/`
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
**there is no error of any kind** — the pack appears installed and simply does
nothing. If the pack seems inert on a server, check this first.

The server generates `config/` on its first run, so start the server once before
looking for it.

## Install with the itzg Docker image

`MC_PACK` accepts an archive or directory whose root holds `behavior_packs/`
and `resource_packs/`. The download uses neither shape, because the client
import path decided the layout, so wrap it once:

```sh
mkdir -p packs/behavior_packs/netherite-no-despawn_BP
unzip -q netherite-no-despawn-<version>.mcpack -d packs/behavior_packs/netherite-no-despawn_BP
```

Mount `packs/` into the container and point `MC_PACK` at its in-container path.
The image installs the pack folder but does not register it, so the step below
still applies.

## Register the pack in the world

This file lives in `worlds/<world name>/`. If it already exists, **merge** this
entry into the existing array rather than overwriting the file — replacing it
disables every other pack on that world.

`world_behavior_packs.json`

```json
[
  {
    "pack_id": "8a0e40f4-750a-45fc-9975-96382613e356",
    "version": [1, 0, 0]
  }
]
```

That is the **header** UUID from the manifest; the module UUID will not work.
Every release's notes carry this same block with the version already filled in.

> **If the pack does not load on a server, try the string form.** This manifest
> is `format_version` 3, where versions are SemVer strings, and it is not yet
> settled whether `world_behavior_packs.json` must match that form — see the
> UNVERIFIED note in [BEDROCK-NOTES.md](../BEDROCK-NOTES.md). If the array above
> is rejected, use `"version": "1.0.0"` instead. The two files have to agree.

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
remove the world's own copy — all three of:

1. delete `<world>/behavior_packs/<pack folder>/`
2. remove the entry from `<world>/world_behavior_pack_history.json`
3. remove the entry from `<world>/world_behavior_pack_settings.json`

On a dedicated server, replace the folder under `behavior_packs/` and restart.

It stores nothing in the world, so there is nothing left behind. Kept items
still on the ground despawn five minutes after the pack is gone.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Licence

MIT, same as the rest of this repository. See [LICENSE](../LICENSE).
