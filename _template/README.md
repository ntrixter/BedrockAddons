# REPLACE_ME Add-on Name

REPLACE_ME one paragraph: what this add-on changes, and who it is for.

- **Add-on ID:** `REPLACE_ME-addon-id` (kebab-case; also the tag prefix, the
  issue label and the artifact filename)
- **Minimum Minecraft version:** REPLACE_ME (`min_engine_version` in the manifests)
- **Packs:** REPLACE_ME behaviour pack / resource pack / both

## Download

Grab the latest `REPLACE_ME-addon-id-<version>.mcaddon` from the
[Releases page](https://github.com/ntrixter/BedrockAddons/releases?q=REPLACE_ME-addon-id).
Releases in this repository are shared across every add-on, so filter by the
`REPLACE_ME-addon-id-v` tag prefix.

## Install on a client

1. Download the file.
2. Open it. Minecraft imports the packs automatically.
3. Enable the packs on the world you want them in, under its settings.

## Install on a dedicated server

1. Rename the downloaded file to `.zip` and extract it.
2. Copy `REPLACE_ME-addon-id_BP` into the server's `behavior_packs/` directory,
   and `REPLACE_ME-addon-id_RP` into the server's `resource_packs/` directory.

   A single-pack `.mcpack` extracts loose instead, with `manifest.json` at the
   top level. In that case create the `REPLACE_ME-addon-id_BP` folder yourself
   inside the right directory and put the extracted files in it.
3. Register the packs in the world (below).
4. Restart the server.

Three things that quietly break a server install:

- `level-name` in `server.properties` must match the world's folder name under
  `worlds/` **exactly**, spaces included. A mismatch is the single most common
  reason a pack appears to be ignored.
- A resource pack is not forced on connecting players unless
  `texturepack-required=true` is set in `server.properties`.
- Do not hand-edit `valid_known_packs.json`. Older guides still say to; the
  server maintains that file by scanning the pack directories.

## Install with the itzg Docker image

`MC_PACK` accepts an archive or directory whose root holds `behavior_packs/`
and `resource_packs/`, or a Marketplace-flavour archive using `data/` and
`resources/`. The download uses neither shape, because the client import path
decided the layout, so wrap it once:

```sh
mkdir -p packs/behavior_packs packs/resource_packs
unzip -q REPLACE_ME-addon-id-<version>.mcaddon -d extracted
mv extracted/REPLACE_ME-addon-id_BP packs/behavior_packs/
mv extracted/REPLACE_ME-addon-id_RP packs/resource_packs/
```

Mount `packs/` into the container and point `MC_PACK` at its in-container path.
The image installs the pack folders but does not register them, so the step
below still applies. `TEXTUREPACK_REQUIRED=true` is that image's equivalent of
`texturepack-required`.

## Register the packs in the world

These files live in `worlds/<world name>/`. If they already exist, **merge**
these entries into the existing array rather than overwriting the file.

`world_behavior_packs.json`

```json
[
  {
    "pack_id": "REPLACE_ME-behaviour-pack-header-uuid",
    "version": [1, 0, 0]
  }
]
```

`world_resource_packs.json`

```json
[
  {
    "pack_id": "REPLACE_ME-resource-pack-header-uuid",
    "version": [1, 0, 0]
  }
]
```

Every release's notes carry these same blocks with the real UUIDs already
filled in, so there is never a need to open a manifest by hand.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Licence

MIT, same as the rest of the repository. See [LICENSE](../LICENSE).
