# Changelog

All notable changes to this add-on are documented here.

The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
add-on follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
independently of every other add-on in this repository.

Release notes on GitHub are generated from the section matching the tagged
version, so the heading has to match exactly: `## [1.0.0] - 2026-10-15`.

## [Unreleased]

## [1.0.0] - 2026-10-15

### Added

- Look at a tamed pet and the action bar names its owner: `Dog "Rex" · owned
  by Steve`, or `· yours` for your own. Covers dogs, cats and parrots, and
  tamed horses, donkeys, mules, llamas and camels.
- The owner's name still shows while they are offline, once the pack has seen
  them online at least once. Until then the line says `owner not seen yet`.
- Tamed dogs no longer hurt players, so a friend caught in a stray hit is not
  bitten by someone else's dog. Wild wolves are unchanged.
- Settings, under the gear icon beside the pack:
  - show a pet's owner, on by default
  - reach, 3 to 16 blocks, default 8
  - tamed dogs can't hurt players, on by default
