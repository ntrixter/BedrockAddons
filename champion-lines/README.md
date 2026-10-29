# Champion Lines

In vanilla, a foal's stats are a blend of its parents' with randomness mixed
in, so breeding two good horses tends to give you a worse one. Champion Lines
breeds the way ARK does instead. Each of a foal's three stats (health, speed
and jump) is rolled on its own: there is a **60% chance it copies the better
parent's value and a 40% chance it copies the worse one**. The foal never lands
between or below its parents, so a good bloodline holds its ground and the best
values can be stacked into one horse over a few generations.

- **Add-on ID:** `champion-lines` (kebab-case; also the tag prefix, the issue
  label and the artifact filename)
- **Minimum Minecraft version:** 1.26.60 (`min_engine_version` in the manifest)
- **Packs:** behaviour pack only
- **Author:** ntrixter
- **No experiments and no cheats needed.** Everything runs from the pack's
  script, so it works on a survival world with cheats off and keeps
  achievements.
- **Overrides the vanilla horse** (`entities/horse.json`). Another add-on that
  also replaces the horse will conflict with this one; whichever is higher in
  the pack list wins.

## What you get

### Breeding

Feed two tamed adult horses golden carrots or golden apples, as usual. When
the foal is born, the pack finds the two horses that were fed and rolls each
stat separately:

| Parents | Foal |
| --- | --- |
| Health 22 and 30 | 30 (60%) or 22 (40%) |
| Speed 9.1 and 12.8 blocks/s | 12.8 (60%) or 9.1 (40%) |
| Jump 2.4 and 4.1 blocks | 4.1 (60%) or 2.4 (40%) |

The chance is a setting (50 to 100%). Donkeys and mules are not affected.

The foal's coat and markings are picked the way Java Edition does it: each
comes from one parent or the other (4 in 9 each), or is random (1 in 9).
Bedrock picks a foal's look too but keeps it where a script cannot read it, so
the pack makes the choice itself and records it.

Each foal has a **generation**: one more than its older parent's. Wild horses,
and horses from before the pack, are generation 0, so a foal of two wild
horses is generation 1.

### Look at a horse

The line above your hotbar shows the horse you are pointing at, within 8
blocks:

`Spirit · Health 28 · Speed 12.4 · Jump 3.9`

Speed is in blocks per second and jump is in blocks, both approximate. Each
stat is coloured by where it sits in the wild range: red bottom 30%, yellow,
green from 60%, and aqua for the top 10%. With the parents setting on, a second
line reads `Parents: Ace & Raven Pepper #112`. A parent named after the foal was born
shows its new name while it is loaded.

### Learning a horse's stats

By default you have to find out what a horse is like. An untamed horse shows
only its name. Once tamed, its health and speed show after it has been ridden,
and its jump shows as the **best jump anyone has made on it**, so a good
jumper is only known once someone tries it at full charge. The book shows the
same. Breeding always uses the horse's true stats, whatever has been seen.

Two settings change this: **Learn stats by riding** off shows the true stats
straight away, and **Show stats of untamed horses** on shows a wild horse's
stats before it is tamed. Bred foals count as tamed.

### Horses without a name tag

Every horse has a name, even without a name tag. The pack makes one from a
word for its coat colour and a word for its markings, so the name says what the
horse looks like:

| Coat | Words | Markings | Words |
| --- | --- | --- | --- |
| White | Swan, Frost, Pearl, Ivory, Snow, Lily | None | Runner, Dancer, Spirit, Wind, Dash, Song |
| Creamy | Honey, Butter, Sand, Biscuit, Maple, Dune | White socks and blaze | Blaze, Socks, Beacon, Flash, Stripe, Boots |
| Chestnut | Copper, Rust, Amber, Ember, Penny, Ginger | White patches | Patch, Cloud, Paint, Quilt, Pinto, Mist |
| Brown | Hazel, Cocoa, Oak, Acorn, Toffee, Bramble | White spots | Freckle, Speck, Spark, Flurry, Dot, Comet |
| Black | Raven, Shadow, Coal, Onyx, Night, Crow | Black spots | Pepper, Dapple, Domino, Ink, Pebble, Spots |
| Gray | Ash, Smoke, Storm, Flint, Slate, Pewter | | |
| Dark brown | Walnut, Mocha, Umber, Cedar, Bark, Truffle | | |

Then comes a **registry number**, unique in the world. A horse is registered
when it is tamed or first written up in a book, whichever comes first, so wild
horses nobody keeps do not use numbers up; until then it goes by its two words
alone. A chestnut with socks and a blaze might be
**Copper Blaze #27**; a black horse with black spots **Raven Pepper #112**. The
words come from the horse's entity id, which is saved with it, and the number
is stored on the horse, so a horse keeps its name for life. A name-tagged
horse still gets a number, shown in its book.

A book title holds at most 16 characters, so a long one keeps the colour word
and the number: **Biscuit #1234**.

### Use a book on a horse

Right-click (or tap) a horse while holding a plain book. The book is replaced
by a signed book of the horse's papers:

- name, colour (written in that colour), markings and registry number
- its generation, the day it was born, who bred it and who tamed it
- health, speed (blocks per second) and jump (blocks)
- for a bred horse, a last **Lineage** page: its parents and their generations

