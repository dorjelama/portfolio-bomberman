// Game rules, shared by the browser and (from milestone 2) the server.
// Pure and deterministic: integer maths, a seeded RNG, a fixed update order and plain JSON state.
// That is what lets every client re-run the same ticks for rollback netcode later.

export const TICK_HZ = 60;
export const COLS = 15;
export const ROWS = 13;
export const TILE = 256; // sim units per tile (the screen draws 16 px per tile)
const HALF = TILE / 2;
const LEAN = TILE / 4; // corner assist: within this distance of the next lane you get nudged into it

export const FUSE = 150; // 2.5 s
export const FLAME = 30;
export const READY_TICKS = 2 * TICK_HZ;
export const ROUND_TICKS = 120 * TICK_HZ; // 2:00, then the arena starts shrinking
export const SHRINK_EVERY = 12; // ticks between falling walls
export const END_GRACE = TICK_HZ; // a trade a moment after the last-but-one dies still counts as a draw
export const RESULT_TICKS = 3 * TICK_HZ;
export const OVER_TICKS = 6 * TICK_HZ;
export const WIN_ROUNDS = 2; // best of 3
export const SPEEDS = [12, 15, 18, 21, 24]; // units per tick for each Speed+ level
export const KICK_SPEED = 32;
export const INVULN = 90; // after a shield breaks
export const MAX_BOMBS = 8;
export const MAX_RANGE = 8;
const BLOCK_CHANCE = 0.75;
const DROP_CHANCE = 0.35;

// Input bits. Directions are indexed 0..3 (up, down, left, right), so direction d is bit 1 << d.
export const UP = 1;
export const DOWN = 2;
export const LEFT = 4;
export const RIGHT = 8;
export const BOMB = 16;
export const ACT = 32; // detonate (Remote)
const DX = [0, 0, -1, 1];
const DY = [-1, 1, 0, 0];

export const FLOOR = 0;
export const WALL = 1;
export const BLOCK = 2;
export const CRUMBLE = 3; // a block that was hit: still solid until its flame dies down

export const ORB_UP = 1;
export const FIRE_UP = 2;
export const SPEED_UP = 3;
export const KICK = 4;
export const SHIELD = 5;
export const REMOTE = 6;
const ITEM_WEIGHTS = [0, 30, 30, 15, 10, 8, 7]; // by item id

export type Phase = "ready" | "play" | "result" | "over";

export interface Player {
  x: number;
  y: number;
  dir: number;
  want: number; // most recently pressed direction, tried first while several are held
  moving: boolean;
  alive: boolean;
  diedAt: number;
  bombs: number;
  range: number;
  speed: number;
  kick: boolean;
  remote: boolean;
  shield: boolean;
  invuln: number;
  prev: number; // last tick's input, for press edges
  wins: number;
}

export interface Bomb {
  id: number;
  owner: number;
  x: number;
  y: number;
  fuse: number;
  range: number;
  remote: boolean;
  dx: number; // sliding direction after a kick
  dy: number;
}

export interface Game {
  tick: number;
  seed: number;
  round: number;
  phase: Phase;
  phaseLeft: number;
  roundTick: number;
  endAt: number; // roundTick when the round is decided, -1 while it's open
  roundWinner: number; // -1 = draw
  matchWinner: number;
  grid: number[];
  items: number[];
  fire: number[];
  crumble: number[];
  bombs: Bomb[];
  nextBomb: number;
  shrink: number; // index into SPIRAL of the next wall to fall
  players: Player[];
}

// Spawn corners; players 1 and 2 start diagonally opposite.
export const SPAWNS = [
  [1, 1],
  [COLS - 2, ROWS - 2],
  [COLS - 2, 1],
  [1, ROWS - 2],
];

export const center = (c: number) => c * TILE + HALF;
export const tileAt = (x: number, y: number) => Math.floor(y / TILE) * COLS + Math.floor(x / TILE);
export const isPillar = (c: number, r: number) => c % 2 === 0 && r % 2 === 0;
export const bombAt = (g: Game, i: number) => g.bombs.find((b) => tileAt(b.x, b.y) === i);

