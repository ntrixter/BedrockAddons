# Changelog

All notable changes to this add-on are documented here.

The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
add-on follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
independently of every other add-on in this repository.

Release notes on GitHub are generated from the section matching the tagged
version, so the heading has to match exactly: `## [1.0.0] - 2026-10-11`.

## [Unreleased]

## [1.0.0] - 2026-10-11

### Added

- Look at a villager and the action bar shows what is in its eight hidden
  inventory slots. The line clears when you look away.
- Every adult villager shows its bread count, even at zero. It also shows a
  breeding meter out of 12, where bread is worth 4 and a carrot, potato or
  beetroot is worth 1. The line is green when the villager is ready, yellow
  when it has some food, and grey when it has none. Babies are marked as too
  young to breed.
- A farmer shows whether it is locked to one crop instead. Locked means every
  slot holds the same plantable item: Wheat Seeds, Potato, Carrot or Beetroot
  Seeds. A locked farmer is green, a single crop with free slots is yellow, and
  mixed contents or an item it cannot plant are red. Mixed contents are listed
  by slot. A farmer holding bread also shows the bread and the breeding meter,
  and the bread counts as mixing.
- Settings, under the gear icon beside the pack: read villagers through glass
  and walls (on by default, since breeders sit behind glass), and reach,
  3 to 16 blocks with a default of 8.
