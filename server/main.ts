// Game server: serves the page, runs each room's lobby, and is the clock and referee for its match.
// Matches use rollback netcode (shared/netcode.ts): the server only orders inputs and runs the same sim.
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import { botInput } from "../shared/bot.ts";
import { InputQueue } from "../shared/netcode.ts";
import { MAPS, TICK_HZ, createGame, sideOf, tickGame, type Game } from "../shared/sim.ts";

const PORT = Number(process.env.PORT) || 8000;
const SEATS = 4;
const MAX_CLIENTS = 8; // 4 players + watchers
const COUNTDOWN = 3 * TICK_HZ;
const STATE_EVERY = 2 * TICK_HZ; // full state broadcast: repairs desyncs, costs ~4 KB

// Allowlist rather than a path join: nothing outside these files can be requested.
const FILES: Record<string, [string, string]> = {
  "/": ["public/index.html", "text/html"],
  "/main.js": ["public/main.js", "text/javascript"],
  "/main.js.map": ["public/main.js.map", "application/json"], // dev builds only
};

const server = http.createServer(async (req, res) => {
  const file = FILES[new URL(req.url ?? "/", "http://x").pathname];
  if (!file) return res.writeHead(404).end("Not found");
  try {
    const body = await readFile(path.join(process.cwd(), file[0]));
    res.writeHead(200, { "Content-Type": `${file[1]}; charset=utf-8`, "Cache-Control": "no-cache" }).end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
});

interface Client {
  ws: WebSocket | null; // null while disconnected mid-match (a bot plays for them)
  token: string; // lets a reloaded tab take its seat back
  name: string;
  seat: number; // -1 = watching
  ready: boolean;
  lastSync: number;
}
interface Seat {
  seat: number;
  name: string;
  bot: boolean;
  client: Client | null;
  queue: InputQueue;
}
interface Settings {
  map: number; // -1 = random each round
  teams: boolean; // 2v2: seats 1 + 3 against 2 + 4
  winRounds: number;
}
interface Room {
  code: string;
  clients: Client[];
  bots: boolean;
  settings: Settings;
  countdown: number; // ticks left, 0 = not counting down
  game: Game | null;
  roster: Seat[]; // sim player i = roster[i]
  tally: Map<string, { name: string; wins: number }>; // match wins tonight, by client token ("bots" for all bots)
}

// shortcut: rooms live in this process's memory; fine for one instance, needs shared state to scale out.
const rooms = new Map<string, Room>();
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 512 });

const send = (c: Client, msg: unknown) => c.ws?.readyState === WebSocket.OPEN && c.ws.send(JSON.stringify(msg));
const cleanName = (v: unknown) => (typeof v === "string" ? v.replace(/[^\p{L}\p{N} _.-]/gu, "").trim().slice(0, 12) : "") || "Trainer";
const freeSeat = (room: Room) => [0, 1, 2, 3].find((s) => !room.clients.some((c) => c.seat === s)) ?? -1;
const rosterIndex = (room: Room, c: Client) => room.roster.findIndex((r) => r.client === c);

function sendLobby(room: Room) {
  for (const c of room.clients) {
    send(c, {
      type: "lobby",
      code: room.code,
      seats: [0, 1, 2, 3].map((s) => {
        const o = room.clients.find((x) => x.seat === s);
        return o ? { name: o.name, ready: o.ready, you: o === c } : null;
      }),
      bots: room.bots,
      settings: room.settings,
      tally: [...room.tally]
        .map(([k, e]) => ({ name: room.clients.find((x) => x.token === k)?.name ?? e.name, wins: e.wins, you: k === c.token }))
        .sort((a, b) => b.wins - a.wins),
      countdown: Math.ceil(room.countdown / TICK_HZ),
      playing: !!room.game,
    });
  }
}

const sendStart = (room: Room, c: Client) =>
  send(c, { type: "start", g: room.game, roster: room.roster.map(({ seat, name, bot }) => ({ seat, name, bot })), you: rosterIndex(room, c) });

