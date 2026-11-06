// Game rules, shared by the browser and the server.
// Pure and deterministic: integer maths, a seeded RNG, a fixed update order and plain JSON state.
// That is what lets every client re-run the same ticks for rollback netcode.

export const TICK_HZ = 60;
export const COLS = 15;
export const ROWS = 13;
export const TILE = 256; // sim units per tile (the screen draws 16 px per tile)
const HALF = TILE / 2;
const LEAN = TILE / 4; // corner assist: within this distance of the next lane you get nudged into it

export const FUSE = 150; // 2.5 s
export const FLAME = 30;
export const NAPALM_FLAME = 2 * TICK_HZ;
export const READY_TICKS = 2 * TICK_HZ;
export const ROUND_TICKS = 120 * TICK_HZ; // 2:00, then the arena starts shrinking
export const SHRINK_EVERY = 30; // ticks between falling walls: a tick-tock, twice a second
export const RESULT_TICKS = 3 * TICK_HZ;
export const OVER_TICKS = 6 * TICK_HZ;
export const WIN_ROUNDS = 2; // default: best of 3
export const SPEEDS = [12, 15, 18, 21, 24]; // units per tick for each Speed+ level
const SLUGGISH_SPEED = 7;
const BELT_SPEED = 8;
export const KICK_SPEED = 32;
export const INVULN = 90; // after a shield breaks
export const GHOST_DELAY = TICK_HZ; // after a knockout, before you're back on the rim
export const GHOST_RELOAD = 5 * TICK_HZ; // a ghost's wait between throws, and from the knockout to the first one
export const CURSE_TICKS = 10 * TICK_HZ;
const IMMUNE_TICKS = TICK_HZ; // after passing a curse on, so it can't bounce straight back
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
export const DX = [0, 0, -1, 1];
export const DY = [-1, 1, 0, 0];

export const FLOOR = 0;
export const WALL = 1;
export const BLOCK = 2;
export const CRUMBLE = 3; // a block that was hit: still solid until its flame dies down

// What's painted on the ground, per map.
export const GRASS = 0;
export const ICE = 1;
export const BELT = 2; // BELT + d is a conveyor moving in direction d (2..5)
export const PORTAL = 6;
export const MAPS = ["Meadow", "Ice Rink", "Factory", "Portal Garden"];
const PORTAL_PAIRS = [
  [3 * COLS + 3, 9 * COLS + 11],
  [3 * COLS + 11, 9 * COLS + 3],
];
const PARTNER = new Map(PORTAL_PAIRS.flatMap(([a, b]) => [[a, b], [b, a]]));

export const ORB_UP = 1;
export const FIRE_UP = 2;
export const SPEED_UP = 3;
export const KICK = 4;
export const SHIELD = 5;
export const REMOTE = 6;
export const PIERCE = 7;
export const NAPALM = 8;
export const SKULL = 9;
export const GLOVE = 10;
export const SWAP = 11;
const ITEM_WEIGHTS = [0, 30, 30, 15, 10, 8, 7, 7, 6, 10, 6, 4]; // by item id
export const ALL_ITEMS = ITEM_WEIGHTS.reduce((mask, _, id) => (id ? mask | (1 << id) : mask), 0);
export const ROUND_CHOICES = [60, 90, 120, 180, 300]; // seconds
export const THROW_HOPS = 3; // a throw (glove, or a ghost from the rim) lands this many tiles away, further if that tile is taken
export const HELD = -1; // a bomb's hops while someone carries it overhead
const FLY_SPEED = TILE / 8; // units per tick in the air: one tile every 8 ticks

export const REVERSED = 1;
export const SLUGGISH = 2;
export const BUTTERFINGERS = 3; // drops orbs on its own
export const FIZZLE = 4; // blasts reach one tile
export const CURSES = ["", "Reversed", "Sluggish", "Butterfingers", "Fizzle"];

export type Phase = "ready" | "play" | "result" | "over";

