// What's special about mobs made of a material, beyond how they look and what they drop.
// Each twist can have:
//   tick(mob)              about once a second, for every loaded painted mob
//   hurt(mob, damage, ev)  after it takes damage
//   hit(mob, player)       when a player hits it
//   die(mob, left)         when it dies; `left` is what it left behind (items or babies)
// Twists belong to materials, not mobs, so a slime cow and a slime zombie both bounce.
// Toughness (TOUGHNESS in data.js, `tough` in make_pack.py) is separate: a tough material
// shrugs off that much of every hit (healed back), so iron and gold mobs ignore fists and
// diamond and netherite mobs want a diamond sword, whatever the mob. Fragile (wood) is a
// health cap set when the mob is painted (convert.js).
import { system, world } from "@minecraft/server";
import { TOUGHNESS } from "./data.js";
import { materialOf } from "./material.js";

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
    die: bang,
  },
};

// Hybrids (breeding.js). Steel, boulder and pygmy are data: toughness and forms.
Object.assign(TWISTS, {
  // Squishy: a hit flings it away from whoever hit it.
  clay: {
    hurt(mob, damage, ev) {
      const from = ev.damageSource.damagingEntity?.location;
      if (!from) return;
      const dx = mob.location.x - from.x;
      const dz = mob.location.z - from.z;
      const len = Math.hypot(dx, dz) || 1;
      quietly(() => mob.applyImpulse({ x: (dx / len) * 1.2, y: 0.5, z: (dz / len) * 1.2 }));
    },
  },
  // Sea: players swimming near it breathe water.
  aquamarine: {
    tick(mob) {
      for (const player of playersNear(mob, 8)) {
        if (player.isInWater) quietly(() => player.addEffect("water_breathing", TICK * 6, { showParticles: false }));
      }
    },
  },
  // Chime: rings like an amethyst block when hit.
  amethyst: {
    hit(mob) {
      quietly(() => mob.dimension.playSound("chime.amethyst_block", mob.location));
    },
  },
  // Party: goes off like a party popper.
  cake: {
    die(mob, left) {
      const { dimension, location } = mob;
      quietly(() => dimension.spawnParticle("minecraft:totem_particle", location));
      quietly(() => dimension.playSound("random.levelup", location));
      for (const thing of left) {
        quietly(() => thing.applyImpulse({ x: rand(-0.3, 0.3), y: rand(0.4, 0.7), z: rand(-0.3, 0.3) }));
      }
    },
  },
  // Mossy: the ground it walks on turns to moss.
  moss: {
    tick(mob) {
      if (Math.random() > 0.3) return;
      const { x, y, z } = mob.location;
      quietly(() => {
        const under = mob.dimension.getBlock({ x: Math.floor(x), y: Math.floor(y) - 1, z: Math.floor(z) });
        if (under && MOSSABLE.has(under.typeId)) under.setType("minecraft:moss_block");
      });
    },
  },
  // Tiny: baby-sized for good (a form), and quick.
  pygmy: {
    tick(mob) {
      quietly(() => mob.addEffect("speed", TICK * 3, { amplifier: 1, showParticles: false }));
    },
  },
  // Ember: smoulders, burns whoever hits it, and goes off with a bang.
  ember: {
    tick(mob) {
      const { x, y, z } = mob.location;
      quietly(() => mob.dimension.spawnParticle("minecraft:lava_particle", { x: x + rand(-0.4, 0.4), y: y + 0.6, z: z + rand(-0.4, 0.4) }));
    },
    hit(mob, player) {
      quietly(() => player.setOnFire(2, true));
      quietly(() => player.onScreenDisplay.setActionBar("§6Hot!"));
    },
    die: bang,
  },
  // Gum: bouncy and sticky, and whoever hits it gets stuck to it for a moment.
  gum: {
    tick(mob) {
      TWISTS.slime.tick(mob);
      quietly(() => mob.addEffect("slowness", TICK * 3, { amplifier: 1, showParticles: false }));
    },
    hurt: TWISTS.slime.hurt,
    hit(mob, player) {
      quietly(() => player.addEffect("slowness", TICK * 3, { amplifier: 4 }));
      const dx = mob.location.x - player.location.x;
      const dz = mob.location.z - player.location.z;
      const len = Math.hypot(dx, dz) || 1;
      quietly(() => player.applyImpulse({ x: (dx / len) * 0.4, y: 0.1, z: (dz / len) * 0.4 }));
      quietly(() => player.onScreenDisplay.setActionBar("§dStuck!"));
    },
  },
});

const MOSSABLE = new Set(["grass_block", "dirt", "coarse_dirt", "podzol", "stone", "cobblestone", "deepslate", "cobbled_deepslate",
  "sand", "gravel", "mycelium", "dirt_with_roots", "mud"].map((b) => `minecraft:${b}`));

function bang(mob, left) {
  const { dimension, location } = mob;
  quietly(() => dimension.spawnParticle("minecraft:huge_explosion_emitter", location));
  quietly(() => dimension.playSound("random.explode", location));
  for (const thing of left) {
    quietly(() => thing.applyImpulse({ x: rand(-0.4, 0.4), y: rand(0.5, 0.8), z: rand(-0.4, 0.4) }));
  }
}

function playersNear(mob, reach) {
  try {
    const { x, y, z } = mob.location;
    return mob.dimension.getPlayers({ location: mob.location, maxDistance: reach })
      .filter((p) => Math.hypot(p.location.x - x, p.location.y - y, p.location.z - z) <= reach);
  } catch {
    return [];
  }
}

function shrugOff(mob, damage) {
  const tough = TOUGHNESS[materialOf(mob)];
  if (typeof tough !== "number") return;
  const health = mob.getComponent("minecraft:health");
  if (health && health.currentValue > 0) {
    health.setCurrentValue(Math.min(health.effectiveMax, health.currentValue + Math.min(damage, tough)));
  }
}

function twistOf(mob) {
  return TWISTS[materialOf(mob)];
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
  shrugOff(mob, ev.damage);
  twist?.hurt?.(mob, ev.damage, ev);
  const player = ev.damageSource.damagingEntity;
  if (twist?.hit && player?.typeId === "minecraft:player") twist.hit(mob, player);
});
