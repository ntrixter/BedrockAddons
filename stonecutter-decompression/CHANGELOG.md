# Changelog

All notable changes to this add-on are documented here.

The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
add-on follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
independently of every other add-on in this repository.

Release notes on GitHub are generated from the section matching the tagged
version, so the heading has to match exactly: `## [1.0.0] - 2026-10-13`.

## [Unreleased]

## [1.0.0] - 2026-10-13

### Added

- 18 stonecutter recipes that turn one-way compressed blocks back into the
  items they were crafted from. Each returns what the block cost to craft:
  bamboo, prismarine, prismarine bricks, dark prismarine, honeycomb, quartz,
  sandstone, red sandstone, white wool, bricks, nether bricks, resin bricks,
  glowstone, melon, clay, snow, packed ice and blue ice. Dark prismarine
  returns its 8 shards; the black dye is not returned.
- The recipes are stonecutter-only, so they never appear in the inventory grid
  or a crafting table.
- A test kit: `/function stonecutter_decompression/test_kit` gives a
  stonecutter and one of every block, with cheats on.
