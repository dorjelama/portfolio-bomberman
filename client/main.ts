import { Timeline } from "../shared/netcode.ts";
import {
  ACT, BOMB, BUTTERFINGERS, CHEAT_CODES, CHEAT_SHIFT, COLS, CROP, CURSES, DARK_TICKS, DEFAULT_DROP, DEFAULT_WEIGHTS, DOWN, FIRST_POTATO_TICKS, GHOST_RELOAD, GLOVE, HARVEST,
  HOLY_TICKS, LANES, LEFT, MAPS, MODES, NIGHT, POTATO_TICKS, REMOTE, RIGHT, ROBBED, ROUND_CHOICES, ROWS, SNAP_TICKS, TICK_HZ, TILE, TOPSY_TICKS, UP, cheatBlock, createGame, ghostReady, roundTicks, sideOf, tileAt, tractor,
  type Claim, type Game, type Knockout, type Stats,
} from "../shared/sim.ts";
import { music, setVolume, sfx, unlock, volume } from "./audio.ts";
import { CROWN_TOP, render } from "./render.ts";
import { COLORS, CROWN_IMG, ITEM_TILES, ORBS, TRAINERS } from "./sprites.ts";
import { button, releaseTouch, stick, touch } from "./touch.ts";

const TICK_MS = 1000 / TICK_HZ;
const MARGIN = 2; // extra ticks of lead, so jitter doesn't make our inputs late
const MAX_STEPS = 8; // ticks simulated per frame while catching up
// {act} is the Remote / Glove control: X / Shift on a keyboard, that power-up's own button on a touchscreen.
const ITEM_HELP = [
  "",
  "Orb+: carry one more orb at a time",
  "Fire+: blasts reach one tile further",
  "Speed+: walk faster",
  "Kick: walk into an orb to send it sliding",
  "Shield: survive one blast",
  "Remote: your orbs wait for {act}",
  "", // 7 was Pierce (removed): no checkbox, no legend
  "Napalm: your fire burns for 2 seconds",
  "Skull: a random 10 s curse you pass on by touch, or Robbed: you lose every power-up",
  "Glove: hold {act} by an orb to carry it, let go to throw it over walls",
  "Swap: instantly trade places with a random opponent",
  "Frost: your blasts leave ice for 5 seconds",
  "Gust: blows every orb on the ground the way you face",
];
const itemHelp = (id: number) => ITEM_HELP[id].replace("{act}", touchMode ? `the ${ITEM_HELP[id].split(":")[0]} button` : "X / Shift");
// Per game, by MODES index: the win condition first. One line for the lobby and the Ready screen, a little more for the Games panel.
const MODE_HINTS = [
  "Last one standing wins.",
  "Most carrots at 0:00 wins. Knocked out? You drop half.",
  "Last one standing wins. Bump into someone to pass the potato before it goes off!",
];
const MODE_HELP = [
  "Last one (or team) standing wins. At 0:00 the walls close in, or it's a draw with Sudden death off.",
  "Most carrots at 0:00 wins; teams add theirs up. Break crates to find carrots. Knocked out? You drop half and you're back 2 s later.",
  `Last one standing wins. Bump into someone to pass the potato; its timer keeps running. Whoever holds it at 0 is out. ` +
    `The one at Go has ${FIRST_POTATO_TICKS / TICK_HZ} s, later ones ${POTATO_TICKS / TICK_HZ} s. You run faster while you hold it, and there are fewer crates to dig through.`,
];
// What each cheat code does, by CHEAT_CODES index: for the Cheats panel and the tooltips in the cheat box.
const CHEAT_HELP = [
  "",
  `Blasts and tractors can't touch you for ${HOLY_TICKS / TICK_HZ} s, and your curse lifts. Walls and the potato still can. You get a halo.`,
  "Orbs, fire and speed to the top.",
  `Every opponent who isn't cursed gets Reversed for ${TOPSY_TICKS / TICK_HZ} s.`,
  "Every orb on the ground goes off, yours too.",
  "Six power-ups sprout on open ground (carrots too, in Harvest).",
  `The grass turns to ice for ${SNAP_TICKS / TICK_HZ} s.`,
  `Night Farm darkness for ${DARK_TICKS / TICK_HZ} s on everyone's screen but yours.`,
];
const TEAM_NAMES = ["Teal & Green", "Red & Purple"]; // team = seat % 2
// End-of-match awards: [stat, title, how to say the number]. Only shown when someone scored at least 1.
const AWARDS: [keyof Stats, string, (n: number) => string][] = [
  ["kos", "Most knockouts", (n) => `${n} KO${n === 1 ? "" : "s"}`],
  ["comebacks", "Comeback kid", (n) => `${n} comeback${n === 1 ? "" : "s"}`],
  ["curses", "Bad apple", (n) => `${n} hand-off${n === 1 ? "" : "s"}`], // curses and potatoes passed on
  ["bushes", "Crate cracker", (n) => `${n} crate${n === 1 ? "" : "s"}`],
  ["pickups", "Collector", (n) => `${n} power-up${n === 1 ? "" : "s"}`],
  ["crops", "Carrot top", (n) => `${n} carrot${n === 1 ? "" : "s"}`],
  ["orbs", "Trigger happy", (n) => `${n} orb${n === 1 ? "" : "s"}`],
  ["oops", "Oops!", (n) => `own orb ×${n}`],
  ["cheats", "Cheater!", (n) => `${n} cheat${n === 1 ? "" : "s"}`],
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

// ---------- display extras: each player switches these for their own screen ----------
const prefs = { feed: true, close: true, callout: true, buzz: true };
try {
  Object.assign(prefs, JSON.parse(storage.get(() => localStorage, "prefs") ?? "{}"));
} catch {}
for (const k of ["feed", "close", "callout", "buzz"] as const) {
  const box = $<HTMLInputElement>(`${k}Pref`);
  box.checked = !!prefs[k];
  box.onchange = () => {
    prefs[k] = box.checked;
    storage.set(() => localStorage, "prefs", JSON.stringify(prefs));
    box.blur(); // so Space goes back to the game
  };
}

// ---------- touchscreens: last input wins, so a phone with a gamepad, or a laptop with a touchscreen, gets what it's using ----------
let touchMode = matchMedia("(pointer: coarse)").matches;
const canBuzz = "vibrate" in navigator;
const vibrate = (pattern: number | number[]) => {
  if (touchMode && prefs.buzz && canBuzz) navigator.vibrate(pattern);
};
const flag = (name: string, on: boolean) => document.documentElement.classList.toggle(name, on);
function setTouch(on: boolean) {
  if (on === touchMode) return;
  touchMode = on;
  if (!on) releaseTouch();
  describeControls();
}
addEventListener("pointerdown", (e) => e.pointerType !== "mouse" && setTouch(true), true);
addEventListener("keydown", (e) => {
  // Typing in a field doesn't count: a phone's own keyboard is how you type a cheat.
  if (!(e.target instanceof Element && e.target.closest("input, select")) && !e.repeat) setTouch(false);
}, true);

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
  champ: boolean; // most match wins tonight, on their own: wears the crown
}
interface Lobby {
  code: string;
  seats: (LobbySeat | null)[];
  bots: boolean;
  settings: {
    map: number; teams: boolean; winRounds: number; roundSecs: number; revenge: boolean; shrink: boolean; items: number; mode: number; cheats: boolean;
    weights: number[]; drop: number; // power-up drop rates, by item id, and % of crates that drop one
  };
  tally: { name: string; wins: number; you: boolean }[];
  totals: { name: string; stats: Stats; you: boolean }[]; // award stats summed over every match in this room
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
    let settings = null;
    try {
      settings = JSON.parse(storage.get(() => localStorage, "settings") ?? "null");
    } catch {}
    send({ type: "hello", token: storage.get(() => sessionStorage, "token"), name: storage.get(() => localStorage, "name"), settings });
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
    storage.set(() => localStorage, "settings", JSON.stringify(m.settings)); // brought back if the room has to be recreated
    if (!m.playing) tl = null; // match over: freeze the last board behind the lobby
    showLobby();
  } else if (m.type === "start") {
    tl = new Timeline(m.g, m.you);
    heard.clear(); // orb ids start again from 1 in a new match
    tossed.clear();
    claimed.clear();
    typing = [];
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
  else if (m.type === "typing" && Number.isInteger(m.i) && typeof m.text === "string") {
    if (m.text.length > (typing[m.i]?.length ?? 0)) sfx.keystroke(); // someone's racing you to a code
    typing[m.i] = m.text;
  }
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
addEventListener("blur", () => {
  held = 0;
  releaseTouch();
});
addEventListener("keydown", unlock); // browsers only start audio from a user gesture
addEventListener("touchend", unlock); // iOS only counts the end of a tap
addEventListener("click", unlock);

// Touch: the stick and buttons (touch.ts) only make input bits.
stick($("stick"));
button($("orbBtn"), BOMB);
button($("actBtn"), ACT);
const liveTouch = () => touchMode && document.documentElement.classList.contains("live");
addEventListener("contextmenu", (e) => liveTouch() && e.preventDefault()); // a long press would open the menu
document.addEventListener("gesturestart", (e) => liveTouch() && e.preventDefault()); // iOS pinch-zoom


// ---------- cheats: typed codes, when the room allows them ----------
// Enter opens the box (your farmer stops: typing is a risk), Enter uses the code, Esc gives up. The code goes out as its
// index in one tick's input, so every client applies it on the same tick. Everyone sees what you type as you type it.
const cheatBox = $("cheatBox");
const cheatInput = $<HTMLInputElement>("cheatInput");
const cheatNote = $("cheatNote");
let cheatTap = 0;
let typing: string[] = []; // what each player has in their cheat box right now, by sim index (yours too)
const canType = () => !!tl && me >= 0 && !!shown.opts.cheats && shown.phase === "play";
function cheatSays(text: string, how: "" | "bad" | "good") {
  cheatNote.textContent = text;
  cheatBox.classList.remove("bad", "good");
  void cheatBox.offsetWidth; // restart the animation
  if (how) cheatBox.classList.add(how);
}
function setTyping(text: string) {
  if (me < 0 || typing[me] === text) return;
  typing[me] = text;
  send({ type: "typing", text });
}
function closeBox() {
  cheatInput.value = "";
  setTyping("");
  cheatInput.blur();
  cheatBox.classList.remove("open");
}
addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || !canType() || (e.target instanceof Element && e.target.closest("input, button, select"))) return;
  e.preventDefault();
  cheatInput.focus();
});
// On a touchscreen the box lives behind a Cheat button and opens over the top of the screen, clear of the keyboard.
// Putting the keyboard away closes it.
$("cheatBtn").onclick = () => {
  cheatBox.classList.add("open");
  cheatInput.focus();
};
cheatInput.onblur = () => {
  if (touchMode) closeBox();
};
cheatInput.onfocus = () => {
  held = tapped = 0; // stop walking while you type
  releaseTouch();
  cheatSays("", "");
};
cheatInput.oninput = () => {
  const text = cheatInput.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 12);
  if (text !== cheatInput.value) cheatInput.value = text; // only when it changed: rewriting mid-word confuses phone keyboards
  setTyping(text);
};
cheatInput.onkeydown = (e) => {
  if (e.key === "Escape") closeBox(); // a block, not an expression: an on- handler returning false cancels the key
};
cheatBox.onsubmit = (e) => {
  e.preventDefault();
  const cheat = CHEAT_CODES.indexOf(cheatInput.value);
  if (cheat < 1) {
    sfx.buzz();
    return cheatSays("Not a cheat", "bad"); // the box stays open for another go
  }
  const why = canType() ? cheatBlock(shown, me, cheat) : "out";
  const by = shown.claims.find((c) => c.cheat === cheat)?.by;
  if (why === "taken" && by !== me) cheatSays(`${nameOf(by!)} got there first`, "bad");
  else if (why === "taken" || why === "spent") cheatSays("One cheat a round", "bad");
  else if (why === "out") cheatSays(shown.players[me]?.ghost ? "Not while you're a ghost" : "Not while you're knocked out", "bad");
  else {
    cheatTap = cheat;
    cheatSays("", "good");
  }
  if (why) sfx.buzz();
  if (why && touchMode) flash(cheatNote.textContent ?? ""); // the box is about to close, so say why up top
  closeBox();
};

