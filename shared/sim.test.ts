import { test } from "node:test";
import assert from "node:assert/strict";
import { botInput } from "./bot.ts";
import {
  ACT, ALL_ITEMS, BELT, BLOCK, BOMB, DEFAULT_WEIGHTS, BUMPERCROP, BUTTERFINGERS, CHEAT_SHIFT, COLDSNAP, COLS, CROP, CRUMBLE, DARK_TICKS, DOWN, FIRST_POTATO_TICKS, POTATO_TICKS, ROWS, FLAME, FLOOR, FROST_TICKS, FUSE, GHOST_DELAY, GHOST_RELOAD, GRASS, GUST,
  HARVEST, HOLY_TICKS, HOLYCOW, ICE, LANES, LEFT, LIGHTSOUT, MAX_BOMBS, MAX_RANGE, NAPALM_FLAME, POPCORN, RAINDANCE, OVER_TICKS, POTATO, READY_TICKS, RESPAWN_TICKS, RESULT_TICKS, REVERSED, RIGHT, ROBBED, ROUND_TICKS, SKULL,
  SHRINK_EVERY, SNAP_TICKS, SPAWNS, SPEEDS, SPIRAL, SWAP, TOPSYTURVY, cheatBlock, TICK_HZ, TRACTOR, WALL, center, createGame, roundTicks, tickGame, tileAt, tractor, type Bomb,
  type Game,
  type Options,
} from "./sim.ts";

const idx = (c: number, r: number) => r * COLS + c;
const run = (g: Game, ticks: number, inputs: number[] = []) => {
  for (let i = 0; i < ticks; i++) tickGame(g, inputs);
};
const place = (g: Game, id: number, c: number, r: number) => Object.assign(g.players[id], { x: center(c), y: center(r) });
const orb = (owner: number, c: number, r: number, extra: Partial<Bomb> = {}): Bomb => ({
  id: 900 + owner, owner, x: center(c), y: center(r), fuse: 999, range: 1, remote: false, frost: false, flame: FLAME,
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

test("same seed + same inputs replay identically, and a saved state resumes identically (rollback), in every mode", () => {
  for (const mode of [0, HARVEST, POTATO]) replays({ ...MIXED, mode });
});

function replays(opts: Partial<Options>) {
  const a = createGame(4, 42, opts);
  const log: number[][] = [];
  for (let t = 0; t < 4000; t++) {
    const inputs = a.players.map((_, id) => botInput(a, id));
    log.push(inputs);
    tickGame(a, inputs);
  }
  const b = createGame(4, 42, opts);
  let saved: Game | null = null;
  log.forEach((inputs, t) => {
    if (t === 2000) saved = structuredClone(b);
    tickGame(b, inputs);
  });
  assert.deepEqual(b, a);
  const resumed = saved!;
  for (const inputs of log.slice(2000)) tickGame(resumed, inputs);
  assert.deepEqual(resumed, a);
}

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
  const g = arena(3); // a third player keeps the round going after the knockout
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
  assert.equal(g.phase, "result");
  assert.equal(g.roundWinner, 1);
  assert.equal(g.players[1].wins, 1);
});

test("two round wins take the match, then a fresh match starts", () => {
  const g = arena();
  g.players[0].wins = 1;
  g.players[1].alive = false;
  run(g, 1);
  assert.equal(g.phase, "over");
  assert.equal(g.matchWinner, 0);
  run(g, OVER_TICKS);
  assert.equal(g.phase, "ready");
  assert.equal(g.round, 1);
  assert.deepEqual(g.players.map((p) => p.wins), [0, 0]);
});

test("four bots finish a round on their own, in every mode and on Tractor Lane", () => {
  for (const opts of [{}, { mode: HARVEST }, { mode: POTATO }, { map: TRACTOR }]) {
    const g = createGame(4, 7, opts);
    let t = 0;
    while (g.round === 1 && g.phase !== "over" && t++ < 20000) tickGame(g, g.players.map((_, id) => botInput(g, id)));
    assert.ok(g.round > 1 || g.phase === "over", `${JSON.stringify(opts)}: round still running after ${t} ticks`);
  }
});

