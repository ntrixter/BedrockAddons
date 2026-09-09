# BedrockAddons

Minecraft Bedrock add-ons, all in one repository. One folder per add-on, each
versioned and released on its own schedule.

## Add-ons

_No add-ons published yet._

<!-- Add a row per add-on. The badge filter is what scopes it to that add-on's
     tags; without it the badge would show whichever add-on was released most
     recently. -->

| Add-on | Latest release | What it does |
| --- | --- | --- |
| <!-- [sleep-addon](sleep-addon/) --> | <!-- ![latest](https://img.shields.io/github/v/release/ntrixter/BedrockAddons?filter=sleep-addon-v*&sort=semver&label=sleep-addon) --> | <!-- One player sleeping skips the night. --> |

## How this repository is laid out

One repository, many add-ons. Each add-on lives in its own folder, keeps its
own version, and is released independently — a new version of one add-on does
not touch any other.

The thing that trips people up: **GitHub releases are repo-wide, but versions
are per add-on.** The Releases page mixes every add-on together, so a release
called `1.2.0` is meaningless on its own. Every tag therefore carries the
add-on ID as a prefix:

```
sleep-addon-v1.2.0        <- the sleep-addon add-on, version 1.2.0
some-other-addon-v0.3.1   <- a different add-on, unrelated version
```

### Finding and downloading a specific add-on

- Open the add-on's folder in the table above and follow the link to its
  releases, or
- go to [Releases](https://github.com/ntrixter/BedrockAddons/releases) and
  filter by the add-on's tag prefix, or
- read [`catalog.json`](catalog.json), which lists every add-on's latest stable
  and prerelease version with a direct download URL and a SHA256.

Do not use GitHub's `/releases/latest` endpoint against this repository. It is
repo-wide and will return whichever add-on was tagged most recently, which is
usually not the one you want. See [CATALOG.md](CATALOG.md).

Each release carries a single download plus its checksum, and its notes include
install instructions for both a client and a dedicated server, with the
ready-to-paste world registration entries already filled in.

## Installing

Every add-on's release notes cover this in full, but in short:

- **Client** — download the `.mcaddon` (or `.mcpack`), open it, and Minecraft
  imports the packs. Enable them on the world you want them in.
- **Dedicated server** — rename the file to `.zip`, extract it, and drop the
  pack folders into the server's `behavior_packs/` and `resource_packs/`. Then
  register them in the world's `world_behavior_packs.json` /
  `world_resource_packs.json`, which live in `worlds/<world name>/`.

Two things that quietly break a server install: `level-name` in
`server.properties` must match the world's folder name exactly, spaces
included; and a resource pack is not forced on connecting players unless
`texturepack-required=true`.

## For a consumer

`catalog.json` is a machine-readable index of every add-on's latest releases,
including pack UUIDs, pack types and SHA256 digests, fetchable unauthenticated
over `raw.githubusercontent.com`. The schema and the notes for anyone writing
an update checker are in [CATALOG.md](CATALOG.md).

## Contributing

Conventions, versioning rules and the walkthrough for adding a new add-on are
in [CONTRIBUTING.md](CONTRIBUTING.md).

Releases are cut by pushing a `<addon-id>-v<semver>` tag. Merging to `main`
never publishes anything.

## Licence

[MIT](LICENSE).
