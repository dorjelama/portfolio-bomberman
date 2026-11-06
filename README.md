# Boom Orbs

A 4-player online bomb-maze brawl set in the Critter Catch world, made for playing with friends in the browser. Drop orbs, break bushes, grab power-ups, and be the last trainer standing. At 0:00 the walls close in.

**Status: milestone 4.** It's online, with invite links, a lobby and rollback netcode; bots fill empty seats. It has sound, music and gamepad support, and keeps score for the evening.

- **Maps:** Meadow; Ice Rink (you slide until you hit something); Factory (conveyor belts); Portal Garden (two linked pairs); Night Farm (you only see what your lantern, fire and lit orbs light up); Tractor Lane (two roads; arrows flash, then a tractor drives through and flattens whoever, and whatever orb, is in the way). Pick one in the lobby, or Random for a new map each round.
- **Games:**
  - Classic: last one standing.
  - Harvest: broken bushes drop carrots. A knockout spills half of yours and you're back at your corner 2 s later; most carrots at 0:00 wins.
  - Hot Potato: someone gets the potato at Go. Touch someone to pass it on before its 15 s run out.
- **Teams:** free-for-all, or 2v2 teams (teal + green vs red + purple). First to 1, 2, 3 or 5 round wins.
- **Revenge:** once knocked out, you ride the outer wall as a ghost and lob orbs in (one throw every 8 seconds; an orb over a ghost's head means it's ready). If your orb knocks out an opponent, you're back in their place, once per round: get knocked out again and you're out until the next round.
- **Rounds:** 1:30 by default, then sudden death: the walls close in, three a second.
- **Power-ups** (Skull, Swap and Gust are rare drops, so luck decides less):
  - Orb+, Fire+, Speed+, Kick, Shield, Remote
  - Pierce: blasts go through bushes
  - Napalm: your fire burns for 2 s
  - Skull: a random 10 s curse: reversed, sluggish, butterfingers (orbs drop by themselves, and Remote and Glove stop working) or fizzle, all passed on by touch; or robbed (you lose every power-up, and it can't be passed on)
  - Glove: pick up an orb and carry it overhead (its fuse waits), then throw it over walls the way you face; it wraps around the edge
  - Swap: trade places with a random opponent
  - Frost: your blasts leave ice for 5 s
  - Gust: every orb on the ground slides off the way you face
- **Awards** after each match: most knockouts, comeback kid, hot potato, bush whacker, collector, top farmer, trigger happy, and "Oops!" for knocking yourself out. Name tags above every trainer show who's who.
- **Feel:**
  - Sound effects and an original chiptune loop, synthesised in the browser (no audio files), with Sound and Music toggles.
  - Gamepads work.
  - Rollback corrections glide instead of snapping.
  - The lobby shows match wins for the evening.
  - Kill feed, "Close call!" when someone's blast just misses you, and an announcer (DOUBLE KO!, COMEBACK!, FINAL TWO!, OOPS!...). Each player switches these on or off for their own screen, next to the volume sliders.
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
- Gamepad: D-pad or left stick to move, A to drop, B or X to detonate. In the lobby, A or Start toggles ready.

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