test("revenge: a knocked-out player rides the rim and lobs orbs inward, with a wait between throws", () => {
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
  assert.equal(p.stats.orbs, 0, "not straight after the knockout");
  run(g, GHOST_RELOAD);
  tickGame(g, [BOMB]);
  const thrown = g.bombs.filter((b) => b.owner === 0);
  assert.equal(thrown.length, 1);
  assert.ok(thrown[0].hops > 0, "thrown from the wall, in the air");
  assert.equal(p.dir, 3, "turned to face the arena");
  run(g, 30);
  assert.equal(thrown[0].hops, 0, "landed");
  assert.equal(tileAt(thrown[0].x, thrown[0].y), idx(3, 5));
  tickGame(g, [BOMB]);
  assert.equal(p.stats.orbs, 1, "has to wait before the next throw");
  run(g, GHOST_RELOAD);
  tickGame(g, [BOMB]);
  assert.equal(p.stats.orbs, 2, "ready again");
});

test("a room's drop rates decide how many crates drop a power-up, and which", () => {
  // An orb on every open tile breaks every crate next to one, in one tick; return what each broken crate left.
  const smash = (opts: Partial<Options>) => {
    const g = createGame(2, 5, opts);
    g.phase = "play";
    const crates = g.grid.flatMap((t, i) => (t === BLOCK ? [i] : []));
    g.grid.forEach((t, i) => t === FLOOR && g.bombs.push(orb(0, i % COLS, Math.floor(i / COLS), { id: 1000 + i, fuse: 1 })));
    tickGame(g, []);
    const broken = crates.filter((i) => g.grid[i] === CRUMBLE);
    assert.ok(broken.length > 20);
    return broken.map((i) => g.items[i]);
  };
  const only = (keep: number, w = 1) => DEFAULT_WEIGHTS.map((_, id) => (id === keep ? w : 0));
  const skulls = smash({ drop: 100, weights: only(SKULL) });
  assert.ok(skulls.every((item) => item === SKULL), "every crate drops, and only what has a weight");
  assert.ok(smash({ drop: 0 }).every((item) => !item), "no crate drops anything");
  // Switched off, or retired (7 was Pierce): never, however big the number.
  const rest = smash({ drop: 100, items: ALL_ITEMS & ~(1 << SKULL), weights: DEFAULT_WEIGHTS.map((_, id) => (id === SKULL || id === 7 ? 100 : 1)) });
  assert.ok(rest.every((item) => item > 0 && item !== SKULL && item !== 7));
});

