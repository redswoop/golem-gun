#!/usr/bin/env python3
"""Generate everything in the packs that isn't hand-written, from the game's files.

    python3 tools/make_pack.py "<version dir>/assets/assets"

The game ships vanilla as stacked packs (vanilla, vanilla_1.14, ... vanilla_1.26.60)
where a later layer replaces a file from an earlier one, so `layered()` reads the
newest copy. Reading only the base `vanilla` pack gives definitions years out of date.

Needs Pillow. Writes (don't hand-edit): behavior_pack/entities, behavior_pack/items,
behavior_pack/scripts/data.js, and in resource_pack: entity, models, render_controllers,
texts, textures.
"""
import copy
import json
import os
import re
import shutil
import struct
import sys

from PIL import Image, ImageDraw

NS = "golemgun"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BP = os.path.join(ROOT, "behavior_pack")
RP = os.path.join(ROOT, "resource_pack")

# The one table for materials: looks, drops, recipes and the tier ladder all come from
# here. Order is what the `mat` property stores, so only ever append. The first 15 are
# LEGACY: mobs painted before 0.8.0 store them in the `material` enum (an enum holds at
# most 16 values, and the head golem's uses one for "iron"), and the client falls back
# to it when `mat` is -1.
#   tier    place on the ladder (docs/farm-tech-plan.md), or None for a wand off the
#           ladder (made from a Wood Wand)
#   drop    the material: what a painted mob drops when it dies, and later what it
#           produces. Raw where there is a raw form, so it still needs smelting.
#   rare    what it rarely drops and produces: a taste of the next tier. An item gets
#           RARE_CHANCE; an [item, chance] list sets each chance.
#   also    other things found where it's found (docs/wand-variety-proposal.md), as
#           [item, chance]. Never a ladder material 2+ tiers up, which would skip a rung.
#   twist   what's special about mobs made of it (scripts/twists.js); just a label here
#   burst   what a painted creeper throws when its blast breaks no blocks (else CRATERS)
#   craft   the items around the wand below that make this wand; "tag:..." for an item tag.
#           A ladder wand is made from the tier below's wand; a wand off the ladder from
#           the ladder wand of `from` (Armen: always the previous tier's wand, never a
#           shortcut from a Wood Wand), wood if unset
#   count   how many `craft` items: 4 (the sides) or 8 (the whole ring); diamond is 8
#   tough   how much of every hit mobs of it shrug off, in hearts' halves (healed back,
#           twists.js). Armen: durability climbs the ladder, so a diamond mob wants a
#           diamond sword. Fists do 1, swords 4 (wood) to 8 (netherite).
#   form    a component group the scripts add after painting (FORMS): "fragile" caps
#           health at FRAGILE_HEALTH whatever the mob (Armen: wood mobs "take ages to
#           kill" by punching), "giant" and "tiny" rescale grown mobs
#   hybrid  the two materials whose painted parents breed this one (Armen, 0.8.0: cross
#           breeds "do something crazy"). No wand makes it, so no `craft` or `wand`.
#   mult    multiplies the material it drops (a giant drops four times as much)
MATERIALS = {
    #            block texture    shading    highlights  wand colors (shaft, tip)
    "copper":   {"block": "copper_block", "name": "Copper", "shade": (0.55, 1.5), "lift": 0.0,
                 "wand": ((120, 70, 40), (235, 140, 90)),
                 "drop": "raw_copper", "burst": "copper_ore", "craft": "copper_ingot", "tier": None, "rare": None,
                 "also": [["coal", 0.1], ["pointed_dripstone", 0.05], ["clay_ball", 0.05], ["raw_iron", 0.03]]},
    "obsidian": {"block": "obsidian", "name": "Obsidian", "shade": (0.6, 1.5), "lift": 0.75,
                 "wand": ((30, 20, 50), (130, 80, 200)),
                 "drop": "obsidian", "burst": "obsidian", "craft": "obsidian", "tier": None, "rare": None, "from": "diamond",
                 "also": [["gold_nugget", 0.1], ["crying_obsidian", 0.05], ["flint", 0.05]]},
    "gold":     {"block": "gold_block", "name": "Gold", "shade": (0.5, 1.25), "lift": 0.0,
                 "wand": ((150, 110, 30), (250, 215, 70)),
                 "drop": "raw_gold", "burst": "gold_ore", "craft": "gold_ingot", "tier": 4, "rare": "diamond", "tough": 1,
                 "also": [["redstone", 0.1], ["lapis_lazuli", 0.1], ["amethyst_shard", 0.05], ["raw_iron", 0.05]]},
    "quartz":   {"block": "quartz_block_side", "name": "Quartz", "shade": (0.45, 1.05), "lift": 0.0,
                 "wand": ((170, 160, 150), (240, 235, 228)),
                 "drop": "quartz", "burst": "quartz_ore", "craft": "quartz", "tier": None, "rare": None, "from": "gold",
                 "also": [["gold_nugget", 0.1], ["glowstone_dust", 0.05], ["magma_cream", 0.03]]},
    "emerald":  {"block": "emerald_block", "name": "Emerald", "shade": (0.5, 1.3), "lift": 0.0,
                 "wand": ((20, 110, 60), (60, 225, 120)),
                 "drop": "emerald", "burst": "emerald_ore", "craft": "emerald", "tier": None, "rare": None, "from": "iron",
                 "also": [["raw_iron", 0.1], ["coal", 0.1], ["snowball", 0.1]]},
    "diamond":  {"block": "diamond_block", "name": "Diamond", "shade": (0.5, 1.2), "lift": 0.0,
                 "wand": ((50, 140, 150), (120, 235, 225)),
                 "drop": "diamond", "burst": "diamond_ore", "craft": "diamond", "count": 8, "tier": 5, "rare": "netherite_scrap", "tough": 3,
                 "also": [["redstone", 0.1], ["lapis_lazuli", 0.1], ["raw_gold", 0.05], ["obsidian", 0.05], ["amethyst_shard", 0.05]]},
    "lapis":    {"block": "lapis_block", "name": "Lapis", "shade": (0.55, 1.4), "lift": 0.0,
                 "wand": ((25, 45, 120), (70, 110, 220)),
                 "drop": "lapis_lazuli", "burst": "lapis_ore", "craft": "lapis_lazuli", "tier": None, "rare": None, "from": "iron",
                 "also": [["redstone", 0.1], ["raw_iron", 0.05], ["amethyst_shard", 0.03]]},
    # The Wood Wand is the free one, the first rung, and the blank off-ladder wands start from.
    "wood":     {"block": "planks_oak", "name": "Wood", "shade": (0.55, 1.4), "lift": 0.0,
                 "wand": ((90, 60, 30), (180, 140, 85)),
                 "drop": "oak_log", "burst": "oak_log", "craft": None, "tier": 1, "rare": "cobblestone", "form": "fragile",
                 "also": [["apple", 0.1], ["stick", 0.1], ["oak_sapling", 0.05], ["sugar_cane", 0.05], ["honeycomb", 0.03]]},
    # Off the ladder since 0.7.0 (Armen: "coal to get diamonds is dumb, because you can
    # just mine some coal"). It still sits at gold's depth, so it's made from a Gold Wand.
    "coal":     {"block": "coal_block", "name": "Coal", "shade": (0.6, 1.6), "lift": 0.5,
                 "wand": ((40, 40, 40), (90, 90, 95)),
                 "drop": "coal", "burst": "coal_ore", "craft": "coal", "tier": None, "rare": None, "from": "gold",
                 "also": [["raw_copper", 0.1], ["flint", 0.1], ["raw_iron", 0.05], ["gunpowder", 0.03]]},
    # Crafted like stone tools, from cobblestone, cobbled deepslate or blackstone. Drops
    # cobblestone, which smelts back into stone.
    "stone":    {"block": "stone", "name": "Stone", "shade": (0.5, 1.4), "lift": 0.0,
                 "wand": ((95, 95, 95), (150, 150, 150)),
                 "drop": "cobblestone", "burst": "cobblestone", "craft": "tag:minecraft:stone_tool_materials",
                 # Coal ore sits in stone, so stone mobs turn up coal too.
                 "tier": 2, "rare": [["raw_iron", 0.1], ["coal", 0.2]],
                 "also": [["raw_copper", 0.1], ["flint", 0.1], ["slime_ball", 0.03]]},
    # An iron golem keeps its own sheet: it already is iron.
    "iron":     {"block": "iron_block", "name": "Iron", "shade": (0.4, 1.0), "lift": 0.0,
                 "wand": ((120, 120, 125), (215, 215, 220)),
                 "drop": "raw_iron", "burst": "iron_ore", "craft": "iron_ingot", "tier": 3, "rare": "raw_gold", "tough": 1,
                 "also": [["raw_copper", 0.1], ["redstone", 0.1], ["lapis_lazuli", 0.05], ["emerald", 0.02]]},
    # The top of the ladder. A creeper throws ancient debris, which smelts into scrap.
    "netherite": {"block": "netherite_block", "name": "Netherite", "shade": (0.6, 1.5), "lift": 0.5,
                  "wand": ((50, 40, 45), (100, 85, 90)),
                  "drop": "netherite_scrap", "burst": "ancient_debris", "craft": "netherite_scrap", "tier": 6, "rare": None, "tough": 4,
                  "also": [["quartz", 0.1], ["gold_nugget", 0.1], ["glowstone_dust", 0.05], ["magma_cream", 0.05], ["crying_obsidian", 0.02]]},
    # Themed wands, off the ladder, each with a twist (scripts/twists.js).
    "slime":    {"block": "slime", "name": "Slime", "shade": (0.55, 1.4), "lift": 0.0,
                 "wand": ((60, 120, 50), (120, 210, 90)), "twist": "boing: hops, no fall damage",
                 "drop": "slime_ball", "burst": "slime", "craft": "slime_ball", "tier": None, "rare": None, "also": []},
    "tnt":      {"block": "tnt_side", "name": "TNT", "shade": (0.5, 1.3), "lift": 0.0,
                 "wand": ((140, 30, 25), (230, 60, 50)), "twist": "kaboom: dies with a harmless bang that flings what it leaves",
                 "drop": "gunpowder", "burst": "tnt", "craft": "tnt", "tier": None, "rare": None,
                 "also": [["sand", 0.1], ["tnt", 0.03]]},
    "honey":    {"block": "honeycomb", "name": "Honey", "shade": (0.5, 1.3), "lift": 0.0,
                 "wand": ((160, 100, 20), (245, 180, 40)), "twist": "sticky: slow, and slows whoever hits it",
                 "drop": "honeycomb", "burst": "honeycomb_block", "craft": "honeycomb", "tier": None, "rare": None,
                 "also": [["honey_bottle", 0.1]]},
    # --- hybrids: only breeding makes these (0.8.0). Everything above is LEGACY. ---
    "clay":     {"block": "clay", "name": "Clay", "shade": (0.55, 1.35), "lift": 0.0, "hybrid": ("wood", "stone"),
                 "twist": "squishy: a hit flings it", "drop": "clay_ball", "burst": "clay", "craft": None, "tier": None,
                 "rare": [["brick", 0.1]], "also": []},
    "aquamarine": {"block": "prismarine_bricks", "name": "Aquamarine", "shade": (0.55, 1.35), "lift": 0.1, "hybrid": ("stone", "diamond"),
                   "twist": "sea: swimmers near it breathe water", "drop": "prismarine_shard", "burst": "prismarine_bricks", "craft": None,
                   "tier": None, "rare": [["prismarine_crystals", 0.1], ["nautilus_shell", 0.01]], "also": []},
    "steel":    {"block": "iron_block", "name": "Steel", "shade": (0.3, 0.85), "lift": 0.0, "hybrid": ("iron", "coal"),
                 "twist": "forged: drops ingots, no smelting, tough as diamond", "drop": "iron_ingot", "burst": "iron_block", "craft": None,
                 "tier": None, "rare": [["raw_gold", 0.05]], "also": [], "tough": 3},
    "amethyst": {"block": "amethyst_block", "name": "Amethyst", "shade": (0.55, 1.35), "lift": 0.2, "hybrid": ("gold", "diamond"),
                 "twist": "chime: rings when hit", "drop": "amethyst_shard", "burst": "amethyst_block", "craft": None,
                 "tier": None, "rare": [["lapis_lazuli", 0.05]], "also": []},
    "cake":     {"block": "cake_side", "name": "Cake", "shade": (0.6, 1.3), "lift": 0.0, "hybrid": ("wood", "honey"),
                 "twist": "party: goes off like a party popper", "drop": "cake", "burst": "cake", "craft": None,
                 "tier": None, "rare": [["cookie", 0.1]], "also": []},
    "moss":     {"block": "moss_block", "name": "Moss", "shade": (0.55, 1.35), "lift": 0.0, "hybrid": ("wood", "slime"),
                 "twist": "mossy: mosses the ground it walks on", "drop": "moss_block", "burst": "moss_block", "craft": None,
                 "tier": None, "rare": [["moss_carpet", 0.1], ["azalea", 0.05]], "also": []},
    "boulder":  {"block": "cobblestone", "name": "Boulder", "shade": (0.5, 1.4), "lift": 0.0, "hybrid": ("stone", "obsidian"),
                 "twist": "giant: twice the size, four times the health and the drops", "drop": "cobblestone", "burst": "cobblestone",
                 "craft": None, "tier": None, "rare": [["obsidian", 0.1]], "also": [], "form": "giant", "tough": 2, "mult": 4},
    "pygmy":    {"block": "diamond_block", "name": "Pygmy", "shade": (0.6, 1.3), "lift": 0.3, "hybrid": ("diamond", "honey"),
                 "twist": "tiny: baby-sized for good, and quick", "drop": "diamond", "burst": "honeycomb_block", "craft": None,
                 "tier": None, "rare": None, "also": [["honeycomb", 0.1]], "form": "tiny"},
    "ember":    {"block": "magma", "name": "Ember", "shade": (0.6, 1.4), "lift": 0.3, "hybrid": ("coal", "tnt"),
                 "twist": "ember: burns whoever hits it, and goes off with a bang", "drop": "coal", "burst": "magma", "craft": None,
                 "tier": None, "rare": [["gunpowder", 0.2], ["blaze_powder", 0.05]], "also": []},
    "gum":      {"block": "wool_colored_pink", "name": "Gum", "shade": (0.6, 1.3), "lift": 0.0, "hybrid": ("slime", "honey"),
                 "twist": "gum: bouncy, sticky, and whoever hits it gets stuck", "drop": "slime_ball", "burst": "pink_wool", "craft": None,
                 "tier": None, "rare": [["honeycomb", 0.1], ["sugar", 0.1]], "also": []},
}
# The materials the `material` enum holds: the first 15, in order, and never any more.
LEGACY = ["copper", "obsidian", "gold", "quartz", "emerald", "diamond", "lapis", "wood", "coal", "stone", "iron",
          "netherite", "slime", "tnt", "honey"]
