# Wand variety: co-drops and new materials (proposal)

Written 2026-11-02 by a fresh design agent, at Armen's request: "a 10% chance of also
dropping the other minerals ... things that might be found at the same layer", and "much
more variety. like, honey wands ... sugar cane, etc." Status: 0.5.0 built co-drops, habitat drops, the twist engine and Slime, TNT and Honey (shortlist 1-4). Armen wants every themed wand to also turn mobs into its element with a twist ("Cactus mobs that hurt to punch", "Crystal mobs that shatter"). Next is the storage change, then Cactus and Amethyst (shattering into tiny crystal versions). Every
item id and block texture was checked against the 1.26.60.4 game files unless flagged.
`material-previews.png` shows candidate textures painted on the cow and pig sheets (flat
sheets, not 3D mobs).

## Pacing rule

Read the ladder by its wands: each wand needs the wand below plus 4 of its material, so a
stockpile of higher material can't skip a rung. What breaks pacing is a mob dropping
material **two or more rungs up**. So a co-drop may be anything at or below the mob's
tier, off the ladder, or plain vanilla; never a ladder material 2+ tiers up. Diamond and
netherite scrap only come from the existing rare drops. Stone's 20% coal already makes
the Coal Wand nearly free after Gold; don't add more of those.

Co-drops are how side wands get discovered: recipes have `unlock` set to their item, so
the first redstone an iron mob drops puts the Redstone Wand in the recipe book.

## 1. Same-layer co-drops

A new `also` field, same `[item, chance]` format as `rare` (data plus one line in
`dropMaterial`; phase-2 production gets it too). Plain items 10%, valuable 2-5%, rolled
per baby.

| Material (where it generates) | Existing rare | New co-drops | Unlocks |
|---|---|---|---|
| Wood (surface, forests) | cobblestone 10% | apple 10%, stick 10%, oak_sapling 5%, sugar_cane 5%, honeycomb 3% | Sugar Cane, Honey |
| Stone (Y 0-100) | raw_iron 10%, coal 20% | raw_copper 10%, flint 10%, slime_ball 3% | Copper, Slime |
| Iron (stone into deepslate, mountains) | raw_gold 10% | raw_copper 10%, redstone 10%, lapis_lazuli 5%, emerald 2% | Redstone, Lapis, Emerald |
| Gold (deepslate) | coal 10% | redstone 10%, lapis_lazuli 10%, amethyst_shard 5%, raw_iron 5% | Amethyst |
| Coal (stone layer) | diamond 10% | raw_copper 10%, flint 10%, raw_iron 5%, gunpowder 3% (theme) | TNT |
| Diamond (Y -59, lava lakes) | netherite_scrap 10% | redstone 10%, lapis_lazuli 10%, raw_gold 5%, obsidian 5%, amethyst_shard 5% | Obsidian |
| Netherite (Nether, near lava) | none | quartz 10%, gold_nugget 10%, glowstone_dust 5%, magma_cream 5%, crying_obsidian 2% | Glowstone, Magma, Quartz |
| Copper (dripstone caves) | none | coal 10%, pointed_dripstone 5%, clay_ball 5%, raw_iron 3% | |
| Lapis | none | redstone 10%, raw_iron 5%, amethyst_shard 3% | |
| Quartz (netherrack) | none | gold_nugget 10%, glowstone_dust 5%, magma_cream 3% | |
| Emerald (mountains) | none | raw_iron 10%, coal 10%, snowball 10% | Ice |
| Obsidian (lava pools, ruined portals) | none | gold_nugget 10%, crying_obsidian 5%, flint 5% | |

Left out on purpose: diamonds from Gold or Obsidian; budding_amethyst (unobtainable).

Rough pace: one iron cow (4 babies) gives about 0.4 redstone, 0.2 lapis, 0.08 emerald, so
the Redstone Wand takes ~10 iron cows, Lapis ~20, Emerald ~50.

**Mob-type drops** (a `habitat` list in `MOBS`; ~5% each, nautilus 1%): the mob type
says where it lives, the material says what it's made of. Mobs whose vanilla loot
already covers it get nothing.

| Mob | Drops | Unlocks |
|---|---|---|
| Drowned | kelp, prismarine_shard, nautilus_shell | Prismarine |
| Husk | sand, cactus | Cactus |
| Stray | snowball, ice | Ice |
| Bogged | slime_ball, red_mushroom | Slime, Mushroom |
| Piglin, zombified piglin | gold_nugget, quartz | Nether family |
| Enderman | chorus_fruit 3% | Chorus |
| Fox | sweet_berries | |

## 2. New materials

Each is one `MATERIALS` row; wand, icon, recipe, sheets and drops are generated. Recipe:
Wood Wand + 4 of the item. Twist cost: $ cheap script (addEffect, applyImpulse,
teleport, sounds, particles), $$ medium (block edits, item handling, interactions),
$$$ costly or risky.

**Garden** (open from the start)

| Material | Texture | Drop / also | Burst | Twist |
|---|---|---|---|---|
| Honey | honeycomb.png | honeycomb / honey_bottle 10% | honeycomb_block | Sticky $: slow, hitting it gives you 2 s Slowness, drips honey particles. Later: bottle it for honey. |
| Sugar Cane | reeds.tga or bamboo_block.png | sugar_cane / sugar 10%, paper 5% | sugar_cane | Sugar rush $: permanent Speed II; killing it gives you 10 s Speed. |
| Pumpkin | pumpkin_side.png | pumpkin / pumpkin_pie 10%, pumpkin_seeds 10% | carved_pumpkin | Jack-o'-lantern $: flame particles at night (weakest). |
| Mushroom | mushroom_block_skin_red.png | red_mushroom / brown_mushroom 10% | red_mushroom_block | Stew $$: bowl gives mushroom stew on a cooldown. |
| Cake | cake_top.png (needs see-through fill) | cake / cookie 10% | cake | Party pop $: particles, jingle, drops fountain up. |
| Bone | bone_block_side.png | bone_meal / bone 10% | bone_block | Green thumb $$: crops within 4 blocks grow a stage ~every 30 s. |
| Cherry (optional) | cherry_leaves_opaque.png | pink_petals / cherry_sapling 5% | cherry_leaves | Petal trail $. |

