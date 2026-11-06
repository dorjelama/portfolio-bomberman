---
name: project-identity-proposals
description: Boom Orbs first creative audit (2026-11-06): which proposals the user accepted and had built, and which are still open
metadata:
  type: project
---

First full audit ran 2026-11-06. On 2026-11-06 the user accepted the top 3 ("first fix bugs, wording and colour pass, readable Hot Potato, nobody sits out") and they were built, uncommitted:

**Accepted and built**
- Players are **farmers** (name placeholder, server default name "Farmer", README). Breakable blocks are **crates** (Pierce text, Harvest help, README).
- "Critter Catch world" replaced by "on the farm, for playing with friends in the browser" (page meta, README, package.json).
- Awards: "Hot potato" -> **Bad apple** ("N hand-offs"), "Bush whacker" -> **Crate cracker**, "Top farmer" -> **Carrot top**.
- Seat colour only means a player: Shield ring white `rgb(244 244 244 / 0.8)`, Shield icon steel (R/r), Swap's lower arrow white, HURRY timer uses new CSS var `--fire: #ff6b4a`. PALETTE trimmed to k n N w o b R r P p Y y c B (comment says no seat colours in it).
- Crown: pixel CROWN_IMG in the lobby (room leader); in the arena it now only marks Harvest's carrot leader (unique, at least 1). The room leader is no longer crowned during play.
- Lobby "Mode" label -> "Teams" (Free-for-all / 2v2). "Kill feed" -> "KO feed".
- FFA winner's round/match title is tinted in their seat colour (2v2 stays yellow).
- Announcer: specific calls (OOPS!, FLATTENED!, KABOOM!...) beat FINAL TWO!; FIRST KO! fires every round; the callout moves to top 15% while the result card shows.
- Hot Potato: potato clamped on the top row (held beside the head when there's no room above); glows on Night Farm and the holder's tag always shows; `sfx.potato` on getting it; `sfx.potatoTick` at 180/150/120/90/60 then 45/30/15 ticks left; **KO credited to the last passer** ("Pema cooked Bot 2", +1 KO, none for a teammate pass); no fresh potato once the round is decided.
- Nobody sits out: **spite ghosts** (after the one comeback, you return to the rim; orbs still KO and score but no second comeback; toast "Ghost: no comeback, but your orbs still hit"). Ghosts see everyone on Night Farm. Harvest respawns play `sfx.respawn` instead of the comeback fanfare.

**Still open (not yet decided)**
- Robbed scatters your power-ups instead of deleting them.
- Tractor Lane: horn on warning, whole-road flash, squish when an orb is flattened.
- Gust: client-only whoosh and streaks.
- Toasts: one line on the fence row, shorter copy.
- Close-call sound. Internal renames (TRAINERS, drawTrainer, stats.bushes).
- Playtests in [[project-playtest-findings]]: potato passes per potato (bots flee the holder; holder speed step if under 2), late-Harvest dead time (crates regrowing).

**Why:** the art moved to the farm packs but the words stayed in Critter Catch; seat colour must only mean identity (pillar 3).
**How to apply:** don't re-pitch the accepted items; build on them. Before pitching an open item, check the code. See [[feedback-shared-browser]].