test("A blast stops at the first crate it breaks; Napalm fire burns longer", () => {
  {
    const g = arena();
    place(g, 0, 7, 7);
    g.grid[idx(3, 1)] = g.grid[idx(4, 1)] = BLOCK;
    g.bombs.push(orb(0, 1, 1, { fuse: 1, range: 4 }));
    tickGame(g, []);
    assert.equal(g.grid[idx(3, 1)], CRUMBLE);
    assert.equal(g.grid[idx(4, 1)], BLOCK);
    assert.equal(g.fire[idx(5, 1)], 0);
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
  assert.equal(g.phase, "play");
  g.players[1].alive = g.players[3].alive = false;
  run(g, 1);
  assert.equal(g.phase, "result");
  assert.deepEqual(g.players.map((p) => p.wins), [1, 0, 1, 0]);
});

test("revenge comeback: a ghost whose orb knocks someone out takes their place", () => {
  for (const revenge of [true, false]) {
    const g = arena(3);
    const ghost = Object.assign(g.players[0], { alive: false, ghost: true, diedAt: 0, x: center(0), y: center(5) });
    g.tick = GHOST_RELOAD; // been on the rim long enough to throw
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

test("revenge: one comeback a round; after that you're a spite ghost whose orbs still score but can't bring you back", () => {
  const g = arena(4);
  const ghost = Object.assign(g.players[0], { alive: false, ghost: true, diedAt: 0, x: center(0), y: center(5) });
  g.tick = GHOST_RELOAD;
  place(g, 1, 3, 5);
  place(g, 2, 9, 9);
  tickGame(g, [BOMB]);
  run(g, FUSE);
  assert.ok(ghost.alive && ghost.returned, "came back");

  run(g, FLAME + 100); // invulnerability over
  place(g, 0, 7, 3);
  g.bombs.push(orb(2, 7, 3, { fuse: 1 }));
  run(g, 1 + GHOST_DELAY + 10);
  assert.equal(ghost.alive, false);
  assert.ok(ghost.ghost, "back on the rim again, as a spite ghost");
  assert.equal(g.phase, "play", "the other two play on");

  Object.assign(ghost, { x: center(0), y: center(9) }); // left wall, row 9: lobs 3 tiles in, onto player 4
  place(g, 3, 3, 9);
  g.tick += GHOST_RELOAD; // reloaded
  const kos = ghost.stats.kos;
  tickGame(g, [BOMB]);
  run(g, FUSE);
  assert.equal(g.players[3].alive, false);
  assert.equal(ghost.stats.kos, kos + 1, "the knockout counts");
  assert.ok(ghost.ghost && !ghost.alive, "but there's no second comeback");
  assert.deepEqual([g.log.at(-1)!.how, g.log.at(-1)!.back], ["ghost", false]);

  run(g, RESULT_TICKS + 2); // one left standing: on to the next round
  assert.equal(g.round, 2);
  assert.equal(ghost.returned, false, "a fresh comeback next round");
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
    assert.ok(g.players[0].carry, "picked up");
    tickGame(g, []);
    assert.ok(g.bombs[0].hops > 0, "let go: in the air");
    run(g, 40);
    const b = g.bombs[0];
    assert.equal(b.hops, 0, "landed");
    return tileAt(b.x, b.y);
  };
  assert.equal(throwFrom(1, [idx(2, 1), idx(3, 1)]), idx(4, 1), "over two crates");
  assert.equal(throwFrom(1, [idx(4, 1)]), idx(5, 1), "bounced off a crate");
  assert.equal(throwFrom(13, []), idx(3, 1), "over the wall, back in on the far side");
});

test("Glove: hold to carry an orb (its fuse waits), let go to throw it the way you face; drop it if knocked out", () => {
  const g = arena(3); // a third player keeps the round going after player 1's knockout
  place(g, 0, 5, 1);
  place(g, 1, 7, 9);
  g.players[0].glove = true;
  tickGame(g, [BOMB]);
  tickGame(g, [ACT]);
  const b = g.bombs[0];
  const fuse = b.fuse;
  run(g, 45, [DOWN | ACT]); // walk two tiles down, holding it
  assert.equal(tileAt(b.x, b.y), idx(5, 3), "carried along");
  assert.equal(b.fuse, fuse, "fuse waits while carried");
  tickGame(g, [LEFT | ACT]); // turn left
  run(g, 30);
  assert.equal(b.hops, 0);
  assert.equal(tileAt(b.x, b.y), idx(2, 3), "thrown 3 tiles the way they faced");

  place(g, 0, 5, 3);
  tickGame(g, [ACT]);
  assert.equal(g.players[0].carry, 0, "can't grab from two tiles away");
  place(g, 0, 2, 3);
  tickGame(g, []);
  tickGame(g, [ACT]);
  g.fire[idx(2, 3)] = FLAME; // caught in a blast while carrying
  tickGame(g, [ACT]);
  assert.equal(g.players[0].alive, false);
  assert.equal(b.hops, 0, "dropped where they fell");
  tickGame(g, []);
  assert.equal(g.bombs.length, 0, "and the fire sets it off");
});

test("Swap trades places with an opponent; stats count orbs, crates and own goals", () => {
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
  run(g, 1 + OVER_TICKS * 2);
  assert.equal(g.phase, "over");
  assert.equal(g.matchWinner, 0);
});

test("room rules: round time, sudden death off, revenge off, and which power-ups drop", () => {
  const quick = arena(2, { roundSecs: 60 });
  quick.roundTick = 60 * TICK_HZ;
  run(quick, SHRINK_EVERY);
  assert.equal(quick.grid[SPIRAL[0]], WALL, "walls start falling at the chosen time");

  const calm = arena(2, { shrink: false, roundSecs: 60 });
  place(calm, 1, 7, 7);
  calm.roundTick = 60 * TICK_HZ - 1;
  run(calm, 2);
  assert.equal(calm.phase, "result");
  assert.equal(calm.roundWinner, -1, "time's up with no sudden death: a draw");
  assert.equal(calm.grid[SPIRAL[0]], FLOOR, "no walls fell");

  const noGhosts = arena(3, { revenge: false });
  const out = Object.assign(noGhosts.players[0], { alive: false, diedAt: 0 });
  run(noGhosts, 120);
  assert.equal(out.ghost, false, "revenge off: knocked-out players stay out");

  const drops = (items: number) => {
    const g = createGame(4, 3, { items });
    const seen = new Set<number>();
    for (let t = 0; t < 6000 && g.phase !== "over"; t++) {
      tickGame(g, g.players.map((_, id) => botInput(g, id)));
      g.items.forEach((it) => it && seen.add(it));
    }
    return seen;
  };
  assert.deepEqual([...drops(1 << SWAP)], [SWAP], "only switched-on power-ups drop");
  assert.equal(drops(0).size, 0, "all off: crates drop nothing");
});

test("the round goes to the survivor at once: the next falling wall can't turn a clear win into a draw", () => {
  const g = arena();
  place(g, 0, SPIRAL[0] % COLS, Math.floor(SPIRAL[0] / COLS)); // first wall to fall
  place(g, 1, SPIRAL[1] % COLS, Math.floor(SPIRAL[1] / COLS)); // the very next one
  g.roundTick = ROUND_TICKS;
  run(g, SHRINK_EVERY);
  assert.equal(g.players[0].alive, false);
  run(g, SHRINK_EVERY * 3); // play is frozen: no more walls fall
  assert.equal(g.roundWinner, 1);
  assert.equal(g.players[1].alive, true);
  assert.equal(g.grid[SPIRAL[1]], FLOOR);
});

test("two players caught in the same blast on the same tick is a draw", () => {
  const g = arena();
  place(g, 0, 1, 1);
  place(g, 1, 2, 1);
  g.bombs.push(orb(0, 1, 1, { fuse: 1, range: 2 }));
  tickGame(g, []);
  assert.equal(g.phase, "result");
  assert.equal(g.roundWinner, -1);
});

test("the knockout log records who got whom: orb, own orb, walls, and a ghost coming back", () => {
  const g = arena(4);
  place(g, 0, 1, 1);
  place(g, 1, 2, 1);
  place(g, 2, 7, 7);
  place(g, 3, 13, 11);
  g.bombs.push(orb(0, 1, 1, { fuse: 1, range: 1 })); // player 1's orb: catches player 1 and player 2
  tickGame(g, []);
  assert.deepEqual(g.log.map(({ victim, by, how }) => [victim, by, how]), [[0, 0, "self"], [1, 0, "orb"]]);

  Object.assign(g.players[1], { ghost: true, x: center(0), y: center(7) }); // player 2's ghost, left wall, row 7
  g.tick += GHOST_RELOAD; // long enough to throw
  tickGame(g, [0, BOMB]); // lobs an orb 3 tiles in: (3, 7)
  place(g, 2, 3, 7);
  run(g, FUSE);
  const last = g.log.at(-1)!;
  assert.deepEqual([last.victim, last.by, last.how, last.back], [2, 1, "ghost", true]);

  g.roundTick = ROUND_TICKS;
  place(g, 3, SPIRAL[0] % COLS, Math.floor(SPIRAL[0] / COLS));
  run(g, SHRINK_EVERY);
  assert.deepEqual([g.log.at(-1)!.victim, g.log.at(-1)!.how], [3, "wall"]);
});

test("Frost blasts leave ice that thaws back to the map's own floor", () => {
  const g = arena(2, { map: 2 }); // Factory: row 5 is a belt
  g.bombs.push(orb(0, 3, 5, { fuse: 1, frost: true }));
  tickGame(g, []);
  assert.equal(g.floor[idx(3, 5)], ICE, "the belt froze");
  assert.equal(g.floor[idx(3, 4)], ICE, "and the grass");
  run(g, FROST_TICKS - 1);
  assert.equal(g.floor[idx(3, 4)], ICE);
  run(g, 1);
  assert.equal(g.floor[idx(3, 5)], BELT + 3, "a belt again");
  assert.equal(g.floor[idx(3, 4)], GRASS);
});

test("Gust blows every orb on the ground the way you face", () => {
  const g = arena();
  place(g, 0, 1, 1);
  g.bombs.push(orb(1, 5, 3), orb(1, 7, 7, { id: 950 }));
  g.items[idx(2, 1)] = GUST;
  run(g, 15, [RIGHT]); // picks it up facing right
  run(g, 100);
  assert.deepEqual(g.bombs.map((b) => [tileAt(b.x, b.y), b.dx]), [[idx(13, 3), 0], [idx(13, 7), 0]]);
});

test("Butterfingers: orbs drop by themselves, and Remote and Glove stop working", () => {
  const g = arena();
  place(g, 0, 3, 3);
  Object.assign(g.players[0], { curse: BUTTERFINGERS, curseLeft: 999, remote: true, glove: true, bombs: 2 });
  g.bombs.push(orb(0, 7, 7, { remote: true, id: 950 })); // a remote orb from before the curse
  tickGame(g, []);
  const dropped = g.bombs.find((b) => b.id !== 950)!;
  assert.equal(dropped.remote, false, "dropped orbs keep their fuse");
  tickGame(g, [ACT]);
  assert.equal(g.players[0].carry, 0, "the glove can't pick it up");
  assert.ok(g.bombs.some((b) => b.id === 950), "the button doesn't set off remote orbs");
});

test("Robbed takes every power-up from whoever picks up that Skull, and can't be passed on", () => {
  // The Skull's curse is random: try boards until one hands out Robbed.
  const pickUpSkull = (seed: number) => {
    const g = arena();
    g.seed = seed;
    place(g, 0, 3, 3);
    Object.assign(g.players[0], { bombs: 3, range: 4, speed: 2, glove: true, frost: true, shield: true });
    g.items[idx(3, 3)] = SKULL;
    tickGame(g, []);
    return g;
  };
  const g = Array.from({ length: 50 }, (_, seed) => pickUpSkull(seed)).find((b) => b.players[0].curse === ROBBED);
  assert.ok(g, "some board hands out Robbed");
  const p0 = g.players[0];
  assert.deepEqual([p0.bombs, p0.range, p0.speed, p0.glove, p0.frost, p0.shield], [1, 2, 0, false, false, false]);

  const p1 = Object.assign(g.players[1], { bombs: 3, glove: true });
  place(g, 1, 3, 3); // walk into them
  tickGame(g, []);
  assert.deepEqual([p1.curse, p1.bombs, p1.glove], [0, 3, true], "touching them doesn't rob you");
  assert.equal(p0.curse, ROBBED);
});

test("Hot Potato: someone gets it at Go, a touch passes it on, and it knocks out whoever holds it at the end", () => {
  const g = createGame(3, 5, { mode: POTATO });
  run(g, READY_TICKS);
  assert.equal(g.phase, "play");
  assert.equal(g.players.filter((p) => p.potato).length, 1);
  const holder = g.players.find((p) => p.potato)!;
  assert.equal(holder.potato, FIRST_POTATO_TICKS, "the one at Go gets the long fuse");
  const other = g.players.find((p) => p !== holder)!;
  Object.assign(other, { x: holder.x, y: holder.y });
  tickGame(g, []);
  assert.ok(other.potato > 0 && !holder.potato, "passed on");
  assert.equal(holder.stats.curses, 1);

  other.potato = 1;
  tickGame(g, []);
  assert.equal(other.alive, false);
  assert.equal(g.log.at(-1)!.how, "potato");
  assert.equal(g.players.filter((p) => p.alive && p.potato).length, 1, "a fresh one goes to someone still standing");
  const fresh = g.players.find((p) => p.alive && p.potato)!;
  assert.ok(fresh.potato >= POTATO_TICKS - 1 && fresh.potato <= POTATO_TICKS, "with the shorter fuse");
});

test("Hot Potato: fewer crates than Classic, and the holder runs a step faster", () => {
  const crates = (g: Game) => g.grid.filter((t) => t === BLOCK).length;
  for (let seed = 1; seed <= 5; seed++) {
    assert.ok(crates(createGame(4, seed, { mode: POTATO })) < 0.7 * crates(createGame(4, seed)), `seed ${seed}`);
  }
  const g = arena(2, { mode: POTATO });
  place(g, 0, 1, 1);
  place(g, 1, 1, ROWS - 2);
  g.players[0].potato = 10 * TICK_HZ;
  run(g, 20, [RIGHT, RIGHT]);
  assert.equal(g.players[0].x - center(1), 20 * SPEEDS[1]);
  assert.equal(g.players[1].x - center(1), 20 * SPEEDS[0]);
});

test("Hot Potato: whoever passed it on scores the knockout, but not a fresh potato or a pass to a teammate", () => {
  const koOf = (g: Game) => ({ victim: g.log.at(-1)!.victim, by: g.log.at(-1)!.by, how: g.log.at(-1)!.how });
  // Bump player `to` into whoever holds the potato, then let it run out on them.
  const passAndBurn = (g: Game, to: (from: number) => number) => {
    const from = g.players.findIndex((p) => p.potato);
    const id = to(from);
    Object.assign(g.players[id], { x: g.players[from].x, y: g.players[from].y });
    tickGame(g, []);
    assert.ok(g.players[id].potato > 0, "passed on");
    g.players[id].potato = 1;
    tickGame(g, []);
    return [from, id];
  };

  const g = createGame(3, 5, { mode: POTATO });
  run(g, READY_TICKS);
  const [from, to] = passAndBurn(g, (f) => (f + 1) % 3);
  assert.deepEqual(koOf(g), { victim: to, by: from, how: "potato" });
  assert.equal(g.players[from].stats.kos, 1);

  const fresh = g.players.findIndex((p) => p.alive && p.potato); // handed out after that knockout: nobody passed it
  const kos = g.players.map((p) => p.stats.kos);
  g.players[fresh].potato = 1;
  tickGame(g, []);
  assert.deepEqual(koOf(g), { victim: fresh, by: -1, how: "potato" });
  assert.deepEqual(g.players.map((p) => p.stats.kos), kos, "nobody scores");
  assert.equal(g.phase, "result", "one left standing");
  assert.ok(g.players.every((p) => !p.potato), "and the winner isn't handed a fresh potato");

  const t = createGame(4, 5, { mode: POTATO, teams: [0, 1, 0, 1] });
  run(t, READY_TICKS);
  const [passer, mate] = passAndBurn(t, (f) => (f + 2) % 4);
  assert.deepEqual(koOf(t), { victim: mate, by: -1, how: "potato" });
  assert.equal(t.players[passer].stats.kos, 0, "no KO for cooking your own teammate");
});

test("Harvest: crops count, a knockout spills half and you respawn, and the most crops win at 0:00", () => {
  const g = arena(2, { mode: HARVEST });
  assert.deepEqual([g.opts.shrink, g.opts.revenge], [false, false]);
  const p = g.players[0];
  place(g, 0, 3, 3);
  g.items[idx(4, 3)] = CROP;
  run(g, 15, [RIGHT]);
  assert.deepEqual([p.crops, p.stats.crops, p.stats.pickups], [1, 1, 0]);

  p.crops = 5;
  g.bombs.push(orb(1, 4, 3, { fuse: 1 }));
  tickGame(g, []);
  assert.equal(p.alive, false);
  assert.equal(g.phase, "play", "the last one standing doesn't end it");
  assert.equal(p.crops, 2);
  assert.equal(g.items.filter((it) => it === CROP).length, 3, "the rest spilled");
  run(g, RESPAWN_TICKS);
  assert.ok(p.alive);
  assert.equal(tileAt(p.x, p.y), idx(1, 1), "back at the corner");
  assert.equal(p.crops, 2);

  g.roundTick = roundTicks(g) - 1;
  run(g, 1);
  assert.equal(g.phase, "result");
  assert.equal(g.roundWinner, 0);
});

test("Tractor Lane: the road stays clear, a warning comes first, then the tractor flattens orbs and whoever's in the way", () => {
  const fresh = createGame(2, 1, { map: TRACTOR });
  for (const [row] of LANES) for (let c = 1; c < COLS - 1; c++) assert.equal(fresh.grid[row * COLS + c], FLOOR);

  const g = arena(3, { map: TRACTOR });
  const [row] = LANES[0];
  assert.ok(tractor(g, 0).warn);
  place(g, 0, 7, row);
  g.bombs.push(orb(1, 9, row));
  run(g, 4 * TICK_HZ);
  assert.equal(g.players[0].alive, false);
  assert.equal(g.log.at(-1)!.how, "tractor");
  assert.equal(g.bombs.length, 0, "squashed");
  assert.equal(g.fire[idx(9, row)], 0, "without a bang");
});

const tap = (cheat: number) => cheat << CHEAT_SHIFT; // a typed cheat code, as it travels in the input

test("cheats: ignored unless the room allows them; each code once a round, one code each a round, all fresh next round", () => {
  const off = arena();
  tickGame(off, [tap(BUMPERCROP)]);
  assert.equal(off.players[0].bombs, 1, "cheats off: the bits do nothing");
  assert.equal(off.claims.length, 0);

  const g = arena(3, { cheats: true });
  const [p0, p1] = g.players;
  tickGame(g, [tap(BUMPERCROP)]);
  tickGame(g, [tap(BUMPERCROP)]); // still held: one tap, one cheat
  assert.deepEqual([p0.bombs, p0.range, p0.speed], [MAX_BOMBS, MAX_RANGE, SPEEDS.length - 1]);
  assert.deepEqual(g.claims.map((c) => [c.by, c.cheat]), [[0, BUMPERCROP]]);
  assert.equal(cheatBlock(g, 1, BUMPERCROP), "taken");
  tickGame(g, [0, tap(BUMPERCROP)]);
  assert.equal(p1.bombs, 1, "someone got there first");
  assert.equal(cheatBlock(g, 0, COLDSNAP), "spent");
  tickGame(g, [tap(COLDSNAP)]);
  assert.equal(g.claims.length, 1, "one cheat a round each");
  tickGame(g, [0, 0, tap(COLDSNAP)]);
  assert.deepEqual(g.claims.map((c) => [c.by, c.cheat]), [[0, BUMPERCROP], [2, COLDSNAP]]);
  assert.equal(p0.stats.cheats, 1);

  [g.phase, g.phaseLeft] = ["result", 1];
  tickGame(g, []);
  run(g, READY_TICKS);
  assert.equal(g.phase, "play");
  assert.equal(g.claims.length, 0, "a new round, so every code is free again");
  tickGame(g, [0, tap(BUMPERCROP)]);
  assert.equal(g.players[1].bombs, MAX_BOMBS);
});

test("HOLY COW: 10 s untouchable by blasts and your curse lifts, but walls still crush you; a ghost can't use it", () => {
  const g = arena(3, { cheats: true });
  const p = Object.assign(g.players[0], { curse: REVERSED, curseLeft: 300 });
  place(g, 0, 2, 1);
  tickGame(g, [tap(HOLYCOW)]);
  assert.equal(p.curse, 0);
  g.bombs.push(orb(1, 1, 1, { fuse: 1, range: 2 }));
  tickGame(g, []);
  assert.ok(g.fire[idx(2, 1)] > 0);
  assert.equal(p.alive, true, "standing in the fire");
  run(g, HOLY_TICKS);
  assert.equal(p.god, 0, "it wears off");

  const h = arena(2, { cheats: true });
  tickGame(h, [tap(HOLYCOW)]);
  h.grid[tileAt(h.players[0].x, h.players[0].y)] = WALL;
  tickGame(h, []);
  assert.equal(h.players[0].alive, false, "a falling wall still crushes you");

  const k = arena(3, { cheats: true });
  Object.assign(k.players[0], { alive: false, ghost: true, diedAt: 0 });
  tickGame(k, [tap(HOLYCOW)]);
  assert.equal(k.claims.length, 0, "not while you're a ghost");
  assert.equal(cheatBlock(k, 0, HOLYCOW), "out");
  k.bombs.push(orb(1, 5, 5), orb(2, 7, 7, { remote: true }));
  tickGame(k, []);
  tickGame(k, [tap(POPCORN)]);
  assert.equal(k.claims.length, 1, "the claim wasn't spent, and POPCORN works from the rim");
  assert.equal(k.bombs.length, 0, "every orb on the ground went off, remote ones too");
  assert.ok(k.fire[idx(5, 5)] > 0 && k.fire[idx(7, 7)] > 0);
});

test("TOPSY-TURVY flips opponents only; RAIN DANCE sprouts power-ups; COLD SNAP ices the grass; LIGHTS OUT darkens the others", () => {
  const g = arena(4, { cheats: true, teams: [0, 1, 0, 1] });
  tickGame(g, [tap(TOPSYTURVY)]);
  assert.deepEqual(g.players.map((p) => p.curse), [0, REVERSED, 0, REVERSED], "only the other team flips");

  tickGame(g, [0, tap(RAINDANCE)]);
  assert.equal(g.items.filter(Boolean).length, 6);

  tickGame(g, [0, 0, tap(COLDSNAP)]);
  assert.equal(g.floor[idx(5, 5)], ICE);
  tickGame(g, [0, 0, 0, tap(LIGHTSOUT)]);
  assert.deepEqual([g.dark, g.darkBy], [DARK_TICKS, 3]);
  run(g, Math.max(SNAP_TICKS, DARK_TICKS));
  assert.equal(g.floor[idx(5, 5)], GRASS, "thawed");
  assert.equal(g.dark, 0, "lights back on");
});

test("two players typing the same code on the same tick: one gets it, and the same one on every replay", () => {
  const race = () => {
    const g = arena(2, { cheats: true });
    tickGame(g, [tap(BUMPERCROP), tap(BUMPERCROP)]);
    return g.claims;
  };
  assert.equal(race().length, 1);
  assert.deepEqual(race(), race());
});
