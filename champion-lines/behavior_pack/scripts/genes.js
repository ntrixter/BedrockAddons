// Champion Lines - the parts with no game in them: stat grids, the
// inheritance roll, and the text for the action bar and the book. Kept free of
// @minecraft/server so tests/run.js can drive it with plain objects.

// These grids must match tools/sync_entities.py, which writes one component
// group per step into entities/horse.json and entities/mule.json.
export const HEALTH_MIN = 15;
export const HEALTH_MAX = 30;
export const SPEED_MIN = 0.1125;
export const SPEED_STEP = 0.0025;
export const SPEED_MAX = 0.3375;
export const JUMP_MIN = 40; // hundredths of jump strength
export const JUMP_MAX = 100;

/** The animals the pack covers, by entity type. */
export const KINDS = { "minecraft:horse": "horse", "minecraft:donkey": "donkey", "minecraft:mule": "mule" };

/**
 * Donkeys are left vanilla, where every donkey has the same speed and jump and
 * only health is rolled. A vanilla mule (one from a spawn egg, or from before
 * the pack) has the same; a bred one takes its stats from its parents.
 */
export const FIXED = { donkey: { s: 0.175, j: 50 } };
export const VANILLA_MULE = { s: 0.175, j: 50 };

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function healthStep(hp) {
  return clamp(Math.round(hp), HEALTH_MIN, HEALTH_MAX);
}

/** Index of the nearest speed group, 0..90. */
export function speedStep(speed) {
  const k = Math.round((clamp(speed, SPEED_MIN, SPEED_MAX) - SPEED_MIN) / SPEED_STEP);
  return clamp(k, 0, Math.round((SPEED_MAX - SPEED_MIN) / SPEED_STEP));
}

export function speedOfStep(k) {
  return Math.round((SPEED_MIN + k * SPEED_STEP) * 10000) / 10000;
}

export function jumpStep(hundredths) {
  return clamp(Math.round(hundredths), JUMP_MIN, JUMP_MAX);
}

/** A fresh jump as vanilla rolls it: uniform over 0.40 .. 1.00. */
export function wildJump(rand) {
  return JUMP_MIN + Math.floor(rand() * (JUMP_MAX - JUMP_MIN + 1));
}

/** The better value with probability `chance`, otherwise the worse one. */
export function pick(a, b, chance, rand) {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return rand() < chance ? hi : lo;
}

/**
 * A foal's stats from its parents' stats. Each stat is rolled on its own.
 * A parent whose jump is unknown (it predates the pack) stands in with a fresh
 * wild roll, so the foal's jump is always known.
 *
 * Returns grid steps: { h: hit points, s: speed step, j: jump hundredths }.
 */
export function inherit(a, b, chance, rand) {
  const ja = a.j ?? wildJump(rand);
  const jb = b.j ?? wildJump(rand);
  return {
    h: healthStep(pick(a.h, b.h, chance, rand)),
    s: speedStep(pick(a.s, b.s, chance, rand)),
    j: jumpStep(pick(ja, jb, chance, rand)),
  };
}

/**
 * A foal's coat or markings, as in Java Edition: 4 in 9 from each parent and
 * 1 in 9 at random. A parent whose look is unknown counts as random.
 */
export function inheritLook(a, b, count, rand) {
  const r = rand() * 9;
  const random = () => Math.min(count - 1, Math.floor(rand() * count));
  if (r < 4) return a ?? random();
  if (r < 8) return b ?? random();
  return random();
}

/** One more than the older line: wild horses, and horses of unknown birth, are generation 0. */
export function generationOf(a, b) {
  return Math.max(a ?? 0, b ?? 0) + 1;
}

// Conversions players recognise. Speed in blocks per second uses the factor
// the Minecraft Wiki gives for horses; jump height uses the wiki's fit of jump
// strength to blocks. Both are shown as approximate.
export function blocksPerSecond(speed) {
  return speed * 42.16;
}

export function jumpBlocks(hundredths) {
  const x = hundredths / 100;
  return -0.1817584952 * x ** 3 + 3.689713992 * x ** 2 + 2.128599134 * x - 0.343930367;
}

/**
 * The jump strength (hundredths) whose full jump comes nearest to a measured
 * rise in blocks. The inverse of jumpBlocks over the vanilla range.
 */
export function jumpFromHeight(blocks) {
  let best = JUMP_MIN;
  for (let j = JUMP_MIN; j <= JUMP_MAX; j++) {
    if (Math.abs(jumpBlocks(j) - blocks) < Math.abs(jumpBlocks(best) - blocks)) best = j;
  }
  return best;
}

/** 0 .. 1: where a value sits in the wild range. */
function quality(v, lo, hi) {
  return clamp((v - lo) / (hi - lo), 0, 1);
}