// The codes under the box. A claimed one is struck through with who has it; while someone types one, a bar in their
// colour fills under it.
let lastCodes = "";
function showCodes(g: Game) {
  const key = JSON.stringify([cheatBox.hidden, g.claims, typing, seats(), me, roster.map((r) => r.name)]);
  if (cheatBox.hidden || key === lastCodes) return;
  lastCodes = key;
  $("cheatCodes").replaceChildren(
    ...CHEAT_CODES.slice(1).map((code, k) => {
      const li = document.createElement("li");
      li.title = CHEAT_HELP[k + 1];
      const claim = g.claims.find((c) => c.cheat === k + 1);
      li.append(Object.assign(document.createElement("span"), { className: claim ? "claimed" : "", textContent: code }));
      if (claim) li.append(Object.assign(document.createElement("span"), { className: `p${seats()[claim.by] + 1}`, textContent: nameOf(claim.by) }));
      else {
        typing.forEach((t, i) => {
          if (!t || !code.startsWith(t)) return;
          const bar = Object.assign(document.createElement("i"), { className: `fill p${seats()[i] + 1}` });
          bar.style.width = `${(t.length / code.length) * 100}%`;
          li.append(bar);
        });
      }
      return li;
    })
  );
}
addEventListener("pointerdown", unlock);

