#!/usr/bin/env python3
"""Rebuild the horse, donkey and mule overrides from Mojang's vanilla files.

    python3 champion-lines/tools/sync_entities.py               # fetch upstream
    python3 champion-lines/tools/sync_entities.py horse.json …  # local copies, named after the entity

Bedrock has no script call that sets a horse's maximum health or its jump
strength, and none that reads jump strength back. The only way to give a foal
exact stats is a component group per value, added by an event the script
triggers. This writes those groups and events into the vanilla file and
changes nothing else, so a re-sync is: run this, then refresh upstream_sha256
in addon.json with check_vanilla_drift.py --print-hash.

The upstream file is comment-stripped with the same rule check_vanilla_drift
uses, then the generated block is inserted as text at the top of
"component_groups" and of "events". Every vanilla line stays as it was, so a
diff against upstream shows the two inserted blocks and nothing else.

Donkeys and mules get the health groups only: in vanilla their speed and jump
are the same for every animal, so there is nothing to set.

A bred horse foal's coat and markings are chosen by the engine and cannot be read
back by a script (the foal carries no variant component), so the script picks
them itself and triggers one more event per coat and per marking, which add
vanilla's own base_* and markings_* groups.

The value grids must match genes.js (HEALTH_*, SPEED_*, JUMP_*). The script
quantises a stat to the nearest step before triggering its event.

Python 3 standard library only.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ADDON = HERE.parent
REPO_ROOT = ADDON.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from check_vanilla_drift import fetch_upstream, strip_comments  # noqa: E402

ENTITIES = ["horse", "donkey", "mule"]
NS = "horsebreed"

# Vanilla ranges, from horse.json's own components.
HEALTH = range(15, 31)  # whole hit points
SPEED_MIN, SPEED_STEP, SPEED_STEPS = 0.1125, 0.0025, 91  # 0.1125 .. 0.3375
JUMP = range(40, 101)  # hundredths: 0.40 .. 1.00


def speed_value(k: int) -> float:
    return round(SPEED_MIN + k * SPEED_STEP, 4)


def stats(entity: str):
    """(stat, step id, component name, component body) for every step."""
    for hp in HEALTH:
        yield "health", hp, "minecraft:health", {"value": hp, "max": hp}
    if entity != "horse":
        return
    for k in range(SPEED_STEPS):
        yield "speed", k, "minecraft:movement", {"value": speed_value(k)}
    for j in JUMP:
        yield "jump", j, "minecraft:horse.jump_strength", {"value": j / 100}


# Vanilla's own groups, in variant order (genes.js COLORS and MARKINGS).
COATS = ["white", "creamy", "chestnut", "brown", "black", "gray", "darkbrown"]
MARKS = ["none", "white_details", "white_fields", "white_dots", "black_dots"]


def compact(obj) -> str:
    return json.dumps(obj, separators=(", ", ": "))


def block(entries: list[str], indent: str) -> str:
    return "".join(f"{indent}{line},\n" for line in entries)


def insert_after(text: str, anchor: str, insertion: str) -> str:
    at = text.index(anchor)
    at = text.index("\n", at) + 1
    return text[:at] + insertion + text[at:]


def build(entity: str, upstream: str) -> str:
    text = strip_comments(upstream)
    groups, events = [], []
    for stat, step, component, body in stats(entity):
        group = f"{NS}:{stat}_{step}"
        groups.append(f'"{group}": {compact({component: body})}')
        events.append(f'"{NS}:set_{stat}_{step}": {compact({"add": {"component_groups": [group]}})}')
    if entity == "horse":
        for i, coat in enumerate(COATS):
            events.append(f'"{NS}:set_coat_{i}": {compact({"add": {"component_groups": [f"minecraft:base_{coat}"]}})}')
        for i, mark in enumerate(MARKS):
            events.append(f'"{NS}:set_mark_{i}": {compact({"add": {"component_groups": [f"minecraft:markings_{mark}"]}})}')
    text = insert_after(text, '"component_groups": {', block(groups, " " * 6))
    text = insert_after(text, '"events": {', block(events, " " * 6))
    json.loads(text)  # must stay strict JSON
    return text


def main(argv: list[str]) -> int:
    local = {Path(a).stem: Path(a) for a in argv[1:]}
    for entity in ENTITIES:
        path = f"behavior_pack/entities/{entity}.json"
        upstream = local[entity].read_text(encoding="utf-8") if entity in local else fetch_upstream(path)
        out = ADDON / path
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(build(entity, upstream), encoding="utf-8", newline="\n")
        print(f"wrote {out.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