export interface Options {
  map: number; // index into MAPS, or -1 for a random map each round
  winRounds: number;
  teams: number[] | null; // team per player, or null for free-for-all
  rematch: boolean; // start a new match by itself after "over" (offline); online the server goes back to the lobby
  roundSecs: number; // round time before sudden death
  shrink: boolean; // sudden death: walls close in at time-out; otherwise time-out is a draw
  revenge: boolean; // knocked-out players come back as ghosts on the rim
  items: number; // which power-ups can drop: bit (1 << item id)
}

// One knockout, for the match summary. by = who lit the fire (-1 for the walls); back = their ghost came back in.
export interface Knockout {
  round: number;
  victim: number;
  by: number;
  how: "orb" | "ghost" | "self" | "team" | "wall";
  back: boolean;
}

// Counted over a whole match, for the end-of-match awards.
export interface Stats {
  kos: number; // opponents knocked out
  oops: number; // knocked out by your own orb
  bushes: number;
  pickups: number;
  curses: number; // curses passed on
  comebacks: number;
  orbs: number; // dropped or thrown
}
export const freshStats = (): Stats => ({ kos: 0, oops: 0, bushes: 0, pickups: 0, curses: 0, comebacks: 0, orbs: 0 });

export interface Player {
  x: number;
  y: number;
  dir: number;
  want: number; // most recently pressed direction, tried first while several are held
  moving: boolean;
  alive: boolean;
  diedAt: number;
  ghost: boolean; // knocked out and riding the rim
  bombs: number;
  range: number;
  speed: number;
  kick: boolean;
  remote: boolean;
  shield: boolean;
  pierce: boolean;
  napalm: boolean;
  glove: boolean;
  carry: number; // id of the orb held overhead, 0 = none
  threwAt: number; // tick of the last throw, for the throwing pose
  invuln: number;
  curse: number;
  curseLeft: number;
  immune: number;
  prev: number; // last tick's input, for press edges
  wins: number;
  stats: Stats;
}

export interface Bomb {
  id: number;
  owner: number;
  x: number;
  y: number;
  fuse: number;
  range: number;
  remote: boolean;
  pierce: boolean;
  flame: number; // how long its fire burns
  revenge: boolean; // lobbed in by a ghost: knocking someone out with it brings the ghost back
  dx: number; // sliding (kicked) or flying (thrown) direction
  dy: number;
  hops: number; // tiles left in the air after a throw; 0 = on the ground, HELD = carried
}

export interface Game {
  tick: number;
  seed: number;
  opts: Options;
  map: number; // this round's map
  round: number;
  phase: Phase;
  phaseLeft: number;
  roundTick: number;
  roundWinner: number; // a player on the winning side, -1 = draw
  matchWinner: number;
  grid: number[];
  floor: number[];
  items: number[];
  fire: number[];
  fireBy: number[]; // who lit each burning tile, for knockout credit
  fireRevenge: number[]; // 1 where that fire came from a ghost's orb
  crumble: number[];
  bombs: Bomb[];
  nextBomb: number;
  shrink: number; // index into SPIRAL of the next wall to fall
  log: Knockout[]; // every knockout this match, in order, for the summary
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
export const onRim = (c: number, r: number) => c === 0 || r === 0 || c === COLS - 1 || r === ROWS - 1;
export const bombAt = (g: Game, i: number) => g.bombs.find((b) => !b.hops && tileAt(b.x, b.y) === i); // orbs in the air don't count
export const sideOf = (g: Game, id: number) => (g.opts.teams ? g.opts.teams[id] : id);
export const roundTicks = (g: Game) => g.opts.roundSecs * TICK_HZ;
export const ghostReady = (g: Game, p: Player) => g.tick - Math.max(p.threwAt, p.diedAt) >= GHOST_RELOAD;

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
    ghost: false,
    bombs: 1,
    range: 2,
    speed: 0,
    kick: false,
    remote: false,
    shield: false,
    pierce: false,
    napalm: false,
    glove: false,
    carry: 0,
    threwAt: -TICK_HZ,
    invuln: 0,
    curse: 0,
    curseLeft: 0,
    immune: 0,
    prev: 0,
    wins: 0,
    stats: freshStats(),
  };
}

