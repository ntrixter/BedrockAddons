# Changelog

All notable changes to this add-on are documented here.

The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
add-on follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
independently of every other add-on in this repository.

Release notes on GitHub are generated from the section matching the tagged
version, so the heading has to match exactly: `## [1.0.0] - 2026-10-29`.

## [Unreleased]

## [1.0.0] - 2026-10-29

### Added

- ARK-style breeding for horses. Each of a foal's health, speed and jump has a
  60% chance to copy the better parent's value, and otherwise copies the worse
  one. The chance is a setting, from 25 to 100%.
- Look at a horse to see its health, speed and jump above the hotbar, coloured
  by how good each is. On by default.
- An optional second line naming the horse's parents. Off by default.
- Horses that were in the world before the pack get their jump measured:
  ride one and its best jump is turned back into a jump strength, shown as
  `Jump ~4.9` and used for breeding.
- Horses get a registry number, unique in the world, when they are tamed or
  first written up in a book. Horses without a name tag get a name built from
  their coat and markings plus that number,
  such as Copper Blaze #27, used on the look-at line, for parents and in the
  book.
- Use a book on a horse to get a signed book of its papers: name, colour,
  markings, birthday, breeder, parents and stats. A renamed horse, or
  parent, also shows its birth or wild name, so old books still identify it.
  The papers name the player who tamed the horse, and sneaking with a horse's
  own papers rewrites them with its current details.
- Foals inherit coat and markings from their parents (4 in 9 each, 1 in 9
  random), and every bred horse has a generation number, shown in its papers
  and beside its parents.
- Stats are learnt by riding (setting, on by default): health and speed show
  once a horse has been ridden, and jump shows its best jump seen. Untamed
  horses' stats are hidden unless "Show stats of untamed horses" is on.
  Breeding always uses the true stats.
- Donkeys and mules are covered (setting, on by default). Donkeys stay
  vanilla but get names, registry numbers, generations and books. A mule
  rolls health, speed and jump from its horse and donkey parents by the
  better-parent rule. Overrides vanilla `mule.json` as well as `horse.json`.
- Bred mules wear their horse parent's markings (setting, on by default). This
  adds a small resource pack, so the add-on now downloads as an `.mcaddon`.
- Papers: values right-justified on their labels' lines, Horse/Donkey/Mule
  named, speed in blocks/s, and the parents'
  stats on the Lineage page.
