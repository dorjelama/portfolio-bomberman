// Bot players. A bot only produces input bits, like a keyboard, so it needn't be deterministic:
// the server runs bots and sends their inputs to everyone like any other player's.
import {
  ACT, BLOCK, BOMB, COLS, DOWN, FLOOR, LEFT, RIGHT, ROWS, SPIRAL, TICK_HZ, TILE, UP, WALL, ghostReady, roundTicks, sideOf, tileAt,
  type Game,
} from "./sim.ts";

const STEPS = [-COLS, COLS, -1, 1]; // tile-index offsets for up, down, left, right (input bits 1, 2, 4, 8)
const ESCAPE_TILES = 5; // how far a bot will run from its own orb before the fuse ends
const GHOST_THROW_CHANCE = 0.05; // per tick once lined up, so people get a moment to react

// Tiles an explosion from `from` would reach. Mirrors explode() in sim.ts.
function blast(g: Game, from: number, range: number, bombs: Set<number>, out: Uint8Array, pierce = false) {
  out[from] = 1;
  for (const s of STEPS) {
    for (let k = 1, i = from + s; k <= range && g.grid[i] !== WALL; k++, i += s) {
      if (g.grid[i] !== FLOOR) {
        if (pierce) continue;
        break;
      }
      out[i] = 1;
      if ((g.items[i] || bombs.has(i)) && !pierce) break;
    }
  }
}

function dangerMap(g: Game, bombs: Set<number>) {
  const d = new Uint8Array(g.grid.length);
  g.fire.forEach((f, i) => f && (d[i] = 1));
  for (const b of g.bombs) blast(g, tileAt(b.x, b.y), b.range, bombs, d, b.pierce);
  if (g.opts.shrink && g.roundTick >= roundTicks(g) - TICK_HZ) for (const i of SPIRAL.slice(g.shrink, g.shrink + 15)) d[i] = 1;
  return d;
}

// Breadth-first search; returns the first tile to step to on the way to the nearest goal, or -1.
function firstStep(start: number, blocked: (i: number) => boolean, goal: (i: number) => boolean, maxDepth = Infinity) {
  const from = new Map([[start, start]]);
  let frontier = [start];
  for (let depth = 0; frontier.length && depth <= maxDepth; depth++) {
    const next: number[] = [];
    for (const i of frontier) {
      if (i !== start && goal(i)) {
        let t = i;
        while (from.get(t) !== start) t = from.get(t)!;
        return t;
      }
      for (const s of STEPS) {
        const j = i + s;
        if (!from.has(j) && !blocked(j)) {
          from.set(j, i);
          next.push(j);
        }
      }
    }
    frontier = next;
  }
  return -1;
}

const enemies = (g: Game, id: number) => g.players.filter((q, j) => q.alive && sideOf(g, j) !== sideOf(g, id));

// Is an orb at `at` worth dropping: would it hit a block or an opponent?
function worth(g: Game, id: number, at: number, range: number) {
  const foes = new Set(enemies(g, id).map((q) => tileAt(q.x, q.y)));
  for (const s of STEPS) {
    for (let k = 1, i = at + s; k <= range; k++, i += s) {
      if (g.grid[i] === BLOCK || foes.has(i)) return true;
      if (g.grid[i] !== FLOOR || g.items[i]) break;
    }
  }
  return false;
}

// A knocked-out bot rides the rim towards the nearest opponent's row or column and lobs an orb in.
function haunt(g: Game, id: number) {
  const p = g.players[id];
  const c = Math.floor(p.x / TILE);
  const r = Math.floor(p.y / TILE);
  const horiz = r === 0 || r === ROWS - 1; // on the top or bottom wall: run left/right
  const pos = horiz ? c : r;
  const lines = enemies(g, id).map((q) => (horiz ? Math.floor(q.x / TILE) : Math.floor(q.y / TILE)));
  if (!lines.length) return 0;
  const best = lines.sort((a, b) => Math.abs(a - pos) - Math.abs(b - pos))[0];
  if (best !== pos) return horiz ? (best < pos ? LEFT : RIGHT) : best < pos ? UP : DOWN;
  const canThrow = !(p.prev & BOMB) && ghostReady(g, p);
  return canThrow && Math.random() < GHOST_THROW_CHANCE ? BOMB : 0;
}

export function botInput(g: Game, id: number): number {
  const p = g.players[id];
  if (g.phase !== "play") return 0;
  if (!p.alive) return p.ghost ? haunt(g, id) : 0;
  const here = tileAt(p.x, p.y);
  const bombs = new Set(g.bombs.map((b) => tileAt(b.x, b.y)));
  const danger = dangerMap(g, bombs);
  const blocked = (i: number) => g.grid[i] !== FLOOR || g.fire[i] > 0 || bombs.has(i);
  const go = (to: number) => (to < 0 ? 0 : 1 << STEPS.indexOf(to - here));

  if (danger[here]) return go(firstStep(here, blocked, (i) => !danger[i]));

  const mine = g.bombs.filter((b) => b.owner === id);
  if (mine.some((b) => b.remote) && !(p.prev & ACT)) return ACT; // we're out of every blast, so fire away

  if (!(p.prev & BOMB) && mine.length < p.bombs && !bombs.has(here) && worth(g, id, here, p.range)) {
    const after = danger.slice();
    blast(g, here, p.range, bombs, after, p.pierce);
    if (firstStep(here, blocked, (i) => !after[i], ESCAPE_TILES) >= 0) return BOMB;
  }

  const unsafe = (i: number) => blocked(i) || danger[i] === 1;
  let to = firstStep(here, unsafe, (i) => g.items[i] > 0);
  // Out of orbs: wait. Seeking a target tile would pace between two of them, and every turn is a rollback online.
  if (to < 0 && mine.length < p.bombs) to = firstStep(here, unsafe, (i) => worth(g, id, i, p.range));
  if (to < 0 && Math.random() < 0.05) {
    const wander = here + STEPS[Math.floor(Math.random() * 4)]; // nothing to do: shuffle about
    if (!unsafe(wander)) to = wander;
  }
  return go(to);
}
