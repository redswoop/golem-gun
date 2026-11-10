// Runs the real pack scripts against the fake game in test/mock. Logic only: how
// any of this looks, and whether the mobs are visible, needs the real game.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Dimension, Player, system, world, ItemStack } from "@minecraft/server";
import { golemize, paint, restore, setMaterial, spawn } from "../behavior_pack/scripts/convert.js";
import { DROPS, HYBRIDS, LADDER, LEGACY, MATERIALS, MOBS, NAMES, WANDS } from "../behavior_pack/scripts/data.js";
import { describe } from "../behavior_pack/scripts/debug.js";
import { materialOf } from "../behavior_pack/scripts/material.js";
import { childMaterial, hybridOf } from "../behavior_pack/scripts/breeding.js";
import { tickAll } from "../behavior_pack/scripts/twists.js";
import { PAGES, showGuide } from "../behavior_pack/scripts/guide.js";
import { ActionFormData } from "@minecraft/server-ui";
import "../behavior_pack/scripts/main.js";

const at = { x: 1, y: 64, z: 2 };
const setup = () => { const d = new Dimension(); return { d, p: new Player(d) }; };
const only = (d) => { assert.equal(d.mobs.size, 1); return [...d.mobs][0]; };

test("a wand swaps a vanilla cow for a painted one, keeping what makes it that cow", () => {
  const { d, p } = setup();
  const cow = spawn(d, "minecraft:cow", at);
  cow.nameTag = "Daisy"; cow.hp = 7; cow.rotation = { x: 0, y: 90 };
  cow.setProperty("minecraft:climate_variant", "cold");
  const fancy = paint(cow, "copper", p);
  assert.equal(only(d), fancy);
  assert.equal(fancy.typeId, "golemgun:cow");
  assert.equal(fancy.getProperty("golemgun:material"), "copper");
  assert.equal(fancy.getProperty("minecraft:climate_variant"), "cold");
  assert.equal(fancy.nameTag, "Daisy");
  assert.equal(fancy.hp, 7);
  assert.deepEqual(fancy.rotation, { x: 0, y: 90 });
  assert.equal(fancy.spawnEvent, "minecraft:spawn_adult");
});

test("babies stay babies", () => {
  const { d, p } = setup();
  const calf = d.spawnEntity("minecraft:cow", at, { spawnEvent: "minecraft:entity_born" });
  const fancy = paint(calf, "obsidian", p);
  assert.ok(fancy.getComponent("minecraft:is_baby"));
  assert.ok(restore(fancy).getComponent("minecraft:is_baby"));
});

test("a mutation happens once: a second wand leaves a painted mob as it is", () => {
  const { d, p } = setup();
  const fancy = paint(spawn(d, "minecraft:iron_golem", at), "copper", p);
  assert.equal(paint(fancy, "obsidian", p), undefined);
  assert.match(p.bar.at(-1), /already mutated/);
  assert.equal(fancy.getProperty("golemgun:material"), "copper");
  assert.equal(only(d), fancy);
});

test("the debug set_element repaints anyway", () => {
  const { d, p } = setup();
  const fancy = paint(spawn(d, "minecraft:cow", at), "copper", p);
  assert.equal(setMaterial(fancy, "diamond"), fancy);
  assert.equal(fancy.getProperty("golemgun:material"), "diamond");
  const golem = golemize(fancy, p);
  setMaterial(golem, "iron");
  assert.equal(golem.getProperty("golemgun:material"), "iron_painted");
});

test("a wand hit costs no health", () => {
  const { d, p } = setup();
  const golem = spawn(d, "minecraft:iron_golem", at);
  golem.hp = 59;
  assert.equal(paint(golem, "copper", p, 1).hp, 60);
});

test("healing back a hit never goes over full health", () => {
  const { d, p } = setup();
  assert.equal(paint(spawn(d, "minecraft:iron_golem", at), "copper", p, 1).hp, 100);
});

