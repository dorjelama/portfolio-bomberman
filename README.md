# Boom Orbs

A 4-player online bomb-maze brawl set in the Critter Catch world, made for playing with friends in the browser. Drop orbs, break bushes, grab power-ups, and be the last trainer standing. At 0:00 the walls close in.

**Status: milestone 3.** It's online, with invite links, a lobby and rollback netcode; bots fill empty seats.

- **Maps:** Meadow; Ice Rink (you slide until you hit something); Factory (conveyor belts); Portal Garden (two linked pairs). Pick one in the lobby, or Random for a new map each round.
- **Modes:** free-for-all, or 2v2 teams (teal + green vs red + purple). First to 1, 2, 3 or 5 round wins.
- **Revenge:** once knocked out, you ride the outer wall as a ghost and lob orbs in (one at a time). Nobody sits out.
- **Power-ups:** Orb+, Fire+, Speed+, Kick, Shield, Remote, Pierce (blasts through bushes), Napalm (2 s fire), and Skull (a random 10 s curse: reversed, sluggish, butterfingers or fizzle, passed on by touch).

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
- Detonate (with Remote): X or Shift

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
client/sprites.ts       pixel art (the trainer comes from Critter Catch)
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
4. **Feel:** sound, gamepads, smoothing for small rollback corrections, session scores
5. ~~Deploy: Render (Singapore) with CI, like Critter Catch~~
