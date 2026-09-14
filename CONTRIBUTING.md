# Contributing

This repository holds every add-on in one place, one folder per add-on, each
versioned and released independently.

## Repository layout

```
<addon-id>/
  addon.json          catalog metadata: display name, description, deprecated
  README.md           what it does, and how to install it
  CHANGELOG.md        Keep a Changelog; release notes are generated from it
  behavior_pack/      manifest.json plus the pack's content
  resource_pack/      manifest.json plus the pack's content
```

An add-on may have a behaviour pack, a resource pack, or both. Delete the
folder you do not need.

There is deliberately no `shared/` folder. Nothing is shared yet, and the right
shape for it is easier to see once two add-ons actually need the same thing.

## Conventions

**The folder name is the canonical ID.** Kebab-case, e.g. `sleep-addon`. That
same string is the git tag prefix, the GitHub issue label, and the artifact
filename. Never rename a published add-on.

**Versioning is semver, per add-on.** Each add-on's version is independent of
every other one. The source of truth is `header.version` in `manifest.json`,
and every pack within one add-on shares a single version — they release
together.

**Bedrock manifests hold only the numeric version.** A manifest version is
three integers, so a prerelease suffix has nowhere to live there. It lives in
the tag instead: the manifests say `[1, 5, 0]` and the tag says
`sleep-addon-v1.5.0-beta.1`. `build_addon.py` refuses to run unless the tag's
numeric core matches the manifests, so the two cannot drift.

**Tags are `<addon-id>-v<semver>`**, e.g. `sleep-addon-v1.2.0`. Never a bare
`v1.2.0` tag: GitHub releases are repo-wide, and the prefix is the only thing
keeping one add-on's releases apart from another's.

**`main` is the only branch.** Short-lived feature branches are fine for
anything worth seeing as a diff first, but they get merged and deleted
promptly. There is no `develop`, no release branch, and no channel branch.

**Nothing publishes from a branch.** A tag push is the only event that produces
a release. Merging to `main` never builds, publishes or notifies. Unreleased
and in-progress work sitting on `main` is expected and normal.

**Beta work does not get a branch.** Stable versus prerelease is expressed in
the version: a suffix such as `1.5.0-beta.1` is what marks a release as a
prerelease on GitHub and keeps it in `latest_prerelease` rather than
`latest_stable` in `catalog.json`. There is no branch to switch to for it.

**Artifacts are never committed.** `.mcaddon`, `.mcpack`, `.zip` and any
`dist/` or `build/` output are ignored. Built packages exist only as GitHub
Release assets.

**Every pack needs its own UUIDs.** A pack's header UUID and its module UUID
must differ, and no two packs anywhere in this repository may share a UUID. CI
enforces both. **Never regenerate a UUID that has already been published** — it
breaks every existing install.

## Archive layout, and why it is not up for revision

`build_addon.py` produces exactly one download per add-on:

- **Two packs** → `<id>-<version>.mcaddon`, with the pack folders at the
  **archive root**: `<id>_BP/manifest.json` and `<id>_RP/manifest.json`.
- **One pack** → `<id>-<version>.mcpack` in canonical form: that pack's files
  at the **zip root**, `manifest.json` at top level, no wrapper folder.

The build script derives the `_BP` / `_RP` archive folder names from the add-on
ID automatically. In the repository the folders stay `behavior_pack/` and
`resource_pack/`; there is nothing to rename by hand.

**Client double-click import is the constraint that decided both shapes, and it
outranks every other consumer.** Root-level pack folders are what community
add-ons ship and what the client is known to handle. So:

- do not nest the packs under `behavior_packs/` + `resource_packs/`,
- do not switch to the Marketplace `data/` + `resources/` flavour,
- do not add a single wrapper folder containing everything — that is the
  classic way an `.mcaddon` fails to import,
- never ship both layouts in one archive, which would duplicate the pack
  content and risk the client importing each pack twice.

The itzg Docker image's `MC_PACK` option accepts only a top-level
`behavior_packs/` + `resource_packs/` pair or the Marketplace `data/` +
`resources/` flavour — that is, only the two shapes this deliberately does not
use. That is handled with a wrap-then-mount recipe in the docs and release
notes. It is a documentation problem, not a reason to change the layout.

Builds are deterministic: fixed entry timestamps, stable ordering and plain
deflate, so rebuilding the same commit produces a byte-identical archive and
the same SHA256.

## Adding an add-on

