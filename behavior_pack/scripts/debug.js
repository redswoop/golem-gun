// Golem Debug menu and its /scriptevent commands, so anything can be set up or
// cleaned up without chasing mobs around:
//   /scriptevent golem:give      all the wands
//   /scriptevent golem:lineup    one of everything in a row
//   /scriptevent golem:spawn golem|cow|creeper|...   a plain vanilla mob to practice on
//   /scriptevent golem:reset     turn converted mobs back into vanilla ones
//   /scriptevent golem:despawn   remove converted mobs
//   /scriptevent golem:tp        teleport to the nearest converted mob
//   /scriptevent golem:status    list converted mobs in chat and the log
//   /scriptevent golem:give_wand <material>    one wand
//   /scriptevent golem:set_element <material>  repaint the converted mob you look at (or
//                                the nearest), ignoring the once-only rule
//   /scriptevent golem:speed <n>  production speed multiplier (production comes in phase 2)
// Holding the Golem Debug shows what the mob you look at is made of.
import { EquipmentSlot, ItemStack, system, world } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { MATERIALS, HEADS, MOBS, LADDER, DROPS, IRON_PAINTED } from "./data.js";
import { isConverted, restore, setMaterial, spawn } from "./convert.js";

export const SPEED = "golemgun:speed";
export const speed = () => world.getDynamicProperty(SPEED) ?? 1;

const MATERIAL = "golemgun:material";
const HEAD = "golemgun:head";
const GAP = 4;
const PER_ROW = 8;

function ahead(player, blocks) {
  const { x, y, z } = player.location;
  const d = player.getViewDirection();
  const len = Math.hypot(d.x, d.z) || 1;
  return { x: x + (d.x / len) * blocks, y, z: z + (d.z / len) * blocks };
}

function converted(player) {
  return player.dimension.getEntities({ location: player.location, maxDistance: 64 }).filter(isConverted);
}

function lineup(player) {
  // Every golem material, then each mob adult and baby and each head, walking through the
  // materials so that a batch of mobs shows every sheet without a mob per combination.
  const cycle = (i) => MATERIALS[i % MATERIALS.length];
  const mobs = Object.keys(MOBS);
  const entries = [
    ["minecraft:iron_golem", {}],
    ...MATERIALS.map((m) => ["golemgun:iron_golem", { properties: { [MATERIAL]: m } }]),
    ...mobs.flatMap((mob, i) => [
      [`golemgun:${mob}`, { properties: { [MATERIAL]: cycle(i) } }],
      ...(MOBS[mob].baby ? [[`golemgun:${mob}`, { baby: true, properties: { [MATERIAL]: cycle(i + 1) } }]] : []),
    ]),
    ...HEADS.map((_, head) => ["golemgun:head_golem", { properties: { [HEAD]: head, [MATERIAL]: head ? cycle(head) : "iron" } }]),
  ];
  const start = ahead(player, 8);
  const d = player.getViewDirection();
  const len = Math.hypot(d.x, d.z) || 1;
  const forward = { x: d.x / len, z: d.z / len };
  const across = { x: -forward.z, z: forward.x };
  entries.forEach(([type, options], i) => {
    const off = (i % PER_ROW - (PER_ROW - 1) / 2) * GAP;
    const row = Math.floor(i / PER_ROW) * GAP;
    const location = { x: start.x + across.x * off + forward.x * row, y: start.y, z: start.z + across.z * off + forward.z * row };
    spawn(player.dimension, type, location, options);
  });
  player.sendMessage(`§7Spawned ${entries.length} mobs.`);
}

function resetAll(player) {
  const reset = converted(player).map(restore).filter(Boolean);
  player.sendMessage(`§7Reset ${reset.length} mobs.`);
}

function despawnAll(player) {
  const mobs = converted(player);
  mobs.forEach((m) => m.remove());
  player.sendMessage(`§7Removed ${mobs.length} mobs.`);
}

function teleportToNearest(player) {
  const dist = (e) => Math.hypot(e.location.x - player.location.x, e.location.z - player.location.z);
  const near = converted(player).sort((a, b) => dist(a) - dist(b))[0];
  if (near) player.teleport(near.location);
  else player.sendMessage("§7No converted mobs nearby.");
}

