# Changelog

All notable changes to this add-on are documented here.

The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
add-on follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
independently of every other add-on in this repository.

Release notes on GitHub are generated from the section matching the tagged
version, so the heading has to match exactly: `## [1.0.0] - 2026-10-01`.

## [Unreleased]

## [1.0.0] - 2026-10-01

First release in this repository. Formerly an unreleased test pack called
"Opposite Dimension Compass Coordinates"; the script is unchanged, and the name,
description, icon and packaging are what is new.

### Added

- Hold a compass and the action bar shows where you are standing in the other
  dimension: your x and z divided by 8 in the Overworld, multiplied by 8 in the
  Nether, with your height passed through unchanged. Every number is rounded
  down to a whole block. Nothing shows in the End or in a custom dimension, and
  the line clears when you put the compass away.
- Only a plain compass in the selected hotbar slot counts. Lodestone compasses,
  recovery compasses and a compass in the offhand do not.
