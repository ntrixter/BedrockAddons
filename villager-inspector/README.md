# Villager Inspector

Villagers carry an inventory you never see: eight slots of bread, crops and
seeds. That inventory decides whether a villager will breed, and whether a farm
farmer plants the crop you built the farm for. Villager Inspector puts it on
screen. Look at a villager and the line above your hotbar says what it is
carrying.

- **Add-on ID:** `villager-inspector` (kebab-case; also the tag prefix, the
  issue label and the artifact filename)
- **Minimum Minecraft version:** 1.26.30 (`min_engine_version` in the manifest)
- **Packs:** behaviour pack only
- **Author:** ntrixter
- **No experiments and no resource pack.** It reads the villager and changes
  nothing: no vanilla file is overridden, and villagers behave exactly as they
  do without the pack.

## What you see

The colour gives the state at a glance. The rest of the line names the
villager's job and lists what it holds.

### Breeding: every adult villager

`Bread ×N` is always shown, even at zero, so it stays in the same place while
you walk along a breeder. The meter counts food points: a bread is worth 4, and
a carrot, potato or beetroot is worth 1. A villager is ready at 12, which is
3 bread or 12 of a crop.

| Villager | Line |
| --- | --- |
| Ready | `Unemployed · Bread ×3 · breed 12/12 ✔` (green) |
| Needs more | `Unemployed · Bread ×1 · breed 4/12` (yellow) |
| Nothing yet | `Nitwit · Bread ×0 · breed 0/12` (grey) |
| Bread and other food | `Librarian · Bread ×1, Carrot ×4 · breed 8/12` |
| Baby | `Baby villager · Bread ×2 · too young to breed` |

The meter stops at 12/12. Anything above that is spare food the villager will
share.

### Farmers: is it locked to one crop?

A farm farmer should hold **one plantable item and nothing else**:

| Farm | Fill the farmer with |
| --- | --- |
| Wheat | Wheat Seeds |
| Potato | Potato |
| Carrot | Carrot |
| Beetroot | Beetroot Seeds |

Mixed contents let it plant or pick up something other than the crop the farm
is for. **Locked** means every one of the eight slots holds that one item. A
part-filled stack is fine, because it only accepts more of the same item. A
free slot accepts anything.

| Farmer | Line |
| --- | --- |
| Locked | `Farmer · Bread ×0 · Potato 8/8 slots ✔ locked` (green) |
| One crop, slots still free | `Farmer · Bread ×0 · Carrot 3/8 slots · 5 free` (yellow) |
| Two crops | `Farmer · Bread ×0 · MIXED · Wheat Seeds ×7 slots, Potato ×1 slot` (red) |
| Given bread | `Farmer · Bread ×3 · breed 12/12 ✔ · MIXED · Potato ×7 slots, Bread ×1 slot` (red) |
| Holding something it cannot plant | `Farmer · Bread ×0 · not plantable · Wheat 3/8 slots` (red) |
| Empty | `Farmer · Bread ×0 · empty · 0/8 slots` (grey) |

A mixed farmer's items are counted in **slots**, because that is how many you
have to clear. The breeding meter appears on a farmer only while it holds
bread. Bread counts as mixing, because it takes up a slot a crop should be in.

If more than three kinds of item are present, the rest show as `+N more`, so
the line stays short on a phone.

A villager with a name tag shows its name next to its job, as
`Farmer "Bob"`.

### Beds and workstations

Each villager line ends with its links: `· bed ✔ · job ✔` when the pack knows
which bed and workstation the villager uses, and `?` when it does not know yet.
Unemployed villagers, nitwits and babies have no job, so only the bed marker
shows. While you look at a villager, its bed and its workstation sparkle.

It works the other way too. Look at a bed or a workstation (composter,
lectern, barrel, smoker and so on) and the line names the villager that uses
it, and that villager sparkles:

| Block | Line |
| --- | --- |
| Owner nearby | `Composter · Farmer · 3 blocks` (green) |
| Named owner | `Bed · Librarian "Bob" · 6 blocks` (green) |
| Its villager out of range | `Bed · villager not nearby` (yellow) |
| No villager seen using it | `Lectern · no villager linked` (grey) |

A bed or workstation right in front of a villager takes priority, so looking
at a bed with someone asleep on it names the sleeper.

**Everyone nearby sees the sparkles**, not just the player looking. That is
handy for pointing a villager out to a friend.

**These links are learned, not read.** Minecraft gives add-ons no way to ask
which bed or workstation a villager has claimed. That is kept in the game's
own village data, which scripts cannot reach. So the pack watches:

- **Workstations.** Every time a villager arrives at its workstation to work,
  the game fires an event the pack can see. The workstation it is standing at
  is its own.
- **Beds.** At night the pack looks for villagers asleep on a bed. A villager
  on the same bed for two checks in a row, two seconds apart, is sleeping
  there. One just walking across has moved on by then.

So a link appears after the villager's next work trip or next night, not the
moment you install the pack. If a villager switches to another bed or
workstation, the link moves the next time it is seen there. Breaking the
block, or the villager dying, clears it.

## Things worth knowing

**Glass and fences do not block it, by default.** Breeders and farms are
usually behind glass, fences or trapdoors, and any block normally stops the line
of sight. With *See villagers through glass and walls* on, the pack reads the
nearest villager in the direction you are looking, within reach, whatever is in
the way. Turn it off if you would rather it stopped at blocks.