Written to be followed cold. Everything below assumes you are starting from an
add-on that exists somewhere else and are bringing it in.

### 0. Scrub the incoming files first

Do this **before** anything is staged. Migrated content is exactly where a real
name or an image's EXIF is most likely to be hiding, and git history is painful
to scrub once pushed. Check:

- `metadata.authors` and every other manifest field — the handle `ntrixter`
  only, no email, and no URL pointing anywhere except this repository;
- author headers, `@author` tags and licence blocks in script files;
- `package.json`, if the add-on has one — `author`, `contributors`,
  `repository`, `homepage` and `bugs` routinely carry a real name, an email
  and a local path between them;
- any JSON field carrying a name or a filesystem path;
- stray editor directories such as `.vscode/` or `.idea/`, which embed absolute
  paths — delete them;
- every image:

  ```sh
  python3 scripts/strip_image_metadata.py <addon-id>/behavior_pack/pack_icon.png
  ```

The full rules are in `CLAUDE.md`. `scripts/check_repo.py` enforces them, but
it is a backstop, not a substitute for looking.

### 1. Copy the template

```sh
cp -r _template sleep-addon
```

Use the kebab-case add-on ID as the folder name. Delete `behavior_pack/` or
`resource_pack/` if the add-on has only one.

### 2. Generate fresh UUIDs

Every pack needs a header UUID and a module UUID, and **they must be
different**:

```sh
uuidgen   # header.uuid
uuidgen   # modules[0].uuid
```

Repeat for each pack. Every `REPLACE_ME` UUID placeholder must be replaced; CI
fails if one survives.

**If the add-on has already been published anywhere — this repository, a
previous release, a site, anywhere people may have installed it — keep its
existing UUIDs.** Do not regenerate them. A changed UUID reads as a completely
different pack, so existing installs break and worlds lose their pack.

### 3. Fill in the manifests

In each `manifest.json`:

| Field | What to put |
| --- | --- |
| `header.name` | The name shown in game. Real text, not a `pack.name` localisation key — a key would end up published in `catalog.json`. |
| `header.description` | One short sentence. |
| `header.uuid` | A fresh UUID (or the published one). |
| `header.version` | `[1, 0, 0]`, or the version being migrated. |
| `header.min_engine_version` | The lowest Minecraft version you have actually tested. |
| `modules[0].type` | `resources` in `resource_pack/`. In `behavior_pack/`: `data` for a content pack, or `script` for a pack that ships scripts — a script module is not a `data` module and changing it to satisfy a validator stops the pack working. |
| `modules[0].uuid` | A different fresh UUID. |
| `modules[0].version` | Same as `header.version`. |
| `metadata.authors` | `["ntrixter"]` — the handle only, never a real name or an email. |

### 4. Fill in `addon.json`

This is what `catalog.json` publishes, and a file a migrating session would
otherwise never think to create. Delete the `_comment` key.

```json
{
  "display_name": "Sleep",
  "description": "One player sleeping skips the night.",
  "deprecated": false
}
```

`deprecated` is read from the working tree rather than from a release, so
retiring an add-on later is a one-line edit plus a `workflow_dispatch` run of
the release workflow to refresh the catalog.

### 5. Write the README and start the changelog

Fill in every `REPLACE_ME` in the add-on's `README.md`, including the pack
UUIDs in the world-registration examples.

Start `CHANGELOG.md` at the version being migrated, not at `1.0.0` unless that
is genuinely the version. The heading must match the version exactly, because
release notes are generated from it:

```markdown
## [1.2.0] - 2026-01-31

### Added

- First release in this repository.
```

### 6. Wire it into the repository

- Add a row to the table in the root `README.md`.
- Add the add-on to the **"Which add-on?" dropdown in both issue forms**:
  `.github/ISSUE_TEMPLATE/bug_report.yml` and
  `.github/ISSUE_TEMPLATE/feature_request.yml`.
- Create its issue label — one label per add-on, named exactly as the add-on ID:

  ```sh
  gh label create sleep-addon --color 0E8A16 --description "Issues with the sleep-addon add-on"
  ```

### 7. Check it before pushing

```sh
python3 scripts/check_repo.py
python3 scripts/build_addon.py sleep-addon
```

The first must be clean. The second must package without error; inspect the
result if you want to be sure:

```sh
unzip -l dist/sleep-addon-1.2.0.mcaddon
```

