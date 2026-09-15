# Bedrock notes

Field-verified facts about Minecraft Bedrock add-ons that were expensive to work
out, several of which contradict the official documentation. Where this file and
`learn.microsoft.com` disagree, **this file wins** — the pages involved are
demonstrably stale, and this repository has already been bitten by one of them.

Everything here was verified in a real pack on a real world unless a line says
otherwise. Items marked **UNVERIFIED** are informed guesses that have not been
tested; treat them as leads, not facts, and update this file once they are
settled either way.

Much of it concerns script packs. The repository has two, and both were built
against these notes rather than against the documentation.

---

## Documentation known to be stale

| Page | What it gets wrong |
| --- | --- |
| `vanillabehaviorpack_snippets/entities/*` | Serves entity files years out of date under a `view=minecraft-bedrock-stable` URL. Observed: `villager_v2.json` at 2,514 lines / `format_version` 1.19.0 when the real file was 4,345 lines / 1.26.20. |
| Manifest reference, `settings` block | Still calls pack settings "experimental / preview builds". They are stable — see below. |
| Custom-settings article, `getPackSettings()` | Still calls it "in Beta". It is stable as of `@minecraft/server` 2.8.0. |

The last two were written against preview 1.21.110 and never revised.

**Source of truth for vanilla files is Mojang's `bedrock-samples` repository:**

```
https://raw.githubusercontent.com/Mojang/bedrock-samples/main/<path>
```

Take `min_engine_version` from that repo's own `behavior_pack/manifest.json`
rather than inferring it from the marketing version. Release names moved to a
calendar style (26.40, 26.45) while the engine version kept its `1.` prefix
(`1.26.40`).

Vanilla JSON is **not strict JSON** — it carries `//` comments, some trailing a
value on the same line — so strip comments before parsing with a strict reader.

---

## Pack settings need no experimental toggle

A behaviour pack can have a native settings screen, reached by a gear icon
beside the pack in the world's Behaviour Packs list. Verified working on latest
stable with **no experiments enabled**.

Requirements:

- `"format_version": 3` in the manifest. In v3 **every** version field becomes a
  SemVer *string* (`"1.2.0"`, not `[1, 2, 0]`), and `metadata.authors` is
  required.
- A top-level `"settings": [...]` array. Control types: `label` (read-only text,
  supports `§` formatting codes — use these to explain a setting), `toggle`,
  `slider` (`min`/`max`/`step`), `dropdown` (options as `{name, text}`). Every
  control needs a namespaced `"name"` such as `"mypack:thing"` and a `"default"`.
- `min_engine_version` `"1.26.30"` and `@minecraft/server` `"2.8.0"`.

Read them with `world.getPackSettings()`, which returns a plain object keyed by
those names.

Two facts settle the no-experiment question:

1. Microsoft's own `configurable_packs` sample (in `microsoft/minecraft-samples`)
   declares no `capabilities` section at all. The feature is gated purely on
   `format_version` 3.
2. `world.getPackSettings()` was promoted from beta to **stable** in
   `@minecraft/server` 2.8.0, shipped with Bedrock 1.26.30.

**Caveat:** there is no stable change event yet — `PackSettingChangeAfterEvent`
is 2.12.0-beta — so read settings once at load. Edits apply on the next world
load.

Confirmed twice, by two independently built packs: the gear icon appears on
latest stable with no experiment enabled, and achievements stay enabled.

---

## Where pack settings persist

```
worlds/<level-name>/world_behavior_pack_settings.json
```

```json
{
  "format_version": "1.21.100",
  "minecraft:pack_settings": {
    "settings": [
      { "pack_id": "<HEADER uuid>", "values": { "mypack:thing": "value" } }
    ]
  }
}
```

- Sits beside `world_behavior_packs.json`, and stores only values **changed from
  their default**.
- The game creates it the first time a setting is changed, so on a server you may
  have to write it by hand.
