# Changelog

All notable changes to this add-on are documented here.

The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
add-on follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
independently of every other add-on in this repository.

Release notes on GitHub are generated from the section matching the tagged
version, so the heading has to match exactly: `## [1.2.0] - 2026-09-14`.

## [Unreleased]

## [1.3.1] - 2026-09-22

### Changed

- The pack description now starts with the version, so the pack list in Edit
  World shows which build you are about to enable. Minecraft shows nothing else
  there that identifies it, and until now the only way to tell two builds apart
  was to enable one and look.

## [1.3.0] - 2026-09-16

### Added

- **Phantoms now clear for anyone who stays in bed until morning.** Nightshare
  moves the clock rather than sleeping, so Minecraft went on counting everyone
  as unrested — donate your share and the phantoms came for you anyway.

  Rather than imitate a sleep, the pack now arranges a real one: it stops just
  short of sunrise, briefly lowers the sleep threshold so one sleeper satisfies
  it, and lets Minecraft perform the night skip itself. Whoever is in bed is
  woken by the game, and their timer clears the only way Minecraft allows. It
  works per player, exactly like vanilla — **if phantoms are bothering you,
  stay in bed until morning.**

  A night that never reaches sunrise cannot do it: get up while it is still
  dark and your timer keeps running, as vanilla would have done anyway.

  New setting, **Let Minecraft end the night when someone is in bed**, on by
  default.

### Changed

- `guard.js` is now the single owner of `playersSleepingPercentage`. It both
  holds vanilla's skip off mid-night and invites it on at dawn, against one
  stored original — two independent borrowers would have recorded each other's
  temporary values and left the world permanently skippable, or permanently not.
- `scriptevent nightshare:debug` reports `handoff=armed|idle`.
- The test harness now models Minecraft's own night skip, which the pack
  deliberately provokes. It is opt-in per scenario: the older scenarios were
  written for a world where only Nightshare moves the clock, and are worth
  revisiting against a vanilla-aware mock separately.

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