test("wands refuse mobs they don't support, and leave them alone", () => {
  const { d, p } = setup();
  const bat = spawn(d, "minecraft:bat", at);
  assert.equal(paint(bat, "copper", p), undefined);
  assert.match(p.bar.at(-1), /can't be painted/);
  assert.equal(only(d), bat);
});

test("the rod makes a head golem with the cow's head", () => {
  const { d, p } = setup();
  const cow = spawn(d, "minecraft:cow", at);
  cow.nameTag = "Daisy";
  const golem = golemize(cow, p);
  assert.equal(only(d), golem);
  assert.equal(golem.typeId, "golemgun:head_golem");
  assert.equal(golem.getProperty("golemgun:head"), 0);
  assert.equal(golem.getProperty("golemgun:material"), "iron");
  assert.equal(golem.hp, 100);
  assert.equal(golem.nameTag, "Daisy");
});

test("the rod keeps a painted cow's material, and wands leave head golems alone", () => {
  const { d, p } = setup();
  const golem = golemize(paint(spawn(d, "minecraft:cow", at), "obsidian", p), p);
  assert.equal(golem.getProperty("golemgun:material"), "obsidian");
  assert.equal(paint(golem, "copper", p), undefined);
  assert.equal(golem.getProperty("golemgun:material"), "obsidian");
  assert.equal(paint(golemize(spawn(d, "minecraft:cow", at), p), "gold", p), undefined, "a plain-iron head golem too");
});

test("the rod refuses golems and mobs without a head on the list", () => {
  const { d, p } = setup();
  for (const mob of [spawn(d, "minecraft:iron_golem", at), paint(spawn(d, "minecraft:iron_golem", at), "copper", p), golemize(spawn(d, "minecraft:cow", at), p)]) {
    assert.equal(golemize(mob, p), undefined);
    assert.match(p.bar.at(-1), /already a golem/);
  }
  assert.equal(golemize(spawn(d, "minecraft:bat", at), p), undefined);
  assert.match(p.bar.at(-1), /doesn't work/);
});

test("reset brings back the vanilla mob", () => {
  const { d, p } = setup();
  const cow = spawn(d, "minecraft:cow", at);
  cow.setProperty("minecraft:climate_variant", "warm");
  const back = restore(paint(cow, "copper", p));
  assert.equal(back.typeId, "minecraft:cow");
  assert.equal(back.getProperty("minecraft:climate_variant"), "warm");
  assert.equal(back.spawnEvent, "minecraft:spawn_adult");
  assert.equal(restore(golemize(spawn(d, "minecraft:cow", at), p)).typeId, "minecraft:cow");
  const golem = restore(paint(spawn(d, "minecraft:iron_golem", at), "copper", p));
  assert.equal(golem.typeId, "minecraft:iron_golem");
  assert.equal(golem.spawnEvent, "minecraft:from_player");
});

test("every input path works, and one tap firing two of them only counts once", () => {
  const { d, p } = setup();
  const equip = (id) => { p.getComponent = (n) => (n === "minecraft:equippable" ? { getEquipment: () => new ItemStack(id) } : undefined); };
  equip("golemgun:copper_wand");
  const cow = spawn(d, "minecraft:cow", at);
  world.afterEvents.entityHitEntity.fire({ damagingEntity: p, hitEntity: cow });
  const fancy = only(d);
  assert.equal(fancy.getProperty("golemgun:material"), "copper");
  p.getEntitiesFromViewDirection = () => [{ entity: fancy }];
  world.afterEvents.itemUse.fire({ source: p, itemStack: new ItemStack("golemgun:golem_rod") });
  assert.equal(only(d), fancy, "same tap, so ignored");

  system.currentTick += 10;
  const calf = spawn(d, "minecraft:cow", at);
  p.getEntitiesFromViewDirection = () => [{ entity: calf }];
  world.afterEvents.itemUse.fire({ source: p, itemStack: new ItemStack("golemgun:obsidian_wand") });
  assert.equal([...d.mobs].at(-1).getProperty("golemgun:material"), "obsidian", "using the wand at a mob");
  d.mobs.delete([...d.mobs].at(-1));

  system.currentTick += 10;
  const ev = { itemStack: new ItemStack("golemgun:golem_rod"), player: p, target: fancy };
  world.beforeEvents.playerInteractWithEntity.fire(ev);
  assert.equal(ev.cancel, true);
  assert.equal(only(d).typeId, "golemgun:head_golem");
});

test("every mob and material paints, and every mob gives the rod its own head", () => {
  for (const [i, mob] of Object.keys(MOBS).entries()) {
    for (const material of MATERIALS) {
      const { d, p } = setup();
      const fancy = paint(spawn(d, `minecraft:${mob}`, at), material, p);
      assert.equal(fancy.typeId, `golemgun:${mob}`);
      assert.equal(materialOf(fancy), material);
      assert.equal(fancy.getProperty("golemgun:mat"), MATERIALS.indexOf(material));
      if (LEGACY.includes(material)) assert.equal(fancy.getProperty("golemgun:material"), material, "legacy materials land on the enum too");
      else assert.equal(fancy.getProperty("golemgun:material"), "copper", "a hybrid leaves the enum at its default");
      const golem = golemize(fancy, p);
      assert.equal(golem.getProperty("golemgun:head"), i);
      assert.equal(materialOf(golem), material);
      if (LEGACY.includes(material)) assert.equal(golem.getProperty("golemgun:material"), material === "iron" ? "iron_painted" : material);
      else assert.equal(golem.getProperty("golemgun:material"), "iron", "a hybrid's golem is drawn as plain iron");
      assert.equal(restore(golem).typeId, `minecraft:${mob}`);
    }
  }
});

test("babies of every mob stay babies", () => {
  for (const [mob, { baby: event }] of Object.entries(MOBS)) {
    if (!event) continue;
    const { d, p } = setup();
    const baby = d.spawnEntity(`minecraft:${mob}`, at, { spawnEvent: event });
    const fancy = paint(baby, "gold", p);
    assert.ok(fancy.getComponent("minecraft:is_baby"), mob);
    assert.equal(fancy.spawnEvent, event, mob);
    assert.ok(restore(fancy).getComponent("minecraft:is_baby"), mob);
  }
});

test("climate carries over only for mobs that have one", () => {
  const { d, p } = setup();
  const chick = spawn(d, "minecraft:chicken", at);
  chick.setProperty("minecraft:climate_variant", "cold");
  assert.equal(paint(chick, "gold", p).getProperty("minecraft:climate_variant"), "cold");
  assert.throws(() => paint(spawn(d, "minecraft:sheep", at), "gold", p).getProperty("minecraft:climate_variant"));
});

test("a saddle and shorn wool survive a wand and a reset", () => {
  const { d, p } = setup();
  const pig = spawn(d, "minecraft:pig", at);
  pig.triggerEvent("minecraft:on_saddled");
  const fancy = paint(pig, "gold", p);
  assert.ok(fancy.getComponent("minecraft:is_saddled"));
  assert.ok(restore(fancy).getComponent("minecraft:is_saddled"));
  const sheep = spawn(d, "minecraft:sheep", at);
  sheep.triggerEvent("minecraft:on_sheared");
  assert.ok(paint(sheep, "quartz", p).getComponent("minecraft:is_sheared"));
});

test("the rod hands back a saddle instead of eating it", () => {
  const { d, p } = setup();
  const pig = spawn(d, "minecraft:pig", at);
  pig.triggerEvent("minecraft:on_saddled");
  golemize(pig, p);
  assert.deepEqual(d.items, ["minecraft:saddle"]);
});

test("pets keep their owners: wands and the rod leave them alone", () => {
  const { d, p } = setup();
  const wolf = spawn(d, "minecraft:wolf", at);
  wolf.worn.add("minecraft:is_tamed");
  assert.equal(paint(wolf, "gold", p), undefined);
  assert.match(p.bar.at(-1), /owner/);
  assert.equal(golemize(wolf, p), undefined);
  assert.equal(only(d), wolf);
});

test("a wolf tamed after painting keeps its owner: reset leaves it alone", () => {
  const { d, p } = setup();
  const fancy = paint(spawn(d, "minecraft:wolf", at), "gold", p);
  fancy.worn.add("minecraft:is_tamed");
  assert.equal(restore(fancy), undefined);
  assert.equal(only(d), fancy);
});

test("other items are left alone", () => {
  const { d, p } = setup();
  const cow = spawn(d, "minecraft:cow", at);
  const ev = { itemStack: new ItemStack("minecraft:bucket"), player: p, target: cow };
  world.beforeEvents.playerInteractWithEntity.fire(ev);
  assert.equal(ev.cancel, undefined);
  assert.equal(only(d), cow);
});

test("the monsters are on the list: zombies, skeletons, creepers, spiders and the rest", () => {
  for (const mob of ["zombie", "husk", "drowned", "skeleton", "stray", "bogged", "creeper", "spider", "cave_spider",
    "enderman", "witch", "pillager", "vindicator", "piglin", "zombie_pigman"]) assert.ok(mob in MOBS, mob);
});

test("a baby zombie stays a baby zombie", () => {
  const { d, p } = setup();
  const baby = d.spawnEntity("minecraft:zombie", at, { spawnEvent: "minecraft:as_baby" });
  const fancy = paint(baby, "copper", p);
  assert.equal(fancy.typeId, "golemgun:zombie");
  assert.ok(fancy.getComponent("minecraft:is_baby"));
  assert.equal(golemize(fancy, p).getProperty("golemgun:head"), Object.keys(MOBS).indexOf("zombie"));
});

test("a charged creeper stays charged, and a shorn bogged stays shorn", () => {
  const { d, p } = setup();
  const creeper = spawn(d, "minecraft:creeper", at);
  creeper.triggerEvent("minecraft:become_charged");
  const fancy = paint(creeper, "diamond", p);
  assert.ok(fancy.getComponent("minecraft:is_charged"));
  assert.ok(restore(fancy).getComponent("minecraft:is_charged"));
  const bogged = spawn(d, "minecraft:bogged", at);
  bogged.triggerEvent("be_sheared");
  assert.ok(paint(bogged, "gold", p).getComponent("minecraft:is_sheared"));
});

test("painted monsters never despawn and never turn into a plain mob", async () => {
  const { readFileSync } = await import("node:fs");
  for (const mob of Object.keys(MOBS)) {
    const text = readFileSync(new URL(`../behavior_pack/entities/${mob}.json`, import.meta.url), "utf8");
    assert.ok(!text.includes("minecraft:despawn"), `${mob} can despawn`);
    assert.ok(!text.includes("minecraft:transformation"), `${mob} can transform`);
    assert.ok(text.includes("minecraft:persistent"), mob);
  }
});

const withRandom = (value, f) => { const r = Math.random; Math.random = () => value; try { f(); } finally { Math.random = r; } };

test("a mob with no baby form drops one or two of its material when it dies", () => {
  for (const material of MATERIALS) {
    const { d, p } = setup();
    withRandom(0.99, () => { paint(spawn(d, "minecraft:skeleton", at), material, p); only(d).kill(); });
    assert.deepEqual(d.items, [DROPS[material].drop], material);
    assert.equal(d.counts[0], 2 * DROPS[material].mult, material);
  }
  assert.equal(DROPS.boulder.mult, 4, "a giant drops four times as much");
  assert.equal(DROPS.copper.drop, "minecraft:raw_copper");
  assert.equal(DROPS.diamond.drop, "minecraft:diamond");
  assert.equal(DROPS.coal.drop, "minecraft:coal");
  assert.equal(DROPS.lapis.drop, "minecraft:lapis_lazuli", "every wand's mobs drop their material");
  assert.equal(DROPS.emerald.drop, "minecraft:emerald");
  assert.equal(DROPS.quartz.drop, "minecraft:quartz");
});

test("a painted chicken splits into 4 stone chicks that never grow up, and drops no material itself", () => {
  const { d, p } = setup();
  const hen = paint(spawn(d, "minecraft:chicken", at), "stone", p);
  hen.setProperty("minecraft:climate_variant", "warm");
  hen.kill();
  const chicks = [...d.mobs];
  assert.equal(chicks.length, 4);
  for (const chick of chicks) {
    assert.equal(chick.typeId, "golemgun:chicken");
    assert.equal(chick.spawnEvent, "golemgun:as_shard");
    assert.ok(chick.getComponent("minecraft:is_baby"));
    assert.equal(chick.getProperty("golemgun:material"), "stone");
    assert.equal(chick.getProperty("minecraft:climate_variant"), "warm");
  }
  assert.deepEqual(d.items, []);
  withRandom(0.99, () => chicks.forEach((c) => c.kill()));
  assert.deepEqual(d.items, Array(4).fill("minecraft:cobblestone"), "one each, and no new chicks");
  assert.deepEqual(d.counts, [1, 1, 1, 1]);
  assert.equal(d.mobs.size, 0);
});

test("a stone chick can drop raw iron (10%) and coal (20%)", () => {
  const roll = (value) => {
    const { d, p } = setup();
    const chick = paint(d.spawnEntity("minecraft:chicken", at, { spawnEvent: "minecraft:entity_born" }), "stone", p);
    withRandom(value, () => chick.kill());
    return d.items;
  };
  assert.deepEqual(roll(0.05), ["minecraft:cobblestone", "minecraft:raw_iron", "minecraft:coal",
    "minecraft:raw_copper", "minecraft:flint"], "plus same-layer copper and flint at 10%");
  assert.deepEqual(roll(0.15), ["minecraft:cobblestone", "minecraft:coal"]);
  assert.deepEqual(roll(0.5), ["minecraft:cobblestone"]);
  assert.deepEqual(DROPS.iron.rare, [["minecraft:raw_gold", 0.1]]);
});

test("a painted zombie doesn't split into baby zombies: it pops into 4 babies' worth of material", () => {
  const { d, p } = setup();
  withRandom(0.99, () => paint(spawn(d, "minecraft:zombie", at), "gold", p).kill());
  assert.equal(d.mobs.size, 0, "no baby zombies");
  assert.deepEqual(d.items, Array(4).fill("minecraft:raw_gold"));
  assert.deepEqual(d.counts, [1, 1, 1, 1]);
  assert.equal(d.impulses, 4, "every one flies");
  assert.deepEqual(d.sounds, ["random.pop"]);
  const { d: d2, p: p2 } = setup();
  withRandom(0.05, () => paint(spawn(d2, "minecraft:zombie", at), "stone", p2).kill());
  assert.equal(d2.items.filter((i) => i === "minecraft:raw_iron").length, 4, "and 4 rolls at the rare drops");
});

test("farm animals split into never-grow-up babies, and monsters with a baby form pop", async () => {
  const { readFileSync } = await import("node:fs");
  const pops = Object.keys(MOBS).filter((mob) => MOBS[mob].pops);
  assert.deepEqual(pops, ["zombie", "husk", "drowned", "piglin", "zombie_pigman"]);
  for (const [mob, kind] of Object.entries(MOBS)) {
    if (!kind.baby || kind.pops) { assert.equal(kind.shard, null, mob); }
    const { d, p } = setup();
    withRandom(0.99, () => paint(spawn(d, `minecraft:${mob}`, at), "wood", p).kill());
    if (!kind.baby) continue;
    if (kind.pops) {
      assert.equal(d.mobs.size, 0, mob);
      assert.equal(d.items.length, 4, mob);
      continue;
    }
    const e = JSON.parse(readFileSync(new URL(`../behavior_pack/entities/${mob}.json`, import.meta.url)))["minecraft:entity"];
    assert.ok(e.events["golemgun:as_shard"], mob);
    const shard = e.component_groups["golemgun:shard"];
    if (shard) assert.ok(!("minecraft:ageable" in shard) && "minecraft:is_baby" in shard, mob);
    assert.equal(d.mobs.size, 4, mob);
  }
});

test("a painted baby zombie still drops just one", () => {
  const { d, p } = setup();
  const baby = paint(d.spawnEntity("minecraft:zombie", at, { spawnEvent: "minecraft:as_baby" }), "iron", p);
  withRandom(0.99, () => baby.kill());
  assert.deepEqual(d.items, ["minecraft:raw_iron"]);
});

test("golems drop their material, and a never-painted head golem drops raw iron", () => {
  const { d, p } = setup();
  withRandom(0.99, () => {
    paint(spawn(d, "minecraft:iron_golem", at), "gold", p);
    only(d).kill();
    golemize(spawn(d, "minecraft:cow", at), p);
    only(d).kill();
  });
  assert.deepEqual(d.items, ["minecraft:raw_gold", "minecraft:raw_iron"]);
});

test("plain mobs drop nothing extra", () => {
  const { d } = setup();
  spawn(d, "minecraft:cow", at).kill();
  assert.deepEqual(d.items, []);
});

// A 5x5x5 cube of stone around the creeper, and the 3x3x3 middle of it blown away: 54
// blocks line the hole.
const HOLES = [];
for (let x = 0; x <= 2; x++) for (let y = 63; y <= 65; y++) for (let z = 1; z <= 3; z++) HOLES.push({ x, y, z });
const blastIn = (material, extra = (d) => {}) => {
  const { d, p } = setup();
  d.fill({ x: -1, y: 62, z: 0 }, { x: 3, y: 66, z: 4 }, "minecraft:stone");
  extra(d);
  const creeper = paint(spawn(d, "minecraft:creeper", at), material, p);
  creeper.explode(HOLES);
  world.afterEvents.entityDie.fire({ deadEntity: creeper });
  return d;
};

test("a painted creeper's crater is all its element, with 1-2 blocks of the next tier", () => {
  for (let i = 0; i < 20; i++) {
    const d = blastIn("iron");
    const next = d.count("minecraft:gold_ore");
    assert.ok(next >= 1 && next <= 2, `${next} gold ore`);
    assert.equal(d.count("minecraft:iron_ore"), 54 - next, "the rest of the lining is iron ore");
    assert.equal(d.count("minecraft:stone"), 125 - 27 - 54, "the blocks behind the lining stay");
    assert.equal(d.count("minecraft:air"), 27, "the blast still breaks blocks");
    assert.deepEqual(d.items, [], "no thrown blocks, and nothing dropped twice");
  }
  const up = { wood: "cobblestone", stone: "iron_ore", iron: "gold_ore", gold: "diamond_ore", diamond: "ancient_debris" };
  for (const [m, next] of Object.entries(up)) {
    assert.equal(DROPS[m].crater.ore, `minecraft:${next}`, m);
    assert.deepEqual(DROPS[m].crater.count, [1, 2], m);
  }
  assert.equal(DROPS.netherite.crater.ore, undefined, "nothing above netherite");
  for (const [m, { crater }] of Object.entries(DROPS)) {
    if (!["gold", "diamond"].includes(m)) assert.ok(!/diamond/.test(`${crater.host} ${crater.ore}`), m);
    if (!["diamond", "netherite"].includes(m)) assert.ok(!/debris/.test(`${crater.host} ${crater.ore}`), m);
  }
});

test("off-ladder creepers line the whole crater with their element", () => {
  for (const [m, block] of [["slime", "minecraft:slime"], ["honey", "minecraft:honey_block"], ["obsidian", "minecraft:obsidian"],
    ["coal", "minecraft:coal_ore"], ["lapis", "minecraft:lapis_ore"], ["netherite", "minecraft:ancient_debris"]]) {
    assert.equal(blastIn(m).count(block), 54, m);
  }
});

test("a crater turns builds too, but never chests, bedrock, beds or torches", () => {
  const d = blastIn("gold", (d) => {
    d.blocks.set("1,62,2", "minecraft:chest");      // under the middle of the hole
    d.blocks.set("1,66,2", "minecraft:bedrock");    // over it
    d.blocks.set("-1,64,2", "minecraft:oak_planks"); // in the side wall: a build
    d.blocks.set("3,64,2", "minecraft:bed");
    d.blocks.set("1,64,0", "minecraft:torch");
    d.blocks.set("1,64,4", "minecraft:water");
  });
  for (const [k, b] of [["1,62,2", "chest"], ["1,66,2", "bedrock"], ["3,64,2", "bed"], ["1,64,0", "torch"], ["1,64,4", "water"]]) {
    assert.equal(d.blocks.get(k), `minecraft:${b}`, b);
  }
  assert.ok(["minecraft:gold_ore", "minecraft:diamond_ore"].includes(d.blocks.get("-1,64,2")), "the planks turned");
  const diamonds = d.count("minecraft:diamond_ore");
  assert.ok(diamonds >= 1 && diamonds <= 2, `${diamonds} diamond ore`);
  assert.equal(d.count("minecraft:gold_ore"), 49 - diamonds);
});

test("a painted creeper whose blast breaks nothing throws ore blocks, and only once", () => {
  const { d, p } = setup();
  paint(spawn(d, "minecraft:creeper", at), "copper", p);
  const creeper = only(d);
  creeper.explode();
  world.afterEvents.entityDie.fire({ deadEntity: creeper });
  assert.ok(d.items.length >= 3 && d.items.length <= 5, `${d.items.length} blocks`);
  assert.ok(d.items.every((id) => id === "minecraft:copper_ore"));
  assert.equal(d.impulses, d.items.length, "every block flies");
});

test("a plain creeper's explosion throws nothing", () => {
  const { d } = setup();
  spawn(d, "minecraft:creeper", at).explode();
  assert.deepEqual(d.items, []);
});

test("a new player gets one Wood Wand and one Golem Guide, once", () => {
  const { d } = setup();
  const p = new Player(d);
  world.afterEvents.playerSpawn.fire({ player: p, initialSpawn: true });
  world.afterEvents.playerSpawn.fire({ player: p, initialSpawn: true });
  assert.deepEqual(p.inventory.map((i) => i.typeId), ["golemgun:wood_wand", "golemgun:guide"]);
});

test("a full inventory doesn't swallow the starter: it lands at the player's feet", () => {
  const { d } = setup();
  const p = new Player(d);
  for (let i = 0; i < 36; i++) p.inventory.push(new ItemStack("minecraft:dirt"));
  world.afterEvents.playerSpawn.fire({ player: p, initialSpawn: true });
  assert.deepEqual(d.items, ["golemgun:wood_wand", "golemgun:guide"]);
  assert.ok(p.messages.some((m) => /inventory is full/.test(m)));
  world.afterEvents.playerSpawn.fire({ player: p, initialSpawn: true });
  assert.equal(d.items.length, 2, "once");
});

test("a player from before the guide gets one on their next join", () => {
  const { d } = setup();
  const p = new Player(d);
  p.setDynamicProperty("golemgun:got_starter", true);
  world.afterEvents.playerSpawn.fire({ player: p, initialSpawn: true });
  assert.deepEqual(p.inventory.map((i) => i.typeId), ["golemgun:guide"]);
});

test("the guide quotes the real recipes, drops and craters", () => {
  const text = PAGES.map(([, body]) => body).join("\n");
  const ladder = PAGES.find(([t]) => t === "The wand ladder")[1];
  assert.match(ladder, /Stone Wand: Wood Wand \+ 4 cobblestone/);
  assert.match(ladder, /Diamond Wand: Gold Wand \+ 8 diamond/);
  assert.match(ladder, /Netherite Wand: Diamond Wand \+ 4 netherite scrap/);
  const side = PAGES.find(([t]) => t === "Side wands")[1];
  assert.match(side, /From a Wood Wand: .*Copper.*Slime.*TNT.*Honey/);
  assert.match(side, /From a Diamond Wand: Obsidian \(4 obsidian\)/);
  assert.match(side, /From an Iron Wand/);
  assert.match(side, /TNT \(4 TNT\)/);
  for (const m of WANDS) assert.match(text, new RegExp(NAMES[m]), `${m} is in the guide`);
  assert.match(text, /Stone: cobblestone, rarely raw iron \(10%\) or coal \(20%\)/);
  assert.match(text, /Iron creeper: iron ore, with a little gold ore hidden in it/);
  assert.match(text, /Diamond mobs shrug off 3 of every hit/);
  assert.match(text, /stone and wood make Clay/);
  assert.doesNotMatch(text, /aquamarine|pygmy/i, "hybrids stay a surprise");
});

test("using the guide, or /scriptevent golem:guide, opens a menu with every page", async () => {
  const { d } = setup();
  const p = new Player(d);
  ActionFormData.shown.length = 0;
  world.afterEvents.itemUse.fire({ source: p, itemStack: new ItemStack("golemgun:guide") });
  system.afterEvents.scriptEventReceive.fire({ id: "golem:guide", message: "", sourceEntity: p });
  await showGuide(p, 0);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(ActionFormData.shown.length, 3);
  assert.deepEqual(ActionFormData.shown[0].buttons, PAGES.map(([t]) => t));
  assert.equal(ActionFormData.shown[2].titleText, "Start here");
  assert.deepEqual(ActionFormData.shown[2].buttons, ["Back"]);
});

test("the debug give hands over every wand, the rod and the debug item", () => {
  const { d } = setup();
  const p = new Player(d);
  system.afterEvents.scriptEventReceive.fire({ id: "golem:give", message: "", sourceEntity: p });
  assert.equal(p.inventory.length, WANDS.length + 3, "no wands for hybrids");
});

test("the wand ladder: each wand is made from the one below it, off-ladder wands from the ladder wand of their depth", async () => {
  const { readFileSync } = await import("node:fs");
  const recipe = (key) => JSON.parse(readFileSync(new URL(`../behavior_pack/recipes/${key}.json`, import.meta.url)))["minecraft:recipe_shaped"];
  assert.deepEqual(LADDER, ["wood", "stone", "iron", "gold", "diamond", "netherite"], "coal came off the ladder in 0.7.0");
  const from = { copper: "wood", slime: "wood", tnt: "wood", honey: "wood", lapis: "iron", emerald: "iron", quartz: "gold", coal: "gold", obsidian: "diamond" };
  for (const m of WANDS.filter((m) => m !== "wood")) {
    const r = recipe(`${m}_wand`);
    assert.equal(r.result.item, `golemgun:${m}_wand`);
    const below = LADDER.includes(m) ? LADDER[LADDER.indexOf(m) - 1] : from[m];
    assert.ok(below, `${m} has no home tier`);
    assert.equal(r.key.W.item, `golemgun:${below}_wand`, m);
    const count = r.pattern.join("").split("M").length - 1;
    assert.equal(count, m === "diamond" ? 8 : 4, `${m} takes ${count}`);
  }
  assert.equal(recipe("iron_wand").key.M.item, "minecraft:iron_ingot");
  assert.equal(recipe("netherite_wand").key.M.item, "minecraft:netherite_scrap");
  assert.equal(recipe("wood_wand").result.item, "golemgun:wood_wand");
  assert.equal(recipe("golem_rod").result.item, "golemgun:golem_rod");
});

test("the Iron Wand: iron mobs and all-iron head golems, but an iron golem is already iron", () => {
  const { d, p } = setup();
  const cow = paint(spawn(d, "minecraft:cow", at), "iron", p);
  assert.equal(cow.getProperty("golemgun:material"), "iron");
  const golem = golemize(cow, p);
  assert.equal(golem.getProperty("golemgun:material"), "iron_painted", "all iron, not the plain-headed kind");
  withRandom(0.99, () => golem.kill());
  assert.deepEqual(d.items, ["minecraft:raw_iron"]);
  assert.equal(paint(spawn(d, "minecraft:iron_golem", at), "iron", p), undefined);
  assert.match(p.bar.at(-1), /already iron/);
});

test("painted farm animals breed their own painted kind; monsters don't, and chickens don't lay eggs", async () => {
  const { readFileSync } = await import("node:fs");
  for (const [mob, kind] of Object.entries(MOBS)) {
    const text = readFileSync(new URL(`../behavior_pack/entities/${mob}.json`, import.meta.url), "utf8");
    assert.ok(!text.includes("minecraft:spawn_entity"), `${mob} lays`);
    const breeds = !!kind.baby && !kind.pops;
    assert.equal(text.includes("minecraft:breedable"), breeds, `${mob} ${breeds ? "can't" : "can"} breed`);
    if (breeds) {
      const e = JSON.parse(text)["minecraft:entity"];
      const groups = [e.components, ...Object.values(e.component_groups)];
      const breedable = groups.find((g) => g["minecraft:breedable"])["minecraft:breedable"];
      assert.deepEqual(breedable.breeds_with, { mate_type: `golemgun:${mob}`, baby_type: `golemgun:${mob}`,
        breed_event: { event: "minecraft:entity_born", target: "baby" } }, mob);
    }
  }
});

test("a bred baby takes a parent's material, 50/50 when they differ", () => {
  const { d, p } = setup();
  const a = paint(spawn(d, "minecraft:cow", at), "stone", p);
  const b = paint(spawn(d, "minecraft:cow", { x: 2, y: 64, z: 2 }), "iron", p);
  const seen = new Set();
  for (const r of [0.1, 0.9]) {
    withRandom(r, () => {
      const calf = d.breed(a, b);
      assert.ok(calf.getComponent("minecraft:is_baby"));
      seen.add(materialOf(calf));
      calf.remove();
    });
  }
  assert.deepEqual([...seen].sort(), ["iron", "stone"]);
  b.remove();
  const same = paint(spawn(d, "minecraft:cow", { x: 2, y: 64, z: 2 }), "stone", p);
  assert.equal(materialOf(d.breed(a, same)), "stone", "same material breeds true");
});

test("listed pairs breed hybrids: stone + wood is clay, and hybrids breed true", () => {
  const { d, p } = setup();
  const stone = paint(spawn(d, "minecraft:sheep", at), "stone", p);
  const wood = paint(spawn(d, "minecraft:sheep", { x: 2, y: 64, z: 2 }), "wood", p);
  const lamb = d.breed(stone, wood);
  assert.equal(materialOf(lamb), "clay");
  assert.equal(lamb.getProperty("golemgun:mat"), MATERIALS.indexOf("clay"));
  assert.equal(hybridOf("wood", "stone"), "clay");
  assert.equal(hybridOf("diamond", "stone"), "aquamarine");
  assert.equal(childMaterial(["clay", "clay"]), "clay");
  assert.equal(childMaterial(["clay"]), "clay");
  assert.equal(childMaterial([]), undefined);
  assert.equal(HYBRIDS.length, 10);
  for (const [a, b, h] of HYBRIDS) {
    assert.ok(WANDS.includes(a) && WANDS.includes(b), `${h}'s parents are wand materials`);
    assert.ok(!WANDS.includes(h), `${h} has no wand`);
  }
});

test("a bred boulder calf grows up giant; a wood calf is fragile from birth", () => {
  const { d, p } = setup();
  const a = paint(spawn(d, "minecraft:cow", at), "stone", p);
  const b = paint(spawn(d, "minecraft:cow", { x: 2, y: 64, z: 2 }), "obsidian", p);
  const calf = d.breed(a, b);
  assert.equal(materialOf(calf), "boulder");
  assert.equal(calf.getComponent("minecraft:health").effectiveMax, 10, "not giant while a baby");
  calf.baby = false;
  world.afterEvents.dataDrivenEntityTrigger.fire({ entity: calf, eventId: "minecraft:ageable_grow_up" });
  assert.equal(calf.getComponent("minecraft:health").effectiveMax, 40, "giant once grown");
  const bull = paint(spawn(d, "minecraft:cow", { x: 5, y: 64, z: 5 }), "boulder", p);
  assert.equal(bull.getComponent("minecraft:health").effectiveMax, 40, "a grown mob painted boulder is giant at once");
  a.remove(); b.remove(); calf.remove(); bull.remove();
  const w1 = paint(spawn(d, "minecraft:cow", at), "wood", p);
  const w2 = paint(spawn(d, "minecraft:cow", { x: 2, y: 64, z: 2 }), "wood", p);
  const woodCalf = d.breed(w1, w2);
  assert.equal(materialOf(woodCalf), "wood");
  assert.equal(woodCalf.getComponent("minecraft:health").effectiveMax, 4, "fragile from birth");
});

test("a mob painted before 0.8.0 still reads its material from the enum", () => {
  const { d } = setup();
  const old = d.spawnEntity("golemgun:cow", at, { spawnEvent: "minecraft:spawn_adult" });
  old.setProperty("golemgun:material", "lapis");
  assert.equal(old.getProperty("golemgun:mat"), -1);
  assert.equal(materialOf(old), "lapis");
  const golem = d.spawnEntity("golemgun:head_golem", at);
  assert.equal(materialOf(golem), "iron", "a plain head golem is iron");
  golem.setProperty("golemgun:material", "iron_painted");
  assert.equal(materialOf(golem), "iron");
  assert.equal(LEGACY.length, 15);
  assert.deepEqual(MATERIALS.slice(0, 15), LEGACY, "the enum's materials stay first, in order");
});

test("the debug readout names the tier and what it makes", () => {
  const { d, p } = setup();
  assert.equal(describe(paint(spawn(d, "minecraft:chicken", at), "stone", p)),
    "chicken: stone, tier 2 of 6. Makes cobblestone, rarely raw iron (10%) or coal (20%)");
  assert.equal(describe(paint(spawn(d, "minecraft:cow", at), "lapis", p)), "cow: lapis, off the ladder. Makes lapis lazuli");
  assert.equal(describe(paint(spawn(d, "minecraft:pig", at), "netherite", p)),
    "pig: netherite, tier 6 of 6. Makes netherite scrap");
  assert.equal(describe(paint(spawn(d, "minecraft:cow", at), "coal", p)), "cow: coal, off the ladder. Makes coal");
  assert.equal(describe(paint(spawn(d, "minecraft:cow", at), "steel", p)), "cow: steel, a hybrid of coal and iron. Makes iron ingot, rarely raw gold (5%)");
  assert.equal(describe(paint(spawn(d, "minecraft:cow", at), "gold", p)), "cow: gold, tier 4 of 6. Makes raw gold, rarely diamond (10%)");
});

test("debug speed and give_wand", () => {
  const { d } = setup();
  const p = new Player(d);
  system.afterEvents.scriptEventReceive.fire({ id: "golem:speed", message: "20", sourceEntity: p });
  assert.equal(world.getDynamicProperty("golemgun:speed"), 20);
  system.afterEvents.scriptEventReceive.fire({ id: "golem:give_wand", message: "netherite", sourceEntity: p });
  assert.deepEqual(p.inventory.map((i) => i.typeId), ["golemgun:netherite_wand"]);
});

test("entity filters use add-on spellings, not the game's numbers, so golems hunt monsters", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const dir = new URL("../behavior_pack/entities/", import.meta.url);
  for (const f of readdirSync(dir)) {
    const text = readFileSync(new URL(f, dir), "utf8");
    assert.doesNotMatch(text, /"(subject|operator)": \d/, f);
    assert.doesNotMatch(text, /"(AND|OR)":/, f);
  }
  const golem = JSON.parse(readFileSync(new URL("iron_golem.json", dir)))["minecraft:entity"];
  const targets = golem.components["minecraft:behavior.nearest_attackable_target"].entity_types[0].filters.all_of;
  assert.deepEqual(targets[0], { test: "is_family", subject: "other", operator: "==", value: "monster" });
});

test("extra drops: an iron chick can turn up copper, redstone, lapis or emerald", () => {
  const { d, p } = setup();
  const chick = paint(d.spawnEntity("minecraft:chicken", at, { spawnEvent: "minecraft:entity_born" }), "iron", p);
  withRandom(0.01, () => chick.kill());
  assert.deepEqual(d.items, ["minecraft:raw_iron", "minecraft:raw_gold", "minecraft:raw_copper", "minecraft:redstone",
    "minecraft:lapis_lazuli", "minecraft:emerald"]);
});

test("habitat drops: a painted drowned can bring up kelp, prismarine and a nautilus shell", () => {
  const { d, p } = setup();
  const baby = paint(d.spawnEntity("minecraft:drowned", at, { spawnEvent: "minecraft:as_baby" }), "copper", p);
  withRandom(0.005, () => baby.kill());
  for (const item of ["minecraft:kelp", "minecraft:prismarine_shard", "minecraft:nautilus_shell"]) assert.ok(d.items.includes(item), item);
});

test("nothing hands out diamonds or netherite except gold, diamond and netherite mobs", () => {
  for (const [material, drop] of Object.entries(DROPS)) {
    const items = [drop.drop, ...drop.rare.map(([i]) => i), ...drop.also.map(([i]) => i)];
    if (!["gold", "diamond", "pygmy"].includes(material)) assert.ok(!items.includes("minecraft:diamond"), material);
    if (!["diamond", "netherite"].includes(material)) assert.ok(!items.includes("minecraft:netherite_scrap"), material);
  }
});

test("slime mobs bounce and take no fall damage", () => {
  const { d, p } = setup();
  world.dimensions.overworld = d;
  const cow = paint(spawn(d, "minecraft:cow", at), "slime", p);
  withRandom(0.1, () => tickAll());
  assert.equal(cow.impulses.length, 1, "it hopped");
  const before = cow.hp;
  cow.hurt(3, "fall");
  assert.equal(cow.hp, before, "fall damage healed straight back");
  cow.hurt(3);
  assert.equal(cow.hp, before - 3, "other damage still counts");
  delete world.dimensions.overworld;
});

test("wood mobs are fragile: a couple of punches, whatever the mob", () => {
  const { d, p } = setup();
  const cow = paint(spawn(d, "minecraft:cow", at), "wood", p);
  assert.equal(cow.getComponent("minecraft:health").effectiveMax, 4);
  assert.equal(cow.getComponent("minecraft:health").currentValue, 4);
  const zombie = paint(spawn(d, "minecraft:zombie", at), "wood", p);
  assert.equal(zombie.getComponent("minecraft:health").effectiveMax, 4);
  const stone = paint(spawn(d, "minecraft:cow", at), "stone", p);
  assert.equal(stone.getComponent("minecraft:health").effectiveMax, 10, "other materials keep the mob's health");
  const golem = golemize(paint(spawn(d, "minecraft:cow", at), "wood", p), p);
  assert.equal(golem.getComponent("minecraft:health").effectiveMax, 4, "a wood head golem too");
});

test("durability climbs the ladder: iron mobs ignore fists, diamond mobs want a diamond sword", () => {
  const { d, p } = setup();
  const hp = (mob) => mob.getComponent("minecraft:health").currentValue;
  const iron = paint(spawn(d, "minecraft:cow", at), "iron", p);
  iron.hurt(1);
  assert.equal(hp(iron), 10, "a punch does nothing");
  iron.hurt(5);
  assert.equal(hp(iron), 6, "a stone sword does 4");
  const diamond = paint(spawn(d, "minecraft:cow", at), "diamond", p);
  diamond.hurt(5);
  assert.equal(hp(diamond), 8, "a stone sword does 2");
  diamond.hurt(7);
  assert.equal(hp(diamond), 4, "a diamond sword does 4");
  const netherite = paint(spawn(d, "minecraft:cow", at), "netherite", p);
  netherite.hurt(5);
  assert.equal(hp(netherite), 9, "a stone sword does 1");
  const stone = paint(spawn(d, "minecraft:cow", at), "stone", p);
  stone.hurt(4);
  assert.equal(hp(stone), 6, "stone is plain");
  diamond.hurt(20);
  assert.ok(diamond.getComponent("minecraft:health").currentValue <= 0, "a big enough hit still kills");
});

test("honey mobs are slow, and slow whoever hits them", () => {
  const { d, p } = setup();
  world.dimensions.overworld = d;
  const pig = paint(spawn(d, "minecraft:pig", at), "honey", p);
  tickAll();
  assert.deepEqual(pig.effects, ["slowness"]);
  const player = new Player(d);
  player.effects = [];
  player.addEffect = (t) => player.effects.push(t);
  pig.hurt(1, "entityAttack", player);
  assert.deepEqual(player.effects, ["slowness"]);
  delete world.dimensions.overworld;
});

test("TNT mobs die with a bang that flings their babies; a TNT creeper's crater is sand and TNT", () => {
  const { d, p } = setup();
  paint(spawn(d, "minecraft:cow", at), "tnt", p).kill();
  assert.equal(d.mobs.size, 4);
  assert.ok([...d.mobs].every((calf) => calf.impulses.length === 1), "every calf flew");
  assert.deepEqual(d.sounds, ["random.explode"]);

  const d2 = blastIn("tnt");
  assert.equal(d2.count("minecraft:tnt"), Math.round(54 * 0.15));
  assert.equal(d2.count("minecraft:sand"), 54 - Math.round(54 * 0.15));
  assert.equal(d2.count("minecraft:air"), 27, "a normal blast that breaks blocks");
  assert.deepEqual(d2.explosions, [], "no extra explosion");
});

test("the three new wands are crafted from a Wood Wand", async () => {
  const { readFileSync } = await import("node:fs");
  for (const [m, item] of [["slime", "minecraft:slime_ball"], ["tnt", "minecraft:tnt"], ["honey", "minecraft:honeycomb"]]) {
    const r = JSON.parse(readFileSync(new URL(`../behavior_pack/recipes/${m}_wand.json`, import.meta.url)))["minecraft:recipe_shaped"];
    assert.equal(r.key.W.item, "golemgun:wood_wand");
    assert.equal(r.key.M.item, item);
  }
});
