# Salvage Smelting

Put a worn-out or unwanted item in a furnace and get half of what it cost to
craft back.

Vanilla already melts down iron, gold and copper gear, but it hands back a
single **nugget** — one ninth of an ingot for a chestplate that cost eight. That
is a disposal chute, not a salvage system, and it means the sensible thing to do
with old gear is throw it in a hole. This add-on rewrites those recipes to pay
out properly, and extends the same idea to diamond, netherite, leather,
chainmail, string-strung gear, and the everyday iron and gold goods that vanilla
will not melt at all.

It also does one thing that is not salvage: a block of raw iron, gold or copper
smelts straight into the matching ingot block, instead of nine separate smelts.

- **Add-on ID:** `salvage-smelting`
- **Minimum Minecraft version:** 1.26.30 (Bedrock 26.30)
- **Packs:** behaviour pack only
- **Author:** ntrixter

Data only — no scripts, no experiments, no resource pack. It is 78 furnace
recipes and a manifest.

## The rule

> An item returns **half of what it costs to craft, rounded up**.

An iron sword costs 2 ingots and returns 1. A chestplate costs 8 and returns 4.
A pickaxe costs 3 and returns 2, because the half is rounded up rather than
down.

**Durability makes no difference.** A chestplate one hit from breaking returns
the same 4 ingots as a fresh one. This is not a design choice — a Bedrock
furnace recipe matches on item type and cannot see an item's damage value, so
there is no way to scale the output by wear.

Two things sit outside the rule, both deliberately:

- **Items crafted in batches pay in nuggets.** A rail costs 6 iron for 16 rails
  — 0.375 of an ingot each — so rounding half of that up to a whole ingot would
  return nearly three times what it cost, and rails would become an iron
  duplicator. Powered rails cost exactly 1 ingot each, where a whole ingot back
  is a 100% refund. Those five are paid in nuggets instead, which keeps the same
  half-the-cost rule without the loop.
- **Items with no crafting recipe are set by hand**, because there is no cost to
  halve. That is chainmail, saddles, and the string-strung gear below.
- **Raw ore blocks are not salvage**, so they do not go through the rule at all.
  See below.

## What you get back

### Gear

Every tool, weapon and armour piece in iron, gold, diamond, copper, leather and
netherite. Copper includes the spear.

| Piece | Crafting cost | Returns |
| --- | --- | --- |
| Sword | 2 | **1** |
| Shovel | 1 | **1** |
| Hoe | 2 | **1** |
| Pickaxe | 3 | **2** |
| Axe | 3 | **2** |
| Boots | 4 | **2** |
| Helmet | 5 | **3** |
| Leggings | 7 | **4** |
| Chestplate | 8 | **4** |

Iron returns iron ingots, gold returns gold ingots, diamond returns diamonds,
copper returns copper ingots, leather armour returns leather. The copper spear
costs 1 ingot and returns 1.

**Netherite is different.** A netherite item is a smithing upgrade, not a craft:
one netherite ingot applied to a finished diamond item. Half of one, rounded up,
is one — so every netherite piece returns **1 netherite ingot** and the diamond
base is lost. Salvaging netherite gear is a way to move an ingot between pieces,
not a way to recover diamonds.

### Fixed returns

| Input | Returns | Why |
| --- | --- | --- |
| Cauldron | 4 iron ingots | costs 7 |
| Blast furnace, hopper | 3 iron ingots | cost 5 |
| Bucket, compass, iron trapdoor | 2 iron ingots | cost 3, 4, 4 |
| Shears, heavy weighted pressure plate | 1 iron ingot | cost 2 |
| Iron door | 1 iron ingot | 6 ingots makes 3 doors, so 2 each |
| Iron chain | 1 iron ingot | costs 1 ingot and 2 nuggets |
| Chainmail helmet, chestplate, leggings, boots | 1 iron ingot each | not craftable, so fixed |
| Clock | 2 gold ingots | costs 4 |
| Light weighted pressure plate | 1 gold ingot | costs 2 |
| Saddle | 2 leather | not craftable in Bedrock; 3 leather is the usual figure |
| Bow, crossbow, fishing rod | 2 string each | the string is the part worth recovering |

### Batch-crafted, paid in nuggets

| Input | Crafting cost each | Returns |
| --- | --- | --- |
| Rail, iron bars | 0.375 iron ingots (3.4 nuggets) | **2 iron nuggets** |
| Activator rail, detector rail | 1 iron ingot (9 nuggets) | **5 iron nuggets** |
| Powered rail | 1 gold ingot (9 nuggets) | **5 gold nuggets** |

### Bulk smelting raw ore blocks

| Input | Returns |
| --- | --- |
| Block of raw iron | **1 block of iron** |
| Block of raw gold | **1 block of gold** |
| Block of raw copper | **1 block of copper** |

This one is convenience, not salvage, and it takes nothing away and gives
nothing extra. A block of raw iron is nine raw iron; nine raw iron smelt into
nine ingots; nine ingots is a block of iron. The metal is identical either way.

