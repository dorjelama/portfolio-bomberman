// Original pixel art as string grids: one char per pixel, "." is transparent.
// The trainer is Critter Catch's sprite (portfolio-game/public/sprites.js), recoloured per player.
const PALETTE: Record<string, string> = {
  k: "#1b1b2f", // outline
  n: "#2b2f77", // beanie
  N: "#4a52b3", // beanie cuff
  w: "#ffffff",
  h: "#1a1a1a", // hair
  s: "#f2c29b", // skin
  S: "#d99b73",
  e: "#1a1a1a", // eyes
  t: "#1f9e9a", // scarf
  o: "#e0a43a", // scarf stripe
  j: "#2a2a2a", // jacket
  b: "#4a3424", // trousers / boots
  R: "#a3a9b0", // Pebblet
  r: "#6b7177",
  P: "#f4a7c4", // Fluffin
  p: "#d9739c",
  Y: "#ffd23f", // Zappik
  y: "#d99a1e",
  c: "#ff6b4a",
  g: "#5aa83e", // bush
  G: "#8fd468",
  d: "#3d7f2c",
};
const P2 = { n: "#7a1f2b", N: "#b33a4a", t: "#e0a43a", o: "#1f9e9a" };
const P3 = { n: "#2f6b35", N: "#4fa055", t: "#ffd23f", o: "#2b2f77" };
const P4 = { n: "#5b2b7a", N: "#8a4fb3", t: "#f4a7c4", o: "#4a52b3" };

const HEAD_FRONT = [
  "....kkkkkkkk....",
  "...knnnnNNnnk...",
  "..knnnnnnwnnnk..",
  "..kNNNNNNNNNNk..",
  "..khhhhhhhhhhk..",
  "..khsssssssshk..",
  "..khsesssseshk..",
  "...ksssSSsssk...",
];
const HEAD_BACK = [
  "....kkkkkkkk....",
  "...knnnnNNnnk...",
  "..knnnnnnnnnnk..",
  "..kNNNNNNNNNNk..",
  "..khhhhhhhhhhk..",
  "..khhhhhhhhhhk..",
  "..khhhhhhhhhhk..",
  "...khhhhhhhhk...",
];
const BODY_FRONT = [
  "..kttottttottk..",
  ".kjttttttttttjk.",
  ".kjjjtottotjjjk.",
  ".ksjjjjjjjjjjsk.",
  "..kjjjjjjjjjjk..",
];
const BODY_BACK = [
  "..kttttttttttk..",
  ".kjttttttttttjk.",
  ".kjjjjjjjjjjjjk.",
  ".ksjjjjjjjjjjsk.",
  "..kjjjjjjjjjjk..",
];
const SIDE_TOP = [
  ".....kkkkkkk....",
  "....knnnnNNnk...",
  "...knnnnnnnnnk..",
  "...kNNNNNNNNNk..",
  "...khhhhhhhhhk..",
  "..ksssshhhhhhk..",
  "..ksesshhhhhhk..",
  "...ksssshhhhk...",
  "...kttttttttok..",
  "..kttttjjjjjjk..",
  "...kjjjjjjjjk...",
  "...kjsjjjjjjk...",
  "...kjjjjjjjjk...",
];
const LEGS = {
  stand: ["...kbbbbbbbbk...", "...kbbk..kbbk...", "...kkkk..kkkk..."],
  walk: ["...kbbbbbbbbk...", "..kbbk...kbbk...", "..kkkk....kkk..."],
  sideStand: ["....kbbbbbbk....", "....kbbkkbbk....", "....kkk..kkk...."],
  sideWalk: ["...kbbbbbbbbk...", "..kbbk....kbbk..", "..kkk......kkk.."],
};

const mirror = (rows: string[]) => rows.map((r) => [...r].reverse().join(""));
const front = [...HEAD_FRONT, ...BODY_FRONT];
const back = [...HEAD_BACK, ...BODY_BACK];
const left = [
  [...SIDE_TOP, ...LEGS.sideStand],
  [...SIDE_TOP, ...LEGS.sideWalk],
  [...SIDE_TOP, ...LEGS.sideWalk],
];
// TRAINER[dir] = [stand, walkA, walkB]
const TRAINER = {
  down: [[...front, ...LEGS.stand], [...front, ...LEGS.walk], [...front, ...mirror(LEGS.walk)]],
  up: [[...back, ...LEGS.stand], [...back, ...LEGS.walk], [...back, ...mirror(LEGS.walk)]],
  left,
  right: left.map(mirror),
};


// ---------- new art for Boom Orbs ----------
const ORB = [
  "......kYk.....",
  "......kbk.....",
  "....kkkkkk....",
  "..kkNNnnnnkk..",
  ".kNwwNnnnnnnk.",
  ".kNwNnnnnnnnk.",
  "kNNnnnnnnnnnnk",
  "kcccccccccccck",
  "knnnnnnnnnnnnk",
  ".knnnnnnnnnnk.",
  ".knnnnnnnnnnk.",
  "..kknnnnnnkk..",
  "....kkkkkk....",
];

