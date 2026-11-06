// Original pixel art as string grids: one char per pixel, "." is transparent.
// Arena tiles and players come from free packs in client/art: Harvest Summer by SnowHex (grass, fences,
// stumps) and Super Retro Ranch by Gif (crates, the farmer).
import farmerUrl from "./art/ranch-farmer.png";
import fencesUrl from "./art/harvest-fences.png";
import tilesUrl from "./art/harvest-tiles.png";
import treesUrl from "./art/harvest-trees.png";
import ranchUrl from "./art/ranch-objects.png";

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

export const COLORS = ["#3fd0cb", "#ff7a85", "#8fe07a", "#c49bff"]; // also the --p1..--p4 CSS colours
export const ORBS = [toCanvas(ORB), toCanvas(ORB, { Y: PALETTE.c })]; // two frames: the spark flickers
// Arena tiles, cut from the packs' sheets by 16 px grid cell.
const sheet = async (url: string) => {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
};
const [TILES, FENCE_SHEET, TREES, RANCH, FARMER] = await Promise.all([tilesUrl, fencesUrl, treesUrl, ranchUrl, farmerUrl].map(sheet));
function cut(src: CanvasImageSource, x: number, y: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 16;
  c.getContext("2d")!.drawImage(src, x, y, 16, 16, 0, 0, 16, 16);
  return c;
}
const cell = (src: CanvasImageSource) => ([c, r]: number[]) => cut(src, c * 16, r * 16);
const crate = cut(RANCH, 48, 32);
const cracked = cut(crate, 0, 0);
{
  const x = cracked.getContext("2d")!;
  x.globalCompositeOperation = "source-atop"; // tint only the crate's own pixels
  x.fillStyle = "rgb(40 24 20 / 0.55)";
  x.fillRect(0, 0, 16, 16);
}
export const GRASS = [[13, 1], [10, 1], [11, 1], [12, 1], [10, 2], [11, 2], [12, 2]].map(cell(TILES)); // plain first
export const FLOWERS = [[14, 1], [15, 1], [13, 2], [14, 2], [15, 2], [16, 2]].map(cell(TILES));
export const BLOCKS = [crate, cracked]; // breakable: fresh, crumbling
export const PILLAR = cut(TREES, 112, 62); // tree stump, sitting on the tile's bottom edge
export const FENCES = [cut(FENCE_SHEET, 112, 64), cut(FENCE_SHEET, 80, 48)]; // top/bottom rail, side post

// The Ranch farmer, his straw hat dyed in the player's colour. One 20x20 frame (square, so lobby faces
// don't stretch) from the middle of each 32x32 cell; sheet rows face down, left, right, up.
function farmer(row: number, col: number, color: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 20;
  const x = c.getContext("2d")!;
  x.drawImage(FARMER, col * 32 + 6, row * 32 + 4, 20, 20, 0, 0, 20, 20);
  const px = x.getImageData(0, 0, 20, 20);
  const hat = parseInt(color.slice(1), 16);
  for (let i = 0; i < px.data.length; i += 4) {
    const rgb = (px.data[i] << 16) | (px.data[i + 1] << 8) | px.data[i + 2];
    const shade = rgb === 0xf4b41b ? 1 : rgb === 0xf47e1b ? 0.7 : 0; // straw: crown, brim
    if (shade) for (let k = 0; k < 3; k++) px.data[i + k] = ((hat >> (16 - 8 * k)) & 255) * shade;
  }
  x.putImageData(px, 0, 0);
  return c;
}
// TRAINERS[player][dir][frame]; dir order matches the sim (up, down, left, right), frames are stand, walk, walk.
export const TRAINERS = COLORS.map((color) => [3, 0, 1, 2].map((row) => [1, 0, 2].map((col) => farmer(row, col, color))));
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
