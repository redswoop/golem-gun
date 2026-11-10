// Golem Gun: input and setup. convert.js does the work, drops.js handles what painted
// mobs leave behind, guide.js is the in-game manual, and debug.js has the test tools.
import { EquipmentSlot, ItemStack, system, world } from "@minecraft/server";
import { WANDS as WAND_MATERIALS } from "./data.js";
import { golemize, paint } from "./convert.js";
import { debugAction, debugMenu, startReadout } from "./debug.js";
import { showGuide } from "./guide.js";
import "./drops.js";
import "./twists.js";
import "./breeding.js";

export const VERSION = "0.8.2";

const ROD = "golemgun:golem_rod";
const DEBUG = "golemgun:debug_wand";
const STARTER = "golemgun:wood_wand";
const GOT_STARTER = "golemgun:got_starter";
const GUIDE = "golemgun:guide";
// Separate from the starter flag, so players from before the guide get one too. A new key
// in 0.8.2: 0.8.1 set the old one even when a full inventory swallowed the book.
const GOT_GUIDE = "golemgun:guide_given";
const WANDS = Object.fromEntries(WAND_MATERIALS.map((m) => [`golemgun:${m}_wand`, m]));
const REACH = 8;
const HIT_DAMAGE = 1;      // what a wand does as a weapon, handed back after painting
const REPEAT_TICKS = 6;    // one tap can fire more than one of the events below

const isOurs = (id) => id === ROD || id in WANDS;
const lastUsed = new Map();

function apply(player, itemId, target, refund = 0) {
  const now = system.currentTick;
  if (now - (lastUsed.get(player.id) ?? -REPEAT_TICKS) < REPEAT_TICKS) return;
  lastUsed.set(player.id, now);
  if (itemId === ROD) golemize(target, player);
  else paint(target, WANDS[itemId], player, refund);
}

/** Hands over whichever of these the player doesn't already carry. addItem gives nothing
 * back when the inventory is full, so what doesn't fit lands at the player's feet. */
function give(player, ids) {
  const inventory = player.getComponent("minecraft:inventory").container;
  let dropped = false;
  for (const id of ids) {
    let has = false;
    for (let i = 0; i < inventory.size && !has; i++) has = inventory.getItem(i)?.typeId === id;
    if (has) continue;
    const left = inventory.addItem(new ItemStack(id));
    if (left) { player.dimension.spawnItem(left, player.location); dropped = true; }
  }
  if (dropped) player.sendMessage("§eYour inventory is full, so it's on the ground at your feet.");
}

/** Debug: everything. Players otherwise get one Wood Wand and craft the rest. */
const giveWands = (player) => give(player, [...Object.keys(WANDS), ROD, DEBUG, GUIDE]);

function giveStarter(player) {
  if (!player.getDynamicProperty(GOT_STARTER)) {
    player.setDynamicProperty(GOT_STARTER, true);
    give(player, [STARTER]);
    player.sendMessage("§7You got a Wood Wand. It changes a mob for good. Try it on a cow.");
  }
  if (!player.getDynamicProperty(GOT_GUIDE)) {
    player.setDynamicProperty(GOT_GUIDE, true);
    give(player, [GUIDE]);
    player.sendMessage("§7You got a Golem Guide. Hold it and use it to read how the wands, drops, creepers and breeding work.");
  }
}

// Touch screens: holding on a mob. Cancelled so the wand doesn't also milk or breed.
world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
  const id = ev.itemStack?.typeId;
  if (!isOurs(id)) return;
  ev.cancel = true;
  const { player, target } = ev;
  system.run(() => { if (target.isValid) apply(player, id, target); });
});

// Using the wand while looking at a mob from a little way off.
world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
  if (itemStack.typeId === DEBUG) { debugMenu(source, giveWands); return; }
  if (itemStack.typeId === GUIDE) { showGuide(source); return; }
  if (!isOurs(itemStack.typeId)) return;
  const hit = source.getEntitiesFromViewDirection({ maxDistance: REACH }).find((h) => h.entity.typeId !== "minecraft:item");
  if (hit) apply(source, itemStack.typeId, hit.entity);
});

// Tapping a mob on a touch screen is an attack, so a hit counts too.
world.afterEvents.entityHitEntity.subscribe(({ damagingEntity: player, hitEntity: target }) => {
  if (player.typeId !== "minecraft:player" || !target.isValid) return;
  const id = player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand)?.typeId;
  if (isOurs(id)) apply(player, id, target, HIT_DAMAGE);
});

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  player.sendMessage(`§7Golem Gun ${VERSION} loaded.`);
  giveStarter(player);
});

startReadout(DEBUG);

system.afterEvents.scriptEventReceive.subscribe(({ id, message, sourceEntity: player }) => {
  if (!id.startsWith("golem:") || player?.typeId !== "minecraft:player") return;
  const name = id.slice("golem:".length);
  if (name === "guide") showGuide(player);
  else debugAction(player, name, message.trim(), giveWands);
});
