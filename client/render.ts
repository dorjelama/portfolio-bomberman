// Draws one game state. seats[i] is sim player i's seat, which picks their colours.
import {
  BELT, BLOCK, COLS, CRUMBLE, DX, DY, FLAME, FLOOR, FUSE, ICE, LANES, NIGHT, PORTAL, ROWS, THROW_HOPS, TICK_HZ, TILE, TRACTOR, WALL, ghostReady,
  tractor, type Bomb, type Game,
} from "../shared/sim.ts";
import {
  BELTS, BLOCKS, CROWN_IMG, CURSE_MARK, FENCES, FLOWERS, GRASS, ICE_IMG, ITEM_TILES, ORBS, PILLAR, PORTAL_IMG, POTATO_IMG, TRACTOR_IMG, TRAINERS,
} from "./sprites.ts";

const PX = TILE / 16; // sim units per screen pixel
const OVERHEAD = 18; // px above a player's centre where a carried orb sits, on the hat
export const CROWN_TOP = 20; // px above a player's centre where the crown starts (name tags go above it)

const field = document.createElement("canvas");
field.width = COLS * 16;
field.height = ROWS * 16;
{
  const f = field.getContext("2d")!;
  f.fillStyle = "rgb(0 0 0 / 0.06)"; // faint checkerboard so the grid stays readable
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const edge = !c || !r || c === COLS - 1 || r === ROWS - 1; // plain under the fence, or flowers peek out
      const n = edge ? 28 : (c * 73 + r * 151 + c * r * 7) % 29; // cheap deterministic scatter, as in Critter Catch
      f.drawImage(n < 2 ? FLOWERS[(c + r) % FLOWERS.length] : n < 12 ? GRASS[1 + (n % 6)] : GRASS[0], c * 16, r * 16);
      if ((c + r) % 2) f.fillRect(c * 16, r * 16, 16, 16);
    }
  }
}

function drawFire(ctx: CanvasRenderingContext2D, g: Game, i: number) {
  const x = (i % COLS) * 16;
  const y = Math.floor(i / COLS) * 16;
  const [l, r, u, d] = [i - 1, i + 1, i - COLS, i + COLS].map((j) => g.fire[j] > 0);
  const grow = ((g.tick + i) % 6 < 3 ? 2 : 0) - (g.fire[i] < 8 ? 4 : 0); // flicker, then thin out as it dies
  for (const [base, color] of [[12, "#ff6b4a"], [8, "#ffd23f"], [4, "#ffffff"]] as const) {
    const w = Math.max(2, base + grow);
    const h = (16 - w) / 2;
    ctx.fillStyle = color;
    if (l || r || !(u || d)) ctx.fillRect(x + (l ? 0 : h), y + h, (r ? 16 : 16 - h) - (l ? 0 : h), w);
    if (u || d || !(l || r)) ctx.fillRect(x + h, y + (u ? 0 : h), w, (d ? 16 : 16 - h) - (u ? 0 : h));
  }
}

function drawOrb(ctx: CanvasRenderingContext2D, b: Pick<Bomb, "x" | "y" | "remote" | "fuse">, t: number) {
  const x = Math.round(b.x / PX);
  const y = Math.round(b.y / PX);
  const swell = Math.floor(t / (!b.remote && b.fuse < 45 ? 4 : 12)) % 2; // pulses faster just before it blows
  ctx.drawImage(ORBS[Math.floor(t / 4) % 2], x - 7 - swell, y - 7 - swell, 14 + 2 * swell, 13 + 2 * swell);
  if (b.remote && t % 30 < 15) {
    ctx.fillStyle = "#ff6b4a";
    ctx.fillRect(x - 1, y + 2, 2, 2);
  }
}

// Conveyor: the chevrons scroll in the belt's direction.
function drawBelt(ctx: CanvasRenderingContext2D, x: number, y: number, d: number, t: number) {
  const s = (t >> 2) % 16;
  const [dx, dy] = [[0, -s], [0, s], [-s, 0], [s, 0]][d];
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, 16, 16);
  ctx.clip();
  ctx.drawImage(BELTS[d], x + dx, y + dy);
  ctx.drawImage(BELTS[d], x + dx - Math.sign(dx) * 16, y + dy - Math.sign(dy) * 16);
  ctx.restore();
}