HYBRIDS = {frozenset(m["hybrid"]): n for n, m in MATERIALS.items() if m.get("hybrid")}
WANDS = [n for n, m in MATERIALS.items() if not m.get("hybrid")]
FORMS = {n: m["form"] for n, m in MATERIALS.items() if m.get("form")}
# What each form does, as a component group the scripts add by event (golemgun:<form>).
FORM_GROUPS = {
    "fragile": {"minecraft:health": {"value": 4, "max": 4}},
    "giant": {"minecraft:scale": {"value": 2.0}, "minecraft:health": {"value": 40, "max": 40}, "minecraft:movement": {"value": 0.18}},
    "tiny": {"minecraft:scale": {"value": 0.4}, "minecraft:movement": {"value": 0.4}},
}
RARE_CHANCE = 0.1

# What a painted creeper's crater turns into (drops.js): every block left lining the hole
# becomes `host`, the material itself, and 1-2 of them (`count`) `ore`, a taste of the
# next tier up the ladder (Armen, 0.7.0: "make *all* of the blocks into its elemental
# type, but leave behind one or two of the next tier"). The ore still needs the right
# pickaxe to mine.
CRATERS = {
    "copper":    {"host": "copper_ore"},
    "obsidian":  {"host": "obsidian"},
    "gold":      {"host": "gold_ore", "ore": "diamond_ore", "count": [1, 2]},
    "quartz":    {"host": "quartz_ore"},
    "emerald":   {"host": "emerald_ore"},
    "diamond":   {"host": "diamond_ore", "ore": "ancient_debris", "count": [1, 2]},
    "lapis":     {"host": "lapis_ore"},
    "wood":      {"host": "oak_log", "ore": "cobblestone", "count": [1, 2]},
    "coal":      {"host": "coal_ore"},
    "stone":     {"host": "stone", "ore": "iron_ore", "count": [1, 2]},
    "iron":      {"host": "iron_ore", "ore": "gold_ore", "count": [1, 2]},
    "netherite": {"host": "ancient_debris"},
    "slime":     {"host": "slime"},
    "tnt":       {"host": "sand", "ore": "tnt", "share": 0.15},
    "honey":     {"host": "honey_block"},
    # Hybrids: creepers don't breed, so only the debug tools make these.
    "clay": {"host": "clay"}, "aquamarine": {"host": "prismarine_bricks"}, "steel": {"host": "iron_block"},
    "amethyst": {"host": "amethyst_block"}, "cake": {"host": "cake"}, "moss": {"host": "moss_block"},
    "boulder": {"host": "cobblestone"}, "pygmy": {"host": "honeycomb_block"}, "ember": {"host": "magma"}, "gum": {"host": "pink_wool"},
}
LADDER =sorted((n for n, m in MATERIALS.items() if m["tier"]), key=lambda n: MATERIALS[n]["tier"])


