# Changelog

All notable changes to this add-on are documented here.

The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
add-on follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
independently of every other add-on in this repository.

Release notes on GitHub are generated from the section matching the tagged
version, so the heading has to match exactly: `## [1.2.0] - 2026-09-14`.

## [Unreleased]

## [1.2.0] - 2026-09-14

First release in this repository. Nightshare was developed elsewhere and
migrated here at 1.2.0, which is why the history starts at that version rather
than at 1.0.0. The pack keeps its original UUIDs, so worlds that already have it
installed continue to see it as the same add-on.

### Added

- Proportional night skipping. Every player online at nightfall owns an equal
  share of the night; getting into bed spends yours and fast-forwards the night
  by that slice. Shares accumulate and nobody has to sleep at the same time.
- An in-game settings screen, reached from the gear icon beside the pack in the
  world's Behaviour Packs list, covering the vanilla night-skip mode, the
  fast-forward length and the chat announcement. No experimental toggle needed.
- `/scriptevent nightshare:config` to read and change settings live on a server,
  persisted across restarts, plus `nightshare:debug` and `nightshare:reset`.
