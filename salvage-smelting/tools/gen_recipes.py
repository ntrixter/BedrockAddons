#!/usr/bin/env python3
"""Generate every furnace recipe in salvage-smelting/behavior_pack/recipes/.

    python3 salvage-smelting/tools/gen_recipes.py           # write
    python3 salvage-smelting/tools/gen_recipes.py --check   # verify, write nothing

There are 75 near-identical recipe files. Hand-editing them is how the pack
ended up shipping five item ids that do not exist, and how the same balance rule
ended up applied inconsistently. The table below is the rule; the files are its
output. Change the table, rerun, commit the diff.

THE RULE
  A salvaged item returns ceil(cost / 2) of its base material, where cost is
  what one of that item costs to craft. Durability is irrelevant -- a furnace
  recipe cannot see it.

  Two exceptions, both deliberate:

  * Items crafted in batches pay in NUGGETS. A rail costs 6 iron for 16 rails,
    0.375 ingots each; rounding half of that up to a whole ingot would return
    2.7x what it cost and make rails an iron duplicator. Powered rails cost
    exactly 1 ingot each, so a whole ingot back is a 100% refund. Paying these
    five in nuggets keeps the same half-the-cost rule without the loop.
  * Items with no crafting recipe at all -- chainmail, saddle -- are fixed by
    hand, because there is no cost to halve.
  * Raw ore blocks are not salvage at all, and do not go through the rule. See
    BULK below.

Every id here was checked against Mojang's own palette
(metadata/vanilladata_modules/mojang-items.json) at 1.26.30, 1.26.40 and
1.26.50, and every cost against the shipped crafting recipe in
bedrock-samples/behavior_pack/recipes/. Do not add an entry from memory.
"""

from __future__ import annotations

import json
import sys
from fractions import Fraction
from pathlib import Path

RECIPES = Path(__file__).resolve().parent.parent / "behavior_pack" / "recipes"

NAMESPACE = "smeltingplus"

# Mojang's own furnace recipes carry this format_version and an "unlock" block.
# Matching them is what keeps these recipes in the furnace recipe book: 32 of
# the files below sit at the same path as a vanilla recipe and therefore replace
# it outright, taking its "unlock" with it unless we supply our own.
FORMAT_VERSION = "1.20.10"

# Deliberately no "priority". Vanilla's gear recipes use 110/130/150, and an
# absent priority is 0, which wins. Today it makes no difference -- a file at
# the same path replaces vanilla's rather than competing with it -- but if
# Mojang ever renames one of those files, ours stops overriding and starts
# competing, and 0 is the value that keeps it working.

TAGS = ["furnace", "blast_furnace"]


