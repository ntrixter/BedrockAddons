# Changelog

All notable changes to this add-on are documented here.

The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
add-on follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
independently of every other add-on in this repository.

Release notes on GitHub are generated from the section matching the tagged
version, so the heading has to match exactly: `## [1.1.0] - 2026-10-01`.

## [Unreleased]

## [1.1.0] - 2026-10-01

First release in this repository. Formerly an unreleased test pack called
"Opposite Dimension Compass Coordinates". It was renamed and packaged as 1.0.0
and tested, but never published, so this is the version that ships.

### Added

- Hold a compass and the action bar shows where you are standing in the other
  dimension: your x and z divided by 8 in the Overworld, multiplied by 8 in the
  Nether, with your height passed through unchanged. Every number is rounded
  down to a whole block. Nothing shows in the End or in a custom dimension, and
  the line clears when you put the compass away.
- It works with the plain compass, the lodestone compass and the recovery
  compass, whichever is the selected hotbar item. A compass in the offhand does
  not count, and neither does any other item, including another pack's custom
  item with "compass" in its name. Each compass keeps pointing where it always
  did; only the readout is added.
