# Changelog

All notable changes to this add-on are documented here.

The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
add-on follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
independently of every other add-on in this repository.

Release notes on GitHub are generated from the section matching the tagged
version, so the heading has to match exactly: `## [1.0.3] - 2026-10-02`.

## [Unreleased]

## [1.0.3] - 2026-10-02

First release. 1.0.0 to 1.0.2 were test builds, under the working name XP
Bottling, and were never published.

### Added

- Craft a Bottle o' Enchanting into a glass bottle and 7 XP, or a glass bottle
  and 7 XP into a Bottle o' Enchanting, at a crafting table or in the inventory
  grid. Shift-click converts a whole stack.
- The XP is raw points at a fixed 7 per bottle. Throwing a bottle is unchanged.
- If you are short of XP, the glass bottles you could not pay for come back with
  a message saying how much XP you have, and anything that does not fit drops at
  your feet rather than being deleted.
- XP is worked out from level and progress and taken without ever subtracting
  across a level boundary, and every charge is checked: if the game does not end
  up exactly 7 XP per bottle lower, the XP goes back and so do the glass bottles.
- A crafted bottle completes the trade only in the inventory it lands in.
  Dropped from the cursor, or found in a chest when the chest is opened, it
  turns back into the bottle it was crafted from and no XP moves, so it cannot
  be thrown at another player to charge them for it.
