# No Witch Conversion

Villagers no longer turn into witches when struck by lightning.

In vanilla, a lightning strike within a few blocks of a villager replaces it
with a witch — and the witch can't despawn, so the villager is gone for good.
This add-on removes that. A struck villager is simply unaffected: no
transformation, and no damage either, which is what vanilla already does (the
conversion never dealt damage in the first place).

- **Add-on ID:** `no-witch-conversion`
- **Minimum Minecraft version:** 1.26.40 (Bedrock 26.40)
- **Packs:** behaviour pack only
- **Author:** ntrixter

## Download

Grab the latest `no-witch-conversion-<version>.mcpack` from the
[Releases page](https://github.com/ntrixter/BedrockAddons/releases?q=no-witch-conversion).
Releases in this repository are shared across every add-on, so filter by the
`no-witch-conversion-v` tag prefix.

## Install on a client

1. Download the file.
2. Open it. Minecraft imports the pack automatically.
3. Enable it on the world you want it in, under **Settings → Behaviour Packs**.

## Install on a dedicated server

This is a single-pack `.mcpack`, so it extracts **loose** — `manifest.json`
ends up at the top level rather than inside a folder.

1. Rename the downloaded file to `.zip` and extract it.
2. Create a folder named `no-witch-conversion_BP` inside the server's
   `behavior_packs/` directory, and put the extracted files (including
   `manifest.json` and the `entities/` folder) directly inside it.
3. Register the pack in the world (below).
4. Restart the server.

Two things that quietly break a server install:

- `level-name` in `server.properties` must match the world's folder name under
  `worlds/` **exactly**, including spaces and letter case. A mismatch is the
  single most common reason a pack appears to be ignored.
- Do not hand-edit `valid_known_packs.json`. Older guides still say to; the
  server maintains that file by scanning the pack directories.

There is no resource pack here, so `texturepack-required` is irrelevant to this
add-on.

## Install with the itzg Docker image

`MC_PACK` accepts an archive or directory whose root holds `behavior_packs/`
and `resource_packs/`, or a Marketplace-flavour archive using `data/` and
`resources/`. This download uses neither shape, because the client import path
decided the layout, so wrap it once:

```sh
mkdir -p packs/behavior_packs
unzip -q no-witch-conversion-<version>.mcpack -d extracted/no-witch-conversion_BP
mv extracted/no-witch-conversion_BP packs/behavior_packs/
```

Mount `packs/` into the container and point `MC_PACK` at its in-container path.
The image installs the pack folder but does not register it, so the step below
still applies.

## Register the pack in the world

This file lives in `worlds/<world name>/`. If it already exists, **merge** the
entry into the existing array rather than overwriting the file.

`world_behavior_packs.json`

```json
[
  {
    "pack_id": "d2af958c-b04d-41c4-8439-0066910c5599",
    "version": [1, 0, 0]
  }
]
```

Every release's notes carry this same block with the UUID and version already
filled in, so there is never a need to open a manifest by hand.

## Updating or removing this add-on

Applying a behaviour pack **copies it into the world**, at
`<world>/behavior_packs/<pack folder>/`, independent of the global pack library.
That has three consequences that all present as confusing bugs:

- A world keeps running its embedded copy, so importing a newer `.mcpack` does
  **not** update a world that already has an older one.
- Minecraft's **Settings → Storage → Behaviour Packs** manages only the global
  library, so a world-local leftover cannot be removed there at all. It still
  appears under **Edit World → Behaviour Packs**.
- `<world>/world_behavior_pack_history.json` lists every pack ever applied.
  Delete the folder without clearing that entry and you get a ghost row reading
  "This pack is missing!".

To update a world you already play, turn the pack off under Edit World and on
again, then check the version. If the old version persists, remove the world's
own copy — all three of:

1. delete `<world>/behavior_packs/<pack folder>/`
2. remove the entry from `<world>/world_behavior_pack_history.json`
3. remove the entry from `<world>/world_behavior_pack_settings.json`

On a dedicated server, replace the folder under `behavior_packs/` and restart.

## How it works

Vanilla handles the conversion entirely in data, in three pieces inside
`entities/villager_v2.json`:

1. `minecraft:damage_sensor` has a trigger filtering on `is_family: lightning`
   and `is_difficulty != peaceful`, which fires the `become_witch` event and
   carries `"deals_damage": "no"`.
2. The `become_witch` event adds the `become_witch` component group.
3. That group is a `minecraft:transformation` into `minecraft:witch`, delayed
   half a second.

This pack ships a copy of that file with **one line removed** — the
`"event": "become_witch",` line in step 1. The filters and
`"deals_damage": "no"` stay, so lightning still matches the villager and still
deals no damage; it just no longer triggers anything.

Steps 2 and 3 are deliberately left in place. They are unreachable through
normal play, they keep this file as close to vanilla as possible for re-syncing,
and they mean the transformation is still available on purpose:

```
/event entity @e[type=villager_v2,r=5] become_witch
```

## Things worth knowing

**It pins villager behaviour to one Minecraft version.** Bedrock replaces
vanilla entity files wholesale — there is no way to patch a single component —
so this pack has to ship the complete villager definition. While it is enabled,
any villager changes Mojang makes in a later update are overridden by this copy
until it is re-synced. See below.

**It conflicts with any other add-on that overrides `villager_v2.json`.** Only
one of them wins, and which one is not something you control reliably.

**Villagers that already became witches stay witches.** This prevents future
conversions; it does not reverse past ones.

**Legacy v1 villagers are not overridden, and don't need to be.** Only
`villager_v2.json` is replaced. The vanilla v2 definition contains its own
"transform from v1 to v2" path, so any old v1 villager migrates to v2 and is
covered.

**Zombie conversion is untouched.** The second `damage_sensor` trigger, which
turns a villager into a zombie villager on a fatal zombie or husk hit, is
unchanged.

## Re-syncing after a Minecraft update

The monthly `vanilla-drift` workflow tells you when this is needed — it watches
upstream and opens an issue when Mojang changes the file. You should not have to
remember to check.

When it fires, refresh the shipped copy:

1. Fetch the current vanilla file from **Mojang's `bedrock-samples` repository**,
   which is the source of truth:

   ```sh
   curl -sSL -o villager_v2.json \
     https://raw.githubusercontent.com/Mojang/bedrock-samples/main/behavior_pack/entities/villager_v2.json
   ```

   Do **not** use the Microsoft Learn `vanillabehaviorpack_snippets` pages. They
   are served under a "stable" URL but lag badly — at the time of writing they
   offered a 2,514-line `villager_v2.json` with `format_version` 1.19.0 while
   the real file was 4,345 lines at 1.26.20. That mistake is how this add-on
   first shipped a stale villager.

2. Strip its `//` comments. The vanilla file is not strict JSON and this
   repository's tooling uses a strict reader. Split each line at `//` and keep
   the left-hand side; blank lines are left where comment-only lines were, so
   line numbers stay aligned with upstream and the diff below stays readable.

3. Apply the one-line edit — delete the `event` line from the lightning trigger:

   ```diff
              {
                "deals_damage": "no",
                "on_damage": {
   -              "event": "become_witch",
                  "filters": [
   ```

   No comma repair is needed: `filters` follows, so the trailing comma goes with
   the deleted line.

4. Update `min_engine_version` in `behavior_pack/manifest.json` to match the
   `min_engine_version` in `bedrock-samples`' own `behavior_pack/manifest.json`,
   bump `header.version`, and add a `CHANGELOG.md` section.

5. Refresh `upstream_sha256` in `addon.json` to the SHA256 of the new
   comment-stripped upstream file, or the drift workflow keeps reporting.
   `python3 scripts/check_vanilla_drift.py --print-hash` prints it.

6. Run `python3 scripts/check_repo.py` and
   `python3 scripts/build_addon.py no-witch-conversion`. A botched edit fails
   immediately as invalid JSON, so the mistake is loud rather than silent.

7. Release by creating a `no-witch-conversion-v<new-version>` tag — either
   `git push origin <tag>`, or Releases → Draft a new release → Create new tag
   on publish. Both routes end up identical; see CONTRIBUTING.md.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Licence

MIT, same as the rest of the repository. See [LICENSE](../LICENSE).
