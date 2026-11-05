// Rollback netcode. No DOM and no sockets here, so tests can run a server and laggy clients in one process.
//
// The server is the clock: it simulates tick t with whatever inputs it has for t, and broadcasts them.
// Clients run a little ahead of it, guess everyone else's input (same as last confirmed),
// and rewind + replay when the confirmed inputs turn out different.
import { TILE, tickGame, type Game } from "./sim.ts";

const MAX_LEAD = 120; // server ignores inputs stamped more than 2 s ahead

// Server side, one per player: inputs stamped for future ticks. Players send only *changes*,
// so a tick with no new input repeats the last one, which is exactly what clients predict.
export class InputQueue {
  last = 0;
  private q = new Map<number, number>();
  private lastAssigned = 0;

  push(t: number, input: number, now: number) {
    if (!Number.isInteger(t) || !Number.isInteger(input) || t > now + MAX_LEAD) return;
    // A late input lands on the next open tick. Keep them in order so a quick tap (press, release) is never lost.
    const at = Math.max(t, now + 1, this.lastAssigned + 1);
    this.q.set(at, input & 63);
    this.lastAssigned = at;
  }

  take(t: number) {
    const v = this.q.get(t);
    if (v !== undefined) {
      this.last = v;
      this.q.delete(t);
    }
    return this.last;
  }
}

// Client side: the local, predicted game plus everything needed to rewind it.
export class Timeline {
  g: Game;
  confirmedTick: number;
  rollbacks = 0;
  desyncs = 0;
  // How far each player jumped because of rewinds (old spot minus corrected spot, in sim units).
  // The renderer draws them offset by this and eases it to zero, so corrections glide instead of snapping.
  drift: { x: number; y: number }[];
  private states = new Map<number, Game>(); // state after tick t, kept from the last confirmed tick on
  private confirmed = new Map<number, number[]>();
  private used = new Map<number, number[]>(); // inputs each tick was simulated with
  private mine = new Map<number, number>();
  private latest: number[]; // most recent confirmed inputs: the guess for ticks not confirmed yet
  private dirtyFrom = Infinity;

  readonly me: number; // -1 when watching

  constructor(start: Game, me: number) {
    this.me = me;
    this.g = structuredClone(start);
    this.confirmedTick = start.tick;
    this.states.set(start.tick, structuredClone(start));
    this.latest = start.players.map((p) => p.prev);
    this.drift = start.players.map(() => ({ x: 0, y: 0 }));
  }

  setMine(t: number, input: number) {
    this.mine.set(t, input);
  }

  // Confirmed inputs for tick t; they arrive in order.
  confirm(t: number, inputs: number[]) {
    this.confirmed.set(t, inputs);
    this.confirmedTick = t;
    this.latest = inputs;
    const used = this.used.get(t);
    if (used && used.some((v, i) => v !== inputs[i])) this.dirtyFrom = Math.min(this.dirtyFrom, t);
  }

  // The server's own state: replaces ours at that tick, which also repairs any desync.
  adopt(s: Game) {
    const ours = this.states.get(s.tick);
    if (ours && s.tick < this.dirtyFrom && JSON.stringify(ours) !== JSON.stringify(s)) this.desyncs++;
    this.states.set(s.tick, s);
    if (s.tick >= this.g.tick) {
      this.g = structuredClone(s);
      this.dirtyFrom = Infinity;
    } else this.dirtyFrom = Math.min(this.dirtyFrom, s.tick + 1);
  }

  // Rewind if a guess was wrong, then simulate forward to `target`.
  advance(target: number) {
    if (this.dirtyFrom <= this.g.tick) {
      const end = this.g.tick;
      const was = this.g.players.map((p) => [p.x, p.y]);
      this.g = structuredClone(this.states.get(this.dirtyFrom - 1)!);
      this.rollbacks++;
      while (this.g.tick < end) this.step();
      this.g.players.forEach((p, i) => {
        const [dx, dy] = [was[i][0] - p.x, was[i][1] - p.y];
        if (Math.abs(dx) + Math.abs(dy) >= 2 * TILE) return; // bigger jumps (portals, ghosts) just snap
        this.drift[i].x += dx;
        this.drift[i].y += dy;
      });
    }
    this.dirtyFrom = Infinity;
    while (this.g.tick < target) this.step();
    for (const map of [this.states, this.confirmed, this.used, this.mine]) {
      for (const k of map.keys()) if (k < this.confirmedTick) map.delete(k);
    }
  }

  // The state every input is confirmed for (for tests).
  settled() {
    this.advance(this.g.tick);
    return this.states.get(this.confirmedTick);
  }

  private step() {
    const t = this.g.tick + 1;
    const inputs = this.confirmed.get(t) ?? this.latest.map((v, i) => (i === this.me ? (this.mine.get(t) ?? v) : v));
    this.used.set(t, inputs);
    tickGame(this.g, inputs);
    this.states.set(t, structuredClone(this.g));
  }
}
