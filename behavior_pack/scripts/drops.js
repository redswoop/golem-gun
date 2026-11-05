// What painted mobs leave behind, on top of their normal loot:
// - A painted farm animal (anything with a baby form that isn't a monster) splits into
//   SPLIT_COUNT babies of its material when it dies (shards: they never grow up and never
//   split again).
// - A painted monster with a baby form (zombies, piglins) pops instead: it bursts into what
//   SPLIT_COUNT babies would have dropped, because 4 baby zombies fight back.
// - A baby drops 1 of its material; a mob with no baby form (skeletons, creepers,
//   golems) drops 1-2. Either way each extra drop rolls its own chance, all set in
//   make_pack.py: the material's `rare` (the next tier's material, coal for stone), its
//   `also` (things found in the same place) and the mob's `habitat`.
// - A painted creeper's blast breaks blocks as usual, then turns what lines the crater into
//   its element (CRATERS in make_pack.py): stone with iron ore, a bounce pit of slime. A
//   blast that breaks nothing (mobGriefing off, or in mid-air) throws ore blocks instead.
import { ItemStack, system, world } from "@minecraft/server";
import { DROPS, MOBS } from "./data.js";
import { onDie } from "./twists.js";
import { NS, materialOf, setMaterialOf } from "./material.js";

const CREEPER = `${NS}:creeper`;
const CLIMATE = "minecraft:climate_variant";
export const SHARD = `${NS}:shard`;
export const SPLIT_COUNT = 4;
export const BABY_DROP = [1, 1];
export const DROP_COUNT = [1, 2];
export const BURST_COUNT = [3, 5];

// Never part of a crater lining: unbreakable or special blocks, anything holding items,
// and things that come in two halves or aren't really blocks (plants, torches).
const KEEP = new Set(["bedrock", "barrier", "light_block", "portal", "end_portal", "end_portal_frame", "end_gateway",
  "command_block", "chain_command_block", "repeating_command_block", "structure_block", "structure_void", "jigsaw",
  "mob_spawner", "trial_spawner", "vault", "reinforced_deepslate", "allow", "deny", "border_block", "fire", "soul_fire"]
  .map((b) => `minecraft:${b}`));
const NOT_A_WALL = /door|_bed$|^minecraft:bed$|torch|(?<!sea_)lantern|lichen|seagrass|kelp|sign|banner|rail|button|lever|pressure_plate|carpet|sapling|flower|tulip|orchid|allium|bluet|daisy|poppy|dandelion|cornflower|lily|rose|peony|lilac|short_grass|tall_grass|fern|dead_bush|vine|mushroom$|_head$|skull|candle|cake|snow_layer|frame|pot$|petals|leaf_litter|bush$/;
const SIDES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const key = ({ x, y, z }) => `${x},${y},${z}`;

// Creepers that just exploded, so a death event after the blast can't drop twice.
const exploded = new Set();

const between = ([lo, hi]) => lo + Math.floor(Math.random() * (hi - lo + 1));

/** Returns the item entities it dropped. */
export function dropMaterial(mob, count = DROP_COUNT, kind = undefined) {
  const drop = DROPS[materialOf(mob)];
  if (!drop) return [];
  const { dimension, location } = mob;
  const left = [dimension.spawnItem(new ItemStack(drop.drop, between(count) * drop.mult), location)];
  for (const [item, chance] of [...drop.rare, ...drop.also, ...(kind?.habitat ?? [])]) {
    if (Math.random() < chance) left.push(dimension.spawnItem(new ItemStack(item, 1), location));
  }
  return left;
}

/** A dead painted monster bursts into SPLIT_COUNT babies' worth of material, flung about. */
export function pop(mob, kind) {
  const left = [];
  for (let i = 0; i < SPLIT_COUNT; i++) left.push(...dropMaterial(mob, BABY_DROP, kind));
  for (const item of left) {
    const angle = Math.random() * 2 * Math.PI;
    try {
      item.applyImpulse({ x: Math.cos(angle) * 0.25, y: 0.3 + Math.random() * 0.2, z: Math.sin(angle) * 0.25 });
    } catch {}
  }
  try {
    mob.dimension.playSound("random.pop", mob.location);
  } catch {}
  return left;
}