def check_pacing():
    """Diamonds and netherite only come from the ladder's own drops (gold and diamond mobs'
    rares, netherite mobs). Anything else handing them out would skip the top rungs."""
    allowed = {"diamond": {"gold", "diamond", "pygmy"}, "netherite_scrap": {"diamond", "netherite"}}
    for n, m in MATERIALS.items():
        items = [m["drop"]] + [i for i, _ in rares(m["rare"])] + [i for i, _ in rares(m.get("also"))]
        for item, ok in allowed.items():
            if f"minecraft:{item}" in items and n not in ok:
                sys.exit(f"{n} mobs would drop {item}")
    for mob, spec in MOBS.items():
        for item, _ in rares(spec.get("habitat")):
            if item.split(":")[1] in allowed:
                sys.exit(f"{mob} would drop {item}")
    if set(CRATERS) != set(MATERIALS):
        sys.exit(f"CRATERS and MATERIALS list different materials: {set(CRATERS) ^ set(MATERIALS)}")
    crater_ok = {"diamond_ore": {"gold", "diamond"}, "deepslate_diamond_ore": {"gold", "diamond"}, "ancient_debris": {"diamond", "netherite"}}
    for n, m in MATERIALS.items():
        if m["tier"] and "from" in m:
            sys.exit(f"{n} is on the ladder, so `from` is ignored")
        if m.get("from") and MATERIALS[m["from"]]["tier"] is None:
            sys.exit(f"{n} is made from {m['from']}, which isn't a ladder wand")
        if m.get("hybrid") and (m.get("craft") or m.get("wand") or m.get("tier")):
            sys.exit(f"{n} is a hybrid, so it has no wand")
        for parent in m.get("hybrid", ()):
            if parent not in MATERIALS or MATERIALS[parent].get("hybrid"):
                sys.exit(f"{n}: parent {parent} isn't a wand material")
        if m.get("form") and m["form"] not in FORM_GROUPS:
            sys.exit(f"{n}: no form {m['form']}")
    if list(MATERIALS)[:len(LEGACY)] != LEGACY:
        sys.exit("the first 15 materials must stay LEGACY, in order: worlds store them in the enum")
    if len(MATERIALS) > 256:
        sys.exit("MATERIALS is full: the mat property holds 256 values")
    pairs = [frozenset(m["hybrid"]) for m in MATERIALS.values() if m.get("hybrid")]
    if len(pairs) != len(set(pairs)):
        sys.exit("two hybrids share the same parents")
    for n, c in CRATERS.items():
        for block in (c["host"], c.get("ore")):
            if block in crater_ok and n not in crater_ok[block]:
                sys.exit(f"{n} creepers would line their crater with {block}")


def check_blocks(assets):
    """Every block a crater uses exists in the game."""
    known = set()
    for d in layers(assets, "resource_packs"):
        p = f"{assets}/resource_packs/{d}/blocks.json"
        if os.path.exists(p):
            with open(p) as f:   # comments here also trail lines
                known |= set(json.loads(re.sub(r"//.*", "", f.read())))
    for n, c in CRATERS.items():
        for block in (c["host"], c.get("ore")):
            if block and block not in known:
                sys.exit(f"{n} crater: no block {block} in the game")


IRON_DROP = "raw_iron"
# The head golem's material list starts with "iron", from before there was an Iron Wand:
# an iron body with the mob's head in its own colours. Worlds store it, so the Iron
# Wand's all-iron head golem is this value instead.
IRON_PAINTED = "iron_painted"
GOLEM_LOOT = f"loot_tables/{NS}/golem.json"   # an iron golem's poppies, without the iron

# Mobs the wands paint and the Golem Rod takes a head from. Only ever append: the `head`
# property stores the index.
#   adult, baby     the sheets to paint (baby None for mobs without babies)
#   head            the models holding the head's cubes; head_bones picks bones by hand
#   adult_event     spawns a grown one; baby_event a baby (default minecraft:entity_born)
#   spawned         replaces entity_spawned so a painted mob never rolls a random age or a
#                   rider; None keeps the vanilla one
#   climate         a climate property to carry over
#   worn            state a swap has to put back: {component: event that restores it}
#   alpha_mask      the sheet uses alpha as a dye mask, so a head golem draws it solid
#   glow            see-through pixels are glowing eyes, and aren't painted
#   nose_hangs      the head, not the nose under it, sits on the golem's neck
#   habitat         things from where this mob lives, as [item, chance]: dropped alongside
#                   its material (drowned bring up kelp, husks sand)
#   pops            a monster with a baby form that bursts into material when killed,
#                   instead of splitting into babies (4 baby zombies fight back)
#   keep            vanilla layers drawn as they are: {"textures": [...], "controllers": [...]}
FARM = {"adult_event": "minecraft:spawn_adult", "spawned": {"trigger": "minecraft:spawn_adult"}, "climate": True}
ZOMBIE = {"adult_event": "minecraft:as_adult", "baby_event": "minecraft:as_baby",
          "spawned": {"trigger": "minecraft:as_adult"}, "pops": True}
PIGLIN = {"adult_event": "spawn_adult", "baby_event": "spawn_baby", "spawned": {"trigger": "spawn_adult"},
          "habitat": [["gold_nugget", 0.05], ["quartz", 0.05]], "pops": True}