export function createGame(players: number, seed: number, opts: Partial<Options> = {}): Game {
  if (!(players >= 1 && players <= SPAWNS.length)) throw new RangeError("1 to 4 players");
  const g: Game = {
    tick: 0,
    seed: seed | 0,
    opts: {
      map: 0, winRounds: WIN_ROUNDS, teams: null, rematch: true,
      roundSecs: ROUND_TICKS / TICK_HZ, shrink: true, revenge: true, items: ALL_ITEMS,
      ...opts,
    },
    map: 0,
    round: 1,
    phase: "ready",
    phaseLeft: 0,
    roundTick: 0,
    roundWinner: -1,
    matchWinner: -1,
    grid: [],
    floor: [],
    items: [],
    fire: [],
    fireBy: [],
    fireRevenge: [],
    crumble: [],
    bombs: [],
    nextBomb: 1,
    shrink: 0,
    log: [],
    players: Array.from({ length: players }, (_, id) => freshPlayer(id)),
  };
  newRound(g);
  return g;
}

function floorFor(map: number, c: number, r: number) {
  if (map === 1) return c >= 3 && c <= COLS - 4 && r >= 3 && r <= ROWS - 4 ? ICE : GRASS; // a rink in the middle
  if (map === 2) return r === 5 ? BELT + 3 : r === ROWS - 6 ? BELT + 2 : GRASS; // two belts, running opposite ways
  if (map === 3) return PARTNER.has(r * COLS + c) ? PORTAL : GRASS;
  return GRASS;
}

function newRound(g: Game) {
  g.map = g.opts.map >= 0 ? g.opts.map : Math.floor(rand(g) * MAPS.length);
  const safe = new Set<number>(PARTNER.keys()); // portals start uncovered
  for (const [c, r] of SPAWNS) for (const [dc, dr] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) safe.add((r + dr) * COLS + c + dc);
  const n = COLS * ROWS;
  g.floor = Array.from({ length: n }, (_, i) => floorFor(g.map, i % COLS, Math.floor(i / COLS)));
  g.grid = Array.from({ length: n }, (_, i) => {
    const c = i % COLS;
    const r = Math.floor(i / COLS);
    if (onRim(c, r) || isPillar(c, r)) return WALL;
    return !safe.has(i) && rand(g) < BLOCK_CHANCE ? BLOCK : FLOOR;
  });
  g.items = Array(n).fill(0);
  g.fire = Array(n).fill(0);
  g.fireBy = Array(n).fill(-1);
  g.fireRevenge = Array(n).fill(0);
  g.crumble = Array(n).fill(0);
  g.bombs = [];
  g.shrink = 0;
  g.roundTick = 0;
  g.roundWinner = -1;
  g.phase = "ready";
  g.phaseLeft = READY_TICKS;
  g.players.forEach((p, id) => Object.assign(p, freshPlayer(id), { wins: p.wins, stats: p.stats }));
}

