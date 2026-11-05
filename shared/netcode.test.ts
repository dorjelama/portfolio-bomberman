import { test } from "node:test";
import assert from "node:assert/strict";
import { InputQueue, Timeline } from "./netcode.ts";
import { BOMB, DOWN, LEFT, RIGHT, UP, createGame, tickGame, type Game } from "./sim.ts";

test("input queue: future inputs wait for their tick, late ones keep their order, gaps repeat the last", () => {
  const q = new InputQueue();
  q.push(12, RIGHT, 10);
  assert.equal(q.take(11), 0);
  assert.equal(q.take(12), RIGHT);
  assert.equal(q.take(13), RIGHT);
  q.push(5, BOMB, 13); // late tap: press...
  q.push(6, 0, 13); // ...and release
  assert.equal(q.take(14), BOMB);
  assert.equal(q.take(15), 0);
  q.push(9999, UP, 15); // absurdly far ahead: ignored
  q.push(16.5, UP, 15); // not a tick
  assert.equal(q.take(16), 0);
});

test("laggy clients predict, roll back and end up with exactly the server's game", () => {
  const server = createGame(3, 11);
  const json = (g: Game) => JSON.parse(JSON.stringify(g)) as Game; // what goes over the wire
  const lag = [2, 9, 4]; // one-way ticks
  const lead = [6, 20, 1]; // client 3 runs too close to the server, so its inputs arrive late
  const clients = lag.map((_, me) => new Timeline(json(server), me));
  const queues = lag.map(() => new InputQueue());
  const lastSent = lag.map(() => 0);
  const toServer: { at: number; me: number; t: number; i: number }[] = [];
  const toClient: { at: number; me: number; t?: number; inputs?: number[]; state?: Game }[] = [];
  const PATTERN = [RIGHT, DOWN, DOWN | BOMB, LEFT, UP, 0, UP | BOMB, RIGHT];
  const script = (me: number, t: number) => PATTERN[Math.floor((t + me * 7) / 17) % PATTERN.length] & (t % 3 ? ~0 : ~BOMB);

  for (let now = 1; now <= 2400; now++) {
    clients.forEach((c, me) => {
      while (c.g.tick < now + lead[me]) {
        const t = c.g.tick + 1;
        const i = script(me, t);
        c.setMine(t, i);
        if (i !== lastSent[me]) toServer.push({ at: now + lag[me], me, t, i });
        lastSent[me] = i;
        c.advance(t);
      }
    });
    for (const m of toServer.filter((m) => m.at <= now)) queues[m.me].push(m.t, m.i, server.tick);
    toServer.splice(0, toServer.length, ...toServer.filter((m) => m.at > now));

    const inputs = queues.map((q) => q.take(server.tick + 1));
    tickGame(server, inputs);
    lag.forEach((l, me) => {
      toClient.push({ at: now + l, me, t: server.tick, inputs });
      if (server.tick % 120 === 0) toClient.push({ at: now + l, me, state: json(server) });
    });
    for (const m of toClient.filter((m) => m.at <= now)) {
      if (m.state) clients[m.me].adopt(m.state);
      else clients[m.me].confirm(m.t!, m.inputs!);
    }
    toClient.splice(0, toClient.length, ...toClient.filter((m) => m.at > now));
  }
  for (const m of toClient) {
    if (m.state) clients[m.me].adopt(m.state);
    else clients[m.me].confirm(m.t!, m.inputs!);
  }

  assert.ok(server.bombs.length + server.players.filter((p) => !p.alive).length + server.round > 1, "the match actually happened");
  for (const c of clients) {
    assert.ok(c.rollbacks > 0, "prediction was wrong sometimes, so rollback was exercised");
    assert.ok(c.drift.some((d) => d.x || d.y), "corrections were measured for smoothing");
    assert.equal(c.desyncs, 0);
    assert.equal(JSON.stringify(c.settled()), JSON.stringify(server));
  }
});