Then commit. Pushing straight to `main` is fine for a small change; for
anything substantial — a new add-on especially — push a branch and open a pull
request instead, because `validate.yml` runs on pull requests and will check the
add-on before it lands. Either way nothing is published yet.

### 8. Cut the first release

A `<addon-id>-v<semver>` tag is the only thing that publishes. Either route
works and both end in the same place — the workflow builds the artifact,
generates the notes and attaches them whichever way the tag arrived.

**With git:**

```sh
git tag sleep-addon-v1.2.0
git push origin sleep-addon-v1.2.0
```

**Without git, in the web UI:** the release form pre-fills from the URL, so the
whole thing is one link and one click. Substitute the tag:

```
https://github.com/ntrixter/BedrockAddons/releases/new?tag=sleep-addon-v1.2.0&target=main
```

Open it and press **Publish release**. Leave the title and description empty —
the workflow overwrites both with generated content, so anything typed there is
discarded.

Without the pre-filled link it is Releases → **Draft a new release** → in
**Choose a tag** type the tag and pick **Create new tag on publish** → target
`main` → **Publish release**. Same result, more typing.

GitHub has no standalone "create tag" button, so this route necessarily creates
the release before the workflow sees the tag. That is handled: the release step
updates an existing release in place rather than failing, which it would
otherwise do, leaving a published release with no artifact attached.

Either way the release workflow then builds the add-on, verifies the tag
version against the manifests, attaches the artifact and its SHA256, generates
the release notes from the build output, marks it a prerelease if the version
carries a suffix, and regenerates `catalog.json`.

To cut a prerelease, tag `sleep-addon-v1.5.0-beta.1` while the manifests say
`[1, 5, 0]`. Add a matching `## [1.5.0-beta.1]` changelog section.

## Add-ons with tests

A script pack can be unit-tested without Minecraft by mocking
`@minecraft/server`; see `BEDROCK-NOTES.md`. Tests live in `<addon-id>/tests/`,
outside `behavior_pack/` so `build_addon.py` never packages them — it only ever
zips the pack folders.

CI does not run them. The repository's own tooling is Python standard library
only, and adding a Node setup step to `validate.yml` is a change to its shape
rather than something to slip in alongside an add-on. Run them by hand.

## Add-ons that override a vanilla file

Some add-ons work by replacing a vanilla file — disabling a built-in mechanic
generally requires it, because Bedrock swaps entity files wholesale rather than
merging them. If yours does:

- Take the vanilla file from **Mojang's `bedrock-samples`**, never from the
  Microsoft Learn snippet pages, which lag by a long way despite their "stable"
  URL. `CLAUDE.md` explains what that mistake cost the first time.
- Take `min_engine_version` from `bedrock-samples`' own
  `behavior_pack/manifest.json`.
- Strip the `//` comments; vanilla JSON is not strict JSON and this repo's
  tooling uses a strict reader.
- Declare the override in `addon.json` so the monthly `vanilla-drift` workflow
  watches it for you:

  ```json
  "vanilla_overrides": [
    {
      "path": "behavior_pack/entities/villager_v2.json",
      "upstream_sha256": "9c1c3d26…"
    }
  ]
  ```

  `path` is relative to the add-on folder and is also the path inside
  `bedrock-samples`. Get the hash from
  `python3 scripts/check_vanilla_drift.py --print-hash`, and refresh it after
  every re-sync or the workflow keeps reporting the same drift.

- Document the re-sync procedure in the add-on's own README, with the exact diff
  to re-apply. Keep the diff from vanilla as small as you can — a one-line
  change makes a re-sync mechanical instead of a research exercise.

## Labels

One label per add-on, plus the usual three. A new label is created whenever a
new add-on is added.

```sh
gh label create bug           --color D73A4A --description "Something is not working"
gh label create enhancement   --color A2EEEF --description "New feature or request"
gh label create documentation --color 0075CA --description "Documentation only"
gh label create dependencies  --color 0366D6 --description "Dependency updates"
```

## Releasing a change to an existing add-on

1. Bump `header.version` in **every** manifest of that add-on.
2. Add the matching `CHANGELOG.md` section.
3. Merge to `main`. Still nothing is published.
4. Tag `<addon-id>-v<new-version>` and push the tag.

## Retiring an add-on

Set `"deprecated": true` in its `addon.json`, merge, then run the release
workflow via **workflow_dispatch**. That regenerates `catalog.json` without
cutting a release, so consumers see the flag while existing installs keep
working. Do not delete the folder or the releases.
