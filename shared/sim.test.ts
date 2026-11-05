import { test } from "node:test";
import assert from "node:assert/strict";
import { botInput } from "./bot.ts";
import {
  ACT, BLOCK, BOMB, COLS, CRUMBLE, DOWN, END_GRACE, FLAME, FLOOR, FUSE, OVER_TICKS, RIGHT, ROUND_TICKS, SHRINK_EVERY,
  SPAWNS, SPIRAL, WALL, center, createGame, tickGame, type Game,
} from "./sim.ts";

const idx = (c: number, r: number) => r * COLS + c;
const run = (g: Game, ticks: number, inputs: number[] = []) => {
  for (let i = 0; i < ticks; i++) tickGame(g, inputs);
};
const place = (g: Game, id: number, c: number, r: number) => Object.assign(g.players[id], { x: center(c), y: center(r) });

// No breakable blocks and the round already running, so each test controls the whole board.
function arena(players = 2) {
  const g = createGame(players, 1);
  g.grid = g.grid.map((t) => (t === BLOCK ? FLOOR : t));
  g.phase = "play";
  return g;
}

test("a new round has border walls, pillars, blocks and open spawn corners", () => {
  const g = createGame(4, 9);
  assert.equal(g.grid[idx(0, 0)], WALL);
  assert.equal(g.grid[idx(2, 2)], WALL);
  for (const [c, r] of SPAWNS) {
    for (const i of [idx(c, r), idx(c + 1, r), idx(c - 1, r), idx(c, r + 1), idx(c, r - 1)]) {
      assert.notEqual(g.grid[i], BLOCK);
    }
  }
  assert.ok(g.grid.filter((t) => t === BLOCK).length > 50);
});

test("same seed + same inputs replay identically, and a saved state resumes identically (rollback)", () => {
  const a = createGame(4, 42);
  const log: number[][] = [];
  for (let t = 0; t < 4000; t++) {
    const inputs = a.players.map((_, id) => botInput(a, id));
    log.push(inputs);
    tickGame(a, inputs);
  }
  const b = createGame(4, 42);
  let saved: Game | null = null;
  log.forEach((inputs, t) => {
    if (t === 2000) saved = structuredClone(b);
    tickGame(b, inputs);
  });
  assert.deepEqual(b, a);
  const resumed = saved!;
  for (const inputs of log.slice(2000)) tickGame(resumed, inputs);
  assert.deepEqual(resumed, a);
});

test("pillars block you; corner assist slips you into a nearby open lane", () => {
  const g = arena();
  place(g, 0, 2, 1); // pillar below at (2, 2)
  run(g, 10, [DOWN]);
  assert.equal(g.players[0].y, center(1));

  Object.assign(g.players[0], { x: center(2) - 80, y: center(1) }); // close to lane 1, which is open below
  run(g, 30, [DOWN]);
  assert.equal(g.players[0].x, center(1));
  assert.ok(g.players[0].y > center(1));

  Object.assign(g.players[0], { x: center(2) - 30, y: center(1) }); // too far from lane 1: no nudge
  run(g, 10, [DOWN]);
  assert.equal(g.players[0].y, center(1));
});

test("an orb explodes after its fuse: breaks blocks, knocks players out and chains into other orbs", () => {
  const g = arena();
  g.grid[idx(3, 1)] = BLOCK;
  place(g, 0, 1, 1);
  place(g, 1, 2, 1);
  tickGame(g, [BOMB]);
  assert.equal(g.bombs.length, 1);
  place(g, 0, 5, 5);
  g.bombs.push({ id: 99, owner: 1, x: center(1), y: center(3), fuse: 999, range: 1, remote: false, dx: 0, dy: 0 });

  run(g, FUSE - 2);
  assert.equal(g.bombs.length, 2);
  tickGame(g, []);
  assert.equal(g.bombs.length, 0, "both orbs went off in the same tick");
  assert.equal(g.grid[idx(3, 1)], CRUMBLE);
  assert.ok(g.fire[idx(1, 4)] > 0, "the chained orb blasted too");
  assert.equal(g.players[1].alive, false);
  assert.equal(g.players[0].alive, true);
  run(g, FLAME);
  assert.equal(g.grid[idx(3, 1)], FLOOR);
});

test("a shield soaks one blast", () => {
  const g = arena();
  place(g, 1, 2, 1);
  g.players[1].shield = true;
  g.bombs.push({ id: 1, owner: 0, x: center(1), y: center(1), fuse: 1, range: 2, remote: false, dx: 0, dy: 0 });
  tickGame(g, []);
  assert.equal(g.players[1].alive, true);
  assert.equal(g.players[1].shield, false);
  assert.ok(g.players[1].invuln > 0);
});

test("kick sends an orb sliding until something stops it", () => {
  const g = arena();
  place(g, 0, 1, 1);
  g.players[0].kick = true;
  g.bombs.push({ id: 1, owner: 1, x: center(2), y: center(1), fuse: 999, range: 1, remote: false, dx: 0, dy: 0 });
  run(g, 100, [RIGHT]);
  assert.equal(g.bombs[0].x, center(COLS - 2));
  assert.equal(g.bombs[0].dx, 0);
});

test("remote orbs wait for the detonate button", () => {
  const g = arena();
  place(g, 0, 1, 1);
  g.players[0].remote = true;
  tickGame(g, [BOMB]);
  place(g, 0, 7, 7);
  run(g, FUSE * 2);
  assert.equal(g.bombs.length, 1);
  tickGame(g, [ACT]);
  assert.equal(g.bombs.length, 0);
  assert.ok(g.fire[idx(1, 1)] > 0);
});

test("after time-out the arena shrinks and crushes whoever is caught", () => {
  const g = arena();
  assert.equal(SPIRAL[0], idx(1, 1));
  place(g, 0, 1, 1);
  place(g, 1, 7, 5);
  g.roundTick = ROUND_TICKS;
  run(g, SHRINK_EVERY);
  assert.equal(g.grid[idx(1, 1)], WALL);
  assert.equal(g.players[0].alive, false);
  run(g, END_GRACE);
  assert.equal(g.phase, "result");
  assert.equal(g.roundWinner, 1);
  assert.equal(g.players[1].wins, 1);
});

test("two round wins take the match, then a fresh match starts", () => {
  const g = arena();
  g.players[0].wins = 1;
  g.players[1].alive = false;
  run(g, END_GRACE + 1);
  assert.equal(g.phase, "over");
  assert.equal(g.matchWinner, 0);
  run(g, OVER_TICKS);
  assert.equal(g.phase, "ready");
  assert.equal(g.round, 1);
  assert.deepEqual(g.players.map((p) => p.wins), [0, 0]);
});

test("four bots finish a round on their own", () => {
  const g = createGame(4, 7);
  let t = 0;
  while (g.round === 1 && g.phase !== "over" && t++ < 20000) tickGame(g, g.players.map((_, id) => botInput(g, id)));
  assert.ok(g.round > 1 || g.phase === "over", `round still running after ${t} ticks`);
});
