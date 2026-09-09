# Working in this repository

Standing instructions for any Claude Code session that opens this repository.
Follow them; they are not a description of how the repo was set up.

This is a monorepo of Minecraft Bedrock add-ons. One folder per add-on, each
versioned and released independently. `main` is the only branch.

## Anonymity

These rules are absolute and apply from the first line of any change.

- **They apply to every file that ends up in this repository, whatever its
  origin** — files you generate, files the user pastes or uploads, and the
  contents of add-ons migrated in from elsewhere. Do not assume anything handed
  to you is already clean. Check it *before* it is staged. If you find
  something you cannot scrub, say so instead of committing it and flagging it
  afterwards.
- **`Co-Authored-By: Claude <noreply@anthropic.com>` as a commit trailer is the
  only attribution permitted anywhere.** That is the whole of it. Never add a
  "Generated with" line, a Claude Code session URL or session ID, any
  `claude.ai` link, a README badge, or AI-attribution comments in code or docs.
  The commit message body describes the change; the trailer is the only place
  attribution appears.
- **No real name, email address, employer, job title or location** in any file,
  commit message, or metadata field. The GitHub handle `ntrixter` is the only
  identifier that may appear, and only where it is structurally required: repo
  URLs, issue-template links, the licence copyright line.
- **`metadata.authors` in a manifest gets the handle only.** No email, and no
  URL pointing anywhere except this repository.
- **Strip metadata from every image on the way in.** A `pack_icon.png` can
  carry EXIF/XMP fields naming an author, the software that made it, a device,
  or GPS coordinates. Run `python3 scripts/strip_image_metadata.py <path>` and
  confirm it reported what it removed.
- **No environment leakage.** No absolute paths from your session, no
  hostnames, no machine names, no internal or corporate domain names — not in
  scripts, docs, examples, comments or workflow files. Relative paths and
  placeholders only.
- **Contact points route to this repository's GitHub Issues.** Never invent or
  include an email address.
- **Before committing, confirm the local git identity is still correct:**

  ```sh
  git config --local user.name    # must be: ntrixter
  git config --local user.email   # must be: 1686841+ntrixter@users.noreply.github.com
  ```

  If either is wrong, fix it before committing. If a commit has already been
  made under a different identity, stop and tell the user rather than pushing.

### Enforcement

`scripts/check_repo.py` enforces all of this. It scans tracked files, staged
content, commit messages, and commit author/committer identity, and it detects
images that still carry metadata.

```sh
python3 scripts/check_repo.py
```

**A clean run is required before any push — every push, not just the first.**
CI runs the same command, so a leak fails the build; but a leak that reaches
GitHub is already published, and unreachable commits stay retrievable by SHA
even after a branch is deleted. The scan is the gate, not the branch name.

If a check fires on something genuinely fine, widen the `ALLOWLIST` block at
the top of `check_repo.py` rather than weakening a pattern.

`strip_image_metadata.py` is the only script that rewrites files, and it never
runs in CI. Stripping is always a deliberate command.

## When you add or migrate an add-on

Follow the walkthrough in `CONTRIBUTING.md` — it is written to be followed
cold, without this file's context. The scrub that applies to incoming files
matters most there: a migrated add-on is exactly where a real name or an
image's EXIF is most likely to be hiding. Check `metadata.authors` and other
manifest fields, author headers or comments in script files, JSON fields
carrying a name or a path, and stray editor directories such as `.vscode/` or
`.idea/` that embed absolute paths.

## Conventions

- **The add-on folder name is the canonical ID.** Kebab-case, e.g.
  `sleep-addon`. The same string is the git tag prefix, the GitHub issue label,
  and the artifact filename. Never rename a published add-on.
- **Versioning is semver, per add-on, independent of every other add-on.** The
  source of truth is `header.version` in `manifest.json`, and every pack in one
  add-on shares one version.
- **Bedrock manifests hold only the numeric version.** A prerelease suffix has
  nowhere to live in a manifest, so it lives in the tag: manifests say
  `[1, 5, 0]` and the tag says `sleep-addon-v1.5.0-beta.1`. The build refuses
  to run unless the tag's numeric core matches the manifests.
- **Tags are `<addon-id>-v<semver>`.** Never a bare `v1.2.0` tag — releases are
  repo-wide on GitHub, and the prefix is what keeps them apart.
- **`main` only.** Short-lived feature branches are fine and get merged and
  deleted promptly. There is no `develop`, no release branch, and no channel
  branch.
- **Nothing publishes from a branch.** A tag push is the only event that
  produces a release. Merging to `main` never builds, publishes or notifies.
  Unreleased work sitting on `main` is expected.
- **Stable versus prerelease is expressed in the version, not the branch.** A
  suffix such as `1.5.0-beta.1` is what marks a release as a prerelease and
  keeps it out of the stable channel in `catalog.json`.
- **Artifacts are never committed.** Built packages exist only as GitHub
  Release assets.
- **Every pack needs its own UUIDs**, and a pack's header UUID must differ from
  its module UUID. Generate fresh UUIDs for a new add-on. **Never regenerate a
  UUID that has already been published** — that breaks every existing install.

## Archive layout — do not "fix" this

`build_addon.py` produces one download per add-on:

- Two packs: `<id>-<version>.mcaddon` with the pack folders at the **archive
  root** — `<id>_BP/manifest.json` and `<id>_RP/manifest.json`.
- One pack: `<id>-<version>.mcpack` in canonical form — that pack's files at
  the **zip root**, `manifest.json` at top level, no wrapper folder.

**Client double-click import is the hard constraint that decided both shapes,
and it outranks every other consumer.** Root-level pack folders are what
community add-ons ship and what the client is known to handle. Do not nest the
packs under `behavior_packs/` + `resource_packs/`, do not switch to the
Marketplace `data/` + `resources/` flavour, do not add a single wrapper folder
containing everything (the classic way an `.mcaddon` fails to import), and
never ship both layouts in one archive — the client would import each pack
twice.

The itzg Docker image's `MC_PACK` accepts only the two shapes this deliberately
does not use, so the docs give a wrap-then-mount recipe instead. That is a
documentation problem, not a reason to change the layout.

## Tooling

Python 3, standard library only. No `pip install` step in CI, no
`requirements.txt`. Keep it that way: if a change needs a dependency, it
probably needs a simpler design instead.

| Command | What it does |
| --- | --- |
| `python3 scripts/check_repo.py` | All repository checks plus the identity-leak scan. Run before every push. |
| `python3 scripts/build_addon.py <addon-id>` | Package one add-on into `dist/`. |
| `python3 scripts/gen_catalog.py` | Regenerate `catalog.json`. `--offline` skips the API. |
| `python3 scripts/strip_image_metadata.py <path>` | Remove EXIF/XMP from a PNG or JPEG. |