**Caves**

| Material | Texture | Drop / also | Burst | Twist |
|---|---|---|---|---|
| Slime | slime.png | slime_ball | slime | Boing $: hops every 2-4 s, no fall damage. Never spawn vanilla slimes on death (free mobs). |
| TNT | tnt_side.png | gunpowder / sand 10%, tnt 3% | tnt (items) | Kaboom $: animals die with a fake harmless explosion that flings drops; a TNT creeper blasts double radius but doesn't break blocks. |
| Redstone | redstone_block.png | redstone | redstone_ore | Magnet $$: pulls dropped items within 6 blocks. |

**Deep**: Amethyst (amethyst_block.png; amethyst_shard / lapis 5%; Chime $: plays
amethyst chimes when walking or hit).

**Nether**: Glowstone (glowstone.png; glowstone_dust / gold_nugget 10%; Night-light $$,
emissive look). Magma (magma.png; magma_cream / blaze_powder 5%; the fire chicken $$:
smelts raw items within 4 blocks, fire and lava immune; suggested as phase 5).

**Ocean, Frost, Desert, End** (unlocked by mob-type drops)

| Material | Texture | Drop / also | Burst | Twist |
|---|---|---|---|---|
| Prismarine | prismarine_bricks.png | prismarine_shard / crystals 10%, nautilus_shell 1% | sea_lantern | Conduit buddy $: water breathing + night vision nearby. |
| Ice | ice_packed.png | snowball / ice 10%, packed_ice 3% | packed_ice | Frost walker $-$$: freezes water next to it; slows attackers. Recipe: 4 snow blocks. |
| Cactus | cactus_side.tga | cactus / green_dye 10%, sand 10% | cactus | Prickly $: hitting it costs half a heart. |
| Chorus | purpur_block.png | chorus_fruit / popped 10%, ender_pearl 3% | purpur_block | Blink $: teleports every ~20 s and when hit; hitting it levitates you 2 s. |

**Twists for the 12 existing materials** (no new storage needed): copper as a lightning
rod in storms, obsidian tanky, diamond sparkles, netherite fire-immune, gold that piglins
stare at, coal smokes when hit, emerald sparkles like a villager trade.

**Parked**: melon, hay, kelp, sand, moss (dull); sponge (drains water near builds);
rainbow wool (16 values); copper oxidation (3 values); sculk, nether wart, shroomlight;
anything that speeds up the breeder pen.

## 3. Structure

Keep the mineral ladder as the spine and hang **themed families of side wands** off it
(Garden, Caves, Deep, Nether, Ocean, Frost, Desert, End), each unlocked by a co-drop or
mob-type drop and crafted from a Wood Wand + 4 of its item. A second ladder would double
the grind and eat wands; a flat list would arrive all at once. The breeder pen is the
shared budget: a mob made honey isn't making iron. Twists belong to materials, so 17
materials across 21 mobs gives hundreds of combinations to collect.

Optional (phase 6): a Golem Guide form listing each family, locked entries as riddles,
with a "you've made 14 kinds!" counter.

## 4. Storage

Short term: 3 enum slots left, enough for Slime, TNT and Honey.

Then: add an int property `golemgun:mat` (range -1..255, default -1) and keep the enum as
read-only legacy. Render with `v.index = t.i >= 0 ? t.i : (enum chain)`, same index
order, so existing mobs keep working with no migration. One `materialOf()` helper in the
scripts. Same for the head golem. Small to medium cost.

The real limit is pack size: head golem sheets (21 heads x 13 values) are 3.6 MB of the
5.4 MB of textures, and each material adds ~360 KB to the `.mcaddon`. ~30 materials
would be an ~11 MB download per join. Fix ($$): draw head golems with two render
controllers (golem body + mob head), reusing the existing painted sheets, bringing each
material to ~150 KB. Unverified: that animations drive both geometries by bone name, and
whether Bedrock loads every declared texture at world load (iPad memory).

Generator changes: `.tga` block textures; fill see-through tile pixels (cake); other
texture archives (deepslate, nether fungus); avoid biome-tinted textures (they come out
grey); crop animated strips. `golem:give` needs a family argument past ~30 wands.

## 5. Shortlist (most fun per effort)

1. Co-drops plus mob-type drops (Armen's ask; unlocks discovery for everything else).
2. Slime (Boing). Fits the enum.
3. TNT (Kaboom). Fits the enum. Build the twist engine here: per-material onTick, onHurt
   and onDie, one interval loop that phase-2 production reuses.
4. Honey (Sticky). Last enum slot; Armen's idea.
5. Storage work (int property, ideally the head golem render split) before material 16.
6. Sugar Cane (Sugar rush).
7. Ice (Frost walker).
8. One of: Redstone Magnet, Chorus Blink, or Magma as the fire chicken.

## Unverified in Bedrock

applyKnockback's 2.0.0 signature; createExplosion's breaksBlocks/causesFire options;
which emissive material makes a sheet glow; sound ids and most particle ids (only
honey_drip_particle and lava_particle confirmed); whether script-placed frosted ice
melts; crop growth state names; whether recipe `unlock` fires on pickup as assumed.
