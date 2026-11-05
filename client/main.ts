import { Timeline } from "../shared/netcode.ts";
import { ACT, BOMB, DOWN, LEFT, RIGHT, ROUND_TICKS, TICK_HZ, UP, createGame, type Game } from "../shared/sim.ts";
import { render } from "./render.ts";
import { ITEM_TILES, TRAINERS } from "./sprites.ts";

const TICK_MS = 1000 / TICK_HZ;
const MARGIN = 2; // extra ticks of lead, so jitter doesn't make our inputs late
const MAX_STEPS = 8; // ticks simulated per frame while catching up
const ITEM_HELP = [
  "",
  "Orb+: carry one more orb at a time",
  "Fire+: blasts reach one tile further",
  "Speed+: walk faster",
  "Kick: walk into an orb to send it sliding",
  "Shield: survive one blast",
  "Remote: your orbs wait for X / Shift",
];

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("game");
const ctx = canvas.getContext("2d")!;
const storage = {
  get: (s: () => Storage, k: string) => {
    try {
      return s().getItem(k);
    } catch {
      return null;
    }
  },
  set: (s: () => Storage, k: string, v: string) => {
    try {
      s().setItem(k, v);
    } catch {}
  },
};

// ---------- room: the URL is the invite, as in Critter Catch ----------
let room = new URLSearchParams(location.search).get("room")?.toLowerCase() ?? "";
if (!/^[a-z0-9]{4,8}$/.test(room)) {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  room = [...crypto.getRandomValues(new Uint8Array(5))].map((b) => abc[b % abc.length]).join("");
  history.replaceState(null, "", `?room=${room}`);
}

// ---------- state ----------
interface Roster {
  seat: number;
  name: string;
  bot: boolean;
}
interface LobbySeat {
  name: string;
  ready: boolean;
  you: boolean;
}
interface Lobby {
  code: string;
  seats: (LobbySeat | null)[];
  bots: boolean;
  countdown: number;
  playing: boolean;
}

let ws: WebSocket | null = null;
let connected = false;
let roomFull = false;
let lobby: Lobby | null = null;
let tl: Timeline | null = null; // the match we're in (or watching)
let shown: Game = createGame(4, 1); // what's drawn: the live match, or the last one behind the lobby
let roster: Roster[] = [0, 1, 2, 3].map((seat) => ({ seat, name: "", bot: true }));
let me = -1;
let delay = 1; // input delay in ticks, picked from ping at match start
let lastSent = 0;
let rtt = 0; // ms, smoothed
let offset: number | null = null; // server tick ≈ now / TICK_MS + offset + half the round trip
let stale = false; // the tab was hidden, so our timeline fell behind: wait for a fresh state
let lastSync = 0;

const send = (msg: unknown) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg));
const nameOf = (i: number) => (i === me ? "You" : roster[i]?.name || `P${i + 1}`);
const seats = () => roster.map((r) => r.seat);

