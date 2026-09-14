# Changelog

All notable changes to this add-on are documented here.

The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
add-on follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
independently of every other add-on in this repository.

Release notes on GitHub are generated from the section matching the tagged
version, so the heading has to match exactly: `## [1.0.0] - 2026-09-14`.

## [Unreleased]

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
