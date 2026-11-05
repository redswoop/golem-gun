// What the wands and the rod do to a mob.
//
// A vanilla mob's texture can't be changed from a script, so the first wand on a mob
// swaps it for a lookalike whose `material` property picks the texture. After that a
// wand only changes the property. The Golem Rod swaps a mob for the head golem.
import { ItemStack } from "@minecraft/server";
import { HEADS, MATERIALS, MOBS } from "./data.js";
import { HEAD_GOLEM, NS, applyForm, materialOf, setMaterialOf } from "./material.js";

const HEAD = `${NS}:head`;
const IRON_GOLEM = "minecraft:iron_golem";
const CLIMATE = "minecraft:climate_variant";
const HEALTH = "minecraft:health";
const OWNED = "minecraft:is_tamed";
const SADDLED = "minecraft:is_saddled";

const FANCY = { [IRON_GOLEM]: `${NS}:iron_golem` };
const KIND = {};
for (const mob of Object.keys(MOBS)) {
  FANCY[`minecraft:${mob}`] = `${NS}:${mob}`;
  KIND[`minecraft:${mob}`] = KIND[`${NS}:${mob}`] = mob;
}
const VANILLA = Object.fromEntries(Object.entries(FANCY).map(([v, f]) => [f, v]));

export const isConverted = (e) => e.typeId === HEAD_GOLEM || e.typeId in VANILLA;

/** The spawn event that gives this type the right age and origin, if it needs one. */
function spawnEvent(typeId, baby) {
  if (typeId === IRON_GOLEM) return "minecraft:from_player";
  const kind = KIND[typeId];
  if (!kind) return undefined;
  return (baby ? MOBS[kind].baby : MOBS[kind].adult) ?? undefined;
}

export function spawn(dimension, typeId, location, { baby = false, properties = {}, material = undefined } = {}) {
  const event = spawnEvent(typeId, baby);
  const mob = dimension.spawnEntity(typeId, location, event ? { spawnEvent: event } : undefined);
  for (const [k, v] of Object.entries(properties)) mob.setProperty(k, v);
  if (material) setMaterialOf(mob, material);
  return mob;
}

function isBaby(mob) {
  return !!mob.getComponent("minecraft:is_baby");
}

function health(mob) {
  return mob.getComponent(HEALTH)?.currentValue;
}

function setHealth(mob, value) {
  const h = mob.getComponent(HEALTH);
  if (h && value !== undefined) h.setCurrentValue(Math.min(value, h.effectiveMax));
}

/** Replace a mob, keeping where it stands, which way it faces and its name. */
function swap(mob, typeId, options) {
  const { dimension, location, nameTag } = mob;
  const rotation = mob.getRotation();
  const next = spawn(dimension, typeId, location, options);
  next.setRotation(rotation);
  if (nameTag) next.nameTag = nameTag;
  mob.remove();
  return next;
}

/**
 * The same individual in another skin: age, climate and what it wears (a saddle, shorn
 * wool, a creeper's charge) all carry over. Held items and armor don't.
 */
function twin(mob, typeId, material = undefined) {
  const kind = MOBS[KIND[mob.typeId]];
  const worn = Object.entries(kind?.worn ?? {}).filter(([component]) => mob.getComponent(component));
  const properties = kind?.climate ? { [CLIMATE]: mob.getProperty(CLIMATE) } : {};
  const next = swap(mob, typeId, { baby: isBaby(mob), properties, material });
  for (const [, event] of worn) next.triggerEvent(event);
  if (material) applyForm(next, material);
  return next;
}

function sparkle(mob, player) {
  try { mob.dimension.spawnParticle("minecraft:totem_particle", mob.location); } catch {}
  try { player.playSound("random.orb"); } catch {}
}

/** Swapping a pet would lose its owner, its collar and its armor, so owned mobs are left alone. */
function refuseOwned(mob, player) {
  if (!mob.getComponent(OWNED)) return false;
  player.onScreenDisplay.setActionBar("§cThat pet has an owner, so it stays as it is");
  return true;
}

/**
 * Paint a vanilla mob. A mutation happens once: a painted mob, a painted golem and a
 * head golem are refused (setMaterial is the debug way round that). `refund` is the
 * damage the wand's hit just did, when it came from a hit, so that painting a mob never
 * hurts it. Returns the painted mob, or undefined.
 */
export function paint(mob, material, player, refund = 0) {
  if (!MATERIALS.includes(material)) throw new Error(`no material ${material}`);
  if (isConverted(mob)) {
    player.onScreenDisplay.setActionBar("§eThat mob has already mutated. It only happens once!");
    return undefined;
  }
  if (material === "iron" && mob.typeId === IRON_GOLEM) {
    player.onScreenDisplay.setActionBar("§eThat golem is already iron!");
    return undefined;
  }
  if (!(mob.typeId in FANCY)) {
    player.onScreenDisplay.setActionBar("§cThat mob can't be painted yet");
    return undefined;
  }
  if (refuseOwned(mob, player)) return undefined;
  const before = health(mob);
  const painted = twin(mob, FANCY[mob.typeId], material);
  setHealth(painted, before + refund);
  sparkle(painted, player);
  return painted;
}

/** Debug: set any converted mob's material, or paint a vanilla one, ignoring the once-only rule. */
export function setMaterial(mob, material) {
  if (isConverted(mob)) {
    setMaterialOf(mob, material);
    applyForm(mob, material);
    return mob;
  }
  return mob.typeId in FANCY ? twin(mob, FANCY[mob.typeId], material) : undefined;
}

/** Turn a mob into a golem wearing its head. Keeps its material and name. */
export function golemize(mob, player) {
  if (mob.typeId === IRON_GOLEM || isGolem(mob)) {
    player.onScreenDisplay.setActionBar("§eThat's already a golem!");
    return undefined;
  }
  const head = KIND[mob.typeId];
  if (!HEADS.includes(head)) {
    player.onScreenDisplay.setActionBar("§cThe Golem Rod doesn't work on that mob yet");
    return undefined;
  }
  if (refuseOwned(mob, player)) return undefined;
  if (mob.getComponent(SADDLED)) mob.dimension.spawnItem(new ItemStack("minecraft:saddle"), mob.location);
  // A plain mob's golem keeps the defaults: an iron body with the mob's own head colours.
  const material = mob.typeId in VANILLA ? materialOf(mob) : undefined;
  const golem = swap(mob, HEAD_GOLEM, { properties: { [HEAD]: HEADS.indexOf(head) }, material });
  if (material) applyForm(golem, material);
  sparkle(golem, player);
  return golem;
}

function isGolem(mob) {
  return mob.typeId === HEAD_GOLEM || mob.typeId === `${NS}:iron_golem`;
}

/** Turn a converted mob back into the vanilla mob it was. */
export function restore(mob) {
  if (mob.typeId === HEAD_GOLEM) {
    return swap(mob, `minecraft:${HEADS[mob.getProperty(HEAD)]}`, {});
  }
  const typeId = VANILLA[mob.typeId];
  if (!typeId || mob.getComponent(OWNED)) return undefined;
  const before = health(mob);
  const next = twin(mob, typeId);
  setHealth(next, before);
  return next;
}
