# Creeper Drop All — test matrix

> **Status at v1.1.0:** four checks passed at v1.0.0 — the settings screen,
> explosion damage surviving `setImpactedBlocks([])`, the double-chest case, and
> a client import of the released artifact. Two more were partly verified on
> 2026-09-16 against Minecraft 26.51 (engine 1.26.50): T5a, the new leaf-block
> setting, and the chest half of T4d. **Everything else below is unrun.** An
> unticked box means untested, not failing.
>
> The highest-value gap is now **T5b** — the setting turned *off*. It is the
> regression test that catches the tool ladder escalating into shears, and
> nothing else in the matrix covers it.

Run each test **twice**: once with the pack disabled (baseline) and once enabled. Differences
that aren't the intended behavior are bugs.

**Setup for the first pass:**
- Settings → Creator → **Content Log GUI** on, so script errors are visible.
- Set `DEBUG = true` at the top of `behavior_pack/scripts/main.js`, rebuild, redeploy.
- For a fast iteration loop, copy `behavior_pack/` into Minecraft's
  `development_behavior_packs` folder and load it from there — dev packs reload on world reload, so
  you never re-import a `.mcpack` while iterating. Otherwise build the real artifact with
  `py -3 scripts/build_addon.py creeper-drop-all` from the repository root and import that.

**Deterministic detonation** (no waiting for a creeper to path to you):

```
/summon creeper ~3 ~ ~ 0 0 minecraft:start_exploding_forced
```

Charged:

```
/summon creeper ~3 ~ ~ 0 0 minecraft:become_charged
```

---

## Test rig

### Once per test world

```
/gamerule doMobSpawning false
/gamerule doWeatherCycle false
/gamerule doDaylightCycle false
/gamerule randomTickSpeed 0
/gamerule showcoordinates true
/time set noon
```

`randomTickSpeed 0` is not cosmetic — it stops **leaf decay**, which drops saplings on its own and
would otherwise pollute the T5 leaf counts with drops the pack never produced. `doMobSpawning false`
keeps a wandering creeper from detonating mid-measurement.

### Damage immunity — Survival, but nothing can hurt you

```
/effect @s resistance 999999 255 true
```

Add for the lava cases in T8:

```
/effect @s fire_resistance 999999 255 true
```

> ⚠️ **Turn this OFF for T1.** T1 measures whether explosion damage survives
> `setImpactedBlocks([])`. With Resistance on, a totally broken pack that removed all damage would
> look identical to a working one, and T1 would pass while the addon had quietly made creepers
> harmless.
>
> ```
> /effect @s clear
> ```
>
> Alternatively, keep immunity on and stand ~15 blocks away for the drop-counting tests — explosion
> damage falls off with distance, so you need no effect at all unless you're close.

### Between every single test

```
/kill @e[type=item]
```

Leftover drops from the previous blast are the easiest way to miscount, and nearly every test here
is a count.

### Achievements check needs its own world

Cheats have to be on to run `/summon`, and **enabling cheats disables achievements by itself** — so
the achievements line in T0 cannot be checked on your main test world. Verify it separately:

1. New world, **cheats off**, Survival
2. Activate Creeper Drop All (and nothing else)
3. Confirm the achievements warning does *not* appear and the Achievements screen stays active
4. Let a creeper detonate naturally and confirm drops still work

That is the run that actually proves the no-experimental-toggle requirement was met.

---

## Status

| | Result |
|---|---|
| **T0** Settings screen | ✅ **PASSED** 2026-09-14 — gear icon opens, controls render, `format_version: 3` accepted on stable |
| **T1** Explosion damage preserved | ✅ **PASSED** 2026-09-14 — creeper still damages the player while dropping everything |
| **T2** Creeper drops | ☑ informally confirmed 2026-09-14 — drops looked complete by eye; not counted against crater size |
| **T4b** Double chest | ✅ **PASSED** 2026-09-14 — 2 chest items + contents dropped exactly once. No duplication |
| everything else | not yet run |

`EXPLOSION_MODE = "suppress"` is therefore the confirmed-correct path. The `"recreate"` fallback is
unused and stays only as insurance against a future engine change.

---

## Blocking tests — do these first, in this order

### ☑ T0 — Settings screen renders — PASSED 2026-09-14

The whole `format_version: 3` bet rides on this, so it goes first.