const BUSH = [
  "................",
  ".....kkkkkk.....",
  "...kkGGGGggkk...",
  "..kGGGggggggdk..",
  ".kGGgggggPgggdk.",
  ".kGggggggggggdk.",
  "kGGgggdggggggddk",
  "kGggggggggPggddk",
  "kGgPgggggggggddk",
  "kggggggdgggggddk",
  ".kgggggggggdddk.",
  ".kdggggggggdddk.",
  "..kddddgggddddk.",
  "...kkddddddkkk..",
  ".....kkkkkk.....",
  "................",
];

const STONE = [
  "kkkkkkkkkkkkkkkk",
  "kWWWWWWWWWWWWWRk",
  "kWRRRRRRRRRRRRRk",
  "kWRRRRRRRRrRRRRk",
  "kWRRRRRRRRRRRRRk",
  "kWRRRrRRRRRRRRRk",
  "kWRRRRRRRRRRRRRk",
  "kWRRRRRRRRRRrRRk",
  "kWRRRRRRRRRRRRRk",
  "kWRRRRRrRRRRRRRk",
  "kRRRRRRRRRRRRRRk",
  "krrrrrrrrrrrrrrk",
  "krrrrrrrrrrrrrrk",
  "krrrrrrrrrrrrrrk",
  "krrrrrrrrrrrrrrk",
  "kkkkkkkkkkkkkkkk",
];

// Power-up icons, indexed by item id in shared/sim.ts (1 = Orb+ … 11 = Swap).
const ICONS = [
  [],
  ["....kYk...", "....kbk...", "..kkkkkk..", ".kNwnnnnk.", "kNwnnnnnnk", "kcccccccck", "knnnnnnnnk", ".knnnnnnk.", "..kkkkkk..", ".........."],
  ["....k.....", "...kck....", "...kcck...", "..kccock..", ".kcooYock.", ".kcoYYYock", "kcoYYwYYok", "kcoYwwwYok", ".kcoYYYok.", "..kkkkkk.."],
  [".....kkkk.", "....kYYk..", "...kYYk...", "..kYYk....", ".kYYYYYYk.", ".kkkYYYk..", "...kYYk...", "..kYYk....", ".kYk......", ".kk......."],
  ["..kkkk....", "..kbbk....", "..kbbk....", "..kbbk....", "..kbbbk...", "..kbbbbkk.", ".kobbbbbbk", ".kbbbbbbbk", ".kkkkkkkkk", ".........."],
  ["kkkkkkkkkk", "kwtttotttk", "kttttotttk", "ktoooooook", "kttttotttk", ".ktttottk.", ".ktttottk.", "..kttttk..", "...kttk...", "....kk...."],
  ["......kYk.", ".......k..", "..kkkkkkk.", "..kRRRRRk.", "..kRcccRk.", "..kRcwcRk.", "..kRcccRk.", "..kRRRRRk.", "..krRrRrk.", "..kkkkkkk."],
  ["....k.....", "....kk....", "....kck...", "kkkkkcck..", "kccccccck.", "kccccccck.", "kkkkkcck..", "....kck...", "....kk....", "....k....."],
  ["....kk....", "...kcck...", "...kcck...", "..kccock..", ".kccoocck.", ".kcooYock.", ".kcoYYock.", ".kccoocck.", "..kcccck..", "...kkkk..."],
  ["..kkkkkk..", ".kwwwwwwk.", "kwwwwwwwwk", "kwkkwwkkwk", "kwkkwwkkwk", "kwwwwkwwwk", ".kwwwwwwk.", "..kwkwkwk.", "..kkkkkkk.", ".........."],
  ["..k.k.k...", ".kwkwkwk..", ".kwkwkwk..", ".kwwwwwwk.", "kkwwwwwwk.", "kwkwwwwwk.", ".kwwwwwwk.", "..kwwwwk..", "..kRRRRk..", "..kkkkkk.."],
  ["......k...", "kkkkkkYk..", "kYYYYYYYk.", "kkkkkkYk..", "......k...", "...k......", "..ktkkkkkk", ".ktttttttk", "..ktkkkkkk", "...k......"],
];

