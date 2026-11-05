import { test } from "node:test";
import assert from "node:assert/strict";
import { botInput } from "./bot.ts";
import {
  ACT, BLOCK, BOMB, BUTTERFINGERS, COLS, CRUMBLE, DOWN, END_GRACE, FLAME, FLOOR, FUSE, GHOST_DELAY, NAPALM_FLAME, OVER_TICKS,
  REVERSED, RIGHT, ROUND_TICKS, SHRINK_EVERY, SPAWNS, SPIRAL, SWAP, WALL, center, createGame, tickGame, tileAt, type Bomb, type Game,
  type Options,
} from "./sim.ts";

const idx = (c: number, r: number) => r * COLS + c;
const run = (g: Game, ticks: number, inputs: number[] = []) => {
  for (let i = 0; i < ticks; i++) tickGame(g, inputs);
};
const place = (g: Game, id: number, c: number, r: number) => Object.assign(g.players[id], { x: center(c), y: center(r) });
const orb = (owner: number, c: number, r: number, extra: Partial<Bomb> = {}): Bomb => ({
  id: 900 + owner, owner, x: center(c), y: center(r), fuse: 999, range: 1, remote: false, pierce: false, flame: FLAME,
  revenge: false, dx: 0, dy: 0, hops: 0, ...extra,
});
const MIXED: Partial<Options> = { map: -1, teams: [0, 1, 0, 1] }; // random map each round, 2v2

// No breakable blocks and the round already running, so each test controls the whole board.
function arena(players = 2, opts: Partial<Options> = {}) {
  const g = createGame(players, 1, opts);
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
  const a = createGame(4, 42, MIXED);
  const log: number[][] = [];
  for (let t = 0; t < 4000; t++) {
    const inputs = a.players.map((_, id) => botInput(a, id));
    log.push(inputs);
    tickGame(a, inputs);
  }
  const b = createGame(4, 42, MIXED);
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
  g.bombs.push(orb(1, 1, 3));

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
  g.bombs.push(orb(0, 1, 1, { fuse: 1, range: 2 }));
  tickGame(g, []);
  assert.equal(g.players[1].alive, true);
  assert.equal(g.players[1].shield, false);
  assert.ok(g.players[1].invuln > 0);
});