// Gamepads: any connected pad plays as you. D-pad or left stick moves, A drops an orb, B / X detonates.
// In the lobby, A or Start toggles ready.
const START = 1 << 16; // not a game input: stripped before sending
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
let lastShrink = 0;
let lastTile = -1;
let lastFire: number[] = [];
let lastPotato = 0;
let lastBeat = ""; // which tick of the potato's countdown we last played
let lastWarn = false;
const claimed = new Set<string>(); // cheats we've already played the jingle for, by round and code
let backUntil = 0; // show "You're back in!" until then
let closeUntil = 0; // ...and "Close call!"
let [flashText, flashUntil] = ["", 0]; // ...and a one-off message
const flash = (text: string) => ([flashText, flashUntil] = [text, performance.now() + 2000]);
function listen(g: Game) {
  for (const b of g.bombs) {
    if (!heard.has(b.id)) {
      heard.add(b.id);
      if (!b.hops) (g.players[b.owner]?.alive ? sfx.drop : sfx.lob)(); // one already flying gets its lob just below
    }
    if (b.hops > 0 && !tossed.has(b.id)) {
      tossed.add(b.id);
      sfx.lob();
    }
  }
  const orbs = new Map(g.bombs.map((b) => [b.id, tileAt(b.x, b.y)]));
  if ([...lastOrbs].some(([id, tile]) => !orbs.has(id) && g.fire[tile] > 0)) sfx.boom(); // gone in flames, not just un-predicted
  lastOrbs = orbs;
  if (g.players.some((p, i) => lastAlive[i] && !p.alive)) sfx.ko();
  if (lastAlive[me] && !g.players[me]?.alive) vibrate([90, 50, 160]); // you're out: the only thing that buzzes
  if (g.phase === "play" && lastPhase === "play" && g.players.some((p, i) => lastAlive[i] === false && p.alive)) {
    (g.opts.mode === HARVEST ? sfx.respawn : sfx.comeback)(); // Harvest respawns are often: save the fanfare for a ghost's comeback
    if (lastAlive[me] === false && g.players[me]?.alive) backUntil = performance.now() + 2000;
  }
  lastAlive = g.players.map((p) => p.alive);
  const mine = g.players[me];
  const tile = mine?.alive ? tileAt(mine.x, mine.y) : -1;
  const far = (a: number, b: number) => Math.abs((a % COLS) - (b % COLS)) + Math.abs(Math.floor(a / COLS) - Math.floor(b / COLS)) > 1;
  if (tile >= 0 && lastTile >= 0 && far(tile, lastTile)) sfx.whoosh(); // swapped or through a portal
  lastTile = tile;
  // Close call: someone else's blast lands right next to you and you're still standing.
  const near = tile >= 0 && !g.fire[tile] ? [tile - COLS, tile + COLS, tile - 1, tile + 1] : [];
  if (prefs.close && near.some((i) => g.fire[i] && !lastFire[i] && g.fireBy[i] !== me)) closeUntil = performance.now() + 1200;
  lastFire = g.fire.slice();
  const warn = LANES.some((_, k) => tractor(g, k).warn);
  if (warn && !lastWarn) sfx.rumble();
  lastWarn = warn;

  if (g.phase !== lastPhase && lastPhase) {
    if (g.phase === "ready") sfx.ready();
    else if (g.phase === "play") sfx.go();
    else if (me >= 0 && g.roundWinner >= 0 && sideOf(g, g.roundWinner) === sideOf(g, me)) sfx.win();
    else sfx.lose();
  }
  lastPhase = g.phase;
  const hurry = g.phase === "play" && g.opts.shrink && g.roundTick >= roundTicks(g);
  if (hurry && !lastHurry) sfx.hurry();
  lastHurry = hurry;

  const p = g.players[me];
  const kit = p ? [p.bombs, p.range, p.speed, +p.kick, +p.remote, +p.shield, +p.napalm, +p.glove, +p.frost, p.crops] : [];
  if (p?.alive && kit.some((v, i) => v > lastKit[i])) sfx.pickup();
  lastKit = kit;
  if (p?.curse && !lastCurse) sfx.curse();
  lastCurse = p?.curse ?? 0;
  if (p?.potato && !lastPotato) sfx.potato();
  lastPotato = p?.potato ?? 0;
  // Everyone hears the potato's last 3 s: a tick every half second, then every quarter for the last one.
  const left = Math.max(0, ...g.players.map((q) => (q.alive ? q.potato : 0)));
  const beat = left > 0 && left <= 3 * TICK_HZ ? (left > TICK_HZ ? `s${Math.ceil(left / 30)}` : `f${Math.ceil(left / 15)}`) : "";
  if (beat && beat !== lastBeat) sfx.potatoTick(left <= TICK_HZ);
  lastBeat = beat;
  if (g.shrink > lastShrink) sfx.tick(g.shrink % 2 === 0); // a wall fell
  lastShrink = g.shrink;
  for (const c of g.claims) {
    const key = `${g.round}:${c.cheat}`;
    if (claimed.has(key)) continue;
    claimed.add(key);
    sfx.cheat(); // everyone hears it, with the shout
  }
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) return send({ type: "sync" });
  // Going to the background: stop walking (the server would repeat our last input) and stop simulating.
  stale = true;
  held = tapped = 0;
  releaseTouch();
  if (tl && me >= 0) send({ type: "in", t: tl.g.tick + delay, i: (lastSent = 0) });
});

