// A small fake of the game's script API. Mobs are checked against the generated
// entity files, so a wrong property, value or spawn event fails here too, not just
// in the game. This proves the logic only: nothing here renders.
import { readFileSync, readdirSync } from "node:fs";

const defs = {};
for (const f of readdirSync(new URL("../../behavior_pack/entities/", import.meta.url))) {
  const d = JSON.parse(readFileSync(new URL(`../../behavior_pack/entities/${f}`, import.meta.url)));
  defs[d["minecraft:entity"].description.identifier] = d["minecraft:entity"];
}
// The vanilla mobs, as far as the scripts touch them.
const vanilla = {
  "minecraft:cow": { properties: { "minecraft:climate_variant": { type: "enum", values: ["temperate", "warm", "cold"], default: "temperate" } },
    events: ["minecraft:entity_born", "minecraft:spawn_adult"], health: 10 },
  "minecraft:iron_golem": { properties: {}, events: ["minecraft:from_player", "minecraft:from_village"], health: 100 },
  "minecraft:bat": { properties: {}, events: [], health: 6 },
};
const climate = { "minecraft:climate_variant": { type: "enum", values: ["temperate", "warm", "cold"], default: "temperate" } };
Object.assign(vanilla, {
  "minecraft:chicken": { properties: climate, events: ["minecraft:entity_born", "minecraft:spawn_adult"], health: 4 },
  "minecraft:pig": { properties: climate, events: ["minecraft:entity_born", "minecraft:spawn_adult", "minecraft:on_saddled"], health: 10 },
  "minecraft:sheep": { properties: {}, events: ["minecraft:entity_born", "spawn_adult", "minecraft:on_sheared"], health: 8 },
  "minecraft:fox": { properties: {}, events: ["minecraft:entity_born"], health: 10 },
  "minecraft:wolf": { properties: {}, events: ["minecraft:entity_born", "minecraft:spawn_wild_adult"], health: 8 },
});
// Monsters: the vanilla mob is the painted copy without the material, as far as the
// scripts can tell (same events, same health).
for (const [id, e] of Object.entries(defs)) {
  const vanillaId = id.replace("golemgun:", "minecraft:");
  if (vanilla[vanillaId] || !e.description.runtime_identifier || vanillaId === "minecraft:iron_golem") continue;
  const { ["golemgun:material"]: _, ...properties } = e.description.properties ?? {};
  vanilla[vanillaId] = { properties, events: Object.keys(e.events), health: e.components["minecraft:health"].max ?? e.components["minecraft:health"].value };
}
// What these events leave on a mob, for the components the scripts look at.
const WEARS = { "minecraft:on_saddled": "minecraft:is_saddled", "minecraft:on_sheared": "minecraft:is_sheared",
  "be_sheared": "minecraft:is_sheared", "minecraft:become_charged": "minecraft:is_charged" };

function definition(typeId) {
  if (vanilla[typeId]) return vanilla[typeId];
  const e = defs[typeId];
  if (!e) throw new Error(`can't spawn ${typeId}`);
  return { properties: e.description.properties ?? {}, events: Object.keys(e.events), health: e.components["minecraft:health"].max ?? e.components["minecraft:health"].value };
}