function tier(q) {
  if (q >= 0.9) return "§b";
  if (q >= 0.6) return "§a";
  if (q >= 0.3) return "§e";
  return "§c";
}

const fmt = (n) => n.toFixed(1);

/**
 * The stats a player gets to see, from the true ones.
 * horse: { tamed, ridden, jm } where jm is its best jump seen, in blocks.
 * opts: { wild } shows an untamed horse's stats; { learn } hides health and
 * speed until the horse has been ridden, and shows its best jump seen in
 * place of its jump. Breeding always uses the true stats.
 * Returns null when nothing is shown.
 */
export function shownStats(stats, horse, opts) {
  if (!horse.tamed && !opts.wild) return null;
  if (!opts.learn) return stats;
  return {
    h: horse.ridden ? stats.h : null,
    s: horse.ridden ? stats.s : null,
    j: horse.jm != null ? jumpFromHeight(horse.jm) : null,
    jEst: true,
    fixed: stats.fixed,
  };
}

export function statParts(stats) {
  if (!stats) return [];
  // A stat every animal of its kind shares is shown plain, not ranked.
  const tierOr = (q) => (stats.fixed ? "§f" : tier(q));
  const parts = [];
  if (stats.h == null) parts.push("§7Health ?§r");
  else parts.push(`${tier(quality(stats.h, HEALTH_MIN, HEALTH_MAX))}Health ${Math.round(stats.h)}§r`);
  if (stats.s == null) parts.push("§7Speed ?§r");
  else parts.push(`${tierOr(quality(stats.s, SPEED_MIN, SPEED_MAX))}Speed ${fmt(blocksPerSecond(stats.s))}§r`);
  if (stats.j == null) parts.push("§7Jump ?§r");
  else parts.push(`${tierOr(quality(stats.j, JUMP_MIN, JUMP_MAX))}Jump ${stats.jEst ? "~" : ""}${fmt(jumpBlocks(stats.j))}§r`);
  return parts;
}

export const COLORS = ["White", "Creamy", "Chestnut", "Brown", "Black", "Gray", "Dark brown"];
export const MARKINGS = ["None", "White socks and blaze", "White patches", "White spots", "Black spots"];

export function colorName(variant) {
  return COLORS[variant] ?? "Unknown";
}

// Text colour for each coat in the book, picked to stay readable on the cream
// page: white shows as light gray, and the material colours stand in for the
// browns, which Minecraft has no plain code for.
const COLOR_CODES = ["§7", "§p", "§6", "§n", "§0", "§8", "§j"];

/** "Brown" in a brown-ish colour, for the book. */
export function coloredColorName(variant) {
  const code = COLOR_CODES[variant];
  return code ? `${code}${colorName(variant)}§r` : colorName(variant);
}

