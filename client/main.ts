import { Timeline } from "../shared/netcode.ts";
import {
  ACT, BOMB, COLS, CURSES, DOWN, LEFT, MAPS, RIGHT, ROUND_TICKS, ROWS, TICK_HZ, TILE, UP, createGame, sideOf, tileAt, type Game, type Stats,
} from "../shared/sim.ts";
import { music, settings as audio, setPref, sfx, unlock } from "./audio.ts";
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
  "Pierce: blasts go straight through bushes",
  "Napalm: your fire burns for 2 seconds",
  "Skull: a random curse for 10 s. Touch someone to pass it on!",
  "Glove: X / Shift on (or facing) an orb throws it over walls",
  "Swap: instantly trade places with a random opponent",
];
const TEAM_NAMES = ["Teal & Green", "Red & Purple"]; // team = seat % 2
// End-of-match awards: [stat, title, how to say the number]. Only shown when someone scored at least 1.
const AWARDS: [keyof Stats, string, (n: number) => string][] = [
  ["kos", "Most knockouts", (n) => `${n} KO${n === 1 ? "" : "s"}`],
  ["comebacks", "Comeback kid", (n) => `back from the wall ×${n}`],
  ["curses", "Hot potato", (n) => `passed on ${n} curse${n === 1 ? "" : "s"}`],
  ["bushes", "Bush whacker", (n) => `${n} bush${n === 1 ? "" : "es"}`],
  ["pickups", "Collector", (n) => `${n} power-up${n === 1 ? "" : "s"}`],
  ["orbs", "Trigger happy", (n) => `${n} orb${n === 1 ? "" : "s"}`],
  ["oops", "Oops!", (n) => `own orb ×${n}`],
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
  settings: { map: number; teams: boolean; winRounds: number };
  tally: { name: string; wins: number; you: boolean }[];
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
    heard.clear(); // orb ids start again from 1 in a new match
    tossed.clear();
    lastAwards = [];
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
  if (!k || e.ctrlKey || e.metaKey || e.altKey || (e.target instanceof Element && e.target.closest("input, button, select"))) return;
  e.preventDefault();
  held |= k;
  tapped |= k;
});
addEventListener("keyup", (e) => (held &= ~keyOf(e)));
addEventListener("blur", () => (held = 0));
addEventListener("keydown", unlock); // browsers only start audio from a user gesture
addEventListener("pointerdown", unlock);

// Gamepads: any connected pad plays as you. D-pad or left stick moves, A drops an orb, B / X detonates.
// In the lobby, A or Start toggles ready.
const START = 64;
let padPrev = 0;
function padInput() {
  let bits = 0;
  for (const pad of navigator.getGamepads?.() ?? []) {
    if (!pad) continue;
    const b = (i: number) => !!pad.buttons[i]?.pressed;
    const [ax, ay] = [pad.axes[0] ?? 0, pad.axes[1] ?? 0];
    if (b(12) || ay < -0.5) bits |= UP;
    if (b(13) || ay > 0.5) bits |= DOWN;
    if (b(14) || ax < -0.5) bits |= LEFT;
    if (b(15) || ax > 0.5) bits |= RIGHT;
    if (b(0)) bits |= BOMB;
    if (b(1) || b(2)) bits |= ACT;
    if (b(9)) bits |= START;
  }
  return bits;
}

