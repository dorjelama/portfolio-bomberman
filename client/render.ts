// Draws one game state. seats[i] is sim player i's seat, which picks their colours.
import { BELT, BLOCK, COLS, CRUMBLE, FLAME, FLOOR, ICE, PORTAL, ROWS, TILE, WALL, isPillar, type Bomb, type Game } from "../shared/sim.ts";
import { BELTS, BORDER, BUSHES, COLORS, CURSE_MARK, ICE_IMG, ITEM_TILES, ORBS, PILLAR, PORTAL_IMG, TRAINERS } from "./sprites.ts";

const PX = TILE / 16; // sim units per screen pixel

const field = document.createElement("canvas");
field.width = COLS * 16;
field.height = ROWS * 16;
{
  const f = field.getContext("2d")!;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      f.fillStyle = (c + r) % 2 ? "#6fbf4f" : "#67b648";
      f.fillRect(c * 16, r * 16, 16, 16);
    }
  }
  for (let i = 0; i < 140; i++) {
    const x = (i * 97) % field.width; // cheap deterministic scatter, as in Critter Catch
    const y = (i * 61 + ((i * i) % 37)) % field.height;
    f.fillStyle = i % 3 ? "#5aa83e" : "#8fd468";
    f.fillRect(x, y, 2, 1);
    f.fillRect(x + 3, y - 1, 1, 2);
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

function drawOrb(ctx: CanvasRenderingContext2D, b: Bomb, t: number) {
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

function drawTrainer(ctx: CanvasRenderingContext2D, g: Game, id: number, seat: number, nudge = { x: 0, y: 0 }) {
  const p = g.players[id];
  const t = g.tick;
  if (!p.alive && !p.ghost && (t - p.diedAt > 50 || (t >> 2) % 2)) return; // knocked out: blink, then gone until back as a ghost
  if (p.alive && p.invuln && (t >> 2) % 2) return;
  const x = Math.round((p.x + nudge.x) / PX);
  const y = Math.round((p.y + nudge.y) / PX);
  const frame = p.moving && g.phase === "play" ? 1 + (Math.floor(t / 9) % 2) : 0;
  ctx.globalAlpha = p.alive ? 1 : p.ghost ? 0.75 : 0.6;
  ctx.drawImage(TRAINERS[seat][p.dir][frame], x - 8, y - 12);
  ctx.globalAlpha = 1;
  ctx.fillStyle = COLORS[seat];
  ctx.fillRect(x - 3, y - 15, 6, 2);
  if (p.curse && (t >> 3) % 2) ctx.drawImage(CURSE_MARK, x - 5, y - 27);
  if (p.shield) {
    ctx.strokeStyle = "rgb(63 208 203 / 0.8)";
    ctx.beginPath();
    ctx.arc(x, y - 4, 9.5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// nudge[i]: extra offset for player i, easing out a rollback correction.
export function render(ctx: CanvasRenderingContext2D, g: Game, seats: number[], nudge: { x: number; y: number }[] = []) {
  const t = g.tick;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(field, 0, 0);
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
      if (tile === WALL) ctx.drawImage(inside && isPillar(c, r) ? PILLAR : BORDER, c * 16, r * 16);
      else if (tile === BLOCK) ctx.drawImage(BUSHES[0], c * 16, r * 16);
      else if (tile === CRUMBLE) {
        ctx.globalAlpha = g.crumble[i] / FLAME;
        ctx.drawImage(BUSHES[1], c * 16 + ((t >> 1) % 2), r * 16);
        ctx.globalAlpha = 1;
      }
    }
    for (const b of g.bombs) if (Math.floor(b.y / TILE) === r) drawOrb(ctx, b, t);
    for (const id of byY) if (Math.floor(g.players[id].y / TILE) === r) drawTrainer(ctx, g, id, seats[id] ?? id, nudge[id]);
  }
}
