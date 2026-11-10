# Golem Gun

A Minecraft Bedrock add-on where mobs are the mines. Tap a cow with a Stone Wand and it turns into a stone cow, which drops cobblestone and coal. Climb the wand ladder from wood to netherite, breed mobs of different materials into hybrids, and use the Golem Rod to turn any mob into an iron golem wearing that mob's head.

## Install

On the device that **hosts** the world (iPad, phone, or Windows):

1. Download **[GolemGun.mcaddon](https://github.com/redswoop/golem-gun/releases/latest/download/GolemGun.mcaddon)** and open it. Minecraft imports it.
2. Edit the world → **Behavior Packs** → **Available** → **Golem Gun x.y.z** → **Activate**. Its art pack, **Golem Gun x.y.z (art)**, comes along automatically. If it doesn't, activate it under **Resource Packs**.
3. Play. Anyone who joins downloads the pack automatically.

Bedrock keeps a world on the pack version it was set up with, so an existing world has to be switched to a new version by hand.

## Play

Everyone who joins gets a **Wood Wand** and a **Golem Guide**, a book that explains everything in the game. Use the wand on a mob, or tap the mob on a touch screen.

- **Wands** turn a vanilla mob into that material, once. A painted mob never despawns and drops its material when it dies. Farm animals split into 4 babies of their material instead, and the babies drop it.
- **The ladder:** Wood → Stone → Iron → Gold → Diamond → Netherite. Each wand is the wand before it in the middle of a crafting table, with 4 of its material around it (cobblestone, iron ingots, gold ingots, a full ring of 8 diamonds, netherite scrap). Higher mobs sometimes drop the next tier's material, and they're tougher: you'll want a diamond sword for a diamond mob.
- **Side wands:** Copper, Slime, TNT and Honey (from the Wood Wand), Lapis and Emerald (from Iron), Quartz and Coal (from Gold), Obsidian (from Diamond). Some come with a twist: slime mobs bounce, honey mobs are sticky, TNT mobs go bang.
- **Creepers make blocks.** A painted creeper's crater is lined with its material, with a block or two of the next tier hidden inside.
- **Breeding:** painted farm animals breed. Two of the same material breed true, and some pairs make a hybrid. The guide tells you about the first one; the rest are a surprise.
- **Golem Rod:** a carved pumpkin on top, a Wood Wand in the middle, and iron blocks around it in a golem shape. Use it on a mob to make an iron golem wearing its head, which fights for you.

The Wood Wand is a stick with a plank above it to the right. The Golem Guide is a book over a stick.

## Debug tools

With cheats on, `/scriptevent golem:give` hands over every wand, the rod and the **Golem Debug** item. Other commands: `golem:spawn <mob>`, `golem:lineup`, `golem:reset`, `golem:despawn`, `golem:tp`, `golem:status`, `golem:guide`.

## Build

`npm test` runs the pack scripts against a fake game API (it checks logic, not looks). `./build.sh` checks the versions and every texture and model, then writes `GolemGun.mcaddon`. `tools/make_pack.py` regenerates the mobs, textures and recipes from the game's own assets; see `CLAUDE.md`.