- [ ] Gear icon appears next to the pack in the behavior pack list
- [ ] All six toggles and both sliders render, with correct labels and defaults
- [ ] **Achievements are still enabled** on the world (this is the requirement that matters)
- [ ] Flip a toggle, reload the world, confirm behavior changed
- [ ] An untouched settings screen behaves as the manifest defaults describe
- [ ] `[CreeperDropAll] loaded. …` appears in the content log

If the gear icon does not appear, the fallback is manifest `format_version: 2` without a settings
block, configured by editing `DEFAULTS` in `scripts/settings.js`.

### ☑ T1 — Does `setImpactedBlocks([])` preserve explosion damage? — PASSED 2026-09-14

**Result: yes.** A creeper detonated next to the player in Survival dealt its damage normally while
the blast dropped 100% of its blocks. No documentation states this either way, so the answer was
only obtainable in-game — re-check it if a future Bedrock release changes explosion handling.

Original framing, kept for context: `cancel` is a separate property from `setImpactedBlocks()`,
which strongly implied the two were independent. Had it failed, creepers would have become harmless
and the pack worse than useless.

Setup: Survival, Normal difficulty, **no armor**, full health, flat stone platform, standing
**exactly 3 blocks** from the detonation point. Explosion damage is deterministic at a fixed
distance, so baseline and treatment should match exactly. Repeat 3× each.

| | Baseline | With pack | Match? |
|---|---|---|---|
| Health lost | | | |
| Knocked back? | | | |
| Explosion sound? | | | |
| Explosion particles? | | | |

**If damage is lost:** open `scripts/main.js`, set `EXPLOSION_MODE = "recreate"`, rebuild, re-run
T1. That path cancels the event outright and re-issues a non-block-breaking explosion from the
same source, restoring damage, knockback, sound and particles together.

**If damage survived but sound/particles didn't:** set `FORCE_SOUND` / `FORCE_PARTICLES` to `true`
instead. Cheaper, and it keeps damage on the engine's own code path.

### ◑ T5 — Leaves, in both settings — T5a PASSED 2026-09-16, T5b unrun

**Drop leaf blocks** decides this one, so it runs twice. Settings apply on the next world load —
reload between the halves, or the second run is just the first again.

**T5a — setting ON (the default).** Blast ~64 leaf blocks.