# Glowing eyes are the see-through pixels of these sheets: they keep their own colour.
GLOW = {"glow": True, "alpha_mask": True}
SPIDER = {"spawned": {"add": {"component_groups": ["minecraft:spider_neutral"]}}}
MOBS = {
    "cow": {**FARM, "adult": ("textures/entity/cow", "cow_v2.png"), "baby": ("textures/entity/cow", "cow_temperate_baby.png"),
            "head": ["geometry.cow.v2"]},
    "chicken": {**FARM, "adult": ("textures/entity/chicken", "chicken.png"),
                "baby": ("textures/entity/chicken", "chicken_temperate_baby.png"), "head": ["geometry.chicken.v1.12"]},
    "sheep": {"adult_event": "spawn_adult", "spawned": {"trigger": "spawn_adult"},
              "adult": ("textures/entity/sheep", "sheep.tga"), "baby": ("textures/entity/sheep", "sheep_baby.tga"),
              "head": ["geometry.sheep.sheared.v1.8", "geometry.sheep.v1.8"],
              "geometry": "query.is_baby ? Geometry.baby : Array.geos[query.is_sheared]",
              "geometries": ["Geometry.default", "Geometry.sheared"],
              "worn": {"minecraft:is_sheared": "minecraft:on_sheared"}, "alpha_mask": True},
    "pig": {**FARM, "adult": ("textures/entity/pig", "pig_v3.png"), "baby": ("textures/entity/pig", "pig_temperate_baby.png"),
            "head": ["geometry.pig.v3"], "keep": {"textures": ["saddle"], "controllers": ["controller.render.saddle"]},
            "worn": {"minecraft:is_saddled": "minecraft:on_saddled"}},
    "fox": {"spawned": {"add": {"component_groups": ["minecraft:fox_adult", "minecraft:docile_fox", "minecraft:fox_red"]}},
            "adult": ("textures/entity/fox", "fox.png"), "baby": ("textures/entity/fox", "fox_baby.png"),
            "head": ["geometry.fox"], "alpha_mask": True, "habitat": [["sweet_berries", 0.05]]},
    "wolf": {"adult_event": "minecraft:spawn_wild_adult", "spawned": {"trigger": "minecraft:spawn_wild_adult"},
             "adult": ("textures/entity/wolf", "wolf.png"), "baby": ("textures/entity/wolf", "wolf_baby.png"),
             "head": ["geometry.wolf"], "alpha_mask": True},
    # Monsters from here on. Painted ones never despawn and never turn into another mob.
    "zombie": {**ZOMBIE, "adult": ("textures/entity/zombie", "zombie.png"), "baby": ("textures/entity/zombie", "zombie_baby.png"),
               "head": ["geometry.zombie.v1.8"]},
    "husk": {**ZOMBIE, "adult": ("textures/entity/zombie", "husk.png"), "baby": ("textures/entity/zombie", "husk_baby.png"),
             "head": ["geometry.zombie.husk.v1.8"], "habitat": [["sand", 0.05], ["cactus", 0.05]]},
    "drowned": {**ZOMBIE, "adult": ("textures/entity/zombie", "drowned.tga"), "baby": ("textures/entity/zombie", "drowned_baby.tga"),
                "head": ["geometry.zombie.drowned.v1.16"],
                "habitat": [["kelp", 0.05], ["prismarine_shard", 0.05], ["nautilus_shell", 0.01]]},
    "skeleton": {"adult": ("textures/entity/skeleton", "skeleton.png"), "head": ["geometry.skeleton.v1.8"]},
    "stray": {"adult": ("textures/entity/skeleton", "stray.png"), "head": ["geometry.skeleton.stray.v1.8"],
              "keep": {"textures": ["overlay"], "controllers": ["controller.render.stray_clothes"]},
              "habitat": [["snowball", 0.05], ["ice", 0.05]]},
    "bogged": {"adult": ("textures/entity/skeleton", "bogged.png"), "head": ["geometry.skeleton.bogged"],
               "keep": {"textures": ["overlay"], "controllers": ["controller.render.bogged_clothes"]},
               "worn": {"minecraft:is_sheared": "be_sheared"}, "habitat": [["slime_ball", 0.05], ["red_mushroom", 0.05]]},
    "creeper": {"adult": ("textures/entity/creeper", "creeper.png"), "head": ["geometry.creeper.v1.8"],
                "keep": {"textures": ["charged"], "controllers": ["controller.render.creeper_armor"]},
                "worn": {"minecraft:is_charged": "minecraft:become_charged"}},
    "spider": {**SPIDER, "adult": ("textures/entity/spider", "spider.tga"), "head": ["geometry.spider.v1.8"], **GLOW},
    "cave_spider": {**SPIDER, "name": "Cave Spider", "adult": ("textures/entity/spider", "cave_spider.tga"),
                    "head": ["geometry.spider.v1.8"], **GLOW},
    # The enderman's face is its `hat` bone; its `head` is the jaw, drawn far below it.
    "enderman": {"adult": ("textures/entity/enderman", "enderman.tga"), "head": ["geometry.enderman.v1.8"],
                 "head_bones": ["hat"], **GLOW, "habitat": [["chorus_fruit", 0.03]]},
    "witch": {"adult": ("textures/entity", "witch.png"), "head": ["geometry.villager.witch.v1.8"]},
    "pillager": {"adult": ("textures/entity", "pillager.png"), "head": ["geometry.pillager"], "nose_hangs": True},
    "vindicator": {"adult": ("textures/entity", "vindicator.png"), "head": ["geometry.vindicator.v1.8"], "nose_hangs": True},
    "piglin": {**PIGLIN, "adult": ("textures/entity/piglin", "piglin.png"), "baby": ("textures/entity/piglin", "piglin_baby.png"),
               "head": ["geometry.piglin"]},
    "zombie_pigman": {**PIGLIN, "name": "Zombified Piglin", "adult": ("textures/entity/piglin", "zombie_piglin.png"),
                      "baby": ("textures/entity/piglin", "zombie_piglin_baby.png"), "head": ["geometry.piglin"]},
}
HEADS = list(MOBS)

GOLEM_NECK_Y = 33.0      # top of the golem's body, where a head sits
GOLEM_HEAD_Z = -3.5      # middle of the golem's own head, front to back
GOLEM_TEX = (128, 128)
HEAD_ROW = 128           # head textures are stacked under the golem texture
ATLAS = (128, 256)


# --- reading the game's files ------------------------------------------------

def brarchive(path):
    """8-byte magic, u32 count, u32 version, count * (u8 len, 247-byte name, u32 off, u32 size), data"""
    b = open(path, "rb").read()
    n, = struct.unpack_from("<I", b, 8)
    base = 16 + n * 256
    for i in range(n):
        e = 16 + i * 256
        name = b[e + 1:e + 1 + b[e]].decode()
        off, size = struct.unpack_from("<II", b, e + 248)
        yield name, b[base + off:base + off + size]


def layers(assets, kind):
    def ver(d):
        m = re.fullmatch(r"vanilla(?:_([\d.]+))?", d)
        return tuple(int(x) for x in (m.group(1) or "0").split(".")) if m else None
    return sorted((d for d in os.listdir(f"{assets}/{kind}") if ver(d) is not None), key=ver)


def layered(assets, kind, archive, name):
    """The newest copy of a file. Archive `rel` is relative to the pack, e.g. textures/entity/cow."""
    found = None
    for d in layers(assets, kind):
        p = f"{assets}/{kind}/{d}/__brarchive/{archive}.brarchive"
        if os.path.exists(p):
            for n, data in brarchive(p):
                if n == name:
                    found = data
    if found is None:
        sys.exit(f"not in the game's files: {kind} {archive} {name}")
    return found


def json_of(data):
    return json.loads(re.sub(r"(?m)^\s*//.*$", "", data.decode()))


