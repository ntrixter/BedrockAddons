# Confirm in game

The tests in `tests/` cover the roll and the text. These are the things only
the game can answer. Each was built on an informed guess, and each one has a
fallback if the guess is wrong. Record the result here, and move anything
settled into `BEDROCK-NOTES.md`.

A test build has `DEBUG` set in `scripts/main.js`, so it prints each spawn and
birth in chat.

| # | Question | Built on | If wrong |
| --- | --- | --- | --- |
| T1 | Does feeding a horse golden carrots fire `afterEvents.playerInteractWithEntity` with the carrot as `beforeItemStack`? | The feed is an interaction with the entity | No parents are ever found; foals keep vanilla stats and the content log says "0 fed parent(s)". Track feeding another way. |
| T2 | Is a bred foal reported by `entitySpawn` with cause `Born`? | `EntityInitializationCause.Born` exists for this | Foals are treated as wild spawns. |
| T3 | Does adding a `horsebreed:*` group override the stat vanilla blended for the foal? | A component group replaces a top-level component of the same name | The debug line "foal now reads" disagrees with the "born" line. Remove `parent_centric_attribute_blending` from the override, or apply the groups a tick later. |
| T4 | Do the stats survive saving and reloading the world? | Component groups and attribute values are saved with the entity | A foal's stats change after reload. |
| T5 | Can a script read jump strength with `getComponent("minecraft:horse.jump_strength")`? | Not in the documented component list, so expected **no** | If yes, old horses' jump can be read too, and the debug line shows a number instead of "unreadable". |
| T6 | Does `minecraft:movement`'s `currentValue` give a horse's base speed, unaffected by being ridden? | It is the attribute's base value | Speed shown for old horses is off. |
| T7 | Does `ItemBookComponent` fill and sign a freshly made `minecraft:written_book`? | Stable since `@minecraft/server` 2.8.0 | No book appears; the content log says "could not write the book". Fill a `writable_book` instead. |
| T8 | Does cancelling `beforeEvents.playerInteractWithEntity` stop a book from mounting a tamed horse? | `cancel` is writable on that event | The player mounts the horse as well as getting the book. |
| T9 | Does `setActionBar` show `\n` as a second line? | Also unverified for `compass-link` | The parents line runs into the stats line. |
| T10 | Is `isOnGround` kept up to date for a horse a player is riding? | It is on the base `Entity` | No `[debug] jump rose` lines appear while riding, and old horses are never measured. Detect take-off and landing from vertical velocity instead. |
| T12 | Does `dataDrivenEntityTrigger` fire `minecraft:on_tame` with the tamer still riding (or `tamedToPlayer` still readable)? | Vanilla `horse.json` runs that event when taming finishes, and taming happens while ridden | The book has no "Tamed by" line and the debug line says "by unknown". Record the owner another way. |
| T13 | Do a written book's dynamic property and lore survive in the inventory? | Non-stackable items can hold dynamic properties | Sneak-click with a horse's own papers does nothing. |
| T14 | Does triggering `horsebreed:set_coat_N` / `set_mark_N` on a newborn foal change how it looks, and does the look stay after reload? | A component group's `minecraft:variant` drives the texture | The foal looks different from its papers. Pick the look a tick later, or leave it to the engine and record "unknown". |
| T15 | Is a mule reported by `entitySpawn` with cause `Born`, and do the `horsebreed:*` groups set its stats? | Same engine path as the horse | Mules show vanilla stats, and no `[debug] born` line appears. |
| T11 | Does a full-charge jump's rise match the Java formula in `jumpBlocks`? | The wiki's fit of strength to height | On a horse the pack set, the debug line's "rose" differs from "predicts" by more than about 0.1. Refit `jumpBlocks` from those pairs. |

Confirmed in game on 2026-10-29: T7 (the book is written and signed) and T10
(ridden jumps are measured).
