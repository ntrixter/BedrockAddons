# Nightshare

Vanilla sleep is a switch: a threshold of players is met and the whole night
vanishes at once. That gives two bad outcomes on a shared world — one holdout
denies everyone the skip, or one person deletes the night for everyone else
mid-build. Nightshare makes sleep a currency instead. Every player online at
nightfall owns an equal share of the night, and getting into bed spends yours.
It is for worlds where not everyone can sleep at the same time.

- **Add-on ID:** `nightshare` (kebab-case; also the tag prefix, the issue label
  and the artifact filename)
- **Minimum Minecraft version:** 1.26.30 (`min_engine_version` in the manifest)
- **Packs:** behaviour pack only

## How it works

With **N** players online at nightfall, one share is **1/N of the night**.

- **Cumulative** — shares stack up over the course of the night.
- **Asynchronous** — nobody has to sleep at the same time. One player turns in
  at dusk, another at midnight; both count in full.
- **One share per player, per night** — you cannot sleep twice to donate twice.
- **Optional** — unspent shares are never spent, and the night runs out its
  remaining natural length.

Ten players online, so each share is worth 10% of the night:

| Who sleeps | Night skipped |
| --- | --- |
| Nobody | 0% |
| 1 player | 10% |
| 6 players, at six different moments | 60% |
| All 10 | 100%, straight to sunrise |

Two cases stay exactly like vanilla: **solo play** (one player, one share, a
full skip) and **everybody sleeping** (also a full skip — the difference is
that nobody had to coordinate it).

## Download

Grab the latest `nightshare-<version>.mcpack` from the
[Releases page](https://github.com/ntrixter/BedrockAddons/releases?q=nightshare).
Releases in this repository are shared across every add-on, so filter by the
`nightshare-v` tag prefix.

## Install on a client

1. Download the file.
2. Open it. Minecraft imports the pack automatically.
3. Enable it on the world you want it in, under its settings.

## Install on a dedicated server

1. Rename the downloaded file to `.zip` and extract it. A single-pack `.mcpack`
   extracts loose, with `manifest.json` at the top level, so create a
   `nightshare_BP` folder yourself inside the server's `behavior_packs/`
   directory and put the extracted files in it.
2. Register the pack in the world (below).
3. Restart the server.

Two things that quietly break a server install:

- `level-name` in `server.properties` must match the world's folder name under
  `worlds/` **exactly**, including spaces and letter case. A mismatch is the
  single most common reason a pack appears to be ignored.
- Do not hand-edit `valid_known_packs.json`. Older guides still say to; the
  server maintains that file by scanning the pack directories.

## Install with the itzg Docker image

`MC_PACK` accepts an archive or directory whose root holds `behavior_packs/`
and `resource_packs/`. The download uses neither shape, because the client
import path decided the layout, so wrap it once:

```sh
mkdir -p packs/behavior_packs/nightshare_BP
unzip -q nightshare-<version>.mcpack -d packs/behavior_packs/nightshare_BP
```

Mount `packs/` into the container and point `MC_PACK` at its in-container path.
The image installs the pack folder but does not register it, so the step below
still applies.

## Register the pack in the world

This file lives in `worlds/<world name>/`. If it already exists, **merge** this
entry into the existing array rather than overwriting the file — replacing it
disables every other pack on that world.

`world_behavior_packs.json`

```json
[
  {
    "pack_id": "18921d46-612a-4224-8b3d-da5cc3de7053",
    "version": [1, 2, 0]
  }
]
```

That is the **header** UUID from the manifest; the module UUID will not work.
Every release's notes carry this same block with the version already filled in.

> **If the pack does not load on a server, try the string form.** Nightshare's
> manifest is `format_version` 3, where versions are SemVer strings, and it is
> not yet settled whether `world_behavior_packs.json` must match that form —
> see the UNVERIFIED note in [BEDROCK-NOTES.md](../BEDROCK-NOTES.md). If the
> array above is rejected, use `"version": "1.2.0"` instead. The two files have
> to agree.

## Settings

Three settings have an in-game screen, reached from the **gear icon** beside
Nightshare in the world's Behaviour Packs list. No experimental toggle is
needed.

| Control | What it does |
| --- | --- |
| Minecraft's own night skip | `Let it happen` / `Hold it back while someone is away` / `Always hold it back`. Every option is explained on the screen itself |
| Fast-forward length | 1–10 seconds. How long the sky takes to sweep forward when a share is spent |
| Announce in chat | Whether to post a line when someone turns in |

Settings are per world, editable by the world or server owner, and read when the
world loads — a change applies on the next load.

### On a dedicated server

There is no gear icon on a server, so use the command. From the console drop the
leading slash; in game you need to be an operator.

```
scriptevent nightshare:config                 list every setting and its source
scriptevent nightshare:config guard auto      change one, live and persisted
scriptevent nightshare:config reset           back to the file values
```

Keys are `guard` (`off`/`auto`/`always`), `skip` (seconds, 1–60) and `announce`
(`true`/`false`).

For offline edits the file is
`worlds/<world name>/world_behavior_pack_settings.json`, beside
`world_behavior_packs.json`:

```json
{
  "format_version": "1.21.100",
  "minecraft:pack_settings": {
    "settings": [
      {
        "pack_id": "18921d46-612a-4224-8b3d-da5cc3de7053",
        "values": { "nightshare:vanilla_guard": "auto" }
      }
    ]
  }
}
```

List only the values you are changing; anything absent falls back to the
`default` in the pack's manifest. The game writes this file itself the first
time a setting is changed, so on a server you may have to create it.

Precedence, highest first: a command override, then the settings screen or the
manifest defaults, then the constants in `behavior_pack/scripts/config.js`.

### Why Minecraft's own night skip is left alone by default

Vanilla ends the night once every player **in the Overworld** is asleep. Players
in the Nether or the End cannot sleep at all, so that condition already means
*everyone who could sleep did* — and at that point the night ending is the right
outcome. Nightshare exists to move the night along when **not** everyone can
sleep, not to hold it open once they all have.

The two disagree in one place: three players, one off in the Nether, and the
other two sleep. That pays two of three shares, but vanilla sees 2 of 2
Overworld players asleep and jumps to dawn, so the third share is never spent.
Under the default that is intended. Set the night-skip mode to
`Hold it back while someone is away` if you would rather the night ran exactly
as long as the unspent shares say — at the cost of Minecraft telling anyone who
gets into bed during that window that night skipping is switched off.

## Other commands

| Command | Effect |
| --- | --- |
| `/scriptevent nightshare:debug` | Dump live state — clock, roster, who has spent, ticks queued |
| `/scriptevent nightshare:reset` | Clear tonight's state; a fresh roster is taken at the next nightfall |

## Tests

The pack's scripts can be exercised without launching Minecraft:

```sh
cd nightshare/tests && node --import ./register.js run.js
```

A Node ESM loader hook redirects the bare `@minecraft/server` import to a mock,
so the **shipping** scripts under `behavior_pack/scripts/` run unmodified
against a simulated clock. Node is needed only for this; the pack itself has no
build step and ships as plain JavaScript.

The suite cannot reach anything that depends on the real game — when
`isSleeping` actually flips, the true Bedrock sleep window, or whether the
fast-forward looks smooth on a client. Those need an in-game check.

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

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Licence

MIT, same as the rest of the repository. See [LICENSE](../LICENSE).