**The action bar is shared.** While you look at a villager this pack rewrites
it four times a second, which replaces whatever another add-on put there. When
you look away it clears the line once.

**Item names are in English.** The pack names the items villagers pick up
themselves. Anything else, which can only have been put there by another pack
or a command, is shown by its id.

**Only current villagers count.** The pack reads `minecraft:villager_v2`.
Villagers from very old worlds are converted to that type when they load.

## Settings

Open the **gear icon** beside Villager Inspector in the world's Behaviour Packs
list. No experimental toggle is needed.

| Control | Default | What it does |
| --- | --- | --- |
| See villagers through glass and walls | on | Read the villager you are pointing at even if a block is in the way |
| Reach (blocks) | 8 | How far away a villager, bed or workstation can be, from 3 to 16 |
| Show particles | on | Sparkle a looked-at villager's bed and workstation, and a looked-at block's villager |

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
        "pack_id": "cad53067-31cd-48f8-b83b-d37df7e7ec51",
        "values": { "villager_inspector:reach": 12 }
      }
    ]
  }
}
```

List only the values you are changing. Anything absent falls back to its
default.

## Confirm in-game

The unit tests cover how the line is worded. They cannot cover these, which
need a real world:

1. **The pack can read the inventory at all.** The vanilla villager marks its
   inventory `"private": true`. The Script API describes that as "does not drop
   on death", but other documentation reads it as an access restriction. Drop
   3 bread next to an unemployed villager, look at it, and expect
   `Bread ×3 · breed 12/12 ✔`.
2. **Locking.** Fill a farmer's eight slots with seeds: green, `locked`. Let
   it pick up one potato after you clear a slot: red, `MIXED`.
3. **Through glass.** Look at a villager through a glass pane and expect the
   line. Turn the setting off, reload, and expect nothing.
4. **Wheat.** Vanilla's farmer config turns wheat into bread inside the
   inventory. Watch a wheat farmer whose slots are not all full, and note
   whether bread appears and turns it `MIXED`.
5. **Workstation links.** Put a composter next to an unemployed villager. Once
   it becomes a farmer and goes to work, look at the composter and expect
   `Composter · Farmer` with sparkles over that farmer. Break the composter
   and place another. The link should move once the farmer works there.
6. **Bed links.** At night, look at a bed with a villager asleep on it and
   expect its name. Then look at a villager by day: `bed ✔`. Also note whether
   the game's own "is sleeping" check reports villagers. Either way the
   two-checks rule covers it, but the answer belongs in the notes.
7. **Bed halves.** Look at the foot and at the head of the same bed. Both
   should name the same villager.

Record what you find in [BEDROCK-NOTES.md](../BEDROCK-NOTES.md).

## Tests

```sh
cd villager-inspector/tests && node --import ./register.js run.js
```

This drives `describe.js`, which turns an inventory into the line, with plain
objects. It also drives `links.js`, the bed and workstation bookkeeping,
against a small mock of `@minecraft/server`. A Node loader hook redirects that
import, so the shipping scripts run unmodified with no install step. CI does
not run it.

## Download

Grab the latest `villager-inspector-<version>.mcpack` from the
[Releases page](https://github.com/ntrixter/BedrockAddons/releases?q=villager-inspector).
Releases in this repository are shared across every add-on, so filter by the
`villager-inspector-v` tag prefix.

## Install on a client

1. Download the file.
2. Open it. Minecraft imports the pack automatically.
3. Enable it on the world you want it in, under **Settings → Behaviour Packs**.

## Install on a dedicated server

1. Rename the downloaded file to `.zip` and extract it. A single-pack `.mcpack`
   extracts loose, with `manifest.json` at the top level. Create a
   `villager-inspector_BP` folder yourself inside the server's
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
mkdir -p packs/behavior_packs/villager-inspector_BP
unzip -q villager-inspector-<version>.mcpack -d packs/behavior_packs/villager-inspector_BP
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
    "pack_id": "cad53067-31cd-48f8-b83b-d37df7e7ec51",
    "version": [1, 0, 1]
  }
]
```

That is the **header** UUID from the manifest. The module UUID will not work.

> **If the pack does not load on a server, try the string form.** This
> manifest is `format_version` 3, and it is not yet settled whether
> `world_behavior_packs.json` must match that form. See
> [BEDROCK-NOTES.md](../BEDROCK-NOTES.md). If the array is rejected, use
> `"version": "1.0.1"`.

## Updating or removing this add-on

Applying a behaviour pack **copies it into the world**, so importing a newer
`.mcpack` does not update a world that already has an older one. To update,
turn the pack off under Edit World and on again, then check the version in the
pack list. If the old version persists, remove the world's own copy. That means
all three of:

1. delete `<world>/behavior_packs/<pack folder>/`
2. remove the entry from `<world>/world_behavior_pack_history.json`
3. remove the entry from `<world>/world_behavior_pack_settings.json`

Removing the pack removes the readout and nothing else. The only thing it
stores is the learned bed and workstation links, kept as add-on data on the
world and on each villager. Without the pack, that data is never read and
changes nothing.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Licence

MIT, same as the rest of this repository. See [LICENSE](../LICENSE).
