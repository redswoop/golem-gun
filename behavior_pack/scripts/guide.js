// The Golem Guide: a book every player gets on joining (and can craft from a book over a
// stick). Using it opens a menu of short pages. The pages are built from data.js, so the
// recipes, drops and craters they quote are the pack's real ones.
import { ActionFormData } from "@minecraft/server-ui";
import { DROPS, HYBRIDS, LADDER, NAMES, RECIPES, TOUGHNESS, TWISTS, WANDS } from "./data.js";

const cap = (m) => NAMES[m] ?? m[0].toUpperCase() + m.slice(1);
const wand = (m) => `${cap(m)} Wand`;
const nice = (id) => id.replace("minecraft:", "").replaceAll("_", " ");
const pct = (c) => `${Math.round(c * 100)}%`;
const list = (lines) => lines.map((l) => `§7-§r ${l}`).join("\n");

function startPage() {
  return [
    "Golem Gun turns ordinary mobs into mobs made of stuff: wood, stone, iron, gold, diamond and more.",
    "",
    "§eUsing a wand:§r hold it and tap a mob. On a touch screen, hold your finger on the mob or hit it. You can also use the wand while looking at a mob a few blocks away.",
    "",
    "A wand works once per mob, and only on a normal mob. A changed mob stays changed for good. It never wanders off and never turns into anything else.",
    "",
    "Wands don't work on tamed pets. A changed mob keeps its name and saddle, but loses anything it holds or wears.",
    "",
    "You start with a Wood Wand. Try it on a cow.",
  ].join("\n");
}

function ladderPage() {
  const rungs = LADDER.map((m, i) => {
    if (i === 0) return `${wand(m)}: free (or a plank over a stick)`;
    const r = RECIPES[m];
    return `${wand(m)}: ${wand(r.from)} + ${r.count} ${r.item}`;
  });
  return [
    "Wands go up a ladder. Each one is made in a crafting table from the wand below it, with the new material around it:",
    "",
    list(rungs),
    "",
    "Crafting uses the lower wand up. Diamond takes the whole ring of 8.",
    "",
    "Mobs of a material drop that material, and now and then a taste of the next tier up. Stone mobs are how you get to iron, and gold mobs are where diamonds first show up.",
  ].join("\n");
}

function sideWandsPage() {
  const side = WANDS.filter((m) => !LADDER.includes(m));
  const byFrom = new Map();
  for (const m of side) {
    const r = RECIPES[m];
    if (!byFrom.has(r.from)) byFrom.set(r.from, []);
    byFrom.get(r.from).push(`${cap(m)} (${r.count} ${r.item})`);
  }
  const groups = [...byFrom].sort((a, b) => LADDER.indexOf(a[0]) - LADDER.indexOf(b[0]))
    .map(([from, wands]) => `From ${/^[aeiou]/i.test(from) ? "an" : "a"} ${wand(from)}: ${wands.join(", ")}`);
  const twists = side.filter((m) => TWISTS[m]).map((m) => `${cap(m)}: ${TWISTS[m]}`);
  return [
    "Other wands branch off the ladder. Each is made from the ladder wand of its depth, with 4 of its material around it:",
    "",
    list(groups),
    "",
    "Their mobs drop their own material: a lapis mob drops lapis.",
    "",
    "Some have a twist:",
    list(twists),
  ].join("\n");
}

function dropsPage() {
  const rares = LADDER.map((m) => {
    const d = DROPS[m];
    const rare = d.rare.length ? `, rarely ${d.rare.map(([item, c]) => `${nice(item)} (${pct(c)})`).join(" or ")}` : "";
    return `${cap(m)}: ${nice(d.drop)}${rare}`;
  });
  return [
    "Kill a changed mob and it drops its material. Ore comes raw, so you still smelt it.",
    "",
    "§eFarm animals§r (cows, chickens, sheep, pigs, foxes, wolves) split into 4 babies instead. Each baby drops 1 of the material. These babies never grow up.",
    "",
    "§eMonsters with a baby form§r (zombies, husks, drowned, piglins) pop into those drops all at once.",
    "",
    "Every kill also has a small chance of something from where the material is found, and of the next tier's material:",
    "",
    list(rares),
  ].join("\n");
}