/** A dead painted mob comes apart into babies of the same material. Returns them. */
export function split(mob, kind) {
  const { dimension, location, typeId } = mob;
  const material = materialOf(mob);
  const climate = kind.climate ? mob.getProperty(CLIMATE) : undefined;
  const babies = [];
  for (let i = 0; i < SPLIT_COUNT; i++) {
    const angle = (i / SPLIT_COUNT) * 2 * Math.PI;
    const at = { x: location.x + Math.cos(angle) * 0.5, y: location.y, z: location.z + Math.sin(angle) * 0.5 };
    const baby = dimension.spawnEntity(typeId, at, { spawnEvent: kind.shard });
    setMaterialOf(baby, material);
    if (climate !== undefined) baby.setProperty(CLIMATE, climate);
    baby.setDynamicProperty(SHARD, true);
    babies.push(baby);
  }
  return babies;
}

export function burst(dimension, location, material) {
  const drop = DROPS[material];
  if (!drop) return;
  const from = { x: location.x, y: location.y + 1, z: location.z };
  const count = between(BURST_COUNT);
  for (let i = 0; i < count; i++) {
    const item = dimension.spawnItem(new ItemStack(drop.burst, 1), from);
    const angle = (i / count) * 2 * Math.PI + Math.random();
    const speed = 0.3 + Math.random() * 0.25;
    try {
      item.applyImpulse({ x: Math.cos(angle) * speed, y: 0.35 + Math.random() * 0.3, z: Math.sin(angle) * speed });
    } catch {}
  }
}

function lines(block) {
  try {
    return !!block && !block.isAir && !block.isLiquid && !KEEP.has(block.typeId) && !NOT_A_WALL.test(block.typeId)
      && !block.getComponent("minecraft:inventory");
  } catch {
    return false;
  }
}

/** Turns the blocks lining a blast's holes into a material's crater. Returns how many. */
export function crater(dimension, holes, material) {
  const spec = DROPS[material]?.crater;
  if (!spec || !holes.length) return 0;
  const gone = new Set(holes.map(key));
  const seen = new Set();
  const wall = [];
  for (const h of holes) {
    for (const [dx, dy, dz] of SIDES) {
      const at = { x: h.x + dx, y: h.y + dy, z: h.z + dz };
      const k = key(at);
      if (gone.has(k) || seen.has(k)) continue;
      seen.add(k);
      let block;
      try {
        block = dimension.getBlock(at);
      } catch {
        continue;
      }
      if (lines(block)) wall.push(block);
    }
  }
  for (let i = wall.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [wall[i], wall[j]] = [wall[j], wall[i]];
  }
  const ores = !spec.ore ? 0 : spec.count ? between(spec.count) : Math.round(wall.length * spec.share);
  wall.forEach((block, i) => {
    try {
      block.setType(i < ores ? spec.ore : spec.host);
    } catch {}
  });
  return wall.length;
}

world.afterEvents.entityDie.subscribe(({ deadEntity: mob }) => {
  if (!mob.typeId.startsWith(`${NS}:`)) return;
  if (exploded.has(mob.id)) return;
  const kind = MOBS[mob.typeId.slice(NS.length + 1)];
  const baby = !!mob.getComponent("minecraft:is_baby");
  const left = baby ? dropMaterial(mob, BABY_DROP, kind)
    : kind?.shard ? split(mob, kind)
    : kind?.pops ? pop(mob, kind)
    : dropMaterial(mob, DROP_COUNT, kind);
  onDie(mob, left);
});

// Read-only here, so the crater is made after the blast is over. The lining is the blocks
// next to the holes that aren't holes themselves, so it comes out the same either way.
world.beforeEvents.explosion.subscribe((ev) => {
  const creeper = ev.source;
  if (creeper?.typeId !== CREEPER) return;
  const material = materialOf(creeper);
  const { dimension } = ev;
  const location = { ...creeper.location };
  const holes = ev.getImpactedBlocks().map(({ location: { x, y, z } }) => ({ x, y, z }));
  const id = creeper.id;
  exploded.add(id);
  system.run(() => {
    if (!crater(dimension, holes, material)) burst(dimension, location, material);
  });
  system.runTimeout(() => exploded.delete(id), 40);
});