function connect() {
  const s = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws?room=${room}`);
  ws = s;
  s.onopen = () => {
    connected = true;
    send({ type: "hello", token: storage.get(() => sessionStorage, "token"), name: storage.get(() => localStorage, "name") });
  };
  s.onmessage = (e) => onMessage(JSON.parse(e.data));
  s.onclose = () => {
    connected = false;
    tl = null;
    if (!roomFull) setTimeout(connect, 2000);
  };
}

function onMessage(m: any) {
  if (Array.isArray(m)) {
    // Confirmed inputs for one server tick; also our clock sample.
    const [t, ...inputs] = m as number[];
    const sample = t - performance.now() / TICK_MS;
    offset = offset === null || Math.abs(sample - offset) > TICK_HZ ? sample : offset + (sample - offset) * 0.05;
    if (!stale) tl?.confirm(t, inputs);
    return;
  }
  if (m.type === "welcome") storage.set(() => sessionStorage, "token", m.token);
  else if (m.type === "lobby") {
    lobby = m;
    if (!m.playing) tl = null; // match over: freeze the last board behind the lobby
    showLobby();
  } else if (m.type === "start") {
    tl = new Timeline(m.g, m.you);
    [roster, me, shown, stale] = [m.roster, m.you, tl.g, false];
    lastSent = m.g.players[m.you]?.prev ?? 0;
    delay = Math.min(4, Math.max(1, Math.round(rtt / TICK_MS / 4))); // more ping, a little more delay, fewer rewinds
  } else if (m.type === "state" && tl && !document.hidden) {
    tl.adopt(m.g);
    if (tl.desyncs) console.warn(`desync repaired at tick ${m.g.tick}`);
    tl.desyncs = 0;
    stale = false;
  } else if (m.type === "pong") rtt = rtt ? rtt * 0.8 + (performance.now() - m.t) * 0.2 : performance.now() - m.t;
  else if (m.type === "full") roomFull = true;
}
setInterval(() => send({ type: "ping", t: performance.now() }), 1000);

// ---------- input ----------
const KEYS: Record<string, number> = {
  ArrowUp: UP, w: UP, ArrowDown: DOWN, s: DOWN, ArrowLeft: LEFT, a: LEFT, ArrowRight: RIGHT, d: RIGHT,
  " ": BOMB, z: BOMB, x: ACT, Shift: ACT,
};
let held = 0;
let tapped = 0; // pressed since the last tick, so a tap shorter than one tick still counts
const keyOf = (e: KeyboardEvent) => KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key] ?? 0;
addEventListener("keydown", (e) => {
  const k = keyOf(e);
  if (!k || e.ctrlKey || e.metaKey || e.altKey || (e.target instanceof Element && e.target.closest("input, button"))) return;
  e.preventDefault();
  held |= k;
  tapped |= k;
});
addEventListener("keyup", (e) => (held &= ~keyOf(e)));
addEventListener("blur", () => (held = 0));
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) return send({ type: "sync" });
  // Going to the background: stop walking (the server would repeat our last input) and stop simulating.
  stale = true;
  held = tapped = 0;
  if (tl && me >= 0) send({ type: "in", t: tl.g.tick + delay, i: (lastSent = 0) });
});

// ---------- lobby ----------
const FACES = TRAINERS.map((dirs) => dirs[1][0].toDataURL());
const nameInput = $<HTMLInputElement>("name");
nameInput.value = storage.get(() => localStorage, "name") ?? "";
nameInput.onchange = () => {
  storage.set(() => localStorage, "name", nameInput.value);
  send({ type: "name", name: nameInput.value });
};
$<HTMLInputElement>("bots").onchange = (e) => send({ type: "bots", on: (e.target as HTMLInputElement).checked });
$("ready").onclick = () => send({ type: "ready", ready: !lobby?.seats.find((s) => s?.you)?.ready });
$("copy").onclick = async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    $("copy").textContent = "Copied!";
  } catch {
    $("copy").textContent = location.href;
  }
};

function showLobby() {
  if (!lobby) return;
  const l = lobby;
  $("roomCode").textContent = l.code;
  $("seats").replaceChildren(
    ...l.seats.map((s, seat) => {
      const li = document.createElement("li");
      li.className = `p${seat + 1}`;
      const face = document.createElement("img");
      face.src = FACES[seat];
      face.alt = "";
      const label = document.createElement("span");
      label.textContent = s ? `${s.name}${s.you ? " (you)" : ""}: ${s.ready ? "ready" : "not ready"}` : l.bots ? "Bot" : "Empty";
      li.append(face, label);
      if (!s) {
        const sit = document.createElement("button");
        sit.type = "button";
        sit.textContent = "Sit here";
        sit.onclick = () => send({ type: "seat", seat });
        li.append(sit);
      }
      return li;
    })
  );
  $<HTMLInputElement>("bots").checked = l.bots;
  const mine = l.seats.find((s) => s?.you);
  const players = l.bots ? 4 : l.seats.filter(Boolean).length;
  $("ready").hidden = !mine;
  $("ready").textContent = mine?.ready ? "Not ready" : "Ready!";
  $("lobbyNote").textContent = l.countdown
    ? `Starting in ${l.countdown}…`
    : !mine
      ? "All seats are taken. You're watching."
      : players < 2
        ? "Need 2 players: send the invite link, or turn on bots."
        : "Starts when everyone is ready.";
}

$("legend").append(
  ...ITEM_HELP.slice(1).map((text, k) => {
    const li = document.createElement("li");
    li.append(ITEM_TILES[k + 1]!, text);
    return li;
  })
);

// ---------- HUD ----------
let lastHud = "";
function hud() {
  const g = shown;
  const inLobby = !!lobby && !lobby.playing;
  const hurry = g.roundTick >= ROUND_TICKS;
  const left = Math.max(0, Math.ceil((ROUND_TICKS - g.roundTick) / TICK_HZ));
  const timer = hurry ? "HURRY!" : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const won = (i: number, what: string) => (i === me ? `You win the ${what}!` : `${nameOf(i)} wins the ${what}`);
  let [title, sub] = ["", ""];
  if (roomFull) [title, sub] = ["This room is full", "Open the page without ?room= to start your own."];
  else if (!connected) [title, sub] = [lobby ? "Connection lost" : "Connecting…", lobby ? "Reconnecting…" : "The server may take a minute to wake up."];
  else if (inLobby || !tl) title = "";
  else if (g.phase === "ready") [title, sub] = [`Round ${g.round}`, "Ready…"];
  else if (g.phase === "result") title = g.roundWinner < 0 ? "Draw!" : won(g.roundWinner, "round");
  else if (g.phase === "over") [title, sub] = [won(g.matchWinner, "match"), "Back to the lobby in a moment…"];
  const toast =
    !tl || g.phase !== "play" ? "" : g.roundTick < 45 ? "GO!" : hurry && g.roundTick < ROUND_TICKS + 3 * TICK_HZ ? "Hurry! The walls are closing in" : "";
  const score = g.players.map((p, i) => `${seats()[i]}:${nameOf(i)}:${p.wins}:${p.alive || g.phase === "ready"}`).join(",");

  const key = [score, timer, title, sub, toast, inLobby, connected, me].join("|");
  if (key === lastHud) return;
  lastHud = key;
  $("score").replaceChildren(
    ...(inLobby || !tl
      ? []
      : g.players.map((p, i) => {
          const span = document.createElement("span");
          span.className = `p${seats()[i] + 1}${p.alive || g.phase === "ready" ? "" : " out"}`;
          span.textContent = `${nameOf(i)} ${p.wins}`;
          return span;
        }))
  );
  $("timer").textContent = inLobby || !tl ? "" : timer;
  $("timer").classList.toggle("hurry", hurry);
  $("who").textContent = tl && !inLobby && me < 0 ? "Watching: you can join after this match." : "";
  $("lobby").hidden = !connected || !inLobby;
  $("status").hidden = !title;
  $("statusText").textContent = title;
  $("statusSub").textContent = sub;
  if (toast) $("toast").textContent = toast;
  $("toast").classList.toggle("show", !!toast);
}

// ---------- loop ----------
function frame(now: number) {
  if (tl && offset !== null && !stale) {
    // Run far enough ahead of the server that our inputs reach it before it simulates their tick.
    const target = Math.floor(now / TICK_MS + offset + rtt / TICK_MS + MARGIN - delay);
    if (target - tl.g.tick > 2 * TICK_HZ && now - lastSync > 1000) {
      lastSync = now;
      send({ type: "sync" }); // too far behind to catch up by simulating
    }
    let steps = 0;
    while (tl.g.tick < target && steps++ < MAX_STEPS) {
      const t = tl.g.tick + 1;
      if (me >= 0) {
        const input = held | tapped;
        tapped = 0;
        tl.setMine(t + delay, input);
        if (input !== lastSent) send({ type: "in", t: t + delay, i: (lastSent = input) });
      }
      tl.advance(t);
    }
    if (!steps) tl.advance(tl.g.tick); // still apply any corrections that came in
    shown = tl.g;
  }
  render(ctx, shown, seats());
  hud();
  requestAnimationFrame(frame);
}

connect();
requestAnimationFrame(frame);