def vanilla_geometries(assets):
    """Every model in the game by id, newest layer winning. Old files key them by id, and
    `geometry.a:geometry.b` means a starts from b's bones (the witch's head is the
    villager's). Newer files list them under minecraft:geometry."""
    found, parents = {}, {}
    for d in layers(assets, "resource_packs"):
        for archive in ("models", "models/entity"):
            p = f"{assets}/resource_packs/{d}/__brarchive/{archive}.brarchive"
            if not os.path.exists(p):
                continue
            for name, data in brarchive(p):
                if not name.endswith(".json"):
                    continue
                j = json_of(data)
                for g in j.get("minecraft:geometry", []):
                    found[g["description"]["identifier"]] = g
                    parents.pop(g["description"]["identifier"], None)
                for k, v in j.items():
                    if k.startswith("geometry."):
                        own, _, parent = k.partition(":")
                        found[own] = v
                        if parent:
                            parents[own] = parent
                        else:
                            parents.pop(own, None)

    def resolve(geo_id):
        g = found[geo_id]
        parent = parents.pop(geo_id, None)
        if parent and parent in found:
            base = resolve(parent)
            own = {b["name"]: b for b in g.get("bones", [])}
            g = {**base, **g, "bones": [own.pop(b["name"], b) for b in base.get("bones", [])] + list(own.values())}
            found[geo_id] = g
        return g
    for geo_id in list(parents):
        if geo_id in parents:
            resolve(geo_id)
    return found


def vanilla_controllers(assets):
    found = {}
    for d in layers(assets, "resource_packs"):
        p = f"{assets}/resource_packs/{d}/__brarchive/render_controllers.brarchive"
        if os.path.exists(p):
            for _, data in brarchive(p):
                found.update(json_of(data).get("render_controllers", {}))
    return found


# --- writing -----------------------------------------------------------------

def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def fresh(path):
    shutil.rmtree(path, ignore_errors=True)
    os.makedirs(path)


# --- textures ----------------------------------------------------------------

def png(data):
    import io
    return Image.open(io.BytesIO(data)).convert("RGBA")


def has_paint(pixel):
    """Some sheets, like the sheep's, use alpha as a dye mask, so a pixel with no alpha can
    still be bare skin that the game draws solid. Only a black one is really empty."""
    return pixel[3] > 0 or pixel[:3] != (0, 0, 0)


def make_material(src, tile, m, glow=False):
    """Repaint a mob's texture in a block's texture, keeping the mob's own light and dark
    so eyes and markings still read. The block tiles across the sheet at its normal size."""
    w, h = src.size
    s, t = src.load(), tile.load()
    tw, th = tile.size
    lum = [0.3 * s[x, y][0] + 0.59 * s[x, y][1] + 0.11 * s[x, y][2]
           for y in range(h) for x in range(w) if has_paint(s[x, y])]
    mean = sum(lum) / len(lum) or 1
    lo, hi = m["shade"]
    out = Image.new("RGBA", (w, h))
    o = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = s[x, y]
            if not has_paint(s[x, y]):
                continue
            if glow and a < 255:
                o[x, y] = s[x, y]
                continue
            l = 0.3 * r + 0.59 * g + 0.11 * b
            shade = max(lo, min(hi, l / mean))
            lift = max(0, l - mean) * m["lift"]
            br, bg, bb, _ = t[x % tw, y % th]
            o[x, y] = (min(255, int(br * shade + lift)), min(255, int(bg * shade + lift)),
                       min(255, int(bb * shade + lift)), a)
    return out


def atlas(golem, head, alpha_mask):
    """Golem sheet on top, the head mob's sheet underneath (see HEAD_ROW)."""
    out = Image.new("RGBA", ATLAS)
    out.paste(golem, (0, 0))
    if not alpha_mask:   # real see-through parts, like a zombie's hat layer
        out.paste(head, (0, HEAD_ROW))
        return out
    # The golem's material would cut out the low alpha that some sheets use as a dye mask.
    solid = head.copy()
    px = solid.load()
    for y in range(solid.height):
        for x in range(solid.width):
            if has_paint(px[x, y]):
                px[x, y] = px[x, y][:3] + (255,)
    out.paste(solid, (0, HEAD_ROW))
    return out


def wand_icon(shaft, tip):
    im = Image.new("RGBA", (16, 16))
    d = ImageDraw.Draw(im)
    d.line((3, 13, 10, 6), fill=shaft + (255,), width=2)
    d.rectangle((10, 3, 13, 6), fill=tip + (255,))
    d.point((11, 4), fill=(255, 255, 255, 255))
    return im


def rod_icon():
    im = Image.new("RGBA", (16, 16))
    d = ImageDraw.Draw(im)
    d.line((3, 13, 9, 7), fill=(170, 170, 175, 255), width=2)
    d.rectangle((8, 2, 13, 7), fill=(205, 205, 210, 255))
    d.point([(9, 4), (12, 4)], fill=(160, 20, 20, 255))
    return im


def debug_icon():
    im = Image.new("RGBA", (16, 16))
    d = ImageDraw.Draw(im)
    d.line((3, 13, 11, 5), fill=(60, 60, 60, 255), width=2)
    d.rectangle((10, 2, 13, 5), fill=(255, 220, 60, 255))
    return im


# --- behavior ----------------------------------------------------------------

# The game's own entity files store some filter fields as numbers ("subject": 1,
# "operator": 0, "AND"), which an add-on may not be read the same way: a golem whose
# attack-on-sight filter doesn't parse only fights back. These are the add-on spellings.
FILTER_WORDS = {"subject": {0: "self", 1: "other"}, "operator": {0: "==", 1: "!="}}
DIFFICULTY = {0: "peaceful", 1: "easy", 2: "normal", 3: "hard"}
FILTER_GROUPS = {"AND": "all_of", "OR": "any_of"}


def text_filters(o):
    """Rewrite numeric filter fields in place, failing on any number it can't name."""
    if isinstance(o, list):
        for v in o:
            text_filters(v)
        return o
    if not isinstance(o, dict):
        return o
    for old, new in FILTER_GROUPS.items():
        if old in o:
            o[new] = o.pop(old)
    if "test" in o:
        for key, words in FILTER_WORDS.items():
            v = o.get(key)
            if isinstance(v, int) and not isinstance(v, bool):
                if v not in words:
                    sys.exit(f"filter {o}: don't know {key} {v}")
                o[key] = words[v]
        if o["test"] == "is_difficulty" and isinstance(o.get("value"), int):
            o["value"] = DIFFICULTY[o["value"]]
    for v in o.values():
        text_filters(v)
    return o


def head_values(names):
    return ["iron"] + [IRON_PAINTED if n == "iron" else n for n in names]


def material_property(values, default):
    return {"type": "enum", "values": values, "default": default, "client_sync": True}


# Index into MATERIALS, or -1 for a mob painted before 0.8.0 (read the enum instead).
MAT_PROPERTY = {"type": "int", "range": [-1, 255], "default": -1, "client_sync": True}


def material_properties(legacy_values, legacy_default):
    return {f"{NS}:material": material_property(legacy_values, legacy_default), f"{NS}:mat": MAT_PROPERTY}


def make_mob(assets, name, spec):
    d = json_of(layered(assets, "behavior_packs", "entities", f"{name}.json"))
    e = d["minecraft:entity"]
    desc = e["description"]
    identifier = f"{NS}:{name}"
    desc.update({"identifier": identifier, "runtime_identifier": f"minecraft:{name}",
                 "is_spawnable": False, "is_summonable": True})
    desc.setdefault("properties", {}).update(material_properties(LEGACY, LEGACY[0]))
    groups = list(e["component_groups"].values())
    breeds = bool(spec.get("baby")) and not spec.get("pops")
    for group in [e["components"]] + groups:
        # Never despawn someone's creation, and never turn it into a plain mob (a zombie
        # into a drowned, a skeleton into a stray), which would lose the paint.
        group.pop("minecraft:despawn", None)
        group.pop("minecraft:transformation", None)
        # No egg laying: chickens will lay their material from the script instead.
        group.pop("minecraft:spawn_entity", None)
        if breeds:
            # Farm animals breed with their own painted kind (0.8.0; sterile before). The
            # baby's material is set by the script (breeding.js): a parent's, or a hybrid.
            if "minecraft:breedable" in group:
                group["minecraft:breedable"]["breeds_with"] = {
                    "mate_type": identifier, "baby_type": identifier,
                    "breed_event": {"event": "minecraft:entity_born", "target": "baby"}}
        else:
            for key in ("minecraft:breedable", "minecraft:behavior.breed"):
                group.pop(key, None)
    e["components"]["minecraft:persistent"] = {}
    add_forms(e)
    if spec.get("baby"):
        add_shard(e, spec.get("baby_event", "minecraft:entity_born"))
    if spec.get("spawned") is not None:
        e["events"]["minecraft:entity_spawned"] = spec["spawned"]
    return d