function creepersPage() {
  const craters = LADDER.map((m) => {
    const c = DROPS[m].crater;
    return `${cap(m)} creeper: ${nice(c.host)}${c.ore ? `, with a little ${nice(c.ore)} hidden in it` : ""}`;
  });
  return [
    "A changed creeper is a mine. When it blows up, every block lining the hole turns into its material, and 1 or 2 of them turn into the next tier up:",
    "",
    list(craters),
    "",
    "The ore still needs the right pickaxe. If the blast breaks nothing, the creeper throws a few ore blocks instead.",
    "",
    "Keep them away from your builds: those turn too.",
  ].join("\n");
}

function toughPage() {
  const tough = Object.entries(TOUGHNESS).filter(([m]) => LADDER.includes(m))
    .sort((a, b) => LADDER.indexOf(a[0]) - LADDER.indexOf(b[0]))
    .map(([m, n]) => `${cap(m)} mobs shrug off ${n} of every hit`);
  return [
    "Wood mobs are fragile: a couple of punches finish one.",
    "",
    "Higher up the ladder, mobs are made of tougher stuff and ignore part of every hit:",
    "",
    list(tough),
    "",
    "A fist does 1, so it does nothing to an iron mob. Bring a sword at least as good as the mob. A big enough hit still works.",
  ].join("\n");
}

function breedingPage() {
  const [a, b, child] = HYBRIDS[0];
  return [
    "Changed farm animals breed like normal ones: feed two of them and a baby appears.",
    "",
    "The baby takes one parent's material. Two stone sheep make stone sheep.",
    "",
    `Some pairs make something new that no wand can make: ${a} and ${b} make ${cap(child)}. There are ${HYBRIDS.length} of these to find, and each has its own twist. Hybrids breed true.`,
    "",
    "Babies born this way grow up. The 4 babies a kill leaves never do.",
  ].join("\n");
}

function rodPage() {
  return [
    "The Golem Rod turns a normal mob into an iron golem wearing that mob's head.",
    "",
    "§eCrafting:§r a carved pumpkin on top, an iron block to the left, right and below, and a Wood Wand in the middle. It's shaped like the golem it makes.",
    "",
    "Head golems behave like iron golems and drop raw iron when they die.",
    "",
    "An Iron Wand on a changed golem turns it back into a real iron golem.",
  ].join("\n");
}

function lostPage() {
  return [
    "Lost this guide? Craft another: a book over a stick.",
    "",
    "Hold the Golem Guide and use it to open these pages any time.",
    "",
    "Painted mobs never despawn, so what you make stays. Name them and build them a pen.",
  ].join("\n");
}

/** [title, body] for each page, in menu order. */
export const PAGES = [
  ["Start here", startPage()],
  ["The wand ladder", ladderPage()],
  ["Side wands", sideWandsPage()],
  ["What mobs drop", dropsPage()],
  ["Creepers", creepersPage()],
  ["Tough mobs", toughPage()],
  ["Breeding", breedingPage()],
  ["The Golem Rod", rodPage()],
  ["Lost something?", lostPage()],
];

/** Opens the guide menu, or one page of it. Back goes to the menu. */
export async function showGuide(player, page) {
  if (page === undefined) {
    const menu = new ActionFormData().title("Golem Guide").body("Pick a page.");
    for (const [title] of PAGES) menu.button(title);
    const { canceled, selection } = await menu.show(player);
    if (!canceled) await showGuide(player, selection);
    return;
  }
  const [title, body] = PAGES[page];
  const form = new ActionFormData().title(title).body(body).button("Back");
  const { canceled } = await form.show(player);
  if (!canceled) await showGuide(player);
}