It is titled with the horse's current name and signed by you. A book is a
snapshot: it keeps the name the horse had when it was written. So that an old
book can still be matched to a horse after a rename, a horse with a name tag
also has its first name listed under its name: the generated name it got
when it was born or spawned, as `Birth name: Copper Blaze #27` for a bred horse
or `Wild name: Copper Blaze #27` for one that spawned wild. A horse that
predates the pack counts as wild. Parents are listed the same way, by their
current name with their birth or wild name below if they have been renamed. Holding a book no longer
mounts or feeds a horse. In creative mode the book is not used up.

To bring a book up to date, sneak and right-click the horse while holding its
papers. Only that horse's own papers are rewritten; another horse's book, or
any other signed book, is left alone.

## Things worth knowing

- **Jump has to be measured for horses that were around before the pack.** No
  script can read a horse's jump strength. The pack sets it itself, using the
  same random range as vanilla, the moment a horse spawns or is born. A horse
  that was already in the world shows `Jump ?` until someone rides it and
  jumps. Every jump's height, from take-off to peak, is recorded, and the best
  one is turned back into a jump strength. The line then shows `Jump ~4.9` and
  the rider sees **New best jump**. A partly charged jump only rises less, so
  a few full-charge jumps on flat open ground settle it. Jumps in water, with
  Jump Boost, or off a slime block or bed are ignored. When an old horse
  breeds before it has been measured, a fresh wild roll stands in for its
  jump.
- **Speed lands on a grid of 0.0025.** Each possible value needs its own entry
  in the horse file, so a foal's speed is rounded to the nearest of 91 steps,
  about 0.1 blocks/s apart. Health is whole points (15 to 30) and jump strength
  is hundredths (0.40 to 1.00), which is exactly vanilla's resolution.
- **Parents are the fed horses within 10 blocks of the foal**, fed in the last
  minute. A foal from a spawn egg, or one born where the pack cannot find two
  fed horses, keeps vanilla's stats and lists no parents.
- **Who bred it** is the player who fed the parents. If two players fed one
  each, both are named.

## Settings

Under the gear icon beside the pack in the world's Behaviour Packs list.
Changes take effect the next time the world loads.

| Setting | Default |
| --- | --- |
| Show stats when you look at a horse | on |
| Show parents when you look at a horse | off |
| Learn stats by riding | on |
| Show stats of untamed horses | off |
| Chance to inherit the better parent's stat | 60% |

On a dedicated server there is no gear icon; see "Where pack settings persist"
in [BEDROCK-NOTES.md](../BEDROCK-NOTES.md) for the file to edit. The setting
names are `horsebreed:show_stats`, `horsebreed:show_parents`,
`horsebreed:learn_by_riding`, `horsebreed:wild_stats` and `horsebreed:chance`.

## Tests

```sh
cd champion-lines/tests && node run.js
```

They cover the inheritance roll, the text of the action bar and the book, and
check that the stat grids in the script match the groups in `horse.json`.
Nothing needs installing. Anything that needs the game is in
[TESTING.md](TESTING.md).

## Download

Grab the latest `champion-lines-<version>.mcpack` from the
[Releases page](https://github.com/ntrixter/BedrockAddons/releases?q=champion-lines).
Releases in this repository are shared across every add-on, so filter by the
`champion-lines-v` tag prefix.

## Install on a client

1. Download the file.
2. Open it. Minecraft imports the pack automatically.
3. Enable it on the world you want it in, under **Settings → Behaviour Packs**.

## Install on a dedicated server

1. Rename the downloaded file to `.zip` and extract it. A single-pack `.mcpack`
   extracts loose, with `manifest.json` at the top level. Create a
   `champion-lines_BP` folder yourself inside the server's
   `behavior_packs/` directory and put the extracted files in it.
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
mkdir -p packs/behavior_packs/champion-lines_BP
unzip -q champion-lines-<version>.mcpack -d packs/behavior_packs/champion-lines_BP
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
    "pack_id": "2e779d30-28bb-40d5-a839-d9e661a7b53e",
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

Removing the pack keeps every horse's current stats; they are saved with the
horse. The papers already written stay as they are. Foals bred afterwards go
back to vanilla's blend.

## Re-syncing after a Minecraft update

The monthly `vanilla-drift` workflow reports when Mojang changes `horse.json`.
The pack's additions are generated, so a re-sync is two commands from the
repository root:

```sh
python3 champion-lines/tools/sync_horse.py
python3 scripts/check_vanilla_drift.py champion-lines --print-hash
```

The first fetches the vanilla horse, strips its `//` comments and inserts this
pack's component groups and events at the top of `component_groups` and
`events`. Every vanilla line is left as it was. Put the printed hash into
`upstream_sha256` in `addon.json`, raise `min_engine_version` if the new file's
`format_version` needs it, and run the tests, which check that the groups
still match the script.

If Mojang renames `minecraft:health`, `minecraft:movement` or
`minecraft:horse.jump_strength`, or changes their ranges, update the grids in
both `tools/sync_horse.py` and `behavior_pack/scripts/genes.js`.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Licence

MIT, same as the rest of this repository. See [LICENSE](../LICENSE).
