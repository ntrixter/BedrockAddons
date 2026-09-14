# Creeper Drop All

A creeper takes a bite out of your base and most of it is simply gone — Bedrock
destroys the blocks but only drops a fraction of them. Java fixed this in 1.19.3
with the `mobExplosionDropDecay` game rule. **Bedrock never got it**, and still
has no equivalent, so the only way to get those blocks back is a script. This
add-on hands back every block a mob explosion destroys, and can optionally make
storage survive the blast entirely.

- **Add-on ID:** `creeper-drop-all` (kebab-case; also the tag prefix, the issue
  label and the artifact filename)
- **Minimum Minecraft version:** 1.26.30 (`min_engine_version` in the manifest)
- **Packs:** behaviour pack only
- **Overrides no vanilla files.** It is a pure script pack, so it does not pin
  any vanilla entity or loot table and never needs re-syncing against
  `bedrock-samples`.

## What it covers

Bedrock's `tntExplosionDropDecay` game rule already defaults to `false`, so
**TNT drops everything without any help**. Mob explosions are the ones that lose
blocks, and they are what this add-on is for.

| Source | Default | Why |
| --- | --- | --- |
| Creepers (charged included) | on | The common case, and the one with no vanilla lever |
| Ghast fireballs | on | Same gap |
| Wither skulls (both kinds) | on | Same gap |
| End crystals | on | Same gap |
| TNT and TNT minecarts | **off** | Already 100% in vanilla; the toggle exists only for completeness |

Drops come from the **real loot tables**, so stone gives cobblestone, coal ore
gives coal, and a chest gives its contents — not the blocks' own items.

## Download

Grab the latest `creeper-drop-all-<version>.mcpack` from the
[Releases page](https://github.com/ntrixter/BedrockAddons/releases?q=creeper-drop-all).
Releases in this repository are shared across every add-on, so filter by the
`creeper-drop-all-v` tag prefix.

## Install on a client

1. Download the file.
2. Open it. Minecraft imports the pack automatically.
3. Enable it on the world you want it in, under its settings.

## Install on a dedicated server

1. Rename the downloaded file to `.zip` and extract it. A single-pack `.mcpack`
   extracts loose, with `manifest.json` at the top level, so create a
   `creeper-drop-all_BP` folder yourself inside the server's `behavior_packs/`
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
mkdir -p packs/behavior_packs/creeper-drop-all_BP
unzip -q creeper-drop-all-<version>.mcpack -d packs/behavior_packs/creeper-drop-all_BP
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
    "pack_id": "c60c1a0f-5864-4695-a2b5-07999da64790",
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

## Settings

Everything is configurable from the **gear icon** beside Creeper Drop All in the
world's Behaviour Packs list. No experimental toggle is needed, and achievements
stay enabled.

| Control | Default | What it does |
| --- | --- | --- |
| Creepers / Ghast fireballs / Wither skulls / End crystals | on | Which explosions hand their blocks back |
| TNT | off | Redundant in vanilla; see above |
| Protect containers from explosions | off | Chests, barrels, shulker boxes, furnaces, hoppers, droppers, dispensers, brewing stands and ender chests survive the blast untouched, contents and all. The crater still forms around them |
| Merge drops within (blocks) | 4 | Groups nearby drops into fewer item entities. `1` spawns a pile at every block — most faithful, hardest on the game |
| Max blocks per explosion | 4096 | Safety limit. A bigger explosion is handed back to Minecraft untouched rather than half-processed |

Settings are per world, editable by the world or server owner, and read when the
world loads — **a change applies on the next load**.

### On a dedicated server

There is no gear icon on a server. Write the values into
`worlds/<world name>/world_behavior_pack_settings.json`, beside
`world_behavior_packs.json`:

```json
{
  "format_version": "1.21.100",
  "minecraft:pack_settings": {
    "settings": [
      {
        "pack_id": "c60c1a0f-5864-4695-a2b5-07999da64790",
        "values": { "creeperdropall:protect_containers": true }
      }
    ]
  }
}
```

List only the values you are changing; anything absent falls back to the
`default` in the pack's manifest. The game writes this file itself the first time
a setting is changed, so on a server you may have to create it. Prefer it over
editing the manifest defaults — this file belongs to the world and survives a
pack update, the manifest does not.

## How it works

Bedrock's `beforeEvents.explosion` runs in **restricted execution**, where
nothing that changes world state may be called, and the `Block` objects it hands
you are *location references* rather than snapshots — once the explosion
resolves they read as air. The work is therefore split across three contexts:

1. **In the event (restricted).** Read each impacted block's position,
   permutation and container contents, then call `setImpactedBlocks([])` so
   vanilla destroys nothing and drops nothing.
2. **`system.run`, same tick.** Remove every block at once, so the crater
   appears with the bang rather than dissolving.
3. **`system.runJob`, over the following ticks.** Generate loot-table drops,
   merge them into full stacks and spawn them. This is the expensive half, kept
   away from the engine's own explosion tick so the script watchdog stays clear.

Items spawn after the blast resolves, so the explosion cannot destroy its own
drops.

## Known limitations

- **No XP orbs.** Block loot tables carry no experience, and script-spawned XP
  orbs have no settable value, so ore drops arrive without the XP mining would
  give. Omitting it is more accurate than faking it.
- **Sign text and banner patterns are lost**, exactly as in a vanilla explosion.
- **`mobGriefing false` disables everything.** With that rule off, mob
  explosions destroy no blocks at all, so there is nothing to hand back. The
  pack detects this and stays out of the way entirely.
- **Conflicts with other explosion add-ons.** If another pack also hooks
  `beforeEvents.explosion` and edits the impacted-block list, the result depends
  on which handler runs first, and Bedrock does not define that order.
- **Not an anti-grief pack on its own.** Blocks are still destroyed; you just
  get all of them back. Turn on *Protect containers* if you want storage itself
  to survive.

## Tests

There is no automated suite. [TESTING.md](TESTING.md) is the manual matrix, with
an in-game rig (the gamerules and effects that stop a test producing a false
result) and a record of what has actually been verified.

Verified in game so far: the settings screen, that suppressing block destruction
still leaves explosion damage intact, creeper drops, and that a double chest
drops its contents once rather than twice. The rest of the matrix is unrun.

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
again, then check the version. If the old version persists, remove the world's
own copy — all three of:

1. delete `<world>/behavior_packs/<pack folder>/`
2. remove the entry from `<world>/world_behavior_pack_history.json`
3. remove the entry from `<world>/world_behavior_pack_settings.json`

On a dedicated server, replace the folder under `behavior_packs/` and restart.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Licence

MIT, same as the rest of the repository. See [LICENSE](../LICENSE).
