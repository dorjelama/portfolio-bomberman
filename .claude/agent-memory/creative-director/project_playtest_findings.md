---
name: project-playtest-findings
description: What bot playtests on 2026-11-06 showed about Harvest, Hot Potato, Night Farm and Tractor Lane feel, and the open playtests that would settle them
metadata:
  type: project
---

Observed 2026-11-06 (1 human idling + 3 bots):
- Hot Potato on Night Farm: zero passes in a whole potato. Bots flee the holder (bot.ts marks the holder's reach as danger) and the holder can't see anyone in the dark. Potato sprite and name tag are clipped off-canvas for players on row 1 (teal and green spawn row).
- Night Farm: ghosts only see their own lantern, so they can't aim from the rim.
- Harvest 1:00 round: all crates gone by about 0:15 left; the tail is only spills. Every Harvest respawn plays the revenge comeback fanfare and "You're back in!".
- Announcer callout ("OOPS!") overlaps the "X wins the match" title when the last KO ends the match.
- Persistent toasts (potato 15 s, ghost 8 s, curse 10 s) cover the top-middle of the arena.

Open playtests (not yet run with humans):
- Hot Potato, 2 humans + 2 bots on Meadow: passes per potato; under 2 on average -> give the holder +1 speed step. **Settled 2026-11-06 by a bot sim:** the first potato was never passed in ~92% of rounds (corners + 75% crates + 15 s), so the user asked for a revamp. Built (uncommitted): 40% crates in Hot Potato, 25 s fuse for the one at Go (15 s after a knockout), holder +1 speed step. Bots then passed the first potato in ~97% of rounds on Meadow and ~90% on random maps. Still worth a human check: does 40% crates make power-ups too scarce?
- Harvest, Meadow 1:30: clock when the last crate breaks; fewer than 2 carrot steals afterwards -> crate regrowth.
- Night Farm, 4 humans: laughs vs "I never found anyone".

**Why:** these decide whether the 2026-11-06 additions need rule changes or just client polish.
**How to apply:** check whether fixes landed before re-raising; ask the user for human playtest results. Related: [[project-identity-proposals]].