/** A name with its number in dark gray: "Oak Dancer §8#1§r". */
export function grayNumber(name, after = "§r") {
  return name.replace(/ (#\d+)$/, ` §8$1${after}`);
}

export function markingName(mark) {
  return MARKINGS[mark] ?? "Unknown";
}

// Names for horses without a name tag: a word from the coat colour, then a
// word from the markings, so "Copper Blaze" is a chestnut with white socks and
// a blaze. Picked from the entity id, which is saved with the horse, so a horse
// keeps its name for life without storing it. 36 names per look; every one
// fits the 16-character book title.
const COLOR_WORDS = [
  ["Swan", "Frost", "Pearl", "Ivory", "Snow", "Lily"],
  ["Honey", "Butter", "Sand", "Biscuit", "Maple", "Dune"],
  ["Copper", "Rust", "Amber", "Ember", "Penny", "Ginger"],
  ["Hazel", "Cocoa", "Oak", "Acorn", "Toffee", "Bramble"],
  ["Raven", "Shadow", "Coal", "Onyx", "Night", "Crow"],
  ["Ash", "Smoke", "Storm", "Flint", "Slate", "Pewter"],
  ["Walnut", "Mocha", "Umber", "Cedar", "Bark", "Truffle"],
];
const MARK_WORDS = [
  ["Runner", "Dancer", "Spirit", "Wind", "Dash", "Song"],
  ["Blaze", "Socks", "Beacon", "Flash", "Stripe", "Boots"],
  ["Patch", "Cloud", "Paint", "Quilt", "Pinto", "Mist"],
  ["Freckle", "Speck", "Spark", "Flurry", "Dot", "Comet"],
  ["Pepper", "Dapple", "Domino", "Ink", "Pebble", "Spots"],
];

// Donkeys and mules have one look each, so their names come from lists of
// their own: 36 names per kind before the number.
const OTHER_WORDS = {
  donkey: [
    ["Dusty", "Clover", "Barley", "Thistle", "Juniper", "Hickory"],
    ["Jack", "Burro", "Rambler", "Trotter", "Wanderer", "Bray"],
  ],
  mule: [
    ["Rusty", "Cobble", "Russet", "Nutmeg", "Sorrel", "Fennel"],
    ["Packer", "Hauler", "Plow", "Kicker", "Trekker", "Drifter"],
  ],
};

export const KIND_NAMES = { horse: "Horse", donkey: "Donkey", mule: "Mule" };

function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * The generated name of a horse with no name tag, e.g. "Copper Blaze #3".
 * The words describe the horse; the number counts the horses registered under
 * those words, so the third Copper Blaze is #3 whatever its registry number.
 */
export function herdName(id, variant, mark, num, kind = "horse") {
  const h = hash(String(id));
  let words;
  if (OTHER_WORDS[kind]) {
    const [firsts, seconds] = OTHER_WORDS[kind];
    words = `${firsts[h % firsts.length]} ${seconds[(h >>> 8) % seconds.length]}`;
  } else {
    const colors = COLOR_WORDS[variant];
    const marks = MARK_WORDS[mark] ?? MARK_WORDS[0];
    words = colors ? `${colors[h % colors.length]} ${marks[(h >>> 8) % marks.length]}` : "Horse";
  }
  return num ? `${words} #${num}` : words;
}

/** "Spirit & Copper Blaze", or why there are no parents to show. */
export function parentsText(info) {
  if (info.origin === "bred") {
    if (!info.parents?.length) return "parents unknown";
    return info.parents.join(" & ");
  }
  if (info.origin === "wild") return "wild-born";
  return "born before Champion Lines";
}

/**
 * The action-bar text.
 * info: { name, baby, stats, origin, parents: [names] }
 * show: { stats, parents }
 */
export function describe(info, show) {
  const title = `§l${info.name ?? "Horse"}§r${info.baby ? " §7(foal)§r" : ""}`;
  const lines = [title];
  if (show.stats && info.stats) lines[0] += " · " + statParts(info.stats).join(" · ");
  if (show.parents) lines.push(`§7Parents: ${parentsText(info)}§r`);
  return lines.join("\n");
}

/**
 * Book title: Bedrock rejects long ones, so keep to the 16 a player may type.
 * A generated name too long with its number keeps the colour word and the
 * number ("Biscuit #1234"), so the title still identifies the horse.
 */
export function bookTitle(name) {
  const t = name ?? "Horse";
  if (t.length <= 16) return t;
  const numbered = t.match(/^(\S+) .* (#\d+)$/);
  if (numbered && numbered[1].length + numbered[2].length < 16) return `${numbered[1]} ${numbered[2]}`;
  return t.slice(0, 15) + ".";
}

/**
 * What a horse's generated name is called once a name tag replaces it: the
 * name it was born with, or the one it had in the wild. A horse that predates
 * the pack counts as wild, since nothing is known of its birth.
 */
export function firstNameLabel(origin) {
  return origin === "bred" ? "Birth name" : "Wild name";
}

// Book text is drawn in the Minecraft font, so a value is right-justified by
// padding it with spaces to a measured width. These are the font's advance
// widths in pixels; every character not listed is 6. A page line holds about
// 120: "Wild name: Ghost Beacon" (119) fits and "Markings: White socks and"
// (128) wraps. With the smooth font setting on, values land a little off.
const GLYPH = { " ": 4, i: 2, l: 3, t: 4, I: 4, f: 5, k: 5, ".": 2, ",": 2, ":": 2, ";": 2, "!": 2, "'": 2, "|": 2, "`": 3, "(": 5, ")": 5, "[": 4, "]": 4, "{": 5, "}": 5, "<": 5, ">": 5, '"': 4, "*": 5, "@": 7, "~": 7 };
export const LINE_WIDTH = 118;
export const PAGE_LINES = 14;

/** Width of book text in pixels, ignoring § formatting codes. */
export function textWidth(text) {
  let w = 0;
  let bold = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "§") {
      const code = text[++i];
      if (code === "l") bold = true;
      else if (code === "r") bold = false;
      continue;
    }
    w += (GLYPH[text[i]] ?? 6) + (bold ? 1 : 0);
  }
  return w;
}

/** The text pushed to the right edge of the page with spaces. */
export function rightAlign(text) {
  const pad = Math.floor((LINE_WIDTH - textWidth(text)) / GLYPH[" "]);
  return pad > 0 ? " ".repeat(pad) + text : text;
}

/**
 * A label, then its value right-justified on the same line. A pair too wide
 * for one line puts the value right-justified on the line below.
 */
function field(label, value, code = "") {
  const left = `${code}${label}:${code ? "§r" : ""}`;
  const right = `${code}${value}${code ? "§r" : ""}`;
  const pad = Math.floor((LINE_WIDTH - textWidth(left) - textWidth(right)) / GLYPH[" "]);
  return pad >= 1 ? [left + " ".repeat(pad) + right] : [left, rightAlign(right)];
}

/** A parent's stats for the Lineage page, one per line: "Health: 18". */
export function parentStatLines(st) {
  const h = st?.h == null ? "?" : Math.round(st.h);
  const sp = st?.s == null ? "?" : fmt(blocksPerSecond(st.s));
  const j = st?.j == null ? "?" : `${st.jEst ? "~" : ""}${fmt(jumpBlocks(st.j))}`;
  return [`Health: ${h}`, `Speed: ${sp}`, `Jump: ${j}`].map((t) => `§7 ${t}§r`);
}

/**
 * The pages of the info book: the horse, its stats, and (bred horses only)
 * its lineage. The horse's page runs onto a second page when it would not fit.
 * info: { name, kind, firstName, reg, gen, tamer, stats, origin, parents, parentEntries, breeder, day, variant, mark, today }
 */
export function bookPages(info) {
  const s = info.stats;
  const kind = info.kind ?? "horse";
  let origin;
  if (info.origin === "bred") {
    origin = [
      ...(info.gen ? field("Generation", info.gen) : []),
      ...field("Born", `day ${info.day ?? "?"}`),
      ...field("Bred by", info.breeder ?? "unknown"),
    ];
    if (info.tamer) origin.push(...field("Tamed by", info.tamer));
  } else {
    if (info.origin === "wild") origin = ["Wild-born", ...field("First seen", `day ${info.day ?? "?"}`)];
    else origin = ["§7Born before Champion", "Lines was added,", "so its parents and", "birthday are unknown.§r"];
    if (info.tamer) origin.push(...field("Tamed by", info.tamer));
  }
  const looks = kind === "horse"
    ? [...field("Color", coloredColorName(info.variant)), ...field("Markings", markingName(info.mark))]
    : [];
  const top = [
    `§l${KIND_NAMES[kind] ?? "Horse"}§r`,
    ...field("Name", `§l${grayNumber(info.name ?? "Horse", "")}§r`),
    ...(info.firstName ? field(firstNameLabel(info.origin), info.firstName, "§7") : []),
    "",
    ...looks,
    ...(info.reg ? field("Registry No.", info.reg, "§8") : []),
  ];
  const identity = top.length + 1 + origin.length <= PAGE_LINES
    ? [[...top, "", ...origin].join("\n")]
    : [top.join("\n"), origin.join("\n")];

  // A renamed parent is listed under its current name with its first name
  // below, so a book written before the rename can still be matched to it.
  const entries = info.parentEntries ?? (info.parents ?? []).map((name) => ({ name }));
  const parentBlocks = entries.map((p) => [
    grayNumber(p.name),
    ...(p.gen !== undefined ? [`§7 generation ${p.gen}§r`] : []),
    ...(p.first ? [`§7 ${firstNameLabel(p.origin).toLowerCase()}: ${p.first}§r`] : []),
    ...("stats" in p ? parentStatLines(p.stats) : []),
  ]);
  const lineage = (blocks, title = "Lineage") => [`§l${title}§r`, "", ...(blocks.length ? blocks.flatMap((b) => [...b, ""]) : ["unknown"])].join("\n").trimEnd();
  // Two parents with all their lines can overrun a page; then each gets one.
  let parentsPage = [];
  if (info.origin === "bred") {
    const together = lineage(parentBlocks);
    parentsPage = together.split("\n").length <= PAGE_LINES ? [together] : parentBlocks.map((b, i) => lineage([b], `Lineage, parent ${"AB"[i]}`));
  }

  let jump;
  if (!s) jump = [];
  else if (s.j == null) jump = ["Jump: unknown", "§7 ride it and jump at", " full charge§r"];
  else if (s.jEst) jump = [`Jump: ~${fmt(jumpBlocks(s.j))} blocks`, "§7 from its best jump§r"];
  else jump = [`Jump: ${fmt(jumpBlocks(s.j))} blocks`, `§7 strength ${(s.j / 100).toFixed(2)}§r`];
  const ride = "§7 ride it to find out§r";
  const body = !s
    ? ["§7Tame it to learn", "its stats.§r"]
    : [
        ...(s.h == null ? ["Health: ?", ride] : [`Health: ${Math.round(s.h)}`, `§7 ${fmt(s.h / 2)} hearts§r`]),
        "",
        ...(s.s == null ? ["Speed: ?", ride] : [`Speed: ${fmt(blocksPerSecond(s.s))}`, "§7 blocks/s§r"]),
        "",
        ...jump,
      ];
  const stats = ["§lStats§r", "", ...body, "", `§7Written on day ${info.today}§r`].join("\n");
  return [...identity, stats, ...parentsPage];
}