function status(player) {
  const mobs = converted(player);
  const lines = mobs.map((m) => {
    const head = m.typeId.endsWith("head_golem") ? ` head=${HEADS[m.getProperty(HEAD)]}` : "";
    return `${describe(m)}${head} health=${m.getComponent("minecraft:health")?.currentValue}`;
  });
  const text = `[golemgun] ${mobs.length} converted mobs\n${lines.join("\n")}`;
  player.sendMessage(text);
  console.warn(text);
}

const nice = (id) => id.replace("minecraft:", "").replaceAll("_", " ");

/** What a converted mob is made of, for the action bar and status. */
export function describe(mob) {
  let material = mob.getProperty(MATERIAL);
  if (material === IRON_PAINTED) material = "iron";
  const name = mob.typeId.replace("golemgun:", "").replaceAll("_", " ");
  const tier = LADDER.indexOf(material);
  const drop = DROPS[material];
  const rare = drop.rare.length ? `, rarely ${drop.rare.map(([item, chance]) => `${nice(item)} (${Math.round(chance * 100)}%)`).join(" or ")}` : "";
  const place = tier < 0 ? "off the ladder" : `tier ${tier + 1} of ${LADDER.length}`;
  return `${name}: ${material}, ${place}. Makes ${nice(drop.drop)}${rare}`;
}

function lookedAt(player) {
  const hit = player.getEntitiesFromViewDirection({ maxDistance: 16 }).find((h) => h.entity.typeId !== "minecraft:item");
  return hit?.entity;
}

function setElement(player, material) {
  if (!MATERIALS.includes(material)) {
    player.sendMessage(`§cNo material ${material}. Try: ${MATERIALS.join(", ")}`);
    return;
  }
  const dist = (e) => Math.hypot(e.location.x - player.location.x, e.location.z - player.location.z);
  const target = lookedAt(player) ?? converted(player).sort((a, b) => dist(a) - dist(b))[0];
  const done = target && setMaterial(target, material);
  player.sendMessage(done ? `§7Set ${done.typeId} to ${material}.` : "§7Nothing to set. Look at a mob.");
}

function giveWand(player, material) {
  if (!MATERIALS.includes(material)) {
    player.sendMessage(`§cNo wand ${material}. Try: ${MATERIALS.join(", ")}`);
    return;
  }
  player.getComponent("minecraft:inventory").container.addItem(new ItemStack(`golemgun:${material}_wand`));
}

function setSpeed(player, arg) {
  const n = Number(arg);
  if (!(n > 0)) {
    player.sendMessage(`§7Production speed is ${speed()}x. Set it with /scriptevent golem:speed <n>.`);
    return;
  }
  world.setDynamicProperty(SPEED, n);
  player.sendMessage(`§7Production speed set to ${n}x.`);
}

/** Holding the Golem Debug shows what the mob you look at is made of. */
export function startReadout(debugItem) {
  system.runInterval(() => {
    for (const player of world.getPlayers()) {
      const held = player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand)?.typeId;
      if (held !== debugItem) continue;
      const mob = lookedAt(player);
      if (mob && isConverted(mob)) player.onScreenDisplay.setActionBar(`§b${describe(mob)}`);
    }
  }, 10);
}

/** Runs one debug action. Returns false if the name isn't one. */
export function debugAction(player, name, arg, give) {
  if (name === "give") give(player);
  else if (name === "lineup") lineup(player);
  else if (name === "spawn") spawn(player.dimension, arg in MOBS ? `minecraft:${arg}` : "minecraft:iron_golem", ahead(player, 5));
  else if (name === "reset") resetAll(player);
  else if (name === "despawn") despawnAll(player);
  else if (name === "tp") teleportToNearest(player);
  else if (name === "status") status(player);
  else if (name === "give_wand") giveWand(player, arg);
  else if (name === "set_element") setElement(player, arg);
  else if (name === "speed") setSpeed(player, arg);
  else return false;
  return true;
}

export async function debugMenu(player, give) {
  const actions = [
    ["Give wands", "give"], ["Spawn test lineup", "lineup"], ["Spawn iron golem", "spawn", "golem"], ["Spawn cow", "spawn", "cow"],
    ["Spawn zombie", "spawn", "zombie"], ["Spawn creeper", "spawn", "creeper"],
    ["Reset converted mobs", "reset"], ["Remove converted mobs", "despawn"], ["Teleport to nearest", "tp"], ["Status", "status"],
  ];
  const form = new ActionFormData().title("Golem Debug");
  for (const [label] of actions) form.button(label);
  const { canceled, selection } = await form.show(player);
  if (canceled) return;
  debugAction(player, actions[selection][1], actions[selection][2], give);
}
