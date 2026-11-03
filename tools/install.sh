#!/bin/bash
# Install the packs into the Mac's Minecraft dev packs and pin every world that uses
# Golem Gun to this version. Never closes the game: if it's running, this waits until
# Armen quits (run it in the background), then installs.
#
#   tools/install.sh
cd "$(dirname "$0")/.." || exit 1
M="$HOME/Library/Application Support/mcpelauncher/games/com.mojang"
if pgrep -f "mcpelauncher-[c]lient" >/dev/null; then
  echo "game is running; installing when it closes"
  while pgrep -f "mcpelauncher-[c]lient" >/dev/null; do sleep 3; done
  sleep 3   # let the game finish writing the world
  pgrep -f "mcpelauncher-[c]lient" >/dev/null && { echo "game started again; not installing"; exit 1; }
fi
/bin/rm -rf "$M/development_behavior_packs/GolemGun" "$M/development_resource_packs/GolemGun"
/bin/cp -R behavior_pack "$M/development_behavior_packs/GolemGun"
/bin/cp -R resource_pack "$M/development_resource_packs/GolemGun"
python3 - "$M" <<'PY'
import glob, json, os, sys
M = sys.argv[1]
bp, rp = json.load(open("behavior_pack/manifest.json")), json.load(open("resource_pack/manifest.json"))
ids, version = {bp["header"]["uuid"], rp["header"]["uuid"]}, bp["header"]["version"]
for world in glob.glob(f"{M}/minecraftWorlds/*"):
    for name in ("world_behavior_packs.json", "world_resource_packs.json"):
        path = f"{world}/{name}"
        if not os.path.exists(path):
            continue
        packs = json.load(open(path))
        ours = [p for p in packs if p.get("pack_id") in ids]
        for p in ours:
            p["version"] = version
        if ours:
            json.dump(packs, open(path, "w"), indent=2)
            print("pinned", open(f"{world}/levelname.txt").read().strip(), name, version)
PY
diff -rq behavior_pack "$M/development_behavior_packs/GolemGun" && diff -rq resource_pack "$M/development_resource_packs/GolemGun" \
  && echo "installed $(grep -o 'VERSION = "[^"]*"' behavior_pack/scripts/main.js)"
