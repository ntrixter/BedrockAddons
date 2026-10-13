# Stonecutter Decompression

Plenty of Minecraft blocks are a one-way trip. Craft four quartz into a quartz
block, nine bamboo into a bamboo block or nine ice into packed ice, and there
is no recipe to get the items back. Mining most of them just drops the block
again. Stonecutter Decompression adds that missing reverse: put the block in a
stonecutter and take back exactly what it cost.

- **Add-on ID:** `stonecutter-decompression` (kebab-case; also the tag prefix,
  the issue label and the artifact filename)
- **Minimum Minecraft version:** 1.26.30 (`min_engine_version` in the manifest)
- **Packs:** behaviour pack only
- **Author:** ntrixter
- **Pure JSON.** No scripts, no experiments, no resource pack and no settings,
  and it works on a dedicated server.

## What you get back

Each block returns what it took to craft it. That is the vanilla recipe's
ingredients divided by how many blocks the recipe makes.

| Block | Gives back |
| --- | --- |
| Bamboo Block | 9 Bamboo |
| Prismarine Bricks | 9 Prismarine Shards |
| Dark Prismarine | 8 Prismarine Shards |
| Prismarine | 4 Prismarine Shards |
| Melon | 9 Melon Slices |
| Packed Ice | 9 Ice |
| Blue Ice | 9 Packed Ice |
| Honeycomb Block | 4 Honeycomb |
| Block of Quartz | 4 Nether Quartz |
| Sandstone | 4 Sand |
| Red Sandstone | 4 Red Sand |
| White Wool | 4 String |
| Bricks | 4 Brick |
| Nether Bricks | 4 Nether Brick |
| Resin Bricks | 4 Resin Brick |
| Glowstone | 4 Glowstone Dust |
| Clay | 4 Clay Ball |
| Snow Block | 4 Snowball |

**Dark prismarine keeps its dye.** It is crafted from 8 prismarine shards and
a black dye; you get the 8 shards back and the dye is used up.

Only the plain blocks count. Chiseled, cut, smooth and pillar variants, and
wool in other colours, have no recipe here.

## What is left out, and why

- **Nether Wart Block, Amethyst Block and Dripstone Block.** All three
  generate naturally in bulk: crimson forests, geodes and dripstone caves.
  Decompressing them would turn those places into farms for nether wart,
  amethyst shards and pointed dripstone.
- **Purpur Block.** Vanilla crafts 4 popped chorus fruit into 4 purpur blocks,
  so a block is worth a single fruit.
- **Magma Block**, for the same reason with magma cream.
- **Block of Resin**, because vanilla already turns it back into 9 resin clumps
  in a crafting grid.

## How it works

Every recipe is a shapeless recipe whose only tag is `stonecutter`. That puts it
in the stonecutter and nowhere else: it never shows up in the inventory grid or
a crafting table. Each identifier is namespaced `uncraft:`, so it can never
collide with a vanilla recipe.

## Test kit

With cheats on, this gives you a stonecutter and one of every block the pack
handles:

```
/function stonecutter_decompression/test_kit
```

It does nothing without cheats or operator rights.

## Changing the recipes

The 18 recipe files and the test kit are generated from one table:

```sh
python3 stonecutter-decompression/tools/gen_recipes.py           # rewrite them all
python3 stonecutter-decompression/tools/gen_recipes.py --check   # verify, write nothing
```

Add `--vanilla <path to a bedrock-samples checkout>` to `--check` and it also
confirms that every item exists in Mojang's item list, and that every count
matches the shipped crafting recipe. Do that whenever the table changes. Edit the table in `tools/gen_recipes.py`, never
the generated files.

## Confirm in-game

1. Bamboo Block appears in the stonecutter and gives 9 bamboo.
2. It does **not** appear in the inventory grid or a crafting table.
3. Dark Prismarine gives 8 prismarine shards, Blue Ice gives 9 packed ice, and Nether
   Bricks give 4 nether brick items.

Record what you find in [BEDROCK-NOTES.md](../BEDROCK-NOTES.md).

## Download

Grab the latest `stonecutter-decompression-<version>.mcpack` from the
[Releases page](https://github.com/ntrixter/BedrockAddons/releases?q=stonecutter-decompression).
Releases in this repository are shared across every add-on, so filter by the
`stonecutter-decompression-v` tag prefix.

## Install on a client

1. Download the file.
2. Open it. Minecraft imports the pack automatically.
3. Enable it on the world you want it in, under **Settings → Behaviour Packs**.

## Install on a dedicated server

This is a single-pack `.mcpack`, so it extracts **loose**: `manifest.json`
ends up at the top level rather than inside a folder.

1. Rename the downloaded file to `.zip` and extract it.
2. Create a folder named `stonecutter-decompression_BP` inside the server's
   `behavior_packs/` directory, and put the extracted files (including
   `manifest.json`, `recipes/` and `functions/`) directly inside it.
3. Register the pack in the world (below).
4. Restart the server.

Two things that quietly break a server install:

- `level-name` in `server.properties` must match the world's folder name under
  `worlds/` **exactly**, including spaces and letter case. A mismatch is the
  single most common reason a pack appears to be ignored.
- Do not hand-edit `valid_known_packs.json`. Older guides still say to; the
  server maintains that file by scanning the pack directories.

## Install with the itzg Docker image

`MC_PACK` accepts an archive or directory whose root holds `behavior_packs/`
and `resource_packs/`, or a Marketplace-flavour archive using `data/` and
`resources/`. This download uses neither shape, because the client import path
decided the layout, so wrap it once:

```sh
mkdir -p packs/behavior_packs
unzip -q stonecutter-decompression-<version>.mcpack -d extracted/stonecutter-decompression_BP
mv extracted/stonecutter-decompression_BP packs/behavior_packs/
```

Mount `packs/` into the container and point `MC_PACK` at its in-container path.
The image installs the pack folder but does not register it, so the step below
still applies.

## Register the pack in the world

This file lives in `worlds/<world name>/`. If it already exists, **merge** the
entry into the existing array rather than overwriting the file.

`world_behavior_packs.json`

```json
[
  {
    "pack_id": "c7e4e6af-0b2e-488d-aebc-d1eb72f5224f",
    "version": [1, 0, 0]
  }
]
```

That is the **header** UUID from the manifest; the module UUID will not work.
Every release's notes carry this same block with the version already filled in.

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
remove the world's own copy. That means all three of:

1. delete `<world>/behavior_packs/<pack folder>/`
2. remove the entry from `<world>/world_behavior_pack_history.json`
3. remove the entry from `<world>/world_behavior_pack_settings.json`

On a dedicated server, replace the folder under `behavior_packs/` and restart.

Removing the pack removes the 18 recipes and nothing else. Nothing is stored in
the world, so there is nothing left behind.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Licence

MIT, same as the rest of this repository. See [LICENSE](../LICENSE).