// One fixed step. inputs[i] is player i's input bits for this tick (missing = nothing held).
export function tickGame(g: Game, inputs: readonly number[]) {
  g.tick++;
  if (g.phase !== "play") {
    g.players.forEach((p, id) => (p.prev = inputs[id] ?? 0)); // a key held through "Ready" doesn't drop an orb at "Go"
    if (--g.phaseLeft > 0) return;
    if (g.phase === "over" && !g.opts.rematch) {
      g.phaseLeft = 1; // hold on the final board
      return;
    }
    if (g.phase === "ready") {
      g.phase = "play";
      return;
    }
    if (g.phase === "over") {
      for (const p of g.players) {
        p.wins = 0;
        p.stats = freshStats();
      }
      g.round = 0;
      g.matchWinner = -1;
      g.log = [];
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
    else if (p.ghost) haunt(g, id, p, input);
    else if (g.opts.revenge && g.tick - p.diedAt >= GHOST_DELAY) toRim(p);
    p.prev = input;
  }
  passCurses(g);

  slideKicked(g);
  flyThrown(g);
  for (const b of g.bombs) if (!b.remote && b.hops !== HELD) b.fuse--; // a carried orb waits
  g.bombs = g.bombs.filter((b) => !(b.hops && b.fuse < -2 * TICK_HZ)); // can't land anywhere (the arena filled in): fizzle out
  explode(g, g.bombs.filter((b) => !b.hops && (b.fuse <= 0 || g.fire[tileAt(b.x, b.y)] > 0)));

  const limit = roundTicks(g);
  if (g.opts.shrink && g.roundTick > limit && (g.roundTick - limit) % SHRINK_EVERY === 0 && g.shrink < SPIRAL.length) {
    const i = SPIRAL[g.shrink++];
    g.grid[i] = WALL;
    g.items[i] = g.fire[i] = g.crumble[i] = 0;
    g.bombs = g.bombs.filter((b) => b.hops || tileAt(b.x, b.y) !== i);
  }

  g.players.forEach((p, id) => {
    if (!p.alive) return;
    if (p.invuln) p.invuln--;
    const i = tileAt(p.x, p.y);
    if (g.grid[i] === WALL) {
      kill(g, id);
      g.log.push({ round: g.round, victim: id, by: -1, how: "wall", back: false });
    }
    else if (g.fire[i] && !p.invuln) {
      if (p.shield) [p.shield, p.invuln] = [false, INVULN];
      else knockedOut(g, id, i);
    }
  });

  // The round ends the moment one side (a player, or a team) is left standing, and play freezes, so a falling wall
  // or a stray blast can't take a clear win away. Only knockouts in the very same tick make a draw.
  const sides = new Set(g.players.flatMap((p, id) => (p.alive ? [sideOf(g, id)] : [])));
  const timeUp = !g.opts.shrink && g.roundTick >= limit; // no sudden death: time's up, it's a draw
  if (sides.size > 1 && !timeUp) return;
  g.roundWinner = sides.size === 1 ? g.players.findIndex((p) => p.alive) : -1;
  if (g.roundWinner >= 0) {
    const side = sideOf(g, g.roundWinner);
    g.players.forEach((p, id) => sideOf(g, id) === side && p.wins++);
  }
  if (g.roundWinner >= 0 && g.players[g.roundWinner].wins >= g.opts.winRounds) {
    g.matchWinner = g.roundWinner;
    [g.phase, g.phaseLeft] = ["over", OVER_TICKS];
  } else [g.phase, g.phaseLeft] = ["result", RESULT_TICKS];
}

// Caught in fire on tile i: credit whoever lit it, and a ghost whose orb did it comes back in their place.
function knockedOut(g: Game, id: number, i: number) {
  kill(g, id);
  const by = g.fireBy[i];
  const team = by >= 0 && by !== id && sideOf(g, by) === sideOf(g, id);
  const entry: Knockout = { round: g.round, victim: id, by, how: by === id ? "self" : team ? "team" : g.fireRevenge[i] ? "ghost" : "orb", back: false };
  g.log.push(entry);
  if (by === id) g.players[id].stats.oops++;
  if (by < 0 || by === id || team) return;
  const killer = g.players[by];
  killer.stats.kos++;
  if (!g.fireRevenge[i] || !killer.ghost) return;
  const { wins, stats, prev } = killer;
  Object.assign(killer, freshPlayer(by), { x: center(i % COLS), y: center(Math.floor(i / COLS)), invuln: INVULN, wins, stats, prev });
  stats.comebacks++;
  entry.back = true;
}

function kill(g: Game, id: number) {
  const p = g.players[id];
  [p.alive, p.diedAt, p.curse, p.curseLeft] = [false, g.tick, 0, 0];
  for (const b of g.bombs) if (b.owner === id && b.remote) [b.remote, b.fuse] = [false, FUSE]; // nobody left to press the button
  const held = g.bombs.find((b) => b.id === p.carry);
  const t = tileAt(p.x, p.y);
  if (held && g.grid[t] === WALL) g.bombs.splice(g.bombs.indexOf(held), 1); // crushed along with them
  else if (held) Object.assign(held, { x: center(t % COLS), y: center(Math.floor(t / COLS)), hops: 0 }); // dropped where they fell
  p.carry = 0;
}

// Revenge mode: after a knockout you reappear on the nearest stretch of the outer wall.
function toRim(p: Player) {
  const c = Math.floor(p.x / TILE);
  const r = Math.floor(p.y / TILE);
  const gaps = [r, ROWS - 1 - r, c, COLS - 1 - c];
  const side = gaps.indexOf(Math.min(...gaps));
  const [rc, rr] = [
    [c, 0],
    [c, ROWS - 1],
    [0, r],
    [COLS - 1, r],
  ][side];
  [p.x, p.y, p.ghost, p.moving] = [center(rc), center(rr), true, false];
}

function haunt(g: Game, id: number, p: Player, input: number) {
  const c = Math.floor(p.x / TILE);
  const r = Math.floor(p.y / TILE);
  const corner = (c === 0 || c === COLS - 1) && (r === 0 || r === ROWS - 1);
  if (input & ~p.prev & BOMB && !corner && ghostReady(g, p)) {
    const d = r === 0 ? 1 : r === ROWS - 1 ? 0 : c === 0 ? 3 : 2; // inward
    g.bombs.push({
      id: g.nextBomb++, owner: id, x: center(c), y: center(r), fuse: FUSE, range: 2,
      remote: false, pierce: false, flame: FLAME, revenge: true, dx: DX[d], dy: DY[d], hops: THROW_HOPS,
    });
    [p.dir, p.threwAt] = [d, g.tick]; // turn to face the arena as you throw
    p.stats.orbs++;
  }
  steer(g, p, input, SPEEDS[0], true);
}

const flip = (v: number) => (v & ~15) | ((v & UP) << 1) | ((v & DOWN) >> 1) | ((v & LEFT) << 1) | ((v & RIGHT) >> 1);

function control(g: Game, id: number, p: Player, raw: number) {
  if (p.curseLeft && --p.curseLeft === 0) p.curse = 0;
  if (p.immune) p.immune--;
  const input = p.curse === REVERSED ? flip(raw) : raw;
  const pressed = raw & ~p.prev;
  const before = tileAt(p.x, p.y);

  if ((pressed & BOMB || p.curse === BUTTERFINGERS) && !bombAt(g, before) && g.bombs.filter((b) => b.owner === id).length < p.bombs) {
    const c = before % COLS;
    const r = Math.floor(before / COLS);
    g.bombs.push({
      id: g.nextBomb++,
      owner: id,
      x: center(c),
      y: center(r),
      fuse: FUSE,
      range: p.curse === FIZZLE ? 1 : p.range,
      remote: p.remote,
      pierce: p.pierce,
      flame: p.napalm ? NAPALM_FLAME : FLAME,
      revenge: false,
      dx: 0,
      dy: 0,
      hops: 0,
    });
    p.stats.orbs++;
  }
  if (pressed & ACT) {
    // Glove: pick up the orb you're on or facing. Otherwise the button detonates (Remote).
    const ahead = before + [-COLS, COLS, -1, 1][p.dir];
    const grab = p.glove && !p.carry ? [before, ahead].map((i) => bombAt(g, i)).find((b) => b && !b.dx && !b.dy) : undefined;
    if (grab) [grab.hops, p.carry] = [HELD, grab.id];
    else {
      const oldest = g.bombs.find((b) => b.owner === id && b.remote);
      if (oldest) [oldest.remote, oldest.fuse] = [false, 0];
    }
  }

  const speed = p.curse === SLUGGISH ? SLUGGISH_SPEED : SPEEDS[p.speed];
  if (g.floor[before] === ICE && p.moving) p.moving = move(g, p, p.dir, speed); // sliding: no steering until you hit something
  else steer(g, p, input, speed, false);

  const belt = g.floor[tileAt(p.x, p.y)];
  if (belt >= BELT && belt < BELT + 4) move(g, p, belt - BELT, BELT_SPEED);

  const at = tileAt(p.x, p.y);
  if (at !== before && g.floor[at] === PORTAL) {
    const to = PARTNER.get(at)!;
    if (g.grid[to] === FLOOR && !bombAt(g, to)) [p.x, p.y] = [center(to % COLS), center(Math.floor(to / COLS))];
  }
  const here = tileAt(p.x, p.y);
  if (g.items[here] && g.grid[here] === FLOOR) {
    const item = g.items[here];
    g.items[here] = 0;
    p.stats.pickups++;
    pickUp(g, id, p, item);
  }

  // The carried orb rides along while the button is held; let go and it flies off the way you face.
  const held = g.bombs.find((b) => b.id === p.carry);
  if (held && raw & ACT) [held.x, held.y] = [p.x, p.y];
  else if (held) {
    const t = tileAt(p.x, p.y);
    Object.assign(held, { x: center(t % COLS), y: center(Math.floor(t / COLS)), dx: DX[p.dir], dy: DY[p.dir], hops: THROW_HOPS });
    [p.carry, p.threwAt] = [0, g.tick];
  }
}

// Pick a direction from the held keys (newest press first) and walk; on the rim when `rim`.
function steer(g: Game, p: Player, input: number, speed: number, rim: boolean) {
  const prev = p.curse === REVERSED ? flip(p.prev) : p.prev;
  const held = [0, 1, 2, 3].filter((d) => input & (1 << d));
  const fresh = held.find((d) => !(prev & (1 << d)));
  if (fresh !== undefined) p.want = fresh;
  const order = held.includes(p.want) ? [p.want, ...held.filter((d) => d !== p.want)] : held;
  p.moving = false;
  for (const d of order) {
    if (move(g, p, d, speed, rim)) {
      [p.dir, p.moving] = [d, true];
      return;
    }
  }
  if (order.length) p.dir = order[0];
}

// Whoever carries a curse hands it to the first player they touch.
function passCurses(g: Game) {
  for (const a of g.players) {
    if (!a.alive || !a.curse) continue;
    const t = tileAt(a.x, a.y);
    const b = g.players.find((q) => q !== a && q.alive && !q.curse && !q.immune && tileAt(q.x, q.y) === t);
    if (!b) continue;
    [b.curse, b.curseLeft] = [a.curse, a.curseLeft];
    [a.curse, a.curseLeft, a.immune] = [0, 0, IMMUNE_TICKS];
    a.stats.curses++;
  }
}

function pickUp(g: Game, id: number, p: Player, item: number) {
  if (item === ORB_UP) p.bombs = Math.min(p.bombs + 1, MAX_BOMBS);
  else if (item === FIRE_UP) p.range = Math.min(p.range + 1, MAX_RANGE);
  else if (item === SPEED_UP) p.speed = Math.min(p.speed + 1, SPEEDS.length - 1);
  else if (item === KICK) p.kick = true;
  else if (item === SHIELD) p.shield = true;
  else if (item === REMOTE) p.remote = true;
  else if (item === PIERCE) p.pierce = true;
  else if (item === NAPALM) p.napalm = true;
  else if (item === SKULL) [p.curse, p.curseLeft] = [1 + Math.floor(rand(g) * (CURSES.length - 1)), CURSE_TICKS];
  else if (item === GLOVE) p.glove = true;
  else if (item === SWAP) {
    // Trade places with a random opponent, right now.
    const foes = g.players.filter((q, j) => q.alive && sideOf(g, j) !== sideOf(g, id));
    const q = foes[Math.floor(rand(g) * foes.length)];
    if (q) [p.x, p.y, q.x, q.y] = [q.x, q.y, p.x, p.y];
  }
}

function open(g: Game, c: number, r: number) {
  return c >= 0 && r >= 0 && c < COLS && r < ROWS && g.grid[r * COLS + c] === FLOOR && !bombAt(g, r * COLS + c);
}
const rimOpen = (_g: Game, c: number, r: number) => c >= 0 && r >= 0 && c < COLS && r < ROWS && onRim(c, r);

const bombCanEnter = (g: Game, c: number, r: number) =>
  open(g, c, r) && !g.players.some((p) => p.alive && tileAt(p.x, p.y) === r * COLS + c);

// Grid movement with corner assist. Returns whether the player moved.
// Your own orb never blocks you: only the tile *ahead* of the one you're centred on is checked.
// Ghosts (`rim`) move the same way, but only along the outer wall.
function move(g: Game, p: Player, d: number, dist: number, rim = false): boolean {
  const can = rim ? rimOpen : open;
  const horiz = d >= 2;
  const c = Math.floor(p.x / TILE);
  const r = Math.floor(p.y / TILE);
  const off = horiz ? p.y - center(r) : p.x - center(c); // how far off the lane centre, across the move
  const along = horiz ? (p.x - center(c)) * DX[d] : (p.y - center(r)) * DY[d]; // > 0: already past the tile centre
  const ahead = can(g, c + DX[d], r + DY[d]);

  if (off !== 0) {
    const side = Math.sign(off);
    const [sc, sr] = horiz ? [c, r + side] : [c + side, r];
    let shift: number;
    if (ahead) shift = -side * Math.min(Math.abs(off), dist); // line up with this lane, then go
    else if (Math.abs(off) >= LEAN && can(g, sc, sr) && can(g, sc + DX[d], sr + DY[d])) shift = side * dist; // slip into the next lane
    else return false;
    if (horiz) p.y += shift;
    else p.x += shift;
    if (Math.abs(shift) < dist) move(g, p, d, dist - Math.abs(shift), rim);
    return true;
  }

  let step = dist;
  if (!ahead) {
    if (!rim && p.kick && along >= -dist) kickAt(g, (r + DY[d]) * COLS + c + DX[d], d);
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

// Thrown orbs fly a tile every 8 ticks over everything. Off the edge they come down on the far side;
// if the landing tile is taken they bounce on a tile at a time.
function flyThrown(g: Game) {
  for (const b of g.bombs) {
    if (b.hops <= 0) continue;
    b.x += b.dx * FLY_SPEED;
    b.y += b.dy * FLY_SPEED;
    if ((b.x - HALF) % TILE || (b.y - HALF) % TILE) continue; // between tiles
    let c = Math.floor(b.x / TILE);
    let r = Math.floor(b.y / TILE);
    if (c === 0) c = COLS - 2;
    else if (c === COLS - 1) c = 1;
    if (r === 0) r = ROWS - 2;
    else if (r === ROWS - 1) r = 1;
    [b.x, b.y] = [center(c), center(r)];
    if (--b.hops > 0) continue;
    const i = r * COLS + c;
    const taken = g.bombs.some((o) => o !== b && !o.hops && tileAt(o.x, o.y) === i);
    if (g.grid[i] === FLOOR && !taken) [b.dx, b.dy] = [0, 0];
    else b.hops = 1;
  }
}

function slideKicked(g: Game) {
  for (const b of g.bombs) {
    if (b.hops || (!b.dx && !b.dy)) continue;
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
  const weights = ITEM_WEIGHTS.map((w, id) => (g.opts.items & (1 << id) ? w : 0)); // switched-off power-ups never drop
  const total = weights.reduce((a, b) => a + b);
  let roll = rand(g) * total;
  return total ? weights.findIndex((w) => (roll -= w) < 0) : 0;
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
    const burn = (i: number) => {
      g.fire[i] = Math.max(g.fire[i], b.flame);
      [g.fireBy[i], g.fireRevenge[i]] = [b.owner, b.revenge ? 1 : 0];
    };
    burn(r * COLS + c);
    for (let d = 0; d < 4; d++) {
      for (let s = 1; s <= b.range; s++) {
        const i = (r + DY[d] * s) * COLS + c + DX[d] * s;
        const t = g.grid[i];
        if (t === WALL) break;
        if (t === CRUMBLE) {
          if (b.pierce) continue;
          break;
        }
        if (t === BLOCK) {
          [g.grid[i], g.crumble[i], g.items[i]] = [CRUMBLE, FLAME, rollItem(g)];
          g.players[b.owner].stats.bushes++;
          if (b.pierce) continue; // Pierce: the blast carries on through
          break;
        }
        burn(i);
        const hadItem = g.items[i] > 0;
        g.items[i] = 0;
        const hit = bombAt(g, i);
        if (hit) queue.push(hit);
        if ((hadItem || hit) && !b.pierce) break;
      }
    }
  }
}