def halve(cost: Fraction) -> int:
    """ceil(cost / 2), the whole rule."""
    half = cost / 2
    return -((-half.numerator) // half.denominator)


# --- cost tables -----------------------------------------------------------
#
# Cost is per item, in units of the material it returns, taken from the vanilla
# crafting recipe. Where a recipe yields several items the cost is divided:
# an iron door is 6 ingots for 3 doors, so 2 each.

GEAR_COST = {
    "sword": 2, "shovel": 1, "hoe": 2, "pickaxe": 3, "axe": 3,
    "helmet": 5, "chestplate": 8, "leggings": 7, "boots": 4,
}
ARMOUR = ("helmet", "chestplate", "leggings", "boots")
TOOLS = ("sword", "shovel", "hoe", "pickaxe", "axe")

# family prefix -> (material returned, which pieces exist)
GEAR_FAMILIES = [
    ("iron", "iron_ingot", TOOLS + ARMOUR),
    ("golden", "gold_ingot", TOOLS + ARMOUR),
    ("diamond", "diamond", TOOLS + ARMOUR),
    ("copper", "copper_ingot", TOOLS + ARMOUR),
    ("leather", "leather", ARMOUR),
]

# Netherite is a smithing upgrade, not a craft: one netherite ingot on top of
# the diamond item. Half of 1, rounded up, is 1 -- so every piece returns one
# ingot and the diamond base is lost. Same as it was before the rule changed.
NETHERITE = TOOLS + ARMOUR

FIXED_COST = {
    # iron
    "bucket": (3, "iron_ingot"),
    "shears": (2, "iron_ingot"),
    "iron_door": (Fraction(6, 3), "iron_ingot"),
    "iron_trapdoor": (4, "iron_ingot"),
    "cauldron": (7, "iron_ingot"),
    "compass": (4, "iron_ingot"),
    "hopper": (5, "iron_ingot"),
    "blast_furnace": (5, "iron_ingot"),
    "heavy_weighted_pressure_plate": (2, "iron_ingot"),
    # 1 ingot + 2 nuggets = 11/9 of an ingot. Half of that rounds up to a whole
    # ingot, which is generous but still less than it cost.
    "iron_chain": (Fraction(11, 9), "iron_ingot"),
    # gold
    "clock": (4, "gold_ingot"),
    "light_weighted_pressure_plate": (2, "gold_ingot"),
}

# Crafted in batches, so one item costs a fraction of an ingot and a whole
# ingot back would pay more than it cost. Same half-the-cost rule, counted in
# nuggets: 9 nuggets to the ingot.
BATCH_NUGGETS = {
    "rail": (Fraction(6, 16), "iron_nugget"),
    "iron_bars": (Fraction(6, 16), "iron_nugget"),
    "activator_rail": (Fraction(6, 6), "iron_nugget"),
    "detector_rail": (Fraction(6, 6), "iron_nugget"),
    "golden_rail": (Fraction(6, 6), "gold_nugget"),
}

# No crafting recipe exists, so there is no cost to halve. Set by hand.
NO_RECIPE = {
    "chainmail_helmet": (1, "iron_ingot"),
    "chainmail_chestplate": (1, "iron_ingot"),
    "chainmail_leggings": (1, "iron_ingot"),
    "chainmail_boots": (1, "iron_ingot"),
    # Saddles are not craftable in Bedrock. Three leather is the long-standing
    # community figure for what one is "worth"; half of it, rounded up, is 2.
    "saddle": (2, "leather"),
    # String-strung gear. Bows, crossbows and fishing rods all cost string and
    # sticks; the string is the part worth recovering.
    "bow": (2, "string"),
    "crossbow": (2, "string"),
    "fishing_rod": (2, "string"),
}

# Bulk smelting, which is not salvage and is deliberately outside the rule.
#
# A raw ore block is nine raw ore, and nine raw ore smelt into nine ingots,
# which is one ingot block. So this returns exactly what the long way round
# returns -- no metal is created or destroyed. What it saves is eight fuel and
# eight smelting cycles, turning a 90-second job into a 10-second one.
#
# Vanilla has no furnace recipe for any of the three, so these are additions
# rather than overrides. There is no raw diamond or raw netherite; diamonds drop
# as items and netherite comes from scrap.
BULK = {
    "raw_iron_block": "iron_block",
    "raw_gold_block": "gold_block",
    "raw_copper_block": "copper_block",
}


def build() -> dict[str, tuple[str, int]]:
    """input id (unnamespaced) -> (output id, count)."""
    out: dict[str, tuple[str, int]] = {}

    for prefix, material, pieces in GEAR_FAMILIES:
        for piece in pieces:
            out[f"{prefix}_{piece}"] = (material, halve(Fraction(GEAR_COST[piece])))
    out["copper_spear"] = ("copper_ingot", halve(Fraction(1)))

    for piece in NETHERITE:
        out[f"netherite_{piece}"] = ("netherite_ingot", halve(Fraction(1)))

    for item, (cost, material) in FIXED_COST.items():
        out[item] = (material, halve(Fraction(cost)))

    for item, (cost, material) in BATCH_NUGGETS.items():
        out[item] = (material, halve(Fraction(cost) * 9))

    for item, (count, material) in NO_RECIPE.items():
        out[item] = (material, count)

    for item, block in BULK.items():
        out[item] = (block, 1)

    return out


def recipe_json(item: str, output: str, count: int) -> str:
    doc = {
        "format_version": FORMAT_VERSION,
        "minecraft:recipe_furnace": {
            "description": {"identifier": f"{NAMESPACE}:{item}"},
            "unlock": [{"item": f"minecraft:{item}"}],
            "tags": TAGS,
            "input": f"minecraft:{item}",
            "output": {"item": f"minecraft:{output}", "count": count},
        },
    }
    return json.dumps(doc, indent=2) + "\n"


def main() -> int:
    check = "--check" in sys.argv
    recipes = build()
    wanted = {f"furnace_{item}.json": recipe_json(item, *value) for item, value in recipes.items()}

    RECIPES.mkdir(parents=True, exist_ok=True)
    present = {p.name for p in RECIPES.glob("*.json")}

    problems = []
    for name in sorted(present - set(wanted)):
        problems.append(f"stale file: {name}")
        if not check:
            (RECIPES / name).unlink()

    for name, text in sorted(wanted.items()):
        path = RECIPES / name
        if not path.exists():
            problems.append(f"missing: {name}")
        elif path.read_text(encoding="utf-8") != text:
            problems.append(f"out of date: {name}")
        if not check:
            path.write_text(text, encoding="utf-8")

    if check:
        for line in problems:
            print(line)
        print(f"{len(problems)} problem(s); {len(wanted)} recipes expected")
        return 1 if problems else 0

    print(f"wrote {len(wanted)} recipes to {RECIPES.relative_to(RECIPES.parents[2])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