// ---------- sounds: worked out from what's drawn, so a rewind never plays one twice ----------
const heard = new Set<number>(); // orbs we've already played a drop for
const tossed = new Set<number>(); // ...and a gloved throw for
let lastOrbs = new Map<number, number>(); // orb id → tile, as drawn last frame
let lastAlive: boolean[] = [];
let lastPhase = "";
let lastHurry = false;
let lastKit: number[] = [];
let lastCurse = 0;
let lastTile = -1;
let backUntil = 0; // show "You're back in!" until then
function listen(g: Game) {
  for (const b of g.bombs) {
    if (!heard.has(b.id)) {
      heard.add(b.id);
      (g.players[b.owner]?.alive ? sfx.drop : sfx.lob)();
    }
    if (b.hops && !tossed.has(b.id)) {
      tossed.add(b.id);
      sfx.lob();
    }
  }
  const orbs = new Map(g.bombs.map((b) => [b.id, tileAt(b.x, b.y)]));
  if ([...lastOrbs].some(([id, tile]) => !orbs.has(id) && g.fire[tile] > 0)) sfx.boom(); // gone in flames, not just un-predicted
  lastOrbs = orbs;
  if (g.players.some((p, i) => lastAlive[i] && !p.alive)) sfx.ko();
  if (g.phase === "play" && lastPhase === "play" && g.players.some((p, i) => lastAlive[i] === false && p.alive)) {
    sfx.comeback(); // a ghost's orb got someone: they're back
    if (lastAlive[me] === false && g.players[me]?.alive) backUntil = performance.now() + 2000;
  }
  lastAlive = g.players.map((p) => p.alive);
  const mine = g.players[me];
  const tile = mine?.alive ? tileAt(mine.x, mine.y) : -1;
  const far = (a: number, b: number) => Math.abs((a % COLS) - (b % COLS)) + Math.abs(Math.floor(a / COLS) - Math.floor(b / COLS)) > 1;
  if (tile >= 0 && lastTile >= 0 && far(tile, lastTile)) sfx.whoosh(); // swapped or through a portal
  lastTile = tile;

  if (g.phase !== lastPhase && lastPhase) {
    if (g.phase === "ready") sfx.ready();
    else if (g.phase === "play") sfx.go();
    else if (me >= 0 && g.roundWinner >= 0 && sideOf(g, g.roundWinner) === sideOf(g, me)) sfx.win();
    else sfx.lose();
  }
  lastPhase = g.phase;
  const hurry = g.phase === "play" && g.roundTick >= ROUND_TICKS;
  if (hurry && !lastHurry) sfx.hurry();
  lastHurry = hurry;

  const p = g.players[me];
  const kit = p ? [p.bombs, p.range, p.speed, +p.kick, +p.remote, +p.shield, +p.pierce, +p.napalm] : [];
  if (p?.alive && kit.some((v, i) => v > lastKit[i])) sfx.pickup();
  lastKit = kit;
  if (p?.curse && !lastCurse) sfx.curse();
  lastCurse = p?.curse ?? 0;
}
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
const mapPick = $<HTMLSelectElement>("map");
const modePick = $<HTMLSelectElement>("mode");
const winsPick = $<HTMLSelectElement>("wins");
mapPick.append(...["Random", ...MAPS].map((name, i) => new Option(name, String(i - 1))));
mapPick.onchange = modePick.onchange = winsPick.onchange = () =>
  send({ type: "settings", map: Number(mapPick.value), teams: modePick.value === "teams", winRounds: Number(winsPick.value) });
const toggleReady = () => send({ type: "ready", ready: !lobby?.seats.find((s) => s?.you)?.ready });
$("ready").onclick = toggleReady;
for (const k of ["sound", "music"] as const) {
  const btn = $(`${k}Btn`);
  const show = () => {
    btn.textContent = `${k === "sound" ? "Sound" : "Music"} ${audio[k] ? "on" : "off"}`;
    btn.setAttribute("aria-pressed", String(audio[k]));
  };
  show();
  btn.onclick = () => {
    setPref(k, !audio[k]);
    show();
    btn.blur(); // so the arrow keys go back to the game
  };
}
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
      const who = s ? `${s.name}${s.you ? " (you)" : ""}: ${s.ready ? "ready" : "not ready"}` : l.bots ? "Bot" : "Empty";
      label.textContent = l.settings.teams ? `${who} · ${TEAM_NAMES[seat % 2]}` : who;
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
  $("tally").textContent = l.tally.length ? `Tonight: ${l.tally.map((e) => `${e.you ? "You" : e.name} ${e.wins}`).join(" · ")}` : "";
  showAwards($("lastAwards"), lastAwards);
  mapPick.value = String(l.settings.map);
  modePick.value = l.settings.teams ? "teams" : "ffa";
  winsPick.value = String(l.settings.winRounds);
  const mine = l.seats.find((s) => s?.you);
  const taken = l.seats.flatMap((s, seat) => (s || l.bots ? [seat] : []));
  $("ready").hidden = !mine;
  $("ready").textContent = mine?.ready ? "Not ready" : "Ready!";
  $("lobbyNote").textContent = l.countdown
    ? `Starting in ${l.countdown}…`
    : !mine
      ? "All seats are taken. You're watching."
      : taken.length < 2
        ? "Need 2 players: send the invite link, or turn on bots."
        : l.settings.teams && new Set(taken.map((s) => s % 2)).size < 2
          ? "2v2 needs someone on each team: change seats or turn on bots."
          : "Starts when everyone is ready.";
}

$("legend").append(
  ...ITEM_HELP.slice(1).map((text, k) => {
    const li = document.createElement("li");
    li.append(ITEM_TILES[k + 1]!, text);
    return li;
  })
);

// ---------- awards ----------
let lastAwards: string[] = []; // from the match that just ended, shown again in the lobby

function awards(g: Game) {
  return AWARDS.flatMap(([key, title, say]) => {
    const best = Math.max(...g.players.map((p) => p.stats[key]));
    if (best < 1) return [];
    const who = g.players.flatMap((p, i) => (p.stats[key] === best ? [nameOf(i)] : []));
    return [`${title}: ${who.join(" & ")} (${say(best)})`];
  });
}

