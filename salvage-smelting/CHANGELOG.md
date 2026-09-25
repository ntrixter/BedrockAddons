# Changelog

All notable changes to this add-on are documented here.

The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
add-on follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
independently of every other add-on in this repository.

Release notes on GitHub are generated from the section matching the tagged
version, so the heading has to match exactly: `## [2.0.0] - 2026-09-25`.

## [Unreleased]

## [2.0.0] - 2026-09-25

First release in this repository. Versions up to 1.3.0 were built outside it and
were never published here; the pack keeps its original UUIDs so an existing
install upgrades in place rather than appearing as a second pack.

Every payout changed, so this is a major version.

### Changed

- **The salvage rule is now half an item's crafting cost, rounded up**, where it
  was previously the cost minus one. A chestplate returns 4 rather than 7, a
  helmet 3 rather than 4, boots 2 rather than 3. Swords, shovels and hoes are
  unaffected at 1, and netherite stays at 1 ingot.
- **Items crafted in batches now pay in nuggets.** Rails and iron bars cost
  0.375 of an ingot each, so half of that rounded up to a whole ingot would have
  returned nearly three times what they cost. Rails and iron bars return 2 iron
  nuggets; activator and detector rails return 5 iron nuggets; powered rails
  return 5 gold nuggets.
- Recipes now carry the same `unlock` block vanilla uses, so they appear in the
  furnace recipe book. Replacing a vanilla recipe file also replaces its
  `unlock`, so the 32 recipes that override vanilla had silently dropped out of
  the book.
- Recipe `format_version` moved from `1.12` to `1.20.10`, matching the shipped
  vanilla furnace recipes.
- Every output is written in the same form. 20 recipes previously used the bare
  string shape and 51 the object shape; all 75 now use the object shape with an
  explicit count.
- Recipes are generated from a cost table by `tools/gen_recipes.py` rather than
  hand-written.

### Added

- **Raw ore blocks smelt straight into the matching ingot block.** A block of
  raw iron gives a block of iron, and the same for gold and copper. This is
  convenience rather than salvage and sits outside the half-cost rule: a raw
  block is nine raw ore, which smelts into nine ingots, which is one ingot
  block — so the metal is identical either way. What it saves is eight fuel and
  eight smelting cycles. Vanilla has no recipe for any of the three.
- Chainmail helmet, chestplate, leggings and boots return 1 iron ingot each.
  Vanilla smelts them to a single nugget; chainmail is not craftable, so there
  is no cost to halve and the value is set by hand.
- Bows, crossbows and fishing rods return 2 string each.
- A pack icon.

### Fixed

- **Iron chain did nothing.** The recipe used `minecraft:chain`, which has not
  been a valid id since copper chains arrived and the block was renamed
  `minecraft:iron_chain`. A furnace recipe pointing at an id that does not exist
  fails silently. It now returns 1 iron ingot.
- **Gold pressure plates did nothing**, for the same reason: the recipe used
  `minecraft:golden_pressure_plate` rather than
  `minecraft:light_weighted_pressure_plate`. It now returns 1 gold ingot.

### Removed

- The three horse armour recipes. All three used ids that never existed
  (`minecraft:horsearmordiamond`, `horsearmorgold`, `horsearmoriron`), so none of
  them has ever worked. Horse armour is loot-only with no crafting recipe, and
  melting chest loot into free diamonds is a different change from recovering
  what you spent, so they are gone rather than corrected.
