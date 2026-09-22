# Changelog

All notable changes to this add-on are documented here.

The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
add-on follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
independently of every other add-on in this repository.

Release notes on GitHub are generated from the section matching the tagged
version, so the heading has to match exactly: `## [1.0.0] - 2026-09-14`.

## [Unreleased]

## [1.1.1] - 2026-09-20

### Fixed

- **A blown-up bed dropped a red bed whatever colour it was.** `minecraft:bed`
  is a single block id whose only states are `direction`, `head_piece_bit` and
  `occupied_bit` — the colour lives in block entity data, so it was never in the
  permutation the loot table was given, and every bed came back the same.
  Different-coloured beds also merged into one stack because they looked
  identical. The pack now reads the block's own item for these, which carries
  the colour.
- **Banners lost their colour and pattern** to the same cause, unreported but
  broken since 1.0.0.

### Changed

- The pack description now starts with the version, so the pack list in Edit
  World shows which build you are about to enable.

  `minecraft:decorated_pot` has the same problem and is deliberately left alone
  — vanilla drops a pot's sherds rather than the pot unless it is mined with silk
  touch, and this pack mines unenchanted, so "fixing" it could make it worse. See
  TESTING.md T9c.

## [1.1.0] - 2026-09-15

### Added

- **Drop leaf blocks**, a new setting, **on by default**. Exploded leaves now
  drop the leaf block itself, so a canopy a creeper took out can be put back the
  way it was instead of leaving a permanent hole.
- Every leaf type is covered, poplar and pale oak included, and each drops its
  own kind rather than plain oak. Leaves are matched by name rather than from a
  list, so a tree Mojang adds in a future release is covered the day it ships
  without an update here.

### Changed

- Leaves dropping saplings, sticks and apples at vanilla rates is now the *off*
  position of that setting rather than the only behaviour. A world updating from
  1.0.0 that wants what it had should turn the new setting off; the setting
  applies on the next world load, as all of them do.

## [1.0.0] - 2026-09-14

First release. Developed outside this repository and migrated here at 1.0.0,
which is genuinely its first version. It keeps the UUIDs it was built and tested
with, so the world it was already installed on continues to see it as the same
add-on.

### Added

- Explosions drop 100% of the blocks they destroy. Bedrock has no
  `mobExplosionDropDecay` game rule - that one is Java-only - so mob explosions
  are the only blasts that still lose blocks, and this closes that gap.
- Covers creepers (charged included), ghast fireballs, wither skulls and end
  crystals, each individually switchable.
- Optional container blast-proofing: chests, barrels, shulker boxes, furnaces,
  hoppers, droppers, dispensers, brewing stands and ender chests survive the
  explosion with their contents intact. Off by default.
- An in-game settings screen, reached from the gear icon beside the pack in the
  world's Behaviour Packs list. No experimental toggle needed.
- Drops come from the real loot tables, so stone gives cobblestone, coal ore
  gives coal and a chest gives its contents - not the blocks' own items.
