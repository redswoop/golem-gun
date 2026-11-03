#!/usr/bin/env python3
"""Check what the game would otherwise only complain about in a log nobody reads:
version numbers agree, and every texture, model, controller and UV a mob uses exists."""
import glob
import json
import os
import re
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
problems = []


def load(path):
    return json.load(open(path))


bp, rp = load("behavior_pack/manifest.json"), load("resource_pack/manifest.json")
v = bp["header"]["version"]
s = ".".join(map(str, v))
js = re.search(r'^export const VERSION = "(.*)";', open("behavior_pack/scripts/main.js").read(), re.M).group(1)
for label, ok in {
    "resource pack version": rp["header"]["version"] == v,
    "module versions": all(m["version"] == v for m in bp["modules"] + rp["modules"]),
    "behavior pack name": bp["header"]["name"] == f"Golem Gun {s}",
    "resource pack name": rp["header"]["name"] == f"Golem Gun {s} (art)",
    "behavior -> resource dependency": {"uuid": rp["header"]["uuid"], "version": v} in bp["dependencies"],
    "resource -> behavior dependency": {"uuid": bp["header"]["uuid"], "version": v} in rp["dependencies"],
    "VERSION in main.js": js == s,
}.items():
    if not ok:
        problems.append(f"version {s} mismatch: {label}")

geos = {}
for path in glob.glob("resource_pack/models/entity/*.geo.json"):
    g = load(path)["minecraft:geometry"][0]
    geos[g["description"]["identifier"]] = g
controllers = load("resource_pack/render_controllers/golemgun.render_controllers.json")["render_controllers"]
controllers_known_vanilla = {"controller.render.iron_golem_cracks", "controller.render.saddle",
                             "controller.render.creeper_armor", "controller.render.stray_clothes",
                             "controller.render.bogged_clothes"}

for path in glob.glob("resource_pack/entity/*.entity.json"):
    d = load(path)["minecraft:client_entity"]["description"]
    name = d["identifier"]
    server = load(f"behavior_pack/entities/{os.path.basename(path).replace('.entity', '')}")["minecraft:entity"]["description"]
    if server["identifier"] != name:
        problems.append(f"{path}: {name} doesn't match its behavior file {server['identifier']}")
    # At this pack's engine version the query doesn't resolve, and the mob turns invisible.
    if "query.attack_time" in json.dumps(d["scripts"]):
        problems.append(f"{name}: query.attack_time doesn't resolve")
    for key, tex in d["textures"].items():
        if not os.path.exists(f"resource_pack/{tex}.png") and "/golemgun/" in tex:
            problems.append(f"{name}: texture {key} has no file: {tex}")
    for key, geo in d["geometry"].items():
        # make_pack.py has already checked that vanilla models exist.
        if geo.startswith("geometry.golemgun.") and geo not in geos:
            problems.append(f"{name}: model {key} doesn't exist: {geo}")
    for rc in d["render_controllers"]:
        rc = rc if isinstance(rc, str) else next(iter(rc))   # {"name": "condition"}
        if rc in controllers_known_vanilla:
            continue
        if rc not in controllers:
            problems.append(f"{name}: no render controller {rc}")
            continue
        text = json.dumps(controllers[rc])
        for kind, table in (("Texture", d["textures"]), ("Geometry", d["geometry"]), ("Material", d["materials"])):
            for ref in re.findall(rf"\b{kind}\.(\w+)", text):
                if ref not in table:
                    problems.append(f"{name}: {rc} uses {kind}.{ref}, which the mob doesn't define")
    for prop in re.findall(r"query\.property\('([^']+)'\)", json.dumps(d["scripts"])):
        if prop not in server.get("properties", {}):
            problems.append(f"{name}: reads property {prop}, which isn't declared")

for name, g in geos.items():
    w, h = g["description"]["texture_width"], g["description"]["texture_height"]
    for bone in g["bones"]:
        for c in bone.get("cubes", []):
            sx, sy, sz = c["size"]
            if isinstance(c["uv"], dict):
                if any(f["uv"][1] + f.get("uv_size", [0, 0])[1] > h or f["uv"][1] < 0 for f in c["uv"].values()):
                    problems.append(f"{name}: {bone['name']} cube runs off its {w}x{h} texture")
                continue
            if c["uv"][0] < 0 or c["uv"][1] < 0 or c["uv"][0] + 2 * (sx + sz) > w or c["uv"][1] + sy + sz > h:
                problems.append(f"{name}: {bone['name']} cube at uv {c['uv']} runs off its {w}x{h} texture")

for path in glob.glob("resource_pack/textures/entity/golemgun/golem_*.png"):
    if Image.open(path).size != (128, 256):
        problems.append(f"{path}: head golem sheets must be 128x256")

atlas = load("resource_pack/textures/item_texture.json")["texture_data"]
for path in glob.glob("behavior_pack/items/*.json"):
    icon = load(path)["minecraft:item"]["components"]["minecraft:icon"]["textures"]["default"]
    if icon not in atlas or not os.path.exists(f"resource_pack/{atlas[icon]['textures']}.png"):
        problems.append(f"{path}: no icon {icon}")

if problems:
    sys.exit("\n".join(problems))
print(f"pack {s} checks out: {len(geos)} models, {len(controllers)} render controllers")