function drawTrainer(ctx: CanvasRenderingContext2D, g: Game, id: number, seat: number, nudge = { x: 0, y: 0 }, crown = false) {
  const p = g.players[id];
  const t = g.tick;
  if (!p.alive && !p.ghost && (t - p.diedAt > 50 || (t >> 2) % 2)) return; // knocked out: blink, then gone until back as a ghost
  if (p.alive && p.invuln && (t >> 2) % 2) return;
  const lean = t - p.threwAt < 8 ? 2 : 0; // just threw: lunge into it
  const x = Math.round((p.x + nudge.x) / PX) + DX[p.dir] * lean;
  const y = Math.round((p.y + nudge.y) / PX) + DY[p.dir] * lean;
  const frame = p.moving && g.phase === "play" ? 1 + (Math.floor(t / 9) % 2) : 0;
  ctx.globalAlpha = p.alive ? 1 : p.ghost ? 0.75 : 0.6;
  ctx.drawImage(TRAINERS[seat][p.dir][frame], x - 10, y - 16); // 20x20 farmer, feet 3 px below centre; the hat shows the colour
  if (crown) ctx.drawImage(CROWN_IMG, x - 5, y - CROWN_TOP); // the hat's top is 14 px up in every frame, so it sits flush
  ctx.globalAlpha = 1;
  if (p.alive && p.god) {
    // God mode (a cheat): a halo over the hat, so everyone can see who's cheating.
    ctx.strokeStyle = "#ffd23f";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, Math.max(3, y - 18), 5, 1.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
  // Overhead marks are clamped to the canvas, or they'd vanish above anyone on the top row (and ghosts on the top rim).
  if (p.ghost && ghostReady(g, p)) drawOrb(ctx, { x: x * PX, y: Math.max(7, y - OVERHEAD) * PX, remote: false, fuse: FUSE }, t); // an orb overhead = ready to throw
  if (p.curse && (t >> 3) % 2) ctx.drawImage(CURSE_MARK, x - 5, Math.max(0, y - 27));
  if (p.potato) {
    const jig = (t >> (p.potato < 3 * TICK_HZ ? 1 : 3)) % 2; // jiggles faster near the end
    // Over the name tag; on the top row there's no room, so it's held out beside the head instead.
    if (y >= 34) ctx.drawImage(POTATO_IMG, x - 8, y - 34 - jig);
    else ctx.drawImage(POTATO_IMG, x + 7, y - 20 - jig);
  }
  if (p.shield) {
    ctx.strokeStyle = "rgb(244 244 244 / 0.8)"; // white: seat colours only ever mean a player
    ctx.beginPath();
    ctx.arc(x, y - 6, 10.5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// Night Farm: everything outside the lights is dark. Only your own lantern is lit, so others lurk until a blast shows them.
// Ghosts and watchers see everyone (a ghost has to aim), and the potato always glows.
const dark = document.createElement("canvas");
dark.width = COLS * 16;
dark.height = ROWS * 16;
function night(ctx: CanvasRenderingContext2D, g: Game, me: number, nudge: { x: number; y: number }[]) {
  const d = dark.getContext("2d")!;
  d.globalCompositeOperation = "source-over";
  d.fillStyle = "rgb(6 8 28 / 0.94)";
  d.fillRect(0, 0, dark.width, dark.height);
  d.globalCompositeOperation = "destination-out";
  const light = (x: number, y: number, r: number) => {
    const glow = d.createRadialGradient(x, y, r * 0.4, x, y, r);
    glow.addColorStop(0, "#000");
    glow.addColorStop(1, "rgb(0 0 0 / 0)");
    d.fillStyle = glow;
    d.fillRect(x - r, y - r, 2 * r, 2 * r);
  };
  const mine = g.players[me];
  const lit = mine?.alive ? [me] : g.players.map((_, i) => i); // a ghost, watching, or just knocked out: see everyone
  const at = (i: number) => [(g.players[i].x + (nudge[i]?.x ?? 0)) / PX, (g.players[i].y + (nudge[i]?.y ?? 0)) / PX] as const;
  for (const i of lit) {
    const p = g.players[i];
    if (p.alive || p.ghost) light(at(i)[0], at(i)[1] - 4, 40);
  }
  g.players.forEach((p, i) => p.alive && p.potato && light(at(i)[0], at(i)[1] - 12, 28)); // you can always see who has it
  g.fire.forEach((f, i) => f && light((i % COLS) * 16 + 8, Math.floor(i / COLS) * 16 + 8, 24));
  for (const b of g.bombs) light(b.x / PX, b.y / PX, 12 + ((g.tick >> 3) % 2) * 2); // the fuse sparks
  ctx.drawImage(dark, 0, 0);
}

// Tractor Lane: arrows flash at the road's start while a tractor's coming, then it drives through.
function tractors(ctx: CanvasRenderingContext2D, g: Game) {
  LANES.forEach(([row, dir], k) => {
    const { x, warn } = tractor(g, k);
    const y = row * 16;
    if (warn && (g.tick >> 3) % 2) {
      ctx.fillStyle = "#ff6b4a";
      for (const c of [1, 2, 3]) {
        const ax = (dir > 0 ? c : COLS - 1 - c) * 16 + 8;
        ctx.beginPath();
        ctx.moveTo(ax + dir * 5, y + 8);
        ctx.lineTo(ax - dir * 3, y + 3);
        ctx.lineTo(ax - dir * 3, y + 13);
        ctx.fill();
      }
    }
    if (x === null) return;
    ctx.save();
    ctx.translate(Math.round(x / PX), y);
    ctx.scale(dir, 1);
    ctx.drawImage(TRACTOR_IMG, -8, -2);
    ctx.restore();
  });
}

// nudge[i]: extra offset for player i, easing out a rollback correction. me: whose lantern lights Night Farm.
// crowned: the player wearing the crown (Harvest's carrot leader), if any.
export function render(ctx: CanvasRenderingContext2D, g: Game, seats: number[], nudge: { x: number; y: number }[] = [], me = -1, crowned = -1) {
  const t = g.tick;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(field, 0, 0);
  if (g.map === TRACTOR) {
    ctx.fillStyle = "#9b7a4f"; // the dirt road
    for (const [row] of LANES) ctx.fillRect(16, row * 16 + 1, (COLS - 2) * 16, 14);
  }
  for (let i = COLS; i < g.grid.length; i++) {
    if (g.grid[i] === WALL) continue;
    const x = (i % COLS) * 16;
    const y = Math.floor(i / COLS) * 16;
    const ground = g.floor[i];
    if (ground === ICE) ctx.drawImage(ICE_IMG, x, y);
    else if (ground >= BELT && ground < BELT + 4) drawBelt(ctx, x, y, ground - BELT, t);
    else if (ground === PORTAL) {
      ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t / 10);
      ctx.drawImage(PORTAL_IMG, x, y);
      ctx.globalAlpha = 1;
    }
    if (g.grid[i] !== FLOOR) continue;
    if (g.grid[i - COLS] !== FLOOR) {
      ctx.fillStyle = "rgb(0 0 0 / 0.22)"; // shadow of the tile above
      ctx.fillRect(x, y, 16, 4);
    }
    const tile = ITEM_TILES[g.items[i]];
    if (tile) ctx.drawImage(tile, x, y - (Math.floor(t / 20) % 2));
    if (g.fire[i]) drawFire(ctx, g, i);
  }
  // Row by row, top to bottom, so a trainer's head overlaps the wall behind them.
  const byY = g.players.map((_, id) => id).sort((a, b) => g.players[a].y - g.players[b].y);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      const tile = g.grid[i];
      const inside = c > 0 && r > 0 && c < COLS - 1 && r < ROWS - 1;
      // Inside walls are pillars or, once the arena shrinks, fallen walls: both are stumps.
      if (tile === WALL) ctx.drawImage(inside ? PILLAR : FENCES[r === 0 || r === ROWS - 1 ? 0 : 1], c * 16, r * 16);
      else if (tile === BLOCK) ctx.drawImage(BLOCKS[0], c * 16, r * 16);
      else if (tile === CRUMBLE) {
        ctx.globalAlpha = g.crumble[i] / FLAME;
        ctx.drawImage(BLOCKS[1], c * 16 + ((t >> 1) % 2), r * 16);
        ctx.globalAlpha = 1;
      }
    }
    for (const b of g.bombs) if (!b.hops && Math.floor(b.y / TILE) === r) drawOrb(ctx, b, t);
    for (const id of byY) if (Math.floor(g.players[id].y / TILE) === r) drawTrainer(ctx, g, id, seats[id] ?? id, nudge[id], id === crowned);
  }
  // Carried orbs sit on the hat; thrown ones leave from there in an arc over everything (shadow on the ground),
  // landing a tile short, then a last hop. Bounces off taken tiles are that same small hop.
  for (const b of g.bombs) {
    if (!b.hops) continue;
    const along = ((((b.x - TILE / 2) * b.dx + (b.y - TILE / 2) * b.dy) % TILE) + TILE) % TILE / TILE;
    const u = (b.hops - along - 1) / (THROW_HOPS - 1); // 1 when it leaves the hands, 0 a tile before landing
    const lift = b.hops < 0 ? OVERHEAD : u > 0 ? OVERHEAD * u + 24 * u * (1 - u) : Math.sin(along * Math.PI) * 6;
    if (b.hops > 0) {
      ctx.fillStyle = "rgb(0 0 0 / 0.3)";
      ctx.fillRect(Math.round(b.x / PX) - 4, Math.round(b.y / PX) + 4, 8, 2);
    }
    drawOrb(ctx, { ...b, y: b.y - Math.round(lift) * PX }, t);
  }
  tractors(ctx, g);
  if (g.map === NIGHT) night(ctx, g, me, nudge);
}