SHARD_EVENT = f"{NS}:as_shard"


def add_forms(e):
    """A group per form (FORM_GROUPS), added by the scripts after painting: fragile caps
    health whatever the mob, giant and tiny rescale it."""
    for form, group in FORM_GROUPS.items():
        e["component_groups"][f"{NS}:{form}"] = dict(group)
        e["events"][f"{NS}:{form}"] = {"add": {"component_groups": [f"{NS}:{form}"]}}


def add_shard(e, baby_event):
    """A shard is one of the babies a painted mob splits into when it dies: a baby that
    never grows up, so splitting can't stand in for breeding. Monster babies already
    never grow; animal babies get their baby group again without minecraft:ageable."""
    groups = e["component_groups"]
    aging = [g for g, c in groups.items() if "minecraft:is_baby" in c and "minecraft:ageable" in c]
    steps = [{"trigger": baby_event}]
    if aging:
        shard = {}
        for g in aging:
            shard.update({k: v for k, v in groups[g].items() if k != "minecraft:ageable"})
        groups[f"{NS}:shard"] = shard
        steps.append({"remove": {"component_groups": aging}, "add": {"component_groups": [f"{NS}:shard"]}})
    e["events"][SHARD_EVENT] = {"sequence": steps}


def make_golem(assets, identifier, properties):
    d = json_of(layered(assets, "behavior_packs", "entities", "iron_golem.json"))
    e = d["minecraft:entity"]
    e["description"].update({"identifier": identifier, "runtime_identifier": "minecraft:iron_golem",
                             "is_spawnable": False, "is_summonable": True, "properties": properties})
    # Always player-built, so a wand hit can't start a fight.
    e["events"]["minecraft:entity_spawned"] = {"add": {"component_groups": ["minecraft:player_created"]}}
    # Its material drops from the script instead of iron (see drops.js).
    e["components"]["minecraft:loot"] = {"table": GOLEM_LOOT}
    add_forms(e)
    return d


def make_item(identifier, name, icon):
    return {"format_version": "1.21.40", "minecraft:item": {
        "description": {"identifier": identifier, "menu_category": {"category": "equipment"}},
        "components": {
            "minecraft:icon": {"textures": {"default": icon}},
            "minecraft:display_name": {"value": name},
            "minecraft:max_stack_size": 1,
            "minecraft:hand_equipped": True,
            "minecraft:glint": True,
            "minecraft:use_modifiers": {"use_duration": 0.25, "movement_modifier": 1.0},
        }}}


def rares(rare):
    """A material's rare drops as [[item, chance], ...]."""
    if not rare:
        return []
    if isinstance(rare, str):
        rare = [[rare, RARE_CHANCE]]
    return [[f"minecraft:{item}", chance] for item, chance in rare]


def recipe(key, pattern, ingredients, unlock):
    return {"format_version": "1.20.10", "minecraft:recipe_shaped": {
        "description": {"identifier": f"{NS}:{key}"}, "tags": ["crafting_table"],
        "pattern": pattern, "key": ingredients, "unlock": unlock, "result": {"item": f"{NS}:{key}"}}}


# --- models ------------------------------------------------------------------

def head_cubes(geometry, only=None):
    """The head bone's cubes and those of everything hanging off it, like a beak or a
    witch's hat, or the bones named in `only`. A bone's own rotation moves onto its cubes,
    since they all end up in one bone."""
    bones = geometry["bones"]
    if only:
        parts = [b for b in bones if b["name"] in only]
    else:
        names = {"head"}
        grew = True
        while grew:
            grew = False
            for b in bones:
                if b.get("parent") in names and b["name"] not in names and b["name"] != "head_sleeping":
                    names.add(b["name"])
                    grew = True
        parts = [b for b in bones if b["name"] in names]
    cubes = []
    for b in parts:
        for c in b.get("cubes", []):
            c = copy.deepcopy(c)
            if b.get("rotation") and any(b["rotation"]) and "rotation" not in c:
                c["rotation"], c["pivot"] = list(b["rotation"]), list(b.get("pivot", [0, 0, 0]))
            if only:
                c.pop("inflate", None)
            cubes.append(c)
    return cubes


def texture_size(geometry):
    d = geometry.get("description", geometry)
    return d.get("texture_width", 64), d.get("texture_height", 64)


def head_golem_geo(golem, models, mob, only=None, rest_on_main=False):
    """The golem with its head's cubes replaced by another mob's. The bone stays named
    `head` with the golem's pivot, so it attaches and looks around like the golem's."""
    tex_w, tex_h = texture_size(models[0])
    if tex_w > ATLAS[0] or tex_h > ATLAS[1] - HEAD_ROW:
        sys.exit(f"{mob}: {tex_w}x{tex_h} texture doesn't fit under the golem's")
    cubes = [c for m in models for c in head_cubes(m, only)]
    if not cubes:
        sys.exit(f"{mob}: no head cubes found")
    main = cubes[0]
    # Usually the lowest cube sits on the neck; an illager's nose hangs below its head.
    bottom = main["origin"][1] if rest_on_main else min(c["origin"][1] for c in cubes)
    dy = GOLEM_NECK_Y - bottom
    dz = GOLEM_HEAD_Z - (main["origin"][2] + main["size"][2] / 2)
    for c in cubes:
        c["origin"] = [c["origin"][0], c["origin"][1] + dy, c["origin"][2] + dz]
        if isinstance(c["uv"], dict):   # per-face UVs
            for face in c["uv"].values():
                face["uv"] = [face["uv"][0], face["uv"][1] + HEAD_ROW]
        else:
            c["uv"] = [c["uv"][0], c["uv"][1] + HEAD_ROW]
        if "pivot" in c:
            c["pivot"] = [c["pivot"][0], c["pivot"][1] + dy, c["pivot"][2] + dz]
    bones = []
    for b in golem["bones"]:
        b = copy.deepcopy(b)
        if b["name"] == "head":
            b["cubes"] = cubes
        bones.append(b)
    bounds = golem.get("description", golem)
    return {"format_version": "1.12.0", "minecraft:geometry": [{
        "description": {
            "identifier": f"geometry.{NS}.golem_{mob}",
            "texture_width": ATLAS[0], "texture_height": ATLAS[1],
            "visible_bounds_width": bounds["visible_bounds_width"],
            "visible_bounds_height": bounds["visible_bounds_height"],
            "visible_bounds_offset": bounds["visible_bounds_offset"],
        },
        "bones": bones,
    }]}


# --- client side -------------------------------------------------------------

def index_of(prop, values):
    """Molang turning an enum property into its index."""
    expr = str(len(values) - 1)
    for i, v in reversed(list(enumerate(values[:-1]))):
        expr = f"({prop} == '{v}') ? {i} : ({expr})"
    return expr


def material_index():
    """Molang for v.index: the `mat` property, or for a mob painted before 0.8.0 the
    legacy enum's index (the same index: LEGACY is the start of MATERIALS)."""
    return [f"t.m = query.property('{NS}:material');", f"t.i = query.property('{NS}:mat');",
            f"v.index = t.i >= 0 ? t.i : ({index_of('t.m', LEGACY)});"]


def client_of(assets, name):
    return json_of(layered(assets, "resource_packs", "entity", f"{name}.entity.json"))


