# Compass Link

Linking a Nether portal to the right place means doing a sum by hand: divide
your coordinates by 8 going into the Nether, multiply by 8 coming back. Get it
wrong and the portal drops you somewhere you did not mean to be. Compass Link
does the sum for you. Hold a compass and the line above your hotbar shows where
you are standing in the *other* dimension.

- **Add-on ID:** `compass-link` (kebab-case; also the tag prefix, the issue
  label and the artifact filename)
- **Minimum Minecraft version:** 1.26.40 (`min_engine_version` in the manifest)
- **Packs:** behaviour pack only
- **Author:** ntrixter
- **No experiments, no resource pack and no settings.** It is a small script
  pack and nothing else.

## How it works

Four times a second the pack looks at every player. If the item in the selected
hotbar slot is a compass, it writes a line on the action bar, the text that
appears just above the hotbar.

| You are in | The action bar shows | The sum |
| --- | --- | --- |
| The Overworld | `Nether: 100, 64, -200` | x and z divided by 8 |
| The Nether | `Overworld: 800, 64, -1600` | x and z multiplied by 8 |
| The End, or a custom dimension | nothing | there is no equivalent |

Standing at 800, 64, -1600 in the Overworld, the readout says 100, 64, -200:
that is where the matching Nether portal belongs. Your height is passed through
unchanged, because the 8-to-1 scale applies to x and z only. Every number is
rounded down to a whole block.

Put the compass away and the line disappears.

## Things worth knowing

**Only the plain compass counts, and only while it is the selected hotbar
item.** A lodestone compass or a recovery compass does nothing, and neither does
a compass in your offhand or further along your inventory. That is deliberate
for now.

**It does not change the compass.** A compass still points at the world spawn.
This pack adds a readout and nothing more.

**The numbers are where *you* are, not where a portal is.** Use them to decide
where the other portal should go. The game does the linking.

**The action bar is shared.** While you hold a compass this pack rewrites it
four times a second, which replaces whatever another add-on put there. When you
put the compass away it clears the line once.

**Nothing is configurable.**

## Download

Grab the latest `compass-link-<version>.mcpack` from the
[Releases page](https://github.com/ntrixter/BedrockAddons/releases?q=compass-link).
Releases in this repository are shared across every add-on, so filter by the
`compass-link-v` tag prefix.

## Install on a client

1. Download the file.
2. Open it. Minecraft imports the pack automatically.
3. Enable it on the world you want it in, under **Settings → Behaviour Packs**.

## Install on a dedicated server

1. Rename the downloaded file to `.zip` and extract it. A single-pack `.mcpack`
   extracts loose, with `manifest.json` at the top level, so create a
   `compass-link_BP` folder yourself inside the server's `behavior_packs/`
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
mkdir -p packs/behavior_packs/compass-link_BP
unzip -q compass-link-<version>.mcpack -d packs/behavior_packs/compass-link_BP
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
    "pack_id": "a5e66d13-59ba-4e3f-b26d-bac8ccaac290",
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

Removing the pack removes the readout and nothing else. It stores nothing in the
world, so there is nothing left behind.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Licence

MIT, same as the rest of this repository. See [LICENSE](../LICENSE).
