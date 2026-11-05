// Painted farm animals breed (0.8.0; sterile before). The game breeds them like vanilla
// (wheat, seeds, carrots) and spawns a baby of the painted kind, and this gives the baby
// its material: a listed pair of parents makes a hybrid (HYBRIDS: stone + wood is clay),
// otherwise it takes one parent's material at random, so same-material pairs breed true.
// Hybrids breed too; no wand makes them. The parents are the two nearest grown mobs of
// the same kind, which is what breeding leaves standing next to the newborn.
import { system, world } from "@minecraft/server";
import { HYBRIDS } from "./data.js";
import { applyForm, isPainted, materialOf, setMaterialOf } from "./material.js";

const PARENT_REACH = 4;
const BORN = "Born";
const GROW_UP = "minecraft:ageable_grow_up";

const hybrids = new Map(HYBRIDS.map(([a, b, h]) => [`${a}+${b}`, h]));

/** The hybrid of two materials, if there is one. */
export const hybridOf = (a, b) => hybrids.get([a, b].sort().join("+"));

/** What a baby of these parents is made of: a hybrid, or one parent's material. */
export function childMaterial(parents) {
  const materials = parents.filter(Boolean);
  if (!materials.length) return undefined;
  if (materials.length > 1) {
    const hybrid = hybridOf(materials[0], materials[1]);
    if (hybrid) return hybrid;
  }
  return materials[Math.floor(Math.random() * materials.length)];
}

function parentsOf(baby) {
  const { dimension, location, typeId } = baby;
  const dist = (e) => Math.hypot(e.location.x - location.x, e.location.y - location.y, e.location.z - location.z);
  let near = [];
  try {
    near = dimension.getEntities({ type: typeId, location, maxDistance: PARENT_REACH });
  } catch {
    return [];
  }
  return near
    .filter((e) => e.typeId === typeId && e.id !== baby.id && !e.getComponent("minecraft:is_baby") && dist(e) <= PARENT_REACH)
    .sort((a, b) => dist(a) - dist(b))
    .slice(0, 2);
}

world.afterEvents.entitySpawn.subscribe(({ entity: baby, cause }) => {
  if (cause !== BORN || !isPainted(baby)) return;
  system.run(() => {
    if (!baby.isValid) return;
    const material = childMaterial(parentsOf(baby).map(materialOf));
    if (!material) return;
    setMaterialOf(baby, material);
    applyForm(baby, material);
  });
});

// A bred baby grows up into its material's form (a boulder calf becomes a giant).
world.afterEvents.dataDrivenEntityTrigger.subscribe(({ entity, eventId }) => {
  if (eventId !== GROW_UP || !isPainted(entity)) return;
  system.run(() => { if (entity.isValid) applyForm(entity); });
});
