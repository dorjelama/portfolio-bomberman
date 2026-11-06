# Boom Orbs

A 4-player online bomb-maze brawl on the farm, made for playing with friends in the browser. Drop orbs, break crates, grab power-ups, and be the last farmer standing. At 0:00 the walls close in.

**Status: milestone 4.** It's online, with invite links, a lobby and rollback netcode; bots fill empty seats. It has sound, music and gamepad support, and keeps score for the evening.

- **Maps:** Meadow; Ice Rink (you slide until you hit something); Factory (conveyor belts); Portal Garden (two linked pairs); Night Farm (you only see what your lantern, fire and lit orbs light up); Tractor Lane (two roads; arrows flash, then a tractor drives through and flattens whoever, and whatever orb, is in the way). Pick one in the lobby, or Random for a new map each round.
- **Games:**
  - Classic: last one standing.
  - Harvest: broken crates drop carrots. A knockout spills half of yours and you're back at your corner 2 s later; most carrots at 0:00 wins. Whoever is 3 or more ahead wears the crown.
  - Hot Potato: someone gets the potato at Go. Touch someone to pass it on before its 15 s run out; it ticks for the last 3 s. If it goes off on someone you passed it to, the knockout is yours ("Pema cooked Bot 2"), unless they're your teammate. It glows on Night Farm.
