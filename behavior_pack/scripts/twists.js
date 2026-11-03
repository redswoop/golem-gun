// What's special about mobs made of a material, beyond how they look and what they drop.
// Each twist can have:
//   tick(mob)              about once a second, for every loaded painted mob
//   hurt(mob, damage, ev)  after it takes damage
//   hit(mob, player)       when a player hits it
//   die(mob, left)         when it dies; `left` is what it left behind (items or babies)
// Twists belong to materials, not mobs, so a slime cow and a slime zombie both bounce.
import { system, world } from "@minecraft/server";

const NS = "golemgun";
const MATERIAL = `${NS}:material`;
const TICK = 20;

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const quietly = (f) => { try { f(); } catch {} };

export const TWISTS = {
  // Boing: hops about, and never takes fall damage.
  slime: {
    tick(mob) {
      if (mob.isOnGround && Math.random() < 0.35) {
        quietly(() => mob.applyImpulse({ x: rand(-0.15, 0.15), y: rand(0.45, 0.6), z: rand(-0.15, 0.15) }));
      }
    },
    hurt(mob, damage, ev) {
      if (ev.damageSource.cause !== "fall") return;
      const health = mob.getComponent("minecraft:health");
      if (health) health.setCurrentValue(Math.min(health.effectiveMax, health.currentValue + damage));
    },
  },
  // Sticky: slow, drips honey, and slows whoever hits it.
  honey: {
    tick(mob) {
      quietly(() => mob.addEffect("slowness", TICK * 3, { amplifier: 1, showParticles: false }));
      if (Math.random() < 0.5) {
        const { x, y, z } = mob.location;
        quietly(() => mob.dimension.spawnParticle("minecraft:honey_drip_particle", { x: x + rand(-0.4, 0.4), y: y + 0.8, z: z + rand(-0.4, 0.4) }));
      }
    },
    hit(mob, player) {
      quietly(() => player.addEffect("slowness", TICK * 2, { amplifier: 1 }));
      quietly(() => player.onScreenDisplay.setActionBar("§6Sticky!"));
    },
  },
  // Kaboom: dies with a big, harmless bang that flings whatever it leaves behind.
  tnt: {
    die(mob, left) {
      const { dimension, location } = mob;
      quietly(() => dimension.spawnParticle("minecraft:huge_explosion_emitter", location));
      quietly(() => dimension.playSound("random.explode", location));
      for (const thing of left) {
        quietly(() => thing.applyImpulse({ x: rand(-0.4, 0.4), y: rand(0.5, 0.8), z: rand(-0.4, 0.4) }));
      }
    },
  },
};

function twistOf(mob) {
  if (!mob.typeId.startsWith(`${NS}:`)) return undefined;
  try {
    return TWISTS[mob.getProperty(MATERIAL)];
  } catch {
    return undefined;
  }
}

/** For drops.js: run a dying mob's twist on what it left behind. */
export function onDie(mob, left) {
  twistOf(mob)?.die?.(mob, left);
}

export function tickAll() {
  for (const id of ["overworld", "nether", "the_end"]) {
    let mobs = [];
    try {
      mobs = world.getDimension(id).getEntities();
    } catch {
      continue;
    }
    for (const mob of mobs) {
      const twist = twistOf(mob);
      if (twist?.tick && mob.isValid) twist.tick(mob);
    }
  }
}

system.runInterval(tickAll, TICK);

world.afterEvents.entityHurt.subscribe((ev) => {
  const mob = ev.hurtEntity;
  if (!mob.isValid) return;
  const twist = twistOf(mob);
  twist?.hurt?.(mob, ev.damage, ev);
  const player = ev.damageSource.damagingEntity;
  if (twist?.hit && player?.typeId === "minecraft:player") twist.hit(mob, player);
});