What it saves is the tedium: one smelt instead of nine, so eight fewer fuel and
about eighty fewer seconds per block. In a blast furnace it is roughly five
seconds for what used to be forty-five.

There is no raw diamond or raw netherite block to add — diamonds drop as items
and netherite comes from scrap.

## Things worth knowing

**It replaces 32 vanilla recipes and adds 46 new ones.** Every iron, gold and
copper gear recipe, and all four chainmail recipes, already exist in vanilla and
return a nugget. A behaviour pack file at the same path replaces the vanilla one
outright, so those 32 are rewrites rather than additions — there is no ambiguity
about which recipe wins and no `priority` juggling. The other 46, the raw ore
blocks among them, are inputs vanilla will not smelt at all.

**Fuel behaviour is unchanged.** One item per fuel unit, exactly as vanilla. A
furnace's burn rate is not something a recipe can alter — which is precisely why
smelting a raw ore block in one go saves the fuel that nine separate smelts
would have burned.

**Works in a blast furnace too**, which is twice as fast. Every recipe carries
both the `furnace` and `blast_furnace` tags, including the leather and string
ones — a blast furnace melting a saddle is a little odd, but a consistent set of
recipes is worth more than the flavour.

**No horse armour.** Horse armour has no crafting recipe, it is loot-only, and
melting a chest-loot item down into free diamonds is a different kind of change
from recovering what you spent. It was in earlier versions of this pack under
three item ids that never existed, so it has never actually worked.

**Recipes appear in the furnace recipe book.** Each one carries the same
`unlock` block vanilla uses, so a recipe shows up once you are holding the item
it consumes.

**Nothing is configurable.** The settings panel on the pack is five lines of
text summarising what it does; there are no toggles. Changing the numbers means
editing the pack.

## Changing the numbers

The recipes are generated, not hand-written:

```sh
python3 salvage-smelting/tools/gen_recipes.py          # rewrite them all
python3 salvage-smelting/tools/gen_recipes.py --check  # verify, write nothing
```

The cost tables at the top of that script **are** the rule. Editing one number
there and rerunning is the whole workflow; editing 78 near-identical JSON files
by hand is how the pack previously ended up with five item ids that do not exist
and a rule applied inconsistently.

Every item id in those tables was checked against Mojang's own palette
(`metadata/vanilladata_modules/mojang-items.json` and `mojang-blocks.json` in
`bedrock-samples`) at 1.26.30, 1.26.40 and 1.26.50, and every crafting cost
against the shipped recipe in `bedrock-samples/behavior_pack/recipes/`. Ids move
between versions without notice — `minecraft:chain` became
`minecraft:iron_chain` when copper chains arrived, and a recipe pointing at the
old id fails silently, doing nothing at all. Do not add an entry from memory.

## Download

Grab the latest `salvage-smelting-<version>.mcpack` from the
[Releases page](https://github.com/ntrixter/BedrockAddons/releases?q=salvage-smelting).
Releases in this repository are shared across every add-on, so filter by the
`salvage-smelting-v` tag prefix.

## Install on a client

1. Download the file.
2. Open it. Minecraft imports the pack automatically.
3. Enable it on the world you want it in, under **Settings → Behaviour Packs**.

## Install on a dedicated server

This is a single-pack `.mcpack`, so it extracts **loose** — `manifest.json`
ends up at the top level rather than inside a folder.

1. Rename the downloaded file to `.zip` and extract it.
2. Create a folder named `salvage-smelting_BP` inside the server's
   `behavior_packs/` directory, and put the extracted files (including
   `manifest.json` and the `recipes/` folder) directly inside it.
3. Register the pack in the world (below).
4. Restart the server.

Two things that quietly break a server install:

- `level-name` in `server.properties` must match the world's folder name under
  `worlds/` **exactly**, including spaces and letter case. A mismatch is the
  single most common reason a pack appears to be ignored.
- Do not hand-edit `valid_known_packs.json`. Older guides still say to; the
  server maintains that file by scanning the pack directories.

There is no resource pack here, so `texturepack-required` is irrelevant to this
add-on.

## Install with the itzg Docker image

`MC_PACK` accepts an archive or directory whose root holds `behavior_packs/`
and `resource_packs/`, or a Marketplace-flavour archive using `data/` and
`resources/`. This download uses neither shape, because the client import path
decided the layout, so wrap it once:

```sh
mkdir -p packs/behavior_packs
unzip -q salvage-smelting-<version>.mcpack -d extracted/salvage-smelting_BP
mv extracted/salvage-smelting_BP packs/behavior_packs/
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
    "pack_id": "c449f4aa-7021-45fa-9db8-1183e2ac9301",
    "version": [2, 0, 0]
  }
]
```

Every release's notes carry this same block with the UUID and version already
filled in, so there is never a need to open a manifest by hand.

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

Removing the pack restores vanilla's nugget recipes for the 32 it replaces, and
removes the other 43 entirely. Nothing is stored in the world, so there is
nothing left behind.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Licence

MIT, same as the rest of this repository. See [LICENSE](../LICENSE).
