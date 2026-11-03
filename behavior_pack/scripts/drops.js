// What painted mobs leave behind, on top of their normal loot:
// - A painted mob that has a baby form splits into SPLIT_COUNT babies of its material
//   when it dies (shards: they never grow up and never split again).
// - A baby drops 1 of its material; a mob with no baby form (skeletons, creepers,
//   golems) drops 1-2. Either way each extra drop rolls its own chance, all set in
//   make_pack.py: the material's `rare` (the next tier's material, coal for stone), its
//   `also` (things found in the same place) and the mob's `habitat`.
// - A painted creeper that explodes throws out a burst of its material's ore blocks.
import { ItemStack, system, world } from "@minecraft/server";
import { DROPS, MOBS } from "./data.js";
import { onDie } from "./twists.js";

const NS = "golemgun";
const MATERIAL = `${NS}:material`;
const CREEPER = `${NS}:creeper`;
const CLIMATE = "minecraft:climate_variant";
export const SHARD = `${NS}:shard`;
export const SPLIT_COUNT = 4;
export const BABY_DROP = [1, 1];
export const DROP_COUNT = [1, 2];
export const BURST_COUNT = [3, 5];

// Creepers that just exploded, so a death event after the blast can't drop twice.
const exploded = new Set();

const between = ([lo, hi]) => lo + Math.floor(Math.random() * (hi - lo + 1));

function materialOf(mob) {
  try {
    return mob.getProperty(MATERIAL);
  } catch {
    return undefined;
  }
}

/** Returns the item entities it dropped. */
export function dropMaterial(mob, count = DROP_COUNT, kind = undefined) {
  const drop = DROPS[materialOf(mob)];
  if (!drop) return [];
  const { dimension, location } = mob;
  const left = [dimension.spawnItem(new ItemStack(drop.drop, between(count)), location)];
  for (const [item, chance] of [...drop.rare, ...drop.also, ...(kind?.habitat ?? [])]) {
    if (Math.random() < chance) left.push(dimension.spawnItem(new ItemStack(item, 1), location));
  }
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
    baby.setProperty(MATERIAL, material);
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

world.afterEvents.entityDie.subscribe(({ deadEntity: mob }) => {
  if (!mob.typeId.startsWith(`${NS}:`)) return;
  if (exploded.has(mob.id)) return;
  const kind = MOBS[mob.typeId.slice(NS.length + 1)];
  const baby = !!mob.getComponent("minecraft:is_baby");
  const left = kind?.shard && !baby ? split(mob, kind) : dropMaterial(mob, baby ? BABY_DROP : DROP_COUNT, kind);
  onDie(mob, left);
});

// Read-only here, so the blocks fly on the next tick, after the blast is over.
world.beforeEvents.explosion.subscribe((ev) => {
  const creeper = ev.source;
  if (creeper?.typeId !== CREEPER) return;
  const material = materialOf(creeper);
  const { dimension } = ev;
  const location = { ...creeper.location };
  const id = creeper.id;
  exploded.add(id);
  // A TNT creeper's blast is twice as big, but breaks no blocks, so farms survive it.
  if (material === "tnt") ev.setImpactedBlocks([]);
  system.run(() => {
    burst(dimension, location, material);
    if (material === "tnt") dimension.createExplosion(location, 6, { breaksBlocks: false, causesFire: false });
  });
  system.runTimeout(() => exploded.delete(id), 40);
});
