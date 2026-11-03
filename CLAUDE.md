# Golem Gun

A Minecraft Bedrock add-on: material wands repaint a mob, and the Golem Rod turns a mob into an iron golem wearing that mob's head. Shared Bedrock notes are in `../CLAUDE.md`.

Keep kids' names and personal details out of this folder, including test player names.

## Commands

- `npm test`: runs the real pack scripts against the fake game in `test/mock`, which checks properties and spawn events against the generated entity files. It proves logic only, not looks or visibility.
- `tools/install.sh`: installs into the Mac dev packs and pins every world that uses the pack. It never closes the game: if the game is running it waits for Armen to quit, so run it in the background. Armen withdrew permission to close his game for installs.
- `./build.sh`: runs `tools/check_pack.py` (versions, and every texture, model, controller and UV a mob uses), then writes `GolemGun.mcaddon`.
- `python3 tools/make_pack.py "<game version dir>/assets/assets"`: regenerates everything except the manifests, `main.js`, `convert.js`, `drops.js` and `debug.js`, including recipes, the golem loot table and `scripts/data.js`. It needs Pillow.

## How it works

- The design is the farm-tech plan in `docs/farm-tech-plan.md` ("mobs are the mines"). Phase 1 (wand ladder, one-time mutation, sterile painted mobs, debug tools) is in 0.4.0; production, mob jobs, boosts and the fire chicken are still to come.
- A vanilla mob's texture can't be changed by script, so a wand swaps the mob for a lookalike (`golemgun:cow`, `golemgun:iron_golem`) whose `golemgun:material` property picks the texture.
- A mutation happens once (Armen's call): wands only work on vanilla mobs, and refuse painted mobs, painted golems and head golems. `/scriptevent golem:set_element` gets round it for testing.
- Painted mobs are sterile, with no breeding and no egg laying, so more of them only come from breeding plain mobs. `make_mob` strips `minecraft:breedable`, `behavior.breed` and `spawn_entity`.
- The swap keeps name, health, age, climate, and what a mob wears (`worn` in `MOBS`: saddle, shorn wool, a creeper's charge). Held items and armor are lost. Mobs with an owner are refused, because a swap would lose the owner. The rod drops a pig's saddle as an item.
- Painted mobs never despawn and never transform (zombie to drowned, skeleton to stray, pig to zombified piglin): `make_mob` strips `minecraft:despawn` and `minecraft:transformation` from every component group.
- Drops (`drops.js`), on top of vanilla loot: a painted mob with a baby form (farm animals, wolves, foxes, zombies, husks, drowned, piglins) splits into 4 babies of its material when it dies, and drops no material itself. These "shards" never grow up and never split again: `add_shard` generates a `golemgun:as_shard` event with the baby group minus `minecraft:ageable` (monster babies never age anyway). A baby drops 1 of its material, and a mob with no baby form drops 1-2. Either way each `rare` drop rolls its own chance: 10% for the next tier's material by default, and stone also has 20% coal. Golems have a poppy-only loot table, so their iron comes from the script too: raw iron for an unpainted head golem. A painted creeper that explodes throws 3-5 `burst` ore blocks with an impulse, caught in `world.beforeEvents.explosion`, since an exploding creeper isn't a death.
- Wands are crafted. A new player gets one Wood Wand (once, tracked by a player dynamic property). The ladder is `LADDER` (from `tier` in `MATERIALS`): wood, stone, iron, gold, coal, diamond, netherite. Each wand is the tier below's wand with 4 of its `craft` item around it, which uses that wand up. Wands off the ladder (copper, obsidian, quartz, emerald, lapis) start from a Wood Wand, and their mobs still drop (and will produce) their material: lapis mobs drop lapis. The rod is an iron golem shape (iron blocks, carved pumpkin) with a Wood Wand in the middle. `/scriptevent golem:give` (cheats on) still hands over everything.
- Extra drops: each material's `also` lists things found where it's found, and each mob's `habitat` lists things from where it lives (drowned bring up kelp). `check_pacing()` stops the build if anything but coal, diamond or netherite mobs would hand out diamonds or netherite.
- Twists (`twists.js`): per-material `tick` (every second, for loaded painted mobs), `hurt`, `hit` and `die`. Slime hops and ignores fall damage. Honey is slow and slows whoever hits it. TNT dies with a harmless bang that flings what it leaves, and a TNT creeper's blast is bigger but breaks no blocks. More themed wands are proposed in `docs/wand-variety-proposal.md`.
- Each material's `drop` is its tier's common material, and `rare` holds its rare drops: an item (10%) or an `[item, chance]` list. These are for death drops now and production in phase 2.
- The Iron Wand: a golem keeps the vanilla iron golem sheet, an Iron Wand on a painted golem restores a real `minecraft:iron_golem`, and an all-iron head golem is stored as `iron_painted`, because the head golem's `iron` value predates the wand and means an iron body with the head in its own colors.
- Painted mobs use one sheet per material, so climate looks, wolf collars, angry eyes and sheep wool colors don't show. Reset gives sheep, foxes and wolves a default look, not the one they had.
- `golemgun:head_golem` is one mob: its `golemgun:head` property picks a model from a render controller array, and `head` plus `material` pick a texture sheet. Head sheets stack the golem's 128x128 sheet over the head mob's sheet.
- `setProperty` only lands on the next tick in the real game, and `getProperty` reads the old value until then. The mock applies it at once, so a same-tick read passes there and fails in the game.
- To add a material or a mob, append to `MATERIALS` or `MOBS` in `make_pack.py`. Never reorder them: worlds store the values. A property enum holds at most 16 values, so `MATERIALS` tops out at 15, and it's full as of 0.5.0. `make_pack.py` refuses a 16th; adding more needs the int-property change in the variety proposal first.
- Some mob sheets use alpha as a dye mask, not as transparency: the sheep's bare skin has alpha 0 with real colour under it. `has_paint()` in `make_pack.py` handles this, so check a new mob's sheet for holes. Mark such mobs `alpha_mask` so their head golem sheet is drawn solid. Spider and enderman eyes glow through low alpha; `glow` leaves those pixels unpainted.
- Some sheets are `.tga`, not `.png` (drowned, spiders, enderman), and they fill unused areas with junk the game never draws.
- Old models inherit with `geometry.a:geometry.b` (the witch's head is the villager's); `vanilla_geometries` resolves that. Head golems take the head bone and everything under it, except where `head_bones` names bones (the enderman's face is its `hat`).
- The game's own entity files store filter fields as numbers (`"subject": 1`, `"operator": 0`, `"AND"`). `text_filters()` rewrites them as `"other"`, `"=="`, `all_of`, and stops on a number it can't name. Golems made from the number form seemed peaceful to Armen in 0.3.2.
- Vanilla ships as stacked packs (`vanilla`, `vanilla_1.14`, ... `vanilla_1.26.60`), and later layers replace files. Reading only the base `vanilla` pack gives definitions years out of date. `make_pack.py` handles this.

## Changing things

Bump the version in both manifests, their names and dependencies, and `VERSION` in `main.js`. `build.sh` fails if they disagree. Then `./build.sh` and `tools/install.sh`.

## Debug tools

The Golem Debug item opens a menu, and holding it shows what the mob you look at is made of (tier, common and rare material). `/scriptevent golem:give|lineup|reset|despawn|tp|status`, `golem:spawn <mob>` for any mob in `MOBS` (anything else spawns an iron golem), `golem:give_wand <material>`, `golem:set_element <material>` (the mob you look at, else the nearest converted one), and `golem:speed <n>` (a world dynamic property; production reads it once it exists). The lineup includes monsters, which attack.
