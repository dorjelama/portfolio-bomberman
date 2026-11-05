// Bot players. A bot only produces input bits, like a keyboard, so it needn't be deterministic:
// online, the server will run bots and send their inputs to everyone like any other player's.
import { ACT, BLOCK, BOMB, COLS, FLOOR, ROUND_TICKS, SPIRAL, TICK_HZ, tileAt, type Game } from "./sim.ts";

const STEPS = [-COLS, COLS, -1, 1]; // tile-index offsets for up, down, left, right (input bits 1, 2, 4, 8)
const ESCAPE_TILES = 5; // how far a bot will run from its own orb before the fuse ends

// Tiles an explosion from `from` would reach. Mirrors explode() in sim.ts.
function blast(g: Game, from: number, range: number, bombs: Set<number>, out: Uint8Array) {
  out[from] = 1;
  for (const s of STEPS) {
    for (let k = 1, i = from + s; k <= range && g.grid[i] === FLOOR; k++, i += s) {
      out[i] = 1;
      if (g.items[i] || bombs.has(i)) break;
    }
  }
}

function dangerMap(g: Game, bombs: Set<number>) {
  const d = new Uint8Array(g.grid.length);
  g.fire.forEach((f, i) => f && (d[i] = 1));
  for (const b of g.bombs) blast(g, tileAt(b.x, b.y), b.range, bombs, d);
  if (g.roundTick >= ROUND_TICKS - TICK_HZ) for (const i of SPIRAL.slice(g.shrink, g.shrink + 15)) d[i] = 1;
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

// Is an orb at `at` worth dropping: would it hit a block or an opponent?
function worth(g: Game, id: number, at: number, range: number) {
  for (const s of STEPS) {
    for (let k = 1, i = at + s; k <= range; k++, i += s) {
      if (g.grid[i] === BLOCK) return true;
      if (g.grid[i] !== FLOOR || g.items[i]) break;
      if (g.players.some((q, j) => j !== id && q.alive && tileAt(q.x, q.y) === i)) return true;
    }
  }
  return false;
}

export function botInput(g: Game, id: number): number {
  const p = g.players[id];
  if (g.phase !== "play" || !p.alive) return 0;
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
    blast(g, here, p.range, bombs, after);
    if (firstStep(here, blocked, (i) => !after[i], ESCAPE_TILES) >= 0) return BOMB;
  }

  const unsafe = (i: number) => blocked(i) || danger[i] === 1;
  let to = firstStep(here, unsafe, (i) => g.items[i] > 0);
  if (to < 0) to = firstStep(here, unsafe, (i) => worth(g, id, i, p.range));
  if (to < 0 && Math.random() < 0.05) {
    const wander = here + STEPS[Math.floor(Math.random() * 4)]; // nothing to do: shuffle about
    if (!unsafe(wander)) to = wander;
  }
  return go(to);
}
