# Pet Tools

Two small fixes for playing with friends. Look at a tamed pet and the line
above your hotbar says whose it is. And tamed dogs stop biting players, so a
friend caught in a stray hit is not chased down by someone else's dog.

- **Add-on ID:** `pet-tools` (kebab-case; also the tag prefix, the issue label
  and the artifact filename)
- **Minimum Minecraft version:** 1.26.30 (`min_engine_version` in the manifest)
- **Packs:** behaviour pack only
- **Author:** ntrixter
- **No experiments and no resource pack.** Only the stable Script API is used,
  and no vanilla file is overridden.

## Who owns this pet?

Look at a tamed animal within reach:

| Pet | Line |
| --- | --- |
| Your own | `Dog "Rex" · yours` (green) |
| Someone else's | `Cat · owned by Steve` (aqua) |
| Owner never seen online | `Parrot · owner not seen yet` (grey) |

It covers everything the game tames to a player: dogs, cats and parrots, and
horses, donkeys, mules, llamas and camels. A pet's own name, from a name tag,
shows in quotes. Wild animals show nothing.

**Offline owners.** Minecraft hands an add-on the owner as a player only while
that player is online. Otherwise it gives an id with no name. So the pack
writes the name down whenever it sees it: on each pet you look at, and for
every player who is online. A pet whose owner has not been online since the
pack was added says `owner not seen yet` until they next join.

**Only the nearest thing counts.** A cow standing in front of a dog hides the
dog, and blocks stop the line of sight.

**The action bar is shared.** While you look at a pet this pack rewrites it
four times a second, which replaces whatever another add-on put there. When you
look away it clears the line once.

## Tamed dogs can't hurt players

A tamed dog attacks whatever its owner hits, and whoever hits its owner. Between
friends that means one stray sword swing sets a dog on someone. With this
setting on, a tamed dog's bite does **no damage to any player**, its owner's
friends and its owner's enemies alike.

What it does not do:

- **The dog may still chase.** The pack cancels the damage, not the dog's
  decision to attack, so it can keep running at a player and snapping until it
  gives up. Stopping that would mean replacing the vanilla wolf file.
- **Wild wolves are unchanged.** Hit a wild wolf and its pack still bites.
- **Every player is protected, everywhere.** There is no per-dog or per-player
  choice yet.

## Settings

Open the **gear icon** beside Pet Tools in the world's Behaviour Packs list.
No experimental toggle is needed.

| Control | Default | What it does |
| --- | --- | --- |
| Show a pet's owner when you look at it | on | The look-at line |
| Reach (blocks) | 8 | How far away a pet can be, from 3 to 16 |
| Tamed dogs can't hurt players | on | Cancel any tamed dog's bite on a player |

Settings are per world, and the pack reads them when the world loads. **A
change applies on the next load.**

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
        "pack_id": "c44c8588-f966-44ac-a1c1-353fb85a35ae",
        "values": { "pet_tools:protect_players": false }
      }
    ]
  }
}
```

List only the values you are changing. Anything absent falls back to its
default.

## Confirm in-game

The unit tests cover the wording and the decisions. They cannot cover these,
which need a real world and two players:

1. **Owner names.** Player A tames a dog. A sees `yours`; B sees
   `owned by A`.
2. **Offline owner.** A leaves. B looks at the same dog and still sees A's
   name. Then B looks at a pet of A's that nobody has looked at yet, and also
   expects A's name. That second case relies on the game's owner id matching
   the player's own id, which is not documented.
3. **Mounts.** Tame a horse and look at it.
4. **Bites.** A hits B. A's dog goes for B. B should take no damage. Note
   whether B is still knocked back, and how long the dog keeps chasing.
5. **Wild wolves.** Hit a wild wolf and expect normal bites.

Record what you find in [BEDROCK-NOTES.md](../BEDROCK-NOTES.md).

## Tests

```sh
cd pet-tools/tests && node --import ./register.js run.js
```

This loads the shipping scripts against a small mock of `@minecraft/server`.
A Node loader hook redirects that import, so the scripts run unmodified with
no install step. CI does not run it.

## Download

Grab the latest `pet-tools-<version>.mcpack` from the
[Releases page](https://github.com/ntrixter/BedrockAddons/releases?q=pet-tools).
Releases in this repository are shared across every add-on, so filter by the
`pet-tools-v` tag prefix.

## Install on a client

1. Download the file.
2. Open it. Minecraft imports the pack automatically.
3. Enable it on the world you want it in, under **Settings → Behaviour Packs**.

## Install on a dedicated server

1. Rename the downloaded file to `.zip` and extract it. A single-pack `.mcpack`
   extracts loose, with `manifest.json` at the top level. Create a
   `pet-tools_BP` folder yourself inside the server's `behavior_packs/`
   directory and put the extracted files in it.
2. Register the pack in the world (below).
3. Restart the server.

Two things that quietly break a server install:

- `level-name` in `server.properties` must match the world's folder name under
  `worlds/` **exactly**, including spaces and letter case.
- Do not hand-edit `valid_known_packs.json`. The server maintains it.

### The one that is specific to a script pack

Check that `config/default/permissions.json` lists `@minecraft/server`:

```json
{ "allowed_modules": [ "@minecraft/server", "@minecraft/server-ui", "@minecraft/server-admin" ] }
```

When it is absent the script never loads, and **there is no error of any
kind**. The pack appears installed and does nothing.

## Install with the itzg Docker image

`MC_PACK` accepts an archive or directory whose root holds `behavior_packs/`
and `resource_packs/`, so wrap the download once:

```sh
mkdir -p packs/behavior_packs/pet-tools_BP
unzip -q pet-tools-<version>.mcpack -d packs/behavior_packs/pet-tools_BP
```

Mount `packs/` into the container and point `MC_PACK` at its in-container path.
The image does not register the pack, so the step below still applies.

## Register the pack in the world

This file lives in `worlds/<world name>/`. If it already exists, **merge** this
entry into the existing array rather than overwriting the file.

`world_behavior_packs.json`

```json
[
  {
    "pack_id": "c44c8588-f966-44ac-a1c1-353fb85a35ae",
    "version": [1, 0, 0]
  }
]
```

That is the **header** UUID from the manifest. The module UUID will not work.

> **If the pack does not load on a server, try the string form.** This
> manifest is `format_version` 3, and it is not yet settled whether
> `world_behavior_packs.json` must match that form. See
> [BEDROCK-NOTES.md](../BEDROCK-NOTES.md). If the array is rejected, use
> `"version": "1.0.0"`.

## Updating or removing this add-on

Applying a behaviour pack **copies it into the world**, so importing a newer
`.mcpack` does not update a world that already has an older one. To update,
turn the pack off under Edit World and on again, then check the version in the
pack list. If the old version persists, remove the world's own copy. That means
all three of:

1. delete `<world>/behavior_packs/<pack folder>/`
2. remove the entry from `<world>/world_behavior_pack_history.json`
3. remove the entry from `<world>/world_behavior_pack_settings.json`

Removing the pack brings back vanilla dog bites and removes the readout. The
only thing it stores is owner names, kept as add-on data on the world and on
each pet. Without the pack, that data is never read and changes nothing.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Licence

MIT, same as the rest of this repository. See [LICENSE](../LICENSE).