def main(assets):
    check_pacing()
    check_blocks(assets)
    for p in (f"{BP}/entities", f"{BP}/items", f"{BP}/recipes", f"{BP}/loot_tables", f"{RP}/entity", f"{RP}/models", f"{RP}/render_controllers",
              f"{RP}/texts", f"{RP}/textures"):
        fresh(p)
    tex = f"{RP}/textures/entity/{NS}"
    os.makedirs(tex)
    names = list(MATERIALS)

    def texture(archive, name):
        return png(layered(assets, "resource_packs", archive, name))

    golem_png = texture("textures/entity", "iron_golem.png")
    sheets = {mob: texture(*spec["adult"]) for mob, spec in MOBS.items()}
    golem_painted, painted = {}, {mob: {} for mob in MOBS}
    for n, m in MATERIALS.items():
        tile = texture("textures/blocks", f"{m['block']}.png")
        tw, th = tile.size
        if th > tw and th % tw == 0:   # an animated strip (magma): the first frame
            tile = tile.crop((0, 0, tw, tw))
        if tile.getbbox() and tile.getbbox() != (0, 0) + tile.size:   # see-through edges (cake)
            tile = tile.crop(tile.getbbox())
        golem_painted[n] = golem_png if n == "iron" else make_material(golem_png, tile, m)
        golem_painted[n].save(f"{tex}/iron_golem_{n}.png")
        for mob, spec in MOBS.items():
            painted[mob][n] = make_material(sheets[mob], tile, m, spec.get("glow", False))
            painted[mob][n].save(f"{tex}/{mob}_{n}.png")
            if spec.get("baby"):
                make_material(texture(*spec["baby"]), tile, m, spec.get("glow", False)).save(f"{tex}/{mob}_baby_{n}.png")

    # Behavior
    for mob, spec in MOBS.items():
        write_json(f"{BP}/entities/{mob}.json", text_filters(make_mob(assets, mob, spec)))
    write_json(f"{BP}/entities/iron_golem.json", text_filters(make_golem(assets, f"{NS}:iron_golem",
        material_properties(LEGACY, LEGACY[0]))))
    write_json(f"{BP}/entities/head_golem.json", text_filters(make_golem(assets, f"{NS}:head_golem", {
        **material_properties(head_values(LEGACY), "iron"),
        # An int, not an enum: enums hold few values and the head list will grow.
        f"{NS}:head": {"type": "int", "range": [0, 63], "default": 0, "client_sync": True}})))

    # Painted mobs: the vanilla client file and model, with only the sheets swapped. Sheets
    # are the temperate ones: a painted mob looks the same in any climate.
    models = vanilla_geometries(assets)
    vanilla_rc = vanilla_controllers(assets)
    controllers = {}
    for mob, spec in MOBS.items():
        client = client_of(assets, mob)
        d = client["minecraft:client_entity"]["description"]
        d["identifier"] = f"{NS}:{mob}"
        keep = spec.get("keep", {})
        baby = bool(spec.get("baby"))
        d["textures"] = {k: d["textures"][k] for k in keep.get("textures", [])}
        for n in names:
            d["textures"][n] = f"textures/entity/{NS}/{mob}_{n}"
            if baby:
                d["textures"][f"baby_{n}"] = f"textures/entity/{NS}/{mob}_baby_{n}"
        rcs = [r if isinstance(r, str) else next(iter(r)) for r in d["render_controllers"]]
        kept = [r for r in d["render_controllers"] if (r if isinstance(r, str) else next(iter(r))) in keep.get("controllers", [])]
        painted_rc = next(r for r in rcs if r not in keep.get("controllers", []))
        # Models the kept layers draw with stay, alongside the mob's own.
        used = set(re.findall(r"Geometry\.(\w+)", json.dumps([vanilla_rc[r] for r in rcs if r in keep.get("controllers", [])])))
        d["geometry"] = {k: v for k, v in d["geometry"].items() if k in ("default", "baby", "sheared") or k in used}
        for geo in d["geometry"].values():
            if geo not in models:
                sys.exit(f"{mob}: no model {geo} in the game's files")
        scripts = d.setdefault("scripts", {})
        scripts["pre_animation"] = [line for line in scripts.get("pre_animation", [])
                                    if not re.search(r"\b(t\.variant|v\.index|v\.is_cold)\b", line)] + material_index()
        rc_name = f"controller.render.{NS}.{mob}"
        rc = copy.deepcopy(vanilla_rc[painted_rc])
        # Keep the controller's own arrays (spiders pick a material when invisible).
        arrays = {k: dict(v) for k, v in rc.get("arrays", {}).items() if k == "materials"}
        arrays["textures"] = {"Array.adult": [f"Texture.{n}" for n in names]}
        if baby:
            arrays["textures"]["Array.baby"] = [f"Texture.baby_{n}" for n in names]
        if "geometries" in spec:
            arrays.setdefault("geometries", {})["Array.geos"] = spec["geometries"]
        rc["arrays"] = arrays
        rc["geometry"] = spec.get("geometry", "query.is_baby ? Geometry.baby : Geometry.default" if baby else "Geometry.default")
        rc["materials"] = [{k: "Material.default" if "?" in v else v for k, v in m.items()} for m in rc["materials"]]
        rc["textures"] = ["query.is_baby ? Array.baby[v.index] : Array.adult[v.index]" if baby else "Array.adult[v.index]"]
        controllers[rc_name] = rc
        # Same order as vanilla, with the painted layer in place of the mob's own.
        d["render_controllers"] = [rc_name if (r if isinstance(r, str) else next(iter(r))) == painted_rc else r
                                   for r in d["render_controllers"] if r in kept or
                                   (r if isinstance(r, str) else next(iter(r))) == painted_rc]
        d.pop("spawn_egg", None)
        write_json(f"{RP}/entity/{mob}.entity.json", client)

    # Material iron golem: vanilla model, cracks layer untouched
    client = client_of(assets, "iron_golem")
    d = client["minecraft:client_entity"]["description"]
    d["identifier"] = f"{NS}:iron_golem"
    d["textures"].pop("default")
    for n in names:
        d["textures"][n] = f"textures/entity/{NS}/iron_golem_{n}"
    d["scripts"]["pre_animation"] += material_index()
    d["render_controllers"] = [f"controller.render.{NS}.iron_golem", "controller.render.iron_golem_cracks"]
    d.pop("spawn_egg", None)
    write_json(f"{RP}/entity/iron_golem.entity.json", client)

    # Head golem: one mob, with a model per head and a sheet per head and legacy material.
    # Hybrids have no head sheets (each would add ~360 KB), so a hybrid's head golem is
    # drawn as plain iron: an iron body with the mob's own head colours.
    golem_geo = models["geometry.irongolem"]
    head_materials = head_values(LEGACY)
    client = client_of(assets, "iron_golem")
    d = client["minecraft:client_entity"]["description"]
    d["identifier"] = f"{NS}:head_golem"
    d["textures"] = {}
    d["geometry"] = {}
    for mob in HEADS:
        write_json(f"{RP}/models/entity/golem_{mob}.geo.json",
                   head_golem_geo(golem_geo, [models[g] for g in MOBS[mob]["head"]], mob,
                                  MOBS[mob].get("head_bones"), MOBS[mob].get("nose_hangs", False)))
        d["geometry"][mob] = f"geometry.{NS}.golem_{mob}"
        for n in head_materials:
            body = golem_png if n in ("iron", IRON_PAINTED) else golem_painted[n]
            head = sheets[mob] if n == "iron" else painted[mob]["iron" if n == IRON_PAINTED else n]
            atlas(body, head, MOBS[mob].get("alpha_mask", False)).save(f"{tex}/golem_{mob}_{n}.png")
            d["textures"][f"{mob}_{n}"] = f"textures/entity/{NS}/golem_{mob}_{n}"
    # The cracks sheets are laid out for a 128x128 golem, so pad them to the atlas.
    for key, name in (("high", "cracked_high"), ("med", "cracked_medium"), ("low", "cracked_low"), ("none", "cracked_none")):
        crack = texture("textures/entity/iron_golem", f"{name}.png")
        pad = Image.new("RGBA", ATLAS)
        if crack.size == GOLEM_TEX:
            pad.paste(crack, (0, 0))
        pad.save(f"{tex}/golem_cracks_{key}.png")
        d["textures"][f"cracks_{key}"] = f"textures/entity/{NS}/golem_cracks_{key}"
    d["scripts"]["pre_animation"] += [
        f"t.m = query.property('{NS}:material');",
        f"t.i = query.property('{NS}:mat');",
        f"v.material = t.i >= 0 ? (t.i < {len(LEGACY)} ? t.i + 1 : 0) : ({index_of('t.m', head_materials)});",
        f"v.head = query.property('{NS}:head');",
        f"v.index = v.head * {len(head_materials)} + v.material;",
    ]
    d["render_controllers"] = [f"controller.render.{NS}.head_golem", f"controller.render.{NS}.head_golem_cracks"]
    d.pop("spawn_egg", None)
    write_json(f"{RP}/entity/head_golem.entity.json", client)

    geos = {"Array.geos": [f"Geometry.{mob}" for mob in HEADS]}
    write_json(f"{RP}/render_controllers/{NS}.render_controllers.json", {
        "format_version": "1.8.0", "render_controllers": {
            **controllers,
            f"controller.render.{NS}.iron_golem": {
                "arrays": {"textures": {"Array.skins": [f"Texture.{n}" for n in names]}},
                "geometry": "Geometry.default",
                "materials": [{"*": "Material.default"}],
                "textures": ["Array.skins[v.index]"],
            },
            f"controller.render.{NS}.head_golem": {
                "arrays": {"geometries": geos, "textures": {
                    "Array.skins": [f"Texture.{mob}_{n}" for mob in HEADS for n in head_materials]}},
                "geometry": "Array.geos[v.head]",
                "materials": [{"*": "Material.default"}],
                "textures": ["Array.skins[v.index]"],
            },
            f"controller.render.{NS}.head_golem_cracks": {
                "arrays": {"geometries": geos, "textures": {
                    "Array.cracks": ["Texture.cracks_high", "Texture.cracks_med", "Texture.cracks_low", "Texture.cracks_none"]}},
                "geometry": "Array.geos[v.head]",
                "materials": [{"*": "Material.default"}],
                "textures": ["Array.cracks[math.clamp(query.health / 25, 0, 3)]"],
            },
        }})

    # Items
    icons = f"{RP}/textures/items/{NS}"
    os.makedirs(icons)
    atlas_data = {}
    def item(key, name, icon_img):
        icon_img.save(f"{icons}/{key}.png")
        atlas_data[f"{NS}_{key}"] = {"textures": f"textures/items/{NS}/{key}"}
        write_json(f"{BP}/items/{key}.json", make_item(f"{NS}:{key}", name, f"{NS}_{key}"))
    for n in WANDS:
        item(f"{n}_wand", f"{MATERIALS[n]['name']} Wand", wand_icon(*MATERIALS[n]["wand"]))
    item("golem_rod", "Golem Rod", rod_icon())
    item("debug_wand", "Golem Debug", debug_icon())
    write_json(f"{RP}/textures/item_texture.json",
               {"resource_pack_name": NS, "texture_name": "atlas.items", "texture_data": atlas_data})

    # Recipes. The Wood Wand is free on joining and cheap to make. Up the ladder, each wand
    # is the previous tier's wand with four of the next tier's material around it, so
    # crafting it uses that wand up (8 for diamond: the whole ring). Wands off the ladder
    # start from the ladder wand of their depth (`from`). The rod is shaped like the iron
    # golem it makes, with a Wood Wand for a heart.
    write_json(f"{BP}/recipes/wood_wand.json", recipe("wood_wand", [" P", "S "],
               {"P": {"tag": "minecraft:planks"}, "S": {"item": "minecraft:stick"}}, {"context": "AlwaysUnlocked"}))
    for n, m in MATERIALS.items():
        if not m["craft"]:
            continue
        before = LADDER[LADDER.index(n) - 1] if m["tier"] else m.get("from", "wood")
        what = ({"tag": m["craft"][4:]} if m["craft"].startswith("tag:") else {"item": f"minecraft:{m['craft']}"})
        pattern = ["MMM", "MWM", "MMM"] if m.get("count", 4) == 8 else [" M ", "MWM", " M "]
        write_json(f"{BP}/recipes/{n}_wand.json", recipe(f"{n}_wand", pattern,
                   {"M": what, "W": {"item": f"{NS}:{before}_wand"}}, [what]))
    write_json(f"{BP}/recipes/golem_rod.json", recipe("golem_rod", [" C ", "IWI", " I "],
               {"C": {"item": "minecraft:carved_pumpkin"}, "I": {"item": "minecraft:iron_block"},
                "W": {"item": f"{NS}:wood_wand"}}, [{"item": "minecraft:iron_block"}]))
    write_json(f"{BP}/{GOLEM_LOOT}", {"pools": [{"rolls": 1, "entries": [{
        "type": "item", "name": "minecraft:poppy", "weight": 1,
        "functions": [{"function": "set_count", "count": {"min": 0, "max": 2}}]}]}]})

    # Names
    with open(f"{RP}/texts/en_US.lang", "w") as f:
        for mob, spec in MOBS.items():
            f.write(f"entity.{NS}:{mob}.name=Fancy {spec.get('name', mob.capitalize())}\n")
        f.write(f"entity.{NS}:iron_golem.name=Fancy Golem\n")
        f.write(f"entity.{NS}:head_golem.name=Head Golem\n")
    write_json(f"{RP}/texts/languages.json", ["en_US"])

    # What the scripts need to know
    with open(f"{BP}/scripts/data.js", "w") as f:
        f.write("// Written by tools/make_pack.py. Don't hand-edit.\n")
        f.write(f"export const MATERIALS = {json.dumps(names)};\n")
        f.write(f"export const HEADS = {json.dumps(HEADS)};\n")
        mobs = {mob: {"adult": spec.get("adult_event"), "baby": spec.get("baby_event", "minecraft:entity_born") if spec.get("baby") else None,
                      "shard": SHARD_EVENT if spec.get("baby") and not spec.get("pops") else None,
                      "pops": spec.get("pops", False), "habitat": rares(spec.get("habitat")),
                      "climate": spec.get("climate", False), "worn": spec.get("worn", {})} for mob, spec in MOBS.items()}
        f.write(f"export const MOBS = {json.dumps(mobs)};\n")
        def crater(c):
            out = {k: v for k, v in c.items() if k in ("share", "count")}
            out.update({k: f"minecraft:{c[k]}" for k in ("host", "ore") if c.get(k)})
            return out
        drops = {n: {"drop": f"minecraft:{m['drop']}", "burst": f"minecraft:{m['burst']}", "mult": m.get("mult", 1),
                     "hybrid": sorted(m["hybrid"]) if m.get("hybrid") else None,
                     "rare": rares(m["rare"]), "also": rares(m.get("also")), "crater": crater(CRATERS[n])}
                 for n, m in MATERIALS.items()}
        drops[IRON_PAINTED] = drops["iron"]   # (and plain "iron" covers unpainted head golems)
        f.write(f"export const IRON_PAINTED = {json.dumps(IRON_PAINTED)};\n")
        f.write(f"export const LADDER = {json.dumps(LADDER)};\n")
        f.write(f"export const LEGACY = {json.dumps(LEGACY)};\n")
        f.write(f"export const WANDS = {json.dumps(WANDS)};\n")
        f.write(f"export const HYBRIDS = {json.dumps([[*sorted(pair), n] for pair, n in HYBRIDS.items()])};\n")
        f.write(f"export const FORMS = {json.dumps(FORMS)};\n")
        f.write(f"export const TOUGHNESS = {json.dumps({n: m['tough'] for n, m in MATERIALS.items() if m.get('tough')})};\n")
        f.write(f"export const DROPS = {json.dumps(drops)};\n")
    print("generated from", assets)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
