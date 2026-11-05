// What a painted mob is made of. Since 0.8.0 the material is the `golemgun:mat` int, an
// index into MATERIALS. Mobs painted before that have -1 there and their material in the
// `golemgun:material` enum, which only holds LEGACY (the first 15) and is still written
// for them, so an old world keeps working with no migration. A head golem's enum has
// "iron" (plain: iron body, the mob's own head colours) and IRON_PAINTED for an all-iron
// one; here both read as "iron".
import { FORMS, IRON_PAINTED, LEGACY, MATERIALS } from "./data.js";

export const NS = "golemgun";
export const MATERIAL = `${NS}:material`;
export const MAT = `${NS}:mat`;
export const HEAD_GOLEM = `${NS}:head_golem`;

export const isPainted = (mob) => typeof mob?.typeId === "string" && mob.typeId.startsWith(`${NS}:`);

/** The material's name, or undefined for anything that isn't painted. */
export function materialOf(mob) {
  try {
    const i = mob.getProperty(MAT);
    if (i >= 0) return MATERIALS[i];
    const legacy = mob.getProperty(MATERIAL);
    return legacy === IRON_PAINTED ? "iron" : legacy;
  } catch {
    return undefined;
  }
}

/** Sets a painted mob's material. Legacy materials land on the enum too. */
export function setMaterialOf(mob, name) {
  const i = MATERIALS.indexOf(name);
  if (i < 0) throw new Error(`no material ${name}`);
  if (LEGACY.includes(name)) {
    mob.setProperty(MATERIAL, mob.typeId === HEAD_GOLEM && name === "iron" ? IRON_PAINTED : name);
  }
  mob.setProperty(MAT, i);
}

/**
 * Adds the material's form group (FORMS: fragile, giant, tiny), if it has one. Fragile
 * applies to anything; giant and tiny only to grown mobs, so a baby grows up into its
 * form (breeding.js catches that) instead of being a giant calf.
 */
export function applyForm(mob, material = materialOf(mob)) {
  const form = FORMS[material];
  if (!form) return;
  if (form !== "fragile" && mob.getComponent("minecraft:is_baby")) return;
  try {
    mob.triggerEvent(`${NS}:${form}`);
  } catch {}
}