let nextId = 1;
export class Entity {
  constructor(typeId, dimension, location, event) {
    Object.assign(this, { typeId, dimension, location, id: String(nextId++), nameTag: "", isValid: true, rotation: { x: 0, y: 0 } });
    const def = definition(typeId);
    this.def = def;
    this.props = Object.fromEntries(Object.entries(def.properties).map(([k, p]) => [k, p.default]));
    this.hp = def.health;
    this.baby = ["minecraft:entity_born", "minecraft:as_baby", "spawn_baby", "golemgun:as_shard"].includes(event);
    this.dynamic = {};
    this.isOnGround = true;
    this.impulses = [];
    this.effects = [];
    this.worn = new Set();
    this.spawnEvent = event;
    if (event && !def.events.includes(event)) throw new Error(`${typeId} has no event ${event}`);
  }
  getProperty(k) {
    if (!(k in this.def.properties)) throw new Error(`${this.typeId} has no property ${k}`);
    return this.props[k];
  }
  setProperty(k, v) {
    const p = this.def.properties[k];
    if (!p) throw new Error(`${this.typeId} has no property ${k}`);
    if (p.type === "enum" && !p.values.includes(v)) throw new Error(`${k} can't be ${v}`);
    if (p.type === "int" && (v < p.range[0] || v > p.range[1])) throw new Error(`${k} can't be ${v}`);
    this.props[k] = v;
  }
  triggerEvent(event) {
    if (!this.def.events.includes(event)) throw new Error(`${this.typeId} has no event ${event}`);
    if (WEARS[event]) this.worn.add(WEARS[event]);
    // A group with minecraft:health resets the mob's health and its max, like the game.
    const e = defs[this.typeId];
    for (const group of e?.events[event]?.add?.component_groups ?? []) {
      const health = e.component_groups[group]?.["minecraft:health"];
      if (health) { this.maxHp = health.max ?? health.value; this.hp = health.value; }
    }
  }
  getDynamicProperty(k) { return this.dynamic[k]; }
  setDynamicProperty(k, v) { this.dynamic[k] = v; }
  applyImpulse(v) { this.impulses.push(v); }
  addEffect(type, duration, options) { this.effects.push(type); }
  setOnFire() {}
  isInWater = false;
  /** Takes damage like a mob in the game, firing entityHurt afterwards. */
  hurt(damage, cause = "entityAttack", damagingEntity = undefined) {
    this.hp -= damage;
    world.afterEvents.entityHurt.fire({ hurtEntity: this, damage, damageSource: { cause, damagingEntity } });
  }
  getRotation() { return this.rotation; }
  setRotation(r) { this.rotation = r; }
  getComponent(name) {
    if (name === "minecraft:is_baby") return this.baby ? {} : undefined;
    if (this.worn.has(name)) return {};
    if (name === "minecraft:health") {
      const me = this;
      return { get currentValue() { return me.hp; }, get effectiveMax() { return me.maxHp ?? me.def.health; }, setCurrentValue(v) { me.hp = v; return true; } };
    }
    return undefined;
  }
  remove() { this.isValid = false; this.dimension.mobs.delete(this); }
  /** Dies like a mob in the game: still valid, and readable, when the event fires. */
  kill() { this.hp = 0; world.afterEvents.entityDie.fire({ deadEntity: this }); this.remove(); }
  /** A creeper going off: the blocks at `holes` are blown away, and the game removes the
   *  creeper without a death. No holes is a blast that breaks nothing (mobGriefing off). */
  explode(holes = []) {
    const dimension = this.dimension;
    const ev = { source: this, dimension, cancel: false, blocks: holes.map((at) => dimension.getBlock(at)),
      getImpactedBlocks() { return this.blocks; }, setImpactedBlocks(b) { this.blocks = b; } };
    this.lastExplosion = ev;
    world.beforeEvents.explosion.fire(ev);
    for (const b of ev.blocks) b.setType("minecraft:air");
    this.remove();
  }
}

// A block as far as the scripts look at it. Anything never set is air.
class Block {
  constructor(dimension, location) { this.dimension = dimension; this.location = location; }
  get typeId() { return this.dimension.blocks.get(Dimension.key(this.location)) ?? "minecraft:air"; }
  get isAir() { return this.typeId === "minecraft:air"; }
  get isLiquid() { return ["minecraft:water", "minecraft:lava"].includes(this.typeId); }
  getComponent(name) {
    return name === "minecraft:inventory" && ["minecraft:chest", "minecraft:barrel"].includes(this.typeId) ? {} : undefined;
  }
  setType(type) { this.dimension.blocks.set(Dimension.key(this.location), type.includes(":") ? type : `minecraft:${type}`); }
}