function canStart(room: Room) {
  const seated = room.clients.filter((c) => c.seat >= 0);
  const seats = room.bots ? [0, 1, 2, 3] : seated.map((c) => c.seat);
  const bothTeams = new Set(seats.map((s) => s % 2)).size === 2;
  return seated.length > 0 && seated.every((c) => c.ready) && seats.length >= 2 && (!room.settings.teams || bothTeams);
}

function startMatch(room: Room) {
  room.roster = [];
  for (let s = 0; s < SEATS; s++) {
    const c = room.clients.find((x) => x.seat === s) ?? null;
    if (c || room.bots) room.roster.push({ seat: s, name: c ? c.name : `Bot ${s + 1}`, bot: !c, client: c, queue: new InputQueue() });
  }
  const { map, teams, winRounds } = room.settings;
  room.game = createGame(room.roster.length, randomBytes(4).readInt32LE(), {
    map,
    winRounds,
    teams: teams ? room.roster.map((r) => r.seat % 2) : null,
    rematch: false,
  });
  room.countdown = 0;
  for (const c of room.clients) sendStart(room, c);
  sendLobby(room);
}

function endMatch(room: Room) {
  const g = room.game;
  if (g && g.matchWinner >= 0) {
    const side = sideOf(g, g.matchWinner);
    const winners = new Map<string, string>(); // token → name; bots share one entry
    room.roster.forEach((r, i) => {
      if (sideOf(g, i) === side) winners.set(r.client?.token ?? "bots", r.client?.name ?? "Bots");
    });
    for (const [key, name] of winners) room.tally.set(key, { name, wins: (room.tally.get(key)?.wins ?? 0) + 1 });
  }
  room.game = null;
  room.roster = [];
  room.clients = room.clients.filter((c) => c.ws); // whoever never came back loses their seat
  for (const c of room.clients) {
    c.ready = false;
    if (c.seat < 0) c.seat = freeSeat(room); // watchers get the free seats
  }
  sendLobby(room);
}

function tickRoom(room: Room) {
  const g = room.game;
  if (!g) {
    const was = room.countdown;
    if (!canStart(room)) room.countdown = 0;
    else if (!room.countdown) room.countdown = COUNTDOWN;
    else if (--room.countdown === 0) return startMatch(room);
    if (Math.ceil(room.countdown / TICK_HZ) !== Math.ceil(was / TICK_HZ)) sendLobby(room); // started, cancelled, or a second passed
    return;
  }

  const t = g.tick + 1;
  const inputs = room.roster.map((r, i) => (r.client?.ws ? r.queue.take(t) : botInput(g, i)));
  tickGame(g, inputs);
  const frame = JSON.stringify([t, ...inputs]);
  const state = t % STATE_EVERY === 0 ? JSON.stringify({ type: "state", g }) : null;
  for (const c of room.clients) {
    if (c.ws?.readyState !== WebSocket.OPEN) continue;
    c.ws.send(frame);
    if (state) c.ws.send(state);
  }
  if (g.phase === "over" && g.phaseLeft <= 1) endMatch(room); // back to the lobby instead of auto-rematching
}

function join(room: Room, ws: WebSocket, m: { token?: unknown; name?: unknown }): Client | null {
  const back = room.clients.find((c) => c.token === m.token && !c.ws);
  if (!back && room.clients.filter((c) => c.ws).length >= MAX_CLIENTS) {
    ws.send(JSON.stringify({ type: "full" }));
    ws.close();
    return null;
  }
  const c = back ?? { ws, token: randomBytes(8).toString("hex"), name: cleanName(m.name), seat: -1, ready: false, lastSync: 0 };
  c.ws = ws;
  if (!back) {
    if (!room.game) c.seat = freeSeat(room);
    room.clients.push(c);
  }
  send(c, { type: "welcome", token: c.token });
  if (room.game) {
    const i = rosterIndex(room, c);
    if (i >= 0) room.roster[i].queue.last = room.game.players[i].prev; // carry on from the bot's last input, as the client will predict
    sendStart(room, c);
  }
  sendLobby(room);
  return c;
}