- This is the file the gear icon writes, so hand-editing is exactly equivalent.
- **Prefer it over editing `default` values in the pack's `manifest.json`.** Both
  work, but the manifest belongs to the pack and is overwritten on every pack
  update, while this file belongs to the world and survives.

The useful consequence: scripts have no filesystem access and cannot open a file,
but the *game* reads this one and hands it back through `getPackSettings()`. It
therefore works as a config file with the script doing no I/O at all.

---

## Do not use `@minecraft/server-admin` for configuration

`config/<module-uuid>/variables.json` with `variables.get()` is the "official"
BDS configuration route, and `/reloadconfig` even re-reads it live. Avoid it
anyway unless you are BDS-only: the module is pre-release, requires the Beta APIs
experiment, and per its own documentation "cannot be used on Minecraft clients or
within Minecraft Realms".

---

## Packs are copied into worlds — the unremovable-pack trap

Applying a behaviour pack **copies** it to `<world>/behavior_packs/<Name>/`,
independent of the global pack library. Three consequences, all of which present
as confusing bugs:

- **Settings → Storage → Behaviour Packs manages only the global library**, so a
  world-local leftover cannot be removed through the UI at all. It still appears
  under Edit World → Behaviour Packs.
- **A world keeps running its embedded copy**, so re-importing a newer `.mcpack`
  does not update a world that already has an older one. This presents as "I
  can't get rid of the old version".
- **`worlds/<id>/world_behavior_pack_history.json` lists every pack ever
  applied.** Delete the folder without clearing this and you get a ghost row
  reading "This pack is missing!".

Full manual removal is all three of:

1. delete `<world>/behavior_packs/<Name>/`
2. remove the entry from `world_behavior_pack_history.json`
3. remove the entry from `world_behavior_pack_settings.json`

---

## Time and clock gotchas (`@minecraft/server`)

- `world.setTimeOfDay(0)` moves the clock **backwards within the same day** and
  does not increment the day counter. To advance to dawn, clamp to `23999` and
  let the game's own tick roll it over. Verify with `/time query day`.
- **Exception:** with `doDayLightCycle` off there is no tick to hand off to, so
  `23999` would strand the world one tick short of dawn forever. Go to `0` in
  that case.
- Beds become usable around tick **12542**. The wiki documents Java's window
  (12523–23477 clear, 12002–23998 rain) and does not break Bedrock out
  separately, so treat the boundary as a tunable constant and confirm in game.
- When fast-forwarding time, pace it by **duration, not by a fixed
  ticks-per-tick rate**. A fixed rate makes the wait scale with the size of the
  skip, so the player skipping the most waits longest.

---

## `playersSleepingPercentage`

- Settable from script: `world.gameRules.playersSleepingPercentage = N`. No
  `/gamerule` command and no `runCommand` needed.
- Any value **above 100** makes the night unskippable — but the client renders
  that as *"The 'Skip night by sleeping' setting is turned off. Turn it on under
  advanced settings in edit world."* on the bed screen, which tells players to
  undo your pack. Do not pin it above 100 as a background state.
- Vanilla skips the night when every player **in the Overworld** is asleep.
  Players in the Nether or the End cannot sleep, so that condition already means
  "everyone who could sleep did" — often the behaviour you want rather than
  something to fight.

---

## A script pack's module type is `script`, not `data`

A behaviour pack that ships only scripts declares:

```json
"modules": [
  {
    "type": "script",
    "language": "javascript",
    "uuid": "...",
    "version": "1.2.0",
    "entry": "scripts/main.js"
  }
]
```

`type` is `"script"` and there is no `data` module alongside it. A behaviour pack
does not need one. Changing it to `"data"` to satisfy a validator stops it being
a script module and the pack silently does nothing.

The pack **folder** is what decides whether something is a behaviour or a
resource pack; the module type describes what is inside it. This repository's
tooling originally conflated the two and rejected the first script pack outright
— see the `ALLOWED_MODULE_TYPES` tables in `scripts/check_repo.py`,
`scripts/build_addon.py` and `scripts/gen_catalog.py`.

---

## Explosions (`@minecraft/server`)