- **Teams:** free-for-all, or 2v2 teams (teal + green vs red + purple). First to 1, 2, 3 or 5 round wins.
- **Revenge:** once knocked out, you ride the outer wall as a ghost and lob orbs in (one throw every 8 seconds; an orb over a ghost's head means it's ready). If your orb knocks out an opponent, you're back in their place, once per round. Get knocked out again and you're a spite ghost: back on the wall, and your orbs still knock people out and score, but they can't bring you back. Ghosts see everyone on Night Farm.
- **Rounds:** 1:30 by default, then sudden death: the walls close in, three a second.
- **Power-ups** (Skull, Swap and Gust are rare drops, so luck decides less):
  - Orb+, Fire+, Speed+, Kick, Shield, Remote
  - Pierce: blasts go through crates
  - Napalm: your fire burns for 2 s
  - Skull: a random 10 s curse: reversed, sluggish, butterfingers (orbs drop by themselves, and Remote and Glove stop working) or fizzle, all passed on by touch; or robbed (you lose every power-up, and it can't be passed on)
  - Glove: pick up an orb and carry it overhead (its fuse waits), then throw it over walls the way you face; it wraps around the edge
  - Swap: trade places with a random opponent
  - Frost: your blasts leave ice for 5 s
  - Gust: every orb on the ground slides off the way you face
- **Awards** after each match: most knockouts, comeback kid, bad apple (curses and potatoes passed on), crate cracker, collector, carrot top, trigger happy, "Oops!" for knocking yourself out, and "Cheater!". Name tags above every farmer show who's who.
- **Feel:**
  - Sound effects and an original chiptune loop, synthesised in the browser (no audio files), with Sound and Music toggles.
  - Gamepads work.
  - Phones and tablets work: touch controls, an arena that fills the screen either way up, and a little buzz on Android (Vibrate in the header turns it off). See Controls below.
  - Rollback corrections glide instead of snapping.
  - The lobby shows match wins for the evening.
  - KO feed, "Close call!" when someone's blast just misses you, and an announcer (DOUBLE KO!, COMEBACK!, FINAL TWO!, OOPS!...). Each player switches these on or off for their own screen, next to the volume sliders.
- **Cheats** (a room rule, off by default): type codes during a match. Press Enter, type, and press Enter again (Esc gives up). Your farmer stands still while you type, and everyone sees what you're typing, letter by letter, in your name tag and on the scoreboard. Each code works once a round, for whoever types it first, and each player gets one a round. A knockout's shout beats a cheat's.
  - HOLYCOW: blasts and tractors can't touch you for 10 s (walls and the potato still can), and your curse lifts. A halo shows over your hat.
  - BUMPERCROP: orbs, fire and speed to the top.
  - TOPSYTURVY: every opponent who isn't cursed gets Reversed for 6 s.
  - POPCORN: every orb on the ground goes off, yours too.
  - RAINDANCE: six power-ups sprout on open ground (carrots too, in Harvest).
  - COLDSNAP: the grass turns to ice for 8 s.
  - LIGHTSOUT: Night Farm darkness for 8 s on everyone's screen but yours.
  - HOLYCOW and BUMPERCROP need you standing; the other five work from the rim as a ghost. A code goes in as part of one tick's input, so rollback keeps everyone in sync.
- **Everything is switchable:** the Game and Map pickers, a checkbox per power-up (the Skull covers every curse), and the room rules.

## Run it

```bash
npm install
npm run dev     # builds the client on every change and runs the server: http://localhost:8000
npm test        # rules + netcode tests (node:test)
npm run check   # type-check
npm run build   # production: public/main.js + dist/server.js
npm start       # runs the production build
```

To play:
1. Open the page. Its URL is your room, so copy the invite link and send it to friends.
2. Everyone picks a seat and hits **Ready**. Empty seats get bots unless you untick that option.
3. Friends on the same Wi-Fi can join through your local IP at port 8000.

Controls:
- Move: arrows or WASD
- Drop an orb: Space or Z
- Detonate (with Remote), or hold to carry and let go to throw (with Glove): X or Shift
- Cheats, when the room turns them on: Enter to type a code, Enter to use it, Esc to give up
- Gamepad: D-pad or left stick to move, A to drop, B or X to detonate. In the lobby, A or Start toggles ready.
- Touchscreen (`client/touch.ts`):
  - Move: put your left thumb down anywhere left of the arena (or under it, upright) and slide. The stick appears where your thumb lands and follows it. Rolling your thumb towards a corner pre-turns, like holding two keys.
  - Orb: the round button on the right. Its badge counts the orbs you have left, and it dims when you can't drop one.
  - Remote / Glove: the button above Orb. It appears once you pick one up.
  - Cheats: the Cheat button opens a box at the top. Type, then tap Go; putting the keyboard away gives up.
  - During a match the page becomes the game: no scrolling or zooming. Sideways gives the biggest arena, with the scoreboard and controls either side. Upright puts them above and below. On Android, Full screen in the header hides the browser bars (iPhones don't allow it).
  - Invite links open the share sheet. Whatever you last used wins: press a key or a gamepad button and the touch controls go away; touch the screen and they're back.

## How it stays in sync

Rollback netcode with the server as the clock:

- **Inputs only.** Clients send key changes stamped with a tick (about 1 byte of game data each). The server runs the same deterministic rules (`shared/sim.ts`) at 60 Hz, puts the inputs in order and broadcasts the confirmed inputs for every tick.
- **Prediction.** Your client runs a little ahead of the server, so your own moves feel instant. For everyone else, it guesses they keep pressing what they last pressed.
- **Rollback.** When the confirmed inputs differ from the guess, the client reloads the state saved at that tick and replays to now. Every client sees the same explosions on the same tick.
- **Late input.** It lands on the next open tick, in order, so a quick tap is never lost.
- **Desync repair.** Every 2 s the server sends its full state, and clients quietly adopt it.
- **Drop-outs.** If someone disconnects mid-match, a bot plays for them until they come back; a reload gets your seat back. People who join mid-match watch until the next one.

## Layout

```
shared/sim.ts           game rules: pure and deterministic
shared/bot.ts           bot players (they only produce inputs, like a keyboard)
shared/netcode.ts       InputQueue (server) and Timeline (client prediction + rollback)
shared/*.test.ts        rules, determinism, and a server + laggy clients simulated in one process
server/main.ts          static files, rooms, lobby, 60 Hz match loop
server/dev.ts           dev entry: esbuild watch + server
client/main.ts          input, connection, lobby, HUD, frame loop
client/touch.ts         touch controls: the stick and the Orb and Remote / Glove buttons
client/render.ts        drawing
client/audio.ts         synthesised sound effects + music loop
client/sprites.ts       pixel art for orbs and icons; cuts the arena tiles and players out of client/art
client/art/             arena tiles and the farmer (players) from free packs: Harvest Summer (SnowHex), Super Retro Ranch (Gif); inlined into main.js
public/index.html       the page
```

## Deploy (Render free tier, Singapore) and CI

`.github/workflows/ci.yml` runs the type check, tests and build on every push and pull request. On `main`, it then triggers a Render deploy, so a failing commit never goes live.

1. Push this folder to a GitHub repo.
2. On Render, choose **New → Blueprint** and pick the repo. `render.yaml` sets everything up (Singapore region, free plan), and Render provides `PORT`.
3. In the Render service, copy the deploy hook URL from **Settings → Deploy Hook**. Add it to the GitHub repo as the Actions secret `RENDER_DEPLOY_HOOK_URL`.
4. The free tier sleeps when idle, so the first visit can take up to a minute to wake it. Open the link a minute before game night.

Rooms live in memory in one process, so a deploy or restart ends any match in progress.

## Roadmap

1. ~~Offline game: rules, bots, 6 power-ups, shrinking arena~~
2. ~~Online: rollback netcode over a WebSocket server, invite links, lobby, bots in empty seats, reconnect~~
3. ~~Content: revenge mode, maps with hazards, more power-ups, 2v2 teams, room settings~~
4. ~~Feel: sound, gamepads, smoothing for small rollback corrections, session scores~~
5. ~~Deploy: Render (Singapore) with CI, like Critter Catch~~