function showAwards(list: HTMLElement, items: string[]) {
  list.replaceChildren(
    ...items.map((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    })
  );
}

// ---------- name tags: page text over the canvas, so they stay crisp at any size ----------
const PX = TILE / 16;
function nameTags(g: Game | null, drift: { x: number; y: number }[] = []) {
  const box = $("tags");
  const players = g?.players ?? [];
  while (box.children.length < players.length) box.append(document.createElement("span"));
  [...box.children].forEach((el, i) => {
    const tag = el as HTMLElement;
    const p = players[i];
    tag.hidden = !p || !(p.alive || p.ghost);
    if (tag.hidden) return;
    const d = drift[i] ?? { x: 0, y: 0 };
    const [text, cls] = [nameOf(i), `p${seats()[i] + 1}${p.alive ? "" : " ghost"}`];
    if (tag.textContent !== text) tag.textContent = text;
    if (tag.className !== cls) tag.className = cls;
    tag.style.left = `${((p.x + d.x) / PX / (COLS * 16)) * 100}%`;
    tag.style.top = `${(((p.y + d.y) / PX - 16) / (ROWS * 16)) * 100}%`;
  });
}

// ---------- HUD ----------
let lastHud = "";
function hud() {
  const g = shown;
  const inLobby = !!lobby && !lobby.playing;
  const hurry = g.roundTick >= ROUND_TICKS;
  const left = Math.max(0, Math.ceil((ROUND_TICKS - g.roundTick) / TICK_HZ));
  const timer = hurry ? "HURRY!" : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const team = (i: number) => g.opts.teams?.[i];
  const won = (i: number, what: string) =>
    g.opts.teams
      ? team(i) === team(me) ? `Your team wins the ${what}!` : `${TEAM_NAMES[team(i)!]} win the ${what}`
      : i === me ? `You win the ${what}!` : `${nameOf(i)} wins the ${what}`;
  const you = g.players[me];
  let [title, sub] = ["", ""];
  if (roomFull) [title, sub] = ["This room is full", "Open the page without ?room= to start your own."];
  else if (!connected) [title, sub] = [lobby ? "Connection lost" : "Connecting…", lobby ? "Reconnecting…" : "The server may take a minute to wake up."];
  else if (inLobby || !tl) title = "";
  else if (g.phase === "ready") [title, sub] = [`Round ${g.round}: ${MAPS[g.map]}`, "Ready…"];
  else if (g.phase === "result") title = g.roundWinner < 0 ? "Draw!" : won(g.roundWinner, "round");
  else if (g.phase === "over") [title, sub] = [won(g.matchWinner, "match"), "Back to the lobby in a moment…"];
  if (tl && g.phase === "over") lastAwards = awards(g);
  const toast =
    !tl || g.phase !== "play"
      ? ""
      : g.roundTick < 45
        ? "GO!"
        : performance.now() < backUntil
          ? "You're back in!"
          : you?.curse
          ? `Cursed: ${CURSES[you.curse]} (${Math.ceil(you.curseLeft / TICK_HZ)}s). Touch someone to pass it on!`
          : you?.ghost && g.endAt < 0
            ? "Ghost: run along the wall, Space lobs an orb in"
            : hurry && g.roundTick < ROUND_TICKS + 3 * TICK_HZ
              ? "Hurry! The walls are closing in"
              : "";
  const score = g.players.map((p, i) => `${seats()[i]}:${nameOf(i)}:${p.wins}:${p.alive || g.phase === "ready"}`).join(",");

  const shownAwards = tl && g.phase === "over" ? lastAwards : [];
  const key = [score, timer, title, sub, toast, inLobby, connected, me, shownAwards].join("|");
  if (key === lastHud) return;
  lastHud = key;
  showAwards($("awards"), shownAwards);
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
  const pad = padInput();
  const padPressed = pad & ~padPrev;
  padPrev = pad;
  if (padPressed & (BOMB | START) && connected && lobby && !lobby.playing) toggleReady();
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
        const input = (held | tapped | pad) & ~START;
        tapped = 0;
        tl.setMine(t + delay, input);
        if (input !== lastSent) send({ type: "in", t: t + delay, i: (lastSent = input) });
      }
      tl.advance(t);
    }
    if (!steps) tl.advance(tl.g.tick); // still apply any corrections that came in
    shown = tl.g;
    listen(shown);
    for (const d of tl.drift) {
      d.x *= 0.8; // ease rollback corrections out over a few frames
      d.y *= 0.8;
    }
  }
  music(audio.music); // lobby too, once the browser has allowed audio
  render(ctx, shown, seats(), tl?.drift);
  nameTags(tl && !(lobby && !lobby.playing) ? shown : null, tl?.drift);
  hud();
  requestAnimationFrame(frame);
}

connect();
requestAnimationFrame(frame);
