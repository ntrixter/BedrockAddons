# Changelog

All notable changes to this add-on are documented here.

The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
add-on follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
independently of every other add-on in this repository.

Release notes on GitHub are generated from the section matching the tagged
version, so the heading has to match exactly: `## [1.0.0] - 2026-09-13`.

## [Unreleased]

## [1.0.0] - 2026-09-13

### Added

- First release. Lightning no longer turns villagers into witches.

  Vanilla wires this through the villager's `minecraft:damage_sensor`: a
  lightning hit fires the `become_witch` event, which adds a component group
  that transforms the villager into a witch after half a second. This pack
  ships a copy of the vanilla villager with that one event trigger removed.

  Lightning still deals no damage to villagers, exactly as in vanilla — the
  strike simply has no effect now. The `become_witch` event and its component
  group are left intact but unreachable, so the transformation can still be
  invoked deliberately with `/event entity <target> become_witch`.

  Includes a pack icon, and the in-game pack description credits ntrixter.

  Built against the Minecraft Bedrock 1.26.40 villager definition
  (`format_version` 1.26.20), taken from Mojang's bedrock-samples.