test("kick sends an orb sliding until something stops it", () => {
  const g = arena();
  place(g, 0, 1, 1);
  g.players[0].kick = true;
  g.bombs.push(orb(1, 2, 1));
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

test("revenge: a knocked-out player rides the rim and lobs orbs inward, one at a time", () => {
  const g = arena(3);
  place(g, 0, 1, 3); // nearest wall: the left one
  g.bombs.push(orb(2, 1, 3, { fuse: 1 }));
  tickGame(g, []);
  const p = g.players[0];
  assert.equal(p.alive, false);
  run(g, GHOST_DELAY);
  assert.ok(p.ghost);
  assert.deepEqual([p.x, p.y], [center(0), center(3)]);
  run(g, 20, [DOWN]);
  assert.equal(p.x, center(0), "stays on the wall");
  assert.ok(p.y > center(3));

  Object.assign(p, { x: center(0), y: center(5) });
  tickGame(g, [BOMB]);
  const thrown = g.bombs.filter((b) => b.owner === 0);
  assert.equal(thrown.length, 1);
  assert.equal(tileAt(thrown[0].x, thrown[0].y), idx(3, 5));
  tickGame(g, []);
  tickGame(g, [BOMB]);
  assert.equal(g.bombs.filter((b) => b.owner === 0).length, 1, "only one revenge orb at a time");
});

test("Pierce blasts carry on through bushes; Napalm fire burns longer", () => {
  for (const pierce of [false, true]) {
    const g = arena();
    place(g, 0, 7, 7);
    g.grid[idx(3, 1)] = g.grid[idx(4, 1)] = BLOCK;
    g.bombs.push(orb(0, 1, 1, { fuse: 1, range: 4, pierce }));
    tickGame(g, []);
    assert.equal(g.grid[idx(3, 1)], CRUMBLE);
    assert.equal(g.grid[idx(4, 1)], pierce ? CRUMBLE : BLOCK);
    assert.equal(g.fire[idx(5, 1)] > 0, pierce);
  }
  const g = arena();
  place(g, 0, 7, 7);
  g.bombs.push(orb(0, 1, 1, { fuse: 1, flame: NAPALM_FLAME }));
  run(g, FLAME + 10);
  assert.ok(g.fire[idx(1, 2)] > 0);
});

test("Skull curses: reversed controls, butterfingers, and the curse jumps to whoever you touch", () => {
  const g = arena();
  place(g, 0, 3, 3);
  place(g, 1, 7, 7);
  Object.assign(g.players[0], { curse: REVERSED, curseLeft: 999 });
  run(g, 10, [RIGHT]);
  assert.ok(g.players[0].x < center(3), "right walks left");

  place(g, 1, 3, 3); // walk into someone
  tickGame(g, []);
  assert.equal(g.players[1].curse, REVERSED);
  assert.equal(g.players[0].curse, 0);
  tickGame(g, []);
  assert.equal(g.players[0].curse, 0, "can't bounce straight back");

  Object.assign(g.players[0], { curse: BUTTERFINGERS, curseLeft: 999 });
  place(g, 0, 9, 9);
  tickGame(g, []);
  assert.equal(g.bombs.filter((b) => b.owner === 0).length, 1, "drops an orb without pressing anything");
});

test("maps: ice keeps you sliding, belts push you, portals swap you across", () => {
  const ice = arena(2, { map: 1 });
  place(ice, 0, 3, 3);
  run(ice, 3, [RIGHT]);
  run(ice, 60, []);
  assert.ok(ice.players[0].x > center(5), "still sliding with no keys held");

  const belts = arena(2, { map: 2 });
  place(belts, 0, 3, 5);
  run(belts, 30, []);
  assert.ok(belts.players[0].x > center(3) + 200);

  const portals = arena(2, { map: 3 });
  place(portals, 0, 2, 3);
  run(portals, 15, [RIGHT]);
  assert.equal(tileAt(portals.players[0].x, portals.players[0].y), idx(11, 9));
});

test("teams: the round ends when one team is left, and both teammates score", () => {
  const g = arena(4, { teams: [0, 1, 0, 1], winRounds: 3 });
  run(g, 5);
  assert.equal(g.endAt, -1);
  g.players[1].alive = g.players[3].alive = false;
  run(g, END_GRACE + 1);
  assert.equal(g.phase, "result");
  assert.deepEqual(g.players.map((p) => p.wins), [1, 0, 1, 0]);
});

test("revenge comeback: a ghost whose orb knocks someone out takes their place", () => {
  for (const revenge of [true, false]) {
    const g = arena(3);
    const ghost = Object.assign(g.players[0], { alive: false, ghost: true, diedAt: 0, x: center(0), y: center(5) });
    place(g, 1, 3, 5);
    place(g, 2, 9, 9);
    if (revenge) tickGame(g, [BOMB]); // lobbed in from the left wall: lands 3 tiles in, on player 2
    else g.bombs.push(orb(0, 3, 5, { fuse: 2 })); // an orb left over from before the knockout
    run(g, FUSE);
    assert.equal(g.players[1].alive, false);
    assert.equal(ghost.stats.kos, 1);
    assert.equal(ghost.alive, revenge, revenge ? "back in the game" : "leftover orbs don't count");
    if (!revenge) continue;
    assert.equal(tileAt(ghost.x, ghost.y), idx(3, 5), "in the knocked-out player's spot");
    assert.equal(ghost.stats.comebacks, 1);
    run(g, FLAME);
    assert.ok(ghost.alive, "brief invulnerability: their own fire doesn't get them");
  }
});

test("Glove throws an orb over walls; it bounces off taken tiles and wraps around the edge", () => {
  const throwFrom = (c: number, blocks: number[]) => {
    const g = arena();
    place(g, 0, c, 1);
    place(g, 1, 7, 9);
    Object.assign(g.players[0], { glove: true, dir: 3 }); // facing right
    for (const i of blocks) g.grid[i] = BLOCK;
    tickGame(g, [BOMB]);
    tickGame(g, [ACT]);
    assert.ok(g.bombs[0].hops > 0, "in the air");
    run(g, 40);
    const b = g.bombs[0];
    assert.equal(b.hops, 0, "landed");
    return tileAt(b.x, b.y);
  };
  assert.equal(throwFrom(1, [idx(2, 1), idx(3, 1)]), idx(4, 1), "over two bushes");
  assert.equal(throwFrom(1, [idx(4, 1)]), idx(5, 1), "bounced off a bush");
  assert.equal(throwFrom(13, []), idx(3, 1), "over the wall, back in on the far side");
});

test("Swap trades places with an opponent; stats count orbs, bushes and own goals", () => {
  const g = arena();
  place(g, 0, 1, 1);
  place(g, 1, 7, 7);
  g.items[idx(2, 1)] = SWAP;
  run(g, 15, [RIGHT]);
  assert.equal(tileAt(g.players[0].x, g.players[0].y), idx(7, 7));
  assert.equal(tileAt(g.players[1].x, g.players[1].y), idx(2, 1));
  assert.equal(g.players[0].stats.pickups, 1);

  const s = arena();
  place(s, 0, 1, 1);
  s.grid[idx(3, 1)] = BLOCK;
  tickGame(s, [BOMB]);
  run(s, FUSE);
  assert.deepEqual([s.players[0].stats.orbs, s.players[0].stats.bushes, s.players[0].stats.oops], [1, 1, 1]);
});

test("online matches hold on the final board instead of starting a new one", () => {
  const g = arena(2, { rematch: false, winRounds: 1 });
  g.players[1].alive = false;
  run(g, END_GRACE + 1 + OVER_TICKS * 2);
  assert.equal(g.phase, "over");
  assert.equal(g.matchWinner, 0);
});