// Ground for the special maps: ice, a conveyor segment (drawn pointing right; rotated per direction), a portal.
const ICE_TILE = [
  "IIIIIIIIIIIIIIII",
  "IiiIIIIIIIIIIIII",
  "IiIIIIIIIIIIIIII",
  "IIIIIIIIIIIIIIII",
  "IIIIIIIIIIIiIIII",
  "IIIIIIIIIIiIIIII",
  "IIIIIIIIIiIIIIII",
  "IIIIIIIIIIIIIIII",
  "IIIIIIIIIIIIIIII",
  "IIIIIIIIIIIIIIII",
  "IIIiIIIIIIIIIIII",
  "IIiIIIIIIIIIIIII",
  "IIIIIIIIIIIIIIII",
  "IIIIIIIIIIIIIiiI",
  "IIIIIIIIIIIIIIiI",
  "IIIIIIIIIIIIIIIJ",
];
const BELT_TILE = [
  "kkkkkkkkkkkkkkkk",
  "rrrrrrrrrrrrrrrr",
  "RRRRRRRRRRRRRRRR",
  "RRRRYRRRRRRRYRRR",
  "RRRRYYRRRRRRYYRR",
  "RRRRRYYRRRRRRYYR",
  "RRRRRRYYRRRRRRYY",
  "RRRRRRRYYRRRRRRY",
  "RRRRRRRYYRRRRRRY",
  "RRRRRRYYRRRRRRYY",
  "RRRRRYYRRRRRRYYR",
  "RRRRYYRRRRRRYYRR",
  "RRRRYRRRRRRRYRRR",
  "RRRRRRRRRRRRRRRR",
  "rrrrrrrrrrrrrrrr",
  "kkkkkkkkkkkkkkkk",
];
const PORTAL_TILE = [
  "................",
  ".....kkkkkk.....",
  "...kkPPPPPPkk...",
  "..kPPppppppPPk..",
  ".kPppNNNNNNppPk.",
  ".kPpNNnnnnNNpPk.",
  "kPpNNnnwwnnNNpPk",
  "kPpNnnwwwwnnNpPk",
  "kPpNnnwwwwnnNpPk",
  "kPpNNnnwwnnNNpPk",
  ".kPpNNnnnnNNpPk.",
  ".kPppNNNNNNppPk.",
  "..kPPppppppPPk..",
  "...kkPPPPPPkk...",
  ".....kkkkkk.....",
  "................",
];

// Draws a grid to its own canvas once, so the game loop only blits images.
function toCanvas(rows: string[], overrides: Record<string, string> = {}) {
  if (rows.some((r) => r.length !== rows[0].length)) throw new Error(`ragged sprite: ${rows.join("|")}`);
  const c = document.createElement("canvas");
  c.width = rows[0].length;
  c.height = rows.length;
  const ctx = c.getContext("2d")!;
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === ".") return;
      ctx.fillStyle = overrides[ch] ?? PALETTE[ch];
      ctx.fillRect(x, y, 1, 1);
    })
  );
  return c;
}

function itemTile(icon: string[]) {
  const c = document.createElement("canvas");
  c.width = c.height = 16;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = PALETTE.k;
  ctx.fillRect(1, 2, 14, 12);
  ctx.fillRect(2, 1, 12, 14);
  ctx.fillStyle = "#fff4d6";
  ctx.fillRect(2, 2, 12, 12);
  ctx.drawImage(toCanvas(icon), 3, 3);
  return c;
}

// TRAINERS[player][dir][frame]; dir order matches the sim: up, down, left, right.
const bake = (overrides: Record<string, string>) =>
  [TRAINER.up, TRAINER.down, TRAINER.left, TRAINER.right].map((frames) => frames.map((f) => toCanvas(f, overrides)));

export const TRAINERS = [bake({}), bake(P2), bake(P3), bake(P4)];
export const COLORS = ["#3fd0cb", "#ff7a85", "#8fe07a", "#c49bff"]; // also the --p1..--p4 CSS colours
export const ORBS = [toCanvas(ORB), toCanvas(ORB, { Y: PALETTE.c })]; // two frames: the spark flickers
export const BUSHES = [toCanvas(BUSH), toCanvas(BUSH, { g: "#8a8a7a", G: "#b0b0a0", d: "#5a5a50", P: "#77776a" })]; // fresh, withered
export const PILLAR = toCanvas(STONE, { W: "#d6dbe0" });
export const BORDER = toCanvas(STONE, { W: "#8a8f96", R: "#6b7177", r: "#44484e" });
export const ITEM_TILES = ICONS.map((icon) => (icon.length ? itemTile(icon) : null));

// Rotate a grid a quarter turn clockwise.
const turn = (rows: string[]) => [...rows[0]].map((_, x) => rows.map((r) => r[x]).reverse().join(""));
const beltRight = BELT_TILE;
const beltDown = turn(beltRight);
const beltLeft = turn(beltDown);
const beltUp = turn(beltLeft);
export const ICE_IMG = toCanvas(ICE_TILE, { I: "#bfe6f5", i: "#ffffff", J: "#9fd0e6" });
export const BELTS = [beltUp, beltDown, beltLeft, beltRight].map((rows) => toCanvas(rows)); // by sim direction
export const PORTAL_IMG = toCanvas(PORTAL_TILE);
export const CURSE_MARK = toCanvas(ICONS[9]);
