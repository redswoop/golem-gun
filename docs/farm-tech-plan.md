# Golem Wand: Farm-Tech Tree Game Plan

Received 2026-11-02. Kids' names are replaced with roles, per this folder's rule. "Jet"
(Armen) decides, "Spike" (Claude) builds. Status: Phase 1 built as 0.4.0 (2026-11-02).

Decisions: a mutation happens once, so wands convert only vanilla mobs and never
repaint or upgrade. Coal stays between gold and diamond. Copper is off the ladder, like
obsidian, quartz, emerald and lapis: crafted from a Wood Wand, and their mobs still drop
and produce their material (Armen: "a lapis wand makes a lapis mob that drops lapis"). Namespace stays `golemgun:`
(renaming would wipe painted mobs in existing worlds). Production will be script timers,
not `minecraft:spawn_entity`, so the speed multiplier and boosts can scale it. Mobs keep
a death drop of their tier's common material. Netherite wand = diamond wand + 4
netherite scrap.

Added after the plan (Armen, 2026-11-02): killing a painted mob that has a baby form
splits it into 4 babies of its material ("1 stone chicken spawns 4 stone chicks. kill the
chicks, 4 stone, and chance for iron"), including baby zombies. The babies never grow up,
so splitting can't replace breeding. Each baby drops 1 of the material plus a 10% chance
of the next tier's. Mobs with no baby form drop 1-2 plus the same 10%. Stone also has a 20% chance of coal
(Armen: "stone should also have a chance to drop coal").

## The pitch in one line

**Mobs are the mines.** You never dig for the first iron. A tier-N wand turns mobs into tier-N elemental mobs. Those mobs *produce* tier-N material, and rarely a little of tier N+1. Collect enough to craft the next wand. Repeat.

## Step 0: Audit before you touch anything

The mod already exists: wood wand + 4 of an element = an elemental wand, and wands turn mobs into elemental mobs/golems. Before building:

1. Read the repo and report back:
   - how elemental mobs are represented now (separate entity per mob×element? properties? runtime swaps?)
   - how the wand detects a hit/use on a mob
   - which recipes exist
2. Propose the refactor (below) **before** doing it. Don't nuke working stuff the kid likes.

## Core architecture

### 1. One table to rule them all

Put every tier in a single config (e.g. `scripts/tiers.ts`, plus generated JSON where data-driven files need it). Everything else reads from it. Tuning should be a one-file edit.

```ts
// sketch, not gospel
export const TIERS = [
  { id: "wood",      common: "minecraft:oak_log",     rare: "minecraft:cobblestone" },
  { id: "stone",     common: "minecraft:cobblestone", rare: "minecraft:raw_iron" },
  { id: "iron",      common: "minecraft:raw_iron",    rare: "minecraft:raw_gold" },
  { id: "gold",      common: "minecraft:raw_gold",    rare: "minecraft:coal" },
  { id: "coal",      common: "minecraft:coal",        rare: "minecraft:diamond" },
  { id: "diamond",   common: "minecraft:diamond",     rare: "minecraft:netherite_scrap" },
  { id: "netherite", common: "minecraft:netherite_scrap", rare: null },
];
```

Raw ore drops are **deliberate**. Smelting is part of the pacing.

### 2. Element as an entity property, not 30 entity files

Preferred: **one golem entity per base mob** (`golemwand:chicken_golem`, `golemwand:cow_golem`, …) with an `element` enum entity property. A render controller picks the texture via `q.property('golemwand:element')`. Behavior differences come from component groups toggled by events.

That's 4 mob types, not 4 × 7 = 28 entity definitions. If the current repo already uses separate entities and it's working, weigh the migration cost first and tell Jet.

### 3. Golems are sterile

Golem entities get **no** `minecraft:breedable`. Elemental eggs/drops are items, never chicks. This is the main brake on the economy. Growth is capped by how fast the player breeds *normal* mobs.

Intended base layout: **breeder pen (normal mobs) → zap station → production coop.**

## Phase plan

### Phase 1: Wand ladder
- Wand use on a vanilla mob converts it to that mob's golem at the wand's element. Preserve name tag, baby state if reasonable, and health ratio.
- Wand use on a golem of a **lower** tier upgrades it to the wand's tier? **Open question for Jet.** Default: no, wands only convert vanilla mobs. Keeps the breeder pen relevant.
- Recipes: **tier-N wand + 4 × tier-(N+1) material = tier-(N+1) wand.**
  - e.g. stone wand + 4 iron ingots = iron wand.
  - The wood wand stays craftable from sticks/planks so there's an entry point.

### Phase 2: Chickens (the drip)
- Golem chickens lay material on a timer, like vanilla eggs.
- Prefer the data-driven `minecraft:spawn_entity` component (that's how vanilla chickens lay). Use two entries per tier component group: a **common** drop on a short timer and a **rare** drop on a long timer. No per-tick scripting needed.
- Starting numbers (expose a global debug speed multiplier for testing):
  - common: every 5–10 min (vanilla egg pace)
  - rare: every 40–60 min
  - Sanity check: 10 stone chickens should give ~4 raw iron in roughly 20–30 min. That's an iron wand per play session. Tune from playtest.

### Phase 3: Mob jobs

| Mob | Job | Mechanic hint |
|---|---|---|
| Chicken | slow passive drip | `spawn_entity` timers (Phase 2) |
| Sheep | shear for a burst; regrows by eating its own element (stone sheep eats stone) | `minecraft:interact` with shears → loot table; regrow on eat-block |
| Cow | bucket milk → "molten" bucket item; big batch, long cooldown | `minecraft:interact` with bucket + cooldown |
| Pig | **truffle pig**: seeks and digs out nearby ore | `minecraft:behavior.move_to_block` targeting ore blocks; script breaks the block and drops the item on arrival |

The truffle pig is the one hunting mob. Cap its search radius and dig rate so it's helpful, not a strip-miner.

### Phase 4: Boosts (risky stunts = faster, never required)
- **Lightning:** a golem near a lightning strike gets a temporary rare-drop multiplier (e.g. 5× for 10 min). Hook: `world.afterEvents.entitySpawn` for `minecraft:lightning_bolt`, find golems in radius, set a dynamic property with an expiry tick.
- **Creeper blast:** a **coal** golem that *survives* a creeper explosion gets a high chance of instantly dropping a diamond. Hook: `world.afterEvents.entityHurt`, damage cause an explosion from a creeper; check it's still alive.
- Boosted golems should **look** boosted: particles, glow, sparks.
- Verify event names against the `@minecraft/server` version in the manifest.

### Phase 5: Fire chicken (the smelting payoff)
- The kid hates smelting. The payoff is a mid/late-tree **fire chicken / magma cow**.
- Unlock idea: zap a mob in the Nether, or with lava adjacent, using a gold-or-higher wand.
- Behavior: dropped `raw_*` item entities within ~4 blocks get swapped for the smelted version every few seconds (`dimension.getEntities({ type: "minecraft:item", location, maxDistance })`, read the item component's stack, replace).

### Phase 6 (optional): Golem Grimoire
- A craftable book with riddle-style hints for unlocks and boosts. Discovery has to be possible without Google.

### Stretch / parking lot (don't build yet)
- **Rust Wand:** steps golems down a tier.
- **Contagion:** high-tier golems convert neighbors. Needs the Rust Wand as a cure first.
- **Fusion rituals:** 4 coal golems in a ring + creeper = diamond golem.

## Debug tooling
- `/scriptevent golemwand:speed <n>`: global production multiplier
- `/scriptevent golemwand:give_wand <tier>`
- `/scriptevent golemwand:set_element <tier>` on the nearest golem
- Optional action-bar readout of a golem's tier, boost status, and next-drop ETA when looked at

## Definition of done (per phase)
- Works in a fresh survival world on Bedrock with experimental toggles noted, if any are needed
- No content-log errors
- The kid playtested it and didn't say "this is boring"

## Open questions for Jet
1. Can a wand upgrade an existing golem, or only convert vanilla mobs? (Default: vanilla only.)
2. Final tier order. Coal sits between gold and diamond on purpose (coal + pressure = diamond). Keep it, or go classic?
3. Copper tier: in or out?
