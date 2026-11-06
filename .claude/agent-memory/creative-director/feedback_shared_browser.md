---
name: feedback-shared-browser
description: How to drive the Playwright browser for Boom Orbs playtests without disturbing the user's saved state, and where screenshots may be saved
metadata:
  type: feedback
---

The Playwright browser is the user's persistent profile (localStorage has their name "Dorje"). Changing room settings in ANY room writes them to localStorage "settings", which becomes the default for the user's next room.

**Why:** the client saves every lobby's settings so a recreated room keeps them; the user also clicks in this same browser.
**How to apply:**
- Open a fresh room (plain http://localhost:8000, no ?room=) so you never touch the user's room.
- After testing, set settings back to Classic / Random / Free-for-all / First to 2 / 1:30 (the defaults), then navigate to about:blank to leave the room.
- Screenshots can only be written under the repo, e.g. `.playwright-mcp/cd-*.png` (gitignored); the scratchpad is outside Playwright's allowed roots.
- Speed up end-of-match checks with First to 1 and 1:00 rounds; the "over" screen lasts 6 s before the lobby returns, so poll for it.
- A localhost:8000 dev server may already be running (the user's); don't stop one you didn't start.