// Order the walls fall in after time-out: clockwise from the top-left, outer ring first.
export const SPIRAL: number[] = (() => {
  const out: number[] = [];
  let [l, t, r, b] = [1, 1, COLS - 2, ROWS - 2];
  while (l <= r && t <= b) {
    for (let x = l; x <= r; x++) out.push(t * COLS + x);
    for (let y = t + 1; y <= b; y++) out.push(y * COLS + r);
    if (t < b) for (let x = r - 1; x >= l; x--) out.push(b * COLS + x);
    if (l < r) for (let y = b - 1; y > t; y--) out.push(y * COLS + l);
    [l, t, r, b] = [l + 1, t + 1, r - 1, b - 1];
  }
  return out.filter((i) => !isPillar(i % COLS, Math.floor(i / COLS)));
})();

// mulberry32, same as Critter Catch: seeded, so a match replays identically.
function rand(g: Game) {
  let t = (g.seed = (g.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function freshPlayer(id: number): Player {
  const [c, r] = SPAWNS[id];
  return {
    x: center(c),
    y: center(r),
    dir: 1,
    want: 1,
    moving: false,
    alive: true,
    diedAt: -1,
    bombs: 1,
    range: 2,
    speed: 0,
    kick: false,
    remote: false,
    shield: false,
    invuln: 0,
    prev: 0,
    wins: 0,
  };
}

export function createGame(players: number, seed: number): Game {
  if (!(players >= 1 && players <= SPAWNS.length)) throw new RangeError("1 to 4 players");
  const g: Game = {
    tick: 0,
    seed: seed | 0,
    round: 1,
    phase: "ready",
    phaseLeft: 0,
    roundTick: 0,
    endAt: -1,
    roundWinner: -1,
    matchWinner: -1,
    grid: [],
    items: [],
    fire: [],
    crumble: [],
    bombs: [],
    nextBomb: 1,
    shrink: 0,
    players: Array.from({ length: players }, (_, id) => freshPlayer(id)),
  };
  newRound(g);
  return g;
}

function newRound(g: Game) {
  const safe = new Set<number>();
  for (const [c, r] of SPAWNS) for (const [dc, dr] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) safe.add((r + dr) * COLS + c + dc);
  const n = COLS * ROWS;
  g.grid = Array.from({ length: n }, (_, i) => {
    const c = i % COLS;
    const r = Math.floor(i / COLS);
    if (c === 0 || r === 0 || c === COLS - 1 || r === ROWS - 1 || isPillar(c, r)) return WALL;
    return !safe.has(i) && rand(g) < BLOCK_CHANCE ? BLOCK : FLOOR;
  });
  g.items = Array(n).fill(0);
  g.fire = Array(n).fill(0);
  g.crumble = Array(n).fill(0);
  g.bombs = [];
  g.shrink = 0;
  g.roundTick = 0;
  g.endAt = -1;
  g.roundWinner = -1;
  g.phase = "ready";
  g.phaseLeft = READY_TICKS;
  g.players.forEach((p, id) => Object.assign(p, freshPlayer(id), { wins: p.wins }));
}

// One fixed step. inputs[i] is player i's input bits for this tick (missing = nothing held).
export function tickGame(g: Game, inputs: readonly number[]) {
  g.tick++;
  if (g.phase !== "play") {
    g.players.forEach((p, id) => (p.prev = inputs[id] ?? 0)); // a key held through "Ready" doesn't drop an orb at "Go"
    if (--g.phaseLeft > 0) return;
    if (g.phase === "ready") {
      g.phase = "play";
      return;
    }
    if (g.phase === "over") {
      g.players.forEach((p) => (p.wins = 0));
      g.round = 0;
      g.matchWinner = -1;
    }
    g.round++;
    newRound(g);
    return;
  }
  g.roundTick++;

  for (let i = 0; i < g.fire.length; i++) {
    if (g.fire[i]) g.fire[i]--;
    if (g.crumble[i] && --g.crumble[i] === 0) g.grid[i] = FLOOR;
  }

  // Rotate who acts first, so same-tick ties (two orbs on one tile) don't always favour player 1.
  const n = g.players.length;
  for (let k = 0; k < n; k++) {
    const id = (k + g.tick) % n;
    const p = g.players[id];
    const input = inputs[id] ?? 0;
    if (p.alive) control(g, id, p, input);
    p.prev = input;
  }

  slideKicked(g);
  for (const b of g.bombs) if (!b.remote) b.fuse--;
  explode(g, g.bombs.filter((b) => b.fuse <= 0 || g.fire[tileAt(b.x, b.y)] > 0));

  if (g.roundTick > ROUND_TICKS && (g.roundTick - ROUND_TICKS) % SHRINK_EVERY === 0 && g.shrink < SPIRAL.length) {
    const i = SPIRAL[g.shrink++];
    g.grid[i] = WALL;
    g.items[i] = g.fire[i] = g.crumble[i] = 0;
    g.bombs = g.bombs.filter((b) => tileAt(b.x, b.y) !== i);
  }

  g.players.forEach((p, id) => {
    if (!p.alive) return;
    if (p.invuln) p.invuln--;
    const i = tileAt(p.x, p.y);
    if (g.grid[i] === WALL) kill(g, id);
    else if (g.fire[i] && !p.invuln) {
      if (p.shield) [p.shield, p.invuln] = [false, INVULN];
      else kill(g, id);
    }
  });

  const alive = g.players.filter((p) => p.alive);
  if (g.endAt < 0 && alive.length <= 1) g.endAt = g.roundTick + END_GRACE;
  if (g.endAt >= 0 && g.roundTick >= g.endAt) {
    g.roundWinner = alive.length === 1 ? g.players.indexOf(alive[0]) : -1;
    const w = g.players[g.roundWinner];
    if (w && ++w.wins >= WIN_ROUNDS) {
      g.matchWinner = g.roundWinner;
      [g.phase, g.phaseLeft] = ["over", OVER_TICKS];
    } else [g.phase, g.phaseLeft] = ["result", RESULT_TICKS];
  }
}

function kill(g: Game, id: number) {
  const p = g.players[id];
  [p.alive, p.diedAt] = [false, g.tick];
  for (const b of g.bombs) if (b.owner === id && b.remote) [b.remote, b.fuse] = [false, FUSE]; // nobody left to press the button
}

function control(g: Game, id: number, p: Player, input: number) {
  const pressed = input & ~p.prev;
  const here = tileAt(p.x, p.y);
  if (pressed & BOMB && !bombAt(g, here) && g.bombs.filter((b) => b.owner === id).length < p.bombs) {
    const c = here % COLS;
    const r = Math.floor(here / COLS);
    g.bombs.push({ id: g.nextBomb++, owner: id, x: center(c), y: center(r), fuse: FUSE, range: p.range, remote: p.remote, dx: 0, dy: 0 });
  }
  if (pressed & ACT) {
    const oldest = g.bombs.find((b) => b.owner === id && b.remote);
    if (oldest) [oldest.remote, oldest.fuse] = [false, 0];
  }

  const held = [0, 1, 2, 3].filter((d) => input & (1 << d));
  const fresh = held.find((d) => !(p.prev & (1 << d)));
  if (fresh !== undefined) p.want = fresh;
  const order = held.includes(p.want) ? [p.want, ...held.filter((d) => d !== p.want)] : held;
  p.moving = false;
  for (const d of order) {
    if (move(g, p, d, SPEEDS[p.speed])) {
      [p.dir, p.moving] = [d, true];
      break;
    }
  }
  if (!p.moving && order.length) p.dir = order[0];

  const at = tileAt(p.x, p.y);
  if (g.items[at] && g.grid[at] === FLOOR) {
    pickUp(p, g.items[at]);
    g.items[at] = 0;
  }
}

function pickUp(p: Player, item: number) {
  if (item === ORB_UP) p.bombs = Math.min(p.bombs + 1, MAX_BOMBS);
  else if (item === FIRE_UP) p.range = Math.min(p.range + 1, MAX_RANGE);
  else if (item === SPEED_UP) p.speed = Math.min(p.speed + 1, SPEEDS.length - 1);
  else if (item === KICK) p.kick = true;
  else if (item === SHIELD) p.shield = true;
  else if (item === REMOTE) p.remote = true;
}

function open(g: Game, c: number, r: number) {
  return c >= 0 && r >= 0 && c < COLS && r < ROWS && g.grid[r * COLS + c] === FLOOR && !bombAt(g, r * COLS + c);
}

const bombCanEnter = (g: Game, c: number, r: number) =>
  open(g, c, r) && !g.players.some((p) => p.alive && tileAt(p.x, p.y) === r * COLS + c);

// Grid movement with corner assist. Returns whether the player moved.
// Your own orb never blocks you: only the tile *ahead* of the one you're centred on is checked.
function move(g: Game, p: Player, d: number, dist: number): boolean {
  const horiz = d >= 2;
  const c = Math.floor(p.x / TILE);
  const r = Math.floor(p.y / TILE);
  const off = horiz ? p.y - center(r) : p.x - center(c); // how far off the lane centre, across the move
  const along = horiz ? (p.x - center(c)) * DX[d] : (p.y - center(r)) * DY[d]; // > 0: already past the tile centre
  const ahead = open(g, c + DX[d], r + DY[d]);

  if (off !== 0) {
    const side = Math.sign(off);
    const [sc, sr] = horiz ? [c, r + side] : [c + side, r];
    let shift: number;
    if (ahead) shift = -side * Math.min(Math.abs(off), dist); // line up with this lane, then go
    else if (Math.abs(off) >= LEAN && open(g, sc, sr) && open(g, sc + DX[d], sr + DY[d])) shift = side * dist; // slip into the next lane
    else return false;
    if (horiz) p.y += shift;
    else p.x += shift;
    if (Math.abs(shift) < dist) move(g, p, d, dist - Math.abs(shift));
    return true;
  }

  let step = dist;
  if (!ahead) {
    if (p.kick && along >= -dist) kickAt(g, (r + DY[d]) * COLS + c + DX[d], d);
    if (along >= 0) return false;
    step = Math.min(dist, -along); // walk up to the tile centre and stop
  }
  if (horiz) p.x += DX[d] * step;
  else p.y += DY[d] * step;
  return true;
}

function kickAt(g: Game, i: number, d: number) {
  const b = bombAt(g, i);
  if (!b || b.dx || b.dy || !bombCanEnter(g, (i % COLS) + DX[d], Math.floor(i / COLS) + DY[d])) return;
  [b.dx, b.dy] = [DX[d], DY[d]];
}

function slideKicked(g: Game) {
  for (const b of g.bombs) {
    if (!b.dx && !b.dy) continue;
    const c = Math.floor(b.x / TILE);
    const r = Math.floor(b.y / TILE);
    const along = (b.x - center(c)) * b.dx + (b.y - center(r)) * b.dy;
    if (along + KICK_SPEED >= 0 && !bombCanEnter(g, c + b.dx, r + b.dy)) {
      [b.x, b.y, b.dx, b.dy] = [center(c), center(r), 0, 0];
    } else {
      b.x += b.dx * KICK_SPEED;
      b.y += b.dy * KICK_SPEED;
    }
  }
}

function rollItem(g: Game) {
  if (rand(g) >= DROP_CHANCE) return 0;
  let roll = rand(g) * ITEM_WEIGHTS.reduce((a, b) => a + b);
  return ITEM_WEIGHTS.findIndex((w) => (roll -= w) < 0);
}

// Blasts run all chain reactions in the same tick, so every client sees them land together.
function explode(g: Game, lit: Bomb[]) {
  const queue = [...lit];
  while (queue.length) {
    const b = queue.shift()!;
    const k = g.bombs.indexOf(b);
    if (k < 0) continue;
    g.bombs.splice(k, 1);
    const c = Math.floor(b.x / TILE);
    const r = Math.floor(b.y / TILE);
    g.fire[r * COLS + c] = FLAME;
    for (let d = 0; d < 4; d++) {
      for (let s = 1; s <= b.range; s++) {
        const i = (r + DY[d] * s) * COLS + c + DX[d] * s;
        const t = g.grid[i];
        if (t === WALL || t === CRUMBLE) break;
        if (t === BLOCK) {
          [g.grid[i], g.crumble[i], g.items[i]] = [CRUMBLE, FLAME, rollItem(g)];
          break;
        }
        g.fire[i] = FLAME;
        if (g.items[i]) {
          g.items[i] = 0;
          break;
        }
        const hit = bombAt(g, i);
        if (hit) {
          queue.push(hit);
          break;
        }
      }
    }
  }
}