export class Dimension {
  static key = ({ x, y, z }) => `${x},${y},${z}`;
  blocks = new Map();
  getBlock(location) { return new Block(this, { ...location }); }
  /** Fills a box of blocks, corners included. */
  fill(from, to, type) {
    for (let x = from.x; x <= to.x; x++) for (let y = from.y; y <= to.y; y++) for (let z = from.z; z <= to.z; z++) {
      this.blocks.set(Dimension.key({ x, y, z }), type);
    }
  }
  count(type) { return [...this.blocks.values()].filter((t) => t === type).length; }
  mobs = new Set();
  spawnEntity(typeId, location, options) {
    const mob = new Entity(typeId, this, location, options?.spawnEvent);
    this.mobs.add(mob);
    return mob;
  }
  items = [];
  counts = [];
  impulses = 0;
  spawnItem(item) {
    this.items.push(item.typeId);
    this.counts.push(item.amount);
    return { typeId: "minecraft:item", applyImpulse: () => { this.impulses++; } };
  }
  explosions = [];
  createExplosion(location, radius, options) { this.explosions.push({ radius, ...options }); return true; }
  sounds = [];
  playSound(id) { this.sounds.push(id); }
  spawnParticle() {}
  getEntities() { return [...this.mobs]; }
  getPlayers() { return world.players.filter((p) => p.dimension === this); }
  /** Breeds two mobs like the game: a newborn of their kind next to them, then entitySpawn with cause Born. */
  breed(a, b) {
    const baby = this.spawnEntity(a.typeId, { x: (a.location.x + b.location.x) / 2, y: a.location.y, z: (a.location.z + b.location.z) / 2 },
      { spawnEvent: "minecraft:entity_born" });
    world.afterEvents.entitySpawn.fire({ entity: baby, cause: "Born" });
    return baby;
  }
}

export class Player {
  typeId = "minecraft:player"; id = "p1"; messages = []; bar = [];
  location = { x: 0, y: 64, z: 0 };
  constructor(dimension) { this.dimension = dimension; }
  onScreenDisplay = { setActionBar: (t) => this.bar.push(t) };
  playSound() {}
  setOnFire() {}
  isInWater = false;
  effects = [];
  addEffect(type) { this.effects.push(type); }
  applyImpulse() {}
  sendMessage(m) { this.messages.push(m); }
  getViewDirection() { return { x: 0, y: 0, z: 1 }; }
  teleport(l) { this.location = l; }
  dynamic = {};
  getDynamicProperty(k) { return this.dynamic[k]; }
  setDynamicProperty(k, v) { this.dynamic[k] = v; }
  inventory = [];
  getComponent(name) {
    if (name !== "minecraft:inventory") return undefined;
    const items = this.inventory;
    // Like the game: a full inventory hands the stack back instead of taking it.
    return { container: { get size() { return 36; }, getItem: (i) => items[i],
      addItem: (it) => { if (items.length >= 36) return it; items.push(it); } } };
  }
}

class Signal {
  subs = [];
  subscribe(f) { this.subs.push(f); return f; }
  fire(e) { for (const f of this.subs) f(e); }
}
const worldProps = {};
export const world = {
  getDynamicProperty: (k) => worldProps[k],
  setDynamicProperty: (k, v) => { worldProps[k] = v; },
  players: [],
  getPlayers() { return this.players; },
  dimensions: {},
  getDimension(id) { if (!this.dimensions[id]) throw new Error(`no dimension ${id}`); return this.dimensions[id]; },
  beforeEvents: { playerInteractWithEntity: new Signal(), explosion: new Signal() },
  afterEvents: { itemUse: new Signal(), entityHitEntity: new Signal(), playerSpawn: new Signal(), entityDie: new Signal(),
    entityHurt: new Signal(), entitySpawn: new Signal(), dataDrivenEntityTrigger: new Signal() },
};
export const system = {
  currentTick: 100,
  afterEvents: { scriptEventReceive: new Signal() },
  run: (f) => f(),
  later: [],
  intervals: [],
  runInterval(f) { this.intervals.push(f); },
  runTimeout(f) { this.later.push(f); },   // left for the test to run, like ticks passing
};
export const EquipmentSlot = { Mainhand: "Mainhand" };
export class ItemStack { constructor(typeId, amount = 1) { this.typeId = typeId; this.amount = amount; } }