- **`setImpactedBlocks([])` suppresses block destruction without cancelling the
  explosion.** Damage, knockback, sound and particles all survive; only the
  blocks and their partial drops go. `cancel` is a genuinely separate property,
  so emptying the list is the way to keep an explosion that harms entities but
  leaves the terrain alone.
- **Bedrock has no `mobExplosionDropDecay` game rule.** It is Java-only, so mob
  explosions are the only blasts that still lose a fraction of their blocks.
  `tntExplosionDropDecay` exists and already defaults to `false`, which is why
  TNT needs no help.
- **Every before-event in a tick fires before any `system.run` callback.** Two
  explosions in the same tick each snapshot the shared region while it is still
  intact, so anything derived from the blocks has to track ownership across the
  whole tick rather than per explosion, or overlapping blasts duplicate it.

---

## Block drops and containers

- **`generateLootFromBlockPermutation` distinguishes `undefined` from `[]`, and
  the difference matters.** `undefined` means the tool was insufficient; `[]`
  means the tool was fine and the table rolled nothing. Bare-handed leaves
  legitimately return `[]` about 95% of the time. Code that escalates through a
  tool ladder must escalate only on `undefined` — treating `[]` as "try a better
  tool" walks past pickaxe and shovel to shears, which returns the leaf *block*
  instead of a sapling. The same fact is useful on purpose: passing shears
  to `generateLootFromBlockPermutation` is how you get a leaf back as a placeable
  block rather than a sapling roll, which is what `creeper-drop-all`'s
  "Drop leaf blocks" setting does — as a short-circuit for leaves alone, never as
  a rung in a ladder.
- **A double chest reports the same merged 54-slot container from both halves.**
  Reading the inventory once per half duplicates the contents; read it once per
  chest, not once per block.

---

## Script API versioning

- Declaring an **older** stable module version still works on newer engines —
  that is the point of script versioning — so pin the lowest version that has
  what you need, to widen compatibility.
- `runCommandAsync` was **removed** in 2.0.0.
- `Entity.isSleeping` stable since 1.20.40; `get`/`setTimeOfDay` since 1.20.30.

| `@minecraft/server` | Bedrock |
| --- | --- |
| 2.0.0 | 1.21.90 |
| 2.8.0 | 1.26.30 |
| 2.9.0 | 1.26.40 |

---

## Dedicated server (BDS) install

- **BDS cannot read `.mcpack`.** Extract it, with `manifest.json` directly inside
  the folder.
- Activate via `worlds/<level-name>/world_behavior_packs.json` using the
  **header** UUID, not the module UUID. **Append** to the array; replacing it
  disables every other pack.
- `level-name` must match `server.properties` exactly, including letter case.
- Stop the server before editing world files — it rewrites them on shutdown.

**UNVERIFIED:** with a `format_version` 3 manifest,
`world_behavior_packs.json` may want `"version": "1.2.0"` (string) rather than
`[1, 2, 0]`, the two files being required to agree. Try the array first, then the
string.

> This one has a live consequence here. `build_addon.py` normalises every
> version to an array, so the ready-to-paste block in generated release notes
> says `[1, 2, 0]` even for a v3 pack. No add-on in this repository is v3 yet, so
> nothing is wrong today — but the first v3 pack must settle this before release,
> and if the string form is required the notes renderer needs to emit whichever
> form the manifest uses.

---

## Patterns that worked

- Persist state in **one** world dynamic property holding a JSON blob. Keep an
  in-memory copy as the source of truth and flush only when dirty.
- `/scriptevent <ns>:<cmd>` is the practical admin command surface. On the BDS
  console, type it **without** the leading slash.
- Re-validate persisted values on load, so a value that stops being legal in a
  later version is dropped rather than carried forward.
- A pack can be unit-tested without Minecraft: mock `@minecraft/server` and drive
  a fake tick loop. A Node ESM loader hook (`module.register`) can redirect the
  bare `@minecraft/server` import to the mock, so the **shipping** scripts load
  unmodified.