- [x] Leaf blocks drop, one per leaf destroyed (arriving merged into stacks)
- [x] A **poplar** (1.26.40's tree, in three autumn colours) drops its own colour, not oak
- [ ] Each is its **own** kind — birch from a birch, cherry from a cherry, azalea from an azalea
- [ ] The dropped blocks place back onto the tree

**Result (2026-09-16, Minecraft 26.51 / engine 1.26.50):** poplar leaves drop as leaf blocks.
The other variants and the place-it-back check are still unticked because they were not part of
that run, not because they failed.

**Also verified in the same run: `minecraft:shelf_mushroom`**, the bracket fungus that grows on
poplars, drops correctly. It is worth calling out because it is not a leaf and does not go near the
shears short-circuit — it takes the ordinary ladder and lands on the very first rung, since its
loot table carries no tool condition. It also has a `growth` block state with a **different loot
table per stage** (growth 0 gives one mushroom, growth 1 gives two), which only comes out right
because P1 snapshots `block.permutation` rather than the type id. Storing the id and re-resolving
later would quietly drop one mushroom from every grown one.

The per-kind check is the one worth being fussy about: it is what separates the shears route, which
reads the permutation, from the fallback that builds an item from the block id. Both give *a* leaf,
but only one gives the right leaf on the legacy `minecraft:leaves` id.

**T5b — setting OFF.** Turn *Drop leaf blocks* off, reload, blast ~64 more.

- [ ] Drops are saplings / sticks / apples at roughly vanilla rates
- [ ] **No leaf-block items appear at all**

T5b is the tool-ladder regression test, and it is the half that matters whenever the loot code is
touched. A leaf *block* dropping **with the setting off** means the ladder escalated on an empty
array and reached shears. See the long comment above `generateLoot()` in `main.js` — and do not
"fix" that by adding shears to the ladder. The shears call behind the setting is a separate
short-circuit that nothing but a leaf can reach.

Also spot-check, in either position: grass and tall grass (seeds only, never grass blocks), vines.
Neither is a leaf, so neither should differ between T5a and T5b.

### ☑ T4b — Double chest (duplication regression) — PASSED 2026-09-14

Place a double chest with both halves inside the blast, protection **off**.

- [x] Contents drop **exactly once**, not twice
- [x] Exactly 2 chest items drop

**Result:** a double chest holding one diamond chestplate dropped 2 chest items and 1 chestplate.
Correct — a double chest is two chest *blocks*, so two chest items is what hand-breaking gives; the
single chestplate is the proof that the merged 54-slot container was read once rather than once per
half.

This is the easiest thing in the whole pack to get wrong, and the failure mode is item duplication.

Still untested: the *cross-explosion* variant in T10, where two blasts in the same tick each contain
a different half. Rarer, and handled by the same tick-scoped `contentsClaimed` ledger, but it is a
distinct code path from the one verified here.

---

## Functional tests

### ☐ T2 — Normal creeper, flat stone
- [ ] Crater appears in the **same tick** as the bang — no dissolve or stutter
- [ ] Every destroyed block yields exactly one cobblestone
- [ ] Total cobblestone == crater block count
- [ ] Baseline visibly yields fewer

### ☐ T3 — Charged creeper (volume / watchdog)
- [ ] No client hitch on the removal tick
- [ ] Loot finishes arriving within ~1 second
- [ ] Debug log reports a block count in the 200–800 range
- [ ] No watchdog warnings in the content log
- [ ] Repeat over mixed terrain (dirt / grass / stone / ore) to exercise several loot tables at once

### ☐ T4 — Containers, protection OFF
- [ ] **T4a** Single chest holding 5 distinct stacks including a damaged, enchanted, renamed tool —
      exactly those 5 stacks drop plus 1 chest item; enchantments, custom name and durability preserved
- [ ] **T4b** Double chest — see blocking tests above
- [ ] **T4c** Shulker box with contents — exactly 1 shulker box item that **still contains** its
      inventory; the loose contents do **not** also drop
- [ ] Barrel (27 slots, no pairing)
- [ ] Furnace mid-smelt (input + fuel + output all drop)

### ◑ T4d — Containers, protection ON — chest PASSED 2026-09-16, sweep incomplete
Turn on *Protect containers from explosions*, reload the world, then detonate point-blank against
each of: chest, double chest, barrel, furnace mid-smelt, hopper, ender chest.

- [x] Chest **survives intact**, contents unmoved
- [ ] The other five container types (double chest, barrel, furnace mid-smelt, hopper, ender chest)
- [ ] The surrounding crater still forms normally
- [ ] Nothing duplicates
- [ ] Toggle back off, reload, confirm T4a–c behavior returns

**Result (2026-09-16):** chest protection confirmed working. The remaining container types are
unrun. The ender chest is the one most worth doing next: it has no `minecraft:inventory` component
and is protected only because `PROTECT_EXTRA` names it explicitly, so it is the entry that a
refactor would break without any other test noticing.

### ☐ T6 — Ores
Exposed coal, iron, gold, redstone, lapis, diamond, plus deepslate variants, obsidian, and
snow / snow block (the shovel rung of the ladder).

- [ ] coal → coal, redstone → 4–5 dust, lapis → 4–9, diamond → diamond, iron/gold → raw ore
- [ ] All at 100%
- [ ] **No XP orbs** — expected and documented, not a bug

### ☐ T7 — `mobGriefing false`
```
/gamerule mobGriefing false
```
- [ ] Nothing is destroyed
- [ ] **Nothing is dropped**
- [ ] No errors in the content log

Confirms the empty-block-list early return fires *before* `setImpactedBlocks`, leaving the pack
completely transparent.

### ☐ T8 — Water, lava, waterlogging
- [ ] Fully submerged creeper next to stone — no crash, impacted blocks drop fully
- [ ] Water flows into the crater without deleting the drops
- [ ] Creeper adjacent to a lava pool — no exception spam
- [ ] Waterlogged stairs drop their base block

### ☐ T9 — Multi-block and block-entity edge cases
Doors, beds, tall grass, large ferns, sunflowers, a sign with text, a monster spawner, a bell.

- [ ] Doors / beds / tall plants drop **one** item each, not two
- [ ] Spawner drops nothing (correct)
- [ ] Sign drops the sign item; **text is lost** — expected, matches vanilla

### ☐ T9c — Colour survives the blast (regression, fixed in 1.1.1)

Blow up several **different-coloured beds** in one blast, and a patterned banner.

- [ ] Each bed drops its **own** colour — blue stays blue, not red
- [ ] Beds of different colours do **not** merge into one stack
- [ ] A banner keeps its colour **and its pattern**

Until 1.1.1 every bed came back red whatever you destroyed. `minecraft:bed` is a
single block id whose states are only `direction`, `head_piece_bit` and
`occupied_bit`, so the colour was never in the permutation handed to the loot
table. The fix snapshots `block.getItemStack(1, true)` for these blocks instead.

**Open question — `minecraft:decorated_pot`.** It has the same block-entity
problem and is deliberately *not* fixed. Vanilla drops a pot's sherds rather than
the pot unless mined with silk touch, and this pack mines unenchanted, so reading
the pot's own item could turn a wrong drop into a differently wrong one. None of
these blocks has a data-driven loot table to check against.

- [ ] Blow up a decorated pot and **record what it gives**: `________________`
- [ ] Break one by hand for comparison: `________________`

If hand-breaking gives sherds, leave the pot alone. If it gives the pot with its
sherds intact, add `minecraft:decorated_pot` to `ITEM_DATA_BLOCKS`.

### ☐ T9b — Falling-block ordering (visual QA, non-blocking)
P2 clears blocks in snapshot-array order, not necessarily bottom-to-top the way the engine would.

- [ ] Sand/gravel column standing above the blast — compare fall-cascade timing to baseline
- [ ] Gravel stack over water
- [ ] No double-triggered falling-block entities

Expected to be cosmetic only. If it visibly misbehaves, sort the P2 removal loop by ascending Y.

### ☐ T10 — Multiple simultaneous explosions
Detonate 4 creepers in the same tick. **Lay this out with a shared double chest sitting inside the
overlap of two blast radii**, not in open space.

- [ ] One drain job, not four (debug log shows the queue draining monotonically)
- [ ] All four craters clear in the same tick
- [ ] Loot from all four arrives
- [ ] **The shared double chest's contents drop exactly once** — two explosions in the same tick
      must not both conclude they own the container
- [ ] **Blocks in the overlap between two craters drop exactly once.** Arrange two creepers close
      enough that their blast radii intersect over plain stone, then count: overlapped cobblestone
      must equal the crater's block count, not more. Every before-event in a tick fires before any
      block is actually removed, so both explosions see the shared region intact — the tick-scoped
      `takenBlocks` ledger in `main.js` is what stops the double drop

### ☐ T11 — Chunk boundaries
- [ ] Creeper detonating on a chunk border
- [ ] Creeper at the edge of render distance
- [ ] No `LocationInUnloadedChunkError` escapes to the log; blocks in departed chunks are skipped
      silently and the rest still process

### ☐ T12 — Per-source toggles
- [ ] Each source toggled off reverts to vanilla behavior for that source
- [ ] Ghast fireball path verified on
- [ ] Wither skull path verified on (both skull types)
- [ ] End crystal path verified on

**Before trusting the `minecraft:tnt_minecart` entry in `SOURCE_GROUPS`,** detonate a TNT minecart
with a bare `console.log(source?.typeId)` at the top of `onExplosionBefore` and read what actually
arrives. The minecart may well have been replaced by a primed-TNT-style entity by the time the
event fires, in which case the guard needs the real id.

- [ ] Actual `typeId` reported by a TNT minecart explosion: `________________`

---

## ☐ T13 — Bedrock Dedicated Server smoke test

1. [ ] Fresh BDS on 1.26.30+. **Confirm `config/default/permissions.json` lists
       `@minecraft/server` before anything else** — some hosts and Docker images ship it trimmed,
       and the failure mode is the script never loading with no error at all
2. [ ] Unzip the pack contents into `behavior_packs/CreeperDropAll/`
3. [ ] Add the header UUID to `world_behavior_packs.json`; confirm whether it accepts
       `"version": "1.1.0"` (string, matching manifest v3) or needs `[1, 1, 0]`
       — record which: `________________`
4. [ ] **`[CreeperDropAll] loaded. …` appears in stdout.** If not, stop and revisit step 1
5. [ ] Re-run T2, T3, T4b, T7, T12
6. [ ] Watch stdout for `Script watchdog` warnings during T3 — none, or spike-only with no hang
7. [ ] Confirm achievements remain enabled client-side

---

## Before release

- [ ] Set `DEBUG = false` in `main.js` and rebuild
- [ ] `py -3 scripts/check_repo.py` is clean and
      `py -3 scripts/build_addon.py creeper-drop-all` packages without error
- [ ] Import the built `.mcpack` on a clean world one final time
- [ ] Search the Bedrock Marketplace in-game for "Creeper Drop All" — it has no public search API,
      so this is the one name check that can only be done by hand