// ---------- lobby ----------
const FACES = TRAINERS.map((dirs) => dirs[1][0].toDataURL());
const CROP_ICON = ITEM_TILES[CROP]!.toDataURL();
const CROWN_ICON = CROWN_IMG.toDataURL();
const nameInput = $<HTMLInputElement>("name");
nameInput.value = storage.get(() => localStorage, "name") ?? "";
nameInput.onchange = () => {
  storage.set(() => localStorage, "name", nameInput.value);
  send({ type: "name", name: nameInput.value });
};
$<HTMLInputElement>("bots").onchange = (e) => send({ type: "bots", on: (e.target as HTMLInputElement).checked });
const gamePick = $<HTMLSelectElement>("gameType");
const mapPick = $<HTMLSelectElement>("map");
const modePick = $<HTMLSelectElement>("mode");
const winsPick = $<HTMLSelectElement>("wins");
const timePick = $<HTMLSelectElement>("time");
const revengePick = $<HTMLInputElement>("revenge");
const shrinkPick = $<HTMLInputElement>("shrink");
const cheatsPick = $<HTMLInputElement>("cheats");
mapPick.append(...["Random", ...MAPS].map((name, i) => new Option(name, String(i - 1))));
gamePick.append(...MODES.map((name, i) => new Option(name, String(i))));
timePick.append(...ROUND_CHOICES.map((s) => new Option(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`, String(s))));
// One row per power-up: a checkbox to switch it on, a number for how often it comes up against the others that are on,
// and the share of drops that works out to.
const dropPick = $<HTMLInputElement>("drop");
const itemPicks = ITEM_HELP.flatMap((help, id) => {
  if (!help) return []; // no item 0, and retired ones
  const name = help.split(":")[0];
  const box = Object.assign(document.createElement("input"), { type: "checkbox" });
  const icon = Object.assign(new Image(), { src: ITEM_TILES[id]!.toDataURL(), alt: "" });
  const label = document.createElement("label");
  label.title = help;
  label.append(box, icon, name);
  const rate = Object.assign(document.createElement("input"), { type: "number", className: "rate", min: "0", max: "100", step: "0.5", inputMode: "decimal" });
  rate.setAttribute("aria-label", `How often ${name} drops`);
  const share = Object.assign(document.createElement("span"), { className: "share" });
  const row = Object.assign(document.createElement("div"), { className: "pick" });
  row.append(label, rate, share);
  $("itemPicks").append(row);
  return [{ id, box, rate, share }];
});
const percent = (v: string) => Math.min(100, Math.max(0, Number(v) || 0));
// Worked out from the boxes as they are, so it follows your typing before anything is sent.
function showShares() {
  const total = itemPicks.reduce((t, p) => t + (p.box.checked ? percent(p.rate.value) : 0), 0);
  for (const p of itemPicks) {
    p.rate.disabled = !p.box.checked;
    p.share.textContent = p.box.checked ? `${+((total ? percent(p.rate.value) / total : 0) * 100).toFixed(1)}%` : "off";
  }
}
const sendSettings = () =>
  send({
    type: "settings",
    map: Number(mapPick.value),
    teams: modePick.value === "teams",
    winRounds: Number(winsPick.value),
    roundSecs: Number(timePick.value),
    revenge: revengePick.checked,
    shrink: shrinkPick.checked,
    items: itemPicks.reduce((mask, { id, box }) => (box.checked ? mask | (1 << id) : mask), 0),
    weights: DEFAULT_WEIGHTS.map((_, id) => percent(itemPicks.find((p) => p.id === id)?.rate.value ?? "0")),
    drop: percent(dropPick.value),
    mode: Number(gamePick.value),
    cheats: cheatsPick.checked,
  });
for (const el of [gamePick, mapPick, modePick, winsPick, timePick, revengePick, shrinkPick, cheatsPick, dropPick, ...itemPicks.map((p) => p.rate)]) {
  el.onchange = sendSettings; // a number goes when you leave its box or press Enter, not on every key
}
for (const { box, rate } of itemPicks) {
  box.onchange = () => {
    showShares();
    sendSettings();
  };
  rate.oninput = showShares;
}
$("resetRates").onclick = () => {
  for (const p of itemPicks) [p.box.checked, p.rate.value] = [true, String(DEFAULT_WEIGHTS[p.id])];
  dropPick.value = String(DEFAULT_DROP);
  showShares();
  sendSettings();
};

// Rules open in their own card, in the lobby card's place.
const lobbyCard = $("lobbyCard");
const rulesCard = $("rulesCard");
const setRules = (open: boolean) => ([rulesCard.hidden, lobbyCard.hidden] = [!open, open]);
function showRules(open: boolean) {
  setRules(open);
  const card = open ? rulesCard : lobbyCard;
  $("lobby").scrollTop = 0; // the lobby over the arena scrolls on its own
  if (card.getBoundingClientRect().top < 0) card.scrollIntoView(); // on a small screen it's part of the page
  (open ? rulesCard.querySelector("h2")! : $("openRules")).focus({ preventScroll: true });
}
$("openRules").onclick = () => showRules(true);
$("closeRules").onclick = () => showRules(false);
rulesCard.addEventListener("keydown", (e) => e.key === "Escape" && showRules(false));

const toggleReady = () => send({ type: "ready", ready: !lobby?.seats.find((s) => s?.you)?.ready });
$("ready").onclick = toggleReady;
for (const k of ["sound", "music"] as const) {
  const slider = $<HTMLInputElement>(`${k}Vol`);
  slider.value = String(Math.round(volume[k] * 100));
  slider.oninput = () => setVolume(k, Number(slider.value) / 100);
  slider.onchange = () => {
    if (k === "sound") sfx.pickup(); // a quick sample at the new level
    slider.blur(); // so the arrow keys go back to the game
  };
}
// On a phone, the invite goes straight to the share sheet (WhatsApp, Messages...); elsewhere it's copied.
const canShare = () => touchMode && "share" in navigator;
$("copy").onclick = async () => {
  if (canShare()) {
    try {
      await navigator.share({ title: "Boom Orbs", text: "Come and play Boom Orbs with me", url: location.href });
    } catch {} // closed without sharing
    return;
  }
  try {
    await navigator.clipboard.writeText(location.href);
    $("copy").textContent = "Copied!";
  } catch {
    $("copy").textContent = location.href;
  }
};
// Full screen hides the browser's bars: more arena on a phone. iPhones don't offer it to pages, so there's no button.
const fullBtn = $("fullscreen");
fullBtn.hidden = !document.fullscreenEnabled;
fullBtn.onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
document.addEventListener("fullscreenchange", () => (fullBtn.textContent = document.fullscreenElement ? "Exit full screen" : "Full screen"));
$("buzzLabel").hidden = !canBuzz;

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
      if (s?.champ) label.prepend(Object.assign(new Image(), { className: "crown", src: CROWN_ICON, alt: "Most wins tonight", title: "Most wins tonight" }), " ");
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
  $("tally").textContent = l.tally.map((e) => `${e.you ? "You" : e.name} ${e.wins}`).join(" · ");
  // One awards list up front: the match that just ended (or tonight's, after a reload). Tonight's sits folded
  // underneath, and only when it says something different.
  const night = awards(l.totals.map((e) => ({ name: e.you ? "You" : e.name, stats: e.stats })));
  const top = lastAwards.length ? lastAwards : night;
  $("awardsHead").textContent = lastAwards.length ? "Last match awards" : "Awards tonight";
  showAwards($("lastAwards"), top);
  showAwards($("roomAwards"), night);
  $("nightAwards").hidden = JSON.stringify(night) === JSON.stringify(top);
  mapPick.value = String(l.settings.map);
  modePick.value = l.settings.teams ? "teams" : "ffa";
  winsPick.value = String(l.settings.winRounds);
  timePick.value = String(l.settings.roundSecs);
  revengePick.checked = l.settings.revenge;
  shrinkPick.checked = l.settings.shrink;
  cheatsPick.checked = l.settings.cheats;
  gamePick.value = String(l.settings.mode);
  $("gameHelp").textContent = `${MODE_HINTS[l.settings.mode] ?? ""}${l.settings.cheats ? " Cheats are on." : ""}`;
  revengePick.disabled = shrinkPick.disabled = l.settings.mode === HARVEST; // Harvest respawns you and runs to 0:00
  // A box you're typing in keeps your number until you leave it, when it's sent.
  const typingIn = (el: HTMLElement) => document.activeElement === el;
  for (const { id, box, rate } of itemPicks) {
    box.checked = !!(l.settings.items & (1 << id));
    if (!typingIn(rate)) rate.value = String(l.settings.weights[id] ?? 0);
  }
  if (!typingIn(dropPick)) dropPick.value = String(l.settings.drop);
  showShares();
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
  $("rulesNote").textContent = l.countdown ? `Starting in ${l.countdown}…` : "";
}

$("games").append(
  ...MODES.flatMap((name, i) => [
    Object.assign(document.createElement("dt"), { textContent: name }),
    Object.assign(document.createElement("dd"), { textContent: MODE_HELP[i] }),
  ])
);
$("cheatHelp").append(
  ...CHEAT_CODES.flatMap((code, i) =>
    i
      ? [Object.assign(document.createElement("dt"), { textContent: code }), Object.assign(document.createElement("dd"), { textContent: CHEAT_HELP[i] })]
      : []
  )
);
const legend = itemPicks.map(({ id }) => ({ id, text: document.createElement("span") }));
$("legend").append(
  ...legend.map(({ id, text }) => {
    const li = document.createElement("li");
    li.append(ITEM_TILES[id]!, text);
    return li;
  })
);

// Words that depend on what you play with: keys, or buttons on the screen.
function describeControls() {
  flag("touch", touchMode);
  for (const { id, text } of legend) text.textContent = itemHelp(id);
  for (const { id, box } of itemPicks) box.parentElement!.title = itemHelp(id);
  cheatInput.placeholder = touchMode ? "Type a code" : "Press Enter to type";
  $("cheatHow").textContent = touchMode
    ? "tap the Cheat button, type a code and tap Go"
    : "press Enter, type a code and press Enter again (Esc gives up)";
  $("copy").textContent = canShare() ? "Share invite link" : "Copy invite link";
  lastHud = lastPad = ""; // redraw: the toasts name keys or buttons
}

// ---------- awards ----------
interface Award {
  title: string;
  who: string;
  says: string;
}
let lastAwards: Award[] = []; // from the match that just ended, shown again in the lobby

function awards(players: { name: string; stats: Stats }[]): Award[] {
  return AWARDS.flatMap(([key, title, say]) => {
    const best = Math.max(...players.map((p) => p.stats[key]));
    const who = players.flatMap((p) => (p.stats[key] === best ? [p.name] : []));
    if (best < 1 || who.length > players.length / 2) return []; // shared by most of the room: nobody stood out
    return [{ title, who: who.join(" & "), says: say(best) }];
  });
}

// Two short lines each: the award, then who got it and for what.
function showAwards(list: HTMLElement, items: Award[]) {
  list.replaceChildren(
    ...items.map(({ title, who, says }) => {
      const li = document.createElement("li");
      li.append(title, Object.assign(document.createElement("span"), { textContent: `${who} · ${says}` }));
      return li;
    })
  );
}

// ---------- knockout log: "Pema KO'd Bot 2", "Bot 2's ghost KO'd you: Bot 2's back!" ----------
function sentence(k: Knockout) {
  const name = (i: number, start: boolean) => (i === me ? (start ? "You" : "you") : nameOf(i));
  const whose = (i: number) => (i === me ? "Your" : `${nameOf(i)}'s`);
  if (k.how === "wall") return `Walls crushed ${name(k.victim, false)}`;
  if (k.how === "tractor") return `Tractor ran over ${name(k.victim, false)}`;
  if (k.how === "potato") return k.by >= 0 ? `${name(k.by, true)} cooked ${name(k.victim, false)}` : `${whose(k.victim)} potato went off`;
  if (k.how === "self") return k.victim === me ? "You KO'd yourself" : `${nameOf(k.victim)} KO'd themselves`;
  const by = k.how === "ghost" ? `${whose(k.by)} ghost` : name(k.by, true);
  if (k.how === "team" && k.victim === me) return `Teammate ${by} KO'd you`; // not "KO'd teammate you"
  const text = `${by} KO'd ${k.how === "team" ? "teammate " : ""}${name(k.victim, false)}`;
  return k.back ? `${text}: ${k.by === me ? "you're" : `${nameOf(k.by)}'s`} back!` : text;
}

let lastLog = "";
function showLog(g: Game) {
  const key = `${JSON.stringify(g.log)}|${me}|${roster.map((r) => r.name)}`; // whole log: a rewind can swap an entry
  if (key === lastLog) return;
  lastLog = key;
  // Newest first, under one "Round N" line per round rather than a tag on every entry.
  const items: HTMLLIElement[] = [];
  let round = -1;
  for (const k of [...g.log].reverse()) {
    if (k.round !== round) {
      round = k.round;
      items.push(Object.assign(document.createElement("li"), { className: "round", textContent: `Round ${round}` }));
    }
    items.push(Object.assign(document.createElement("li"), { textContent: sentence(k) }));
  }
  $("matchLog").replaceChildren(...items);
}

// ---------- KO feed and announcer: worked out from the knockout log alone, so a rewind corrects them too ----------
const FEED_TICKS = 4 * TICK_HZ;
let lastFeed = "";
// One line per cheat typed: "Pema flipped everyone".
function cheatLine(g: Game, c: Claim) {
  const who = c.by === me ? "You" : nameOf(c.by);
  return [
    "",
    `${who} ${c.by === me ? "are" : "is"} untouchable for ${HOLY_TICKS / TICK_HZ}s`,
    `${who} maxed out`,
    `${who} flipped everyone`,
    `${who} set off every orb`,
    `${who} made ${g.opts.mode === HARVEST ? "carrots and power-ups" : "power-ups"} sprout`,
    `${who} froze the farm`,
    `${who} hit the lights`,
  ][c.cheat];
}

function showFeed(g: Game) {
  const fresh = (tick: number) => g.tick - tick < FEED_TICKS;
  const kos = g.log.filter((k) => fresh(k.tick)).map((k) => ({ tick: k.tick, text: sentence(k) }));
  const cheats = g.claims.filter((c) => fresh(c.tick)).map((c) => ({ tick: c.tick, text: cheatLine(g, c) }));
  const recent = tl && prefs.feed ? [...kos, ...cheats].sort((a, b) => a.tick - b.tick).slice(-4).reverse() : [];
  const lines = recent.map((e) => e.text);
  if (lines.join("|") === lastFeed) return;
  lastFeed = lines.join("|");
  $("feed").replaceChildren(...lines.map((text) => Object.assign(document.createElement("li"), { textContent: text })));
}

const KO_CALLS: Partial<Record<Knockout["how"], string>> = {
  self: "OOPS!", team: "FRIENDLY FIRE!", wall: "CRUSHED!", potato: "KABOOM!", tractor: "FLATTENED!",
};
// A knockout's shout beats a cheat's.
const CHEAT_SHOUTS = ["", "HOLY COW!", "BUMPER CROP!", "TOPSY-TURVY!", "POPCORN!", "RAIN DANCE!", "COLD SNAP!", "LIGHTS OUT!"];
function callout(g: Game) {
  const c = g.claims.at(-1);
  return koCall(g) || (c && g.tick - c.tick < 2 * TICK_HZ ? CHEAT_SHOUTS[c.cheat] : "");
}

function koCall(g: Game) {
  const k = g.log.at(-1);
  if (!k || g.tick - k.tick >= 2 * TICK_HZ) return "";
  const scored = (e: Knockout) => (e.how === "orb" || e.how === "ghost") && e.by === k.by && k.tick - e.tick < 3 * TICK_HZ;
  const streak = g.log.filter(scored).length;
  if (scored(k) && streak >= 2) return streak >= 3 ? "TRIPLE KO!" : "DOUBLE KO!";
  if (k.back) return "COMEBACK!";
  const special = KO_CALLS[k.how]; // how it happened beats who's left: a tractor KO is FLATTENED!, even down to the final two
  if (special) return special;
  const standing = g.players.filter((p) => p.alive).length;
  if (!g.opts.teams && g.opts.mode !== HARVEST && g.players.length > 2 && standing === 2) return "FINAL TWO!";
  return g.log.filter((e) => e.round === g.round).length === 1 ? "FIRST KO!" : "";
}

let lastCall = "";
function showCallout(g: Game) {
  const call = tl && prefs.callout ? callout(g) : "";
  if (call === lastCall) return;
  lastCall = call;
  const el = $("callout");
  el.textContent = call;
  el.classList.remove("pop");
  if (!call) return;
  void el.offsetWidth; // restart the pop animation
  el.classList.add("pop");
  if (!CHEAT_SHOUTS.includes(call)) sfx.announce(); // a cheat has its own jingle
}

// ---------- name tags: page text over the canvas, so they stay crisp at any size ----------
const PX = TILE / 16;
function nameTags(g: Game | null, drift: { x: number; y: number }[] = []) {
  const box = $("tags");
  const players = g?.players ?? [];
  while (box.children.length < players.length) box.append(document.createElement("span"));
  const crown = g ? crowned(g) : -1;
  // Night Farm, or LIGHTS OUT on your screen: tags would give the others away (ghosts see all: they aim)
  const dark = !!g && (g.map === NIGHT || (g.dark > 0 && g.darkBy !== me)) && !!g.players[me]?.alive;
  [...box.children].forEach((el, i) => {
    const tag = el as HTMLElement;
    const p = players[i];
    tag.hidden = !p || !(p.alive || p.ghost) || (dark && i !== me && !p.potato); // whoever has the potato always shows
    if (tag.hidden) return;
    const d = drift[i] ?? { x: 0, y: 0 };
    const potato = p.potato ? ` · ${Math.ceil(p.potato / TICK_HZ)}s` : "";
    const typed = typing[i] ? `: ${typing[i]}▌` : ""; // what they're typing in the cheat box, for all to see
    const [text, cls] = [nameOf(i) + potato + typed, `p${seats()[i] + 1}${p.alive ? "" : " ghost"}`];
    if (tag.textContent !== text) tag.textContent = text;
    if (tag.className !== cls) tag.className = cls;
    tag.style.left = `${((p.x + d.x) / PX / (COLS * 16)) * 100}%`;
    const lift = p.carry ? 28 : i === crown || p.god ? CROWN_TOP + 2 : 16; // above a carried orb, the crown or the halo
    tag.style.top = `${(Math.max(7, (p.y + d.y) / PX - lift) / (ROWS * 16)) * 100}%`; // kept on the canvas for the top row
  });
}

// The arena's crown: Harvest's carrot leader, so the late round has someone to hunt. Only once they've pulled
// clearly ahead, so a single early carrot doesn't crown anyone.
const CROWN_LEAD = 3; // carrots ahead of everyone else
function crowned(g: Game) {
  if (g.opts.mode !== HARVEST) return -1;
  const [first, second] = g.players.map((p, i) => ({ i, crops: p.crops })).sort((a, b) => b.crops - a.crops);
  return first && first.crops - (second?.crops ?? 0) >= CROWN_LEAD ? first.i : -1;
}

// ---------- HUD ----------
// Scoreboard card: face, name (white, so it reads on the dark panel), and round wins as pips out of the target.
function scoreCard(g: Game, i: number, inPlay: boolean) {
  const seat = seats()[i];
  const card = document.createElement("div");
  card.className = `card p${seat + 1}${inPlay ? "" : " out"}${i === me ? " you" : ""}`;
  const face = new Image();
  face.src = FACES[seat];
  face.alt = "";
  const who = document.createElement("span");
  who.className = "who";
  who.textContent = nameOf(i);
  const wins = g.players[i].wins;
  const pips = document.createElement("span");
  pips.className = "pips";
  pips.setAttribute("aria-label", `${wins} of ${g.opts.winRounds} round wins`);
  for (let k = 0; k < g.opts.winRounds; k++) pips.append(Object.assign(document.createElement("i"), { className: k < wins ? "won" : "" }));
  const typed = Object.assign(document.createElement("span"), { className: "typed", textContent: `${typing[i]}▌` });
  card.append(face, who, typing[i] ? typed : pips); // what they're typing in the cheat box, readable even on Night Farm
  if (g.opts.mode === HARVEST) {
    const crops = Object.assign(document.createElement("span"), { className: "crops", textContent: String(g.players[i].crops) });
    crops.prepend(Object.assign(new Image(), { src: CROP_ICON, alt: "crops:" }));
    card.append(crops);
  }
  return card;
}

let lastHud = "";
function hud() {
  const g = shown;
  const inLobby = !!lobby && !lobby.playing;
  const limit = roundTicks(g);
  const hurry = g.opts.shrink && g.roundTick >= limit;
  const left = Math.max(0, Math.ceil((limit - g.roundTick) / TICK_HZ));
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
  else if (g.phase === "ready") {
    [title, sub] = [`Round ${g.round}: ${MAPS[g.map]}`, `${MODE_HINTS[g.opts.mode] ?? "Ready…"}${g.opts.cheats ? " Cheats are on." : ""}`];
  }
  else if (g.phase === "result") title = g.roundWinner < 0 ? "Draw!" : won(g.roundWinner, "round");
  else if (g.phase === "over") [title, sub] = [won(g.matchWinner, "match"), "Back to the lobby in a moment…"];
  // A free-for-all winner's title is in their seat colour (a 2v2 title names two colours, so it stays yellow).
  const winner = g.phase === "over" ? g.matchWinner : g.phase === "result" ? g.roundWinner : -1;
  const tint = tl && !inLobby && !g.opts.teams && winner >= 0 ? COLORS[seats()[winner]] : "";
  if (tl && g.phase === "over") lastAwards = awards(g.players.map((p, i) => ({ name: nameOf(i), stats: p.stats })));
  const toast =
    !tl || g.phase !== "play"
      ? ""
      : g.roundTick < 45
        ? "GO!"
        : performance.now() < flashUntil
        ? flashText
        : me < 0 && touchMode
        ? "Watching: you can join after this match" // there's no room for the line under the arena
        : performance.now() < backUntil
          ? "You're back in!"
          : performance.now() < closeUntil
          ? "Close call!"
          : you?.potato
          ? `You have the potato! Touch someone (${Math.ceil(you.potato / TICK_HZ)}s)`
          : you?.curse
          ? you.curse === ROBBED
            ? "Robbed! You lost every power-up"
            : `Cursed: ${CURSES[you.curse]} (${Math.ceil(you.curseLeft / TICK_HZ)}s). Touch someone to pass it on!`
          : you?.ghost
            ? you.returned
              ? "Ghost: no comeback, but your orbs still hit" // a spite ghost: already came back once this round
              : ghostReady(g, you)
              ? `Ghost: run along the wall, ${touchMode ? "tap Orb to lob one in" : "Space lobs an orb in"}`
              : `Ghost: run along the wall. Next orb in ${Math.ceil((GHOST_RELOAD - (g.tick - Math.max(you.threwAt, you.diedAt))) / TICK_HZ)}s`
            : hurry && g.roundTick < limit + 3 * TICK_HZ
              ? "Hurry! The walls are closing in"
              : "";
  const score = g.players.map((p, i) => `${seats()[i]}:${nameOf(i)}:${p.wins}:${p.alive || g.phase === "ready"}:${p.crops}:${typing[i] ?? ""}`).join(",");

  const shownAwards = tl && g.phase === "over" ? lastAwards : [];
  const cheats = !!tl && !inLobby && me >= 0 && !!g.opts.cheats;
  const key = [score, g.opts.winRounds, timer, title, tint, sub, toast, inLobby, connected, me, JSON.stringify(shownAwards), cheats, touchMode].join("|");
  if (key === lastHud) return;
  lastHud = key;
  flag("inlobby", connected && inLobby); // on a small screen the lobby then takes the arena's place
  showAwards($("awards"), shownAwards);
  cheatBox.hidden = !cheats;
  $("board").hidden = inLobby || !tl;
  $("timer").textContent = timer;
  $("timer").classList.toggle("hurry", hurry);
  // One card per player, split either side of the timer: by team in 2v2, otherwise first half / second half.
  // A phone held sideways puts each half in its own column, either side of the arena.
  const onLeft = (i: number) => (g.opts.teams ? g.opts.teams[i] === 0 : i < g.players.length / 2);
  const cards = g.players.map((p, i) => scoreCard(g, i, p.alive || g.phase === "ready"));
  cards.forEach((card, i) => card.classList.add(onLeft(i) ? "l" : "r"));
  $("board").replaceChildren(...cards.filter((_, i) => onLeft(i)), $("timer"), ...cards.filter((_, i) => !onLeft(i)));
  $("who").textContent = tl && !inLobby && me < 0 ? "Watching: you can join after this match." : "";
  $("lobby").hidden = !connected || !inLobby;
  if ($("lobby").hidden) setRules(false); // back from a match to the seats, not the rules
  $("status").hidden = !title;
  $("statusText").textContent = title;
  $("statusText").style.color = tint;
  $("statusSub").textContent = sub;
  if (toast) $("toast").textContent = toast;
  $("toast").classList.toggle("show", !!toast);
}

// Touch buttons: Orb shows how many orbs you have left and dims when it can't drop one (or, as a ghost, until your next
// throw). The Remote / Glove button only shows once you have one of them, with its icon, and dims under Butterfingers.
$<HTMLImageElement>("orbIcon").src = ORBS[0].toDataURL();
$<HTMLImageElement>("remoteIcon").src = ITEM_TILES[REMOTE]!.toDataURL();
$<HTMLImageElement>("gloveIcon").src = ITEM_TILES[GLOVE]!.toDataURL();
let lastPad = "";
function padState(g: Game) {
  const p = g.players[me];
  const fumble = p?.curse === BUTTERFINGERS;
  const left = p?.alive ? Math.max(0, p.bombs - g.bombs.filter((b) => b.owner === me).length) : -1;
  const orb = !!p && g.phase === "play" && (p.alive ? left > 0 && !fumble : p.ghost && ghostReady(g, p));
  const [remote, glove] = [!!p?.alive && p.remote, !!p?.alive && p.glove];
  const key = [orb, left, remote, glove, fumble, canType()].join();
  if (key === lastPad) return;
  lastPad = key;
  $("orbBtn").classList.toggle("off", !orb);
  $("orbsLeft").textContent = left >= 0 ? String(left) : "";
  $("actBtn").classList.toggle("none", !remote && !glove);
  $("actBtn").classList.toggle("off", fumble);
  $("remoteIcon").hidden = !remote;
  $("gloveIcon").hidden = !glove;
  $("cheatBtn").hidden = !canType();
}

// ---------- loop ----------
function frame(now: number) {
  const pad = padInput();
  const padPressed = pad & ~padPrev;
  padPrev = pad;
  if (pad) setTouch(false); // picked up a gamepad: put the on-screen controls away
  if (padPressed & (BOMB | START) && connected && lobby && !lobby.playing) toggleReady();
  // In a match (playing or watching): on a touchscreen the page becomes the game, see index.html.
  const live = !!tl && !(lobby && !lobby.playing);
  if (live !== document.documentElement.classList.contains("live")) {
    flag("live", live);
    releaseTouch();
    if (live) scrollTo(0, 0);
  }
  flag("watching", me < 0);
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
        const input = ((held | tapped | pad | touch.bits | touch.tapped) & ~START) | (cheatTap << CHEAT_SHIFT);
        tapped = cheatTap = touch.tapped = 0;
        tl.setMine(t + delay, input);
        if (input !== lastSent) send({ type: "in", t: t + delay, i: (lastSent = input) });
      }
      tl.advance(t);
    }
    if (!steps) tl.advance(tl.g.tick); // still apply any corrections that came in
    shown = tl.g;
    listen(shown);
    if (shown.phase !== "play" && typing.some(Boolean)) typing = []; // the round's over: half-typed codes go too
    for (const d of tl.drift) {
      d.x *= 0.8; // ease rollback corrections out over a few frames
      d.y *= 0.8;
    }
  }
  music(volume.music > 0); // lobby too, once the browser has allowed audio
  if (!canType() && (cheatInput.value || document.activeElement === cheatInput || cheatBox.classList.contains("open"))) closeBox();
  if (live && touchMode) padState(shown);
  render(ctx, shown, seats(), tl?.drift, me, crowned(shown));
  nameTags(tl && !(lobby && !lobby.playing) ? shown : null, tl?.drift);
  hud();
  showLog(shown);
  showFeed(shown);
  showCallout(shown);
  showCodes(shown);
  requestAnimationFrame(frame);
}

describeControls();
connect();
requestAnimationFrame(frame);