function leave(room: Room, c: Client) {
  c.ws = null;
  if (!room.game) room.clients = room.clients.filter((x) => x !== c); // in the lobby the seat frees up at once
  if (!room.clients.some((x) => x.ws)) rooms.delete(room.code);
  else sendLobby(room);
}

// Trust boundary: every client message is checked here before it touches room state.
function handle(room: Room, c: Client, m: Record<string, unknown>) {
  const g = room.game;
  if (m.type === "ping" && typeof m.t === "number") send(c, { type: "pong", t: m.t });
  else if (m.type === "in" && g) {
    const i = rosterIndex(room, c);
    if (i >= 0) room.roster[i].queue.push(m.t as number, m.i as number, g.tick); // push() validates both
  } else if (m.type === "sync" && g && g.tick - c.lastSync >= TICK_HZ) {
    c.lastSync = g.tick;
    send(c, { type: "state", g });
  } else if (m.type === "name") {
    c.name = cleanName(m.name);
    sendLobby(room);
  } else if (g) return; // the rest are lobby-only
  else if (m.type === "seat" && Number.isInteger(m.seat) && (m.seat as number) >= 0 && (m.seat as number) < SEATS) {
    if (room.clients.some((x) => x.seat === m.seat)) return;
    [c.seat, c.ready] = [m.seat as number, false];
    sendLobby(room);
  } else if (m.type === "ready" && c.seat >= 0) {
    c.ready = m.ready === true;
    sendLobby(room);
  } else if (m.type === "bots") {
    room.bots = m.on === true;
    sendLobby(room);
  } else if (m.type === "settings") {
    const { map, teams, winRounds } = m;
    if (!Number.isInteger(map) || (map as number) < -1 || (map as number) >= MAPS.length) return;
    if (!Number.isInteger(winRounds) || (winRounds as number) < 1 || (winRounds as number) > 5) return;
    room.settings = { map: map as number, teams: teams === true, winRounds: winRounds as number };
    sendLobby(room);
  }
}

wss.on("connection", (ws, req) => {
  const code = new URL(req.url ?? "", "http://x").searchParams.get("room")?.toLowerCase() ?? "";
  if (!/^[a-z0-9]{4,8}$/.test(code)) return ws.close(1008, "bad room");
  let room = rooms.get(code);
  if (!room) {
    room = { code, clients: [], bots: true, settings: { map: -1, teams: false, winRounds: 2 }, countdown: 0, game: null, roster: [], tally: new Map() };
    rooms.set(code, room);
  }
  const r = room;
  let me: Client | null = null;
  ws.on("message", (data) => {
    let m: unknown;
    try {
      m = JSON.parse(String(data));
    } catch {
      return;
    }
    if (!m || typeof m !== "object") return;
    const msg = m as Record<string, unknown>;
    if (me) handle(r, me, msg);
    else if (msg.type === "hello") me = join(r, ws, msg);
  });
  ws.on("close", () => {
    if (me) leave(r, me);
    else if (!r.clients.length) rooms.delete(code);
  });
});

// Fixed timestep from a real clock: setInterval drifts, the accumulator keeps exactly TICK_HZ on average.
const TICK_MS = 1000 / TICK_HZ;
let last = performance.now();
let acc = 0;
setInterval(() => {
  const now = performance.now();
  acc = Math.min(acc + now - last, 250); // after a stall, skip ahead instead of fast-forwarding seconds
  last = now;
  while (acc >= TICK_MS) {
    acc -= TICK_MS;
    rooms.forEach(tickRoom);
  }
}, TICK_MS / 2);

server.listen(PORT, () => console.log(`Boom Orbs on http://localhost:${PORT}`));
