# The Hollow Relay — Feature and Bug Tracker

**Updated:** 2026-09-26

## Implemented and verified

- [x] Full-screen first-person Babylon.js game with a connected 12-room estate, colliders, hiding props, touch controls, and responsive HUD.
- [x] Title → briefing lobby → shift start, pause/resume, leave, results and replay flows.
- [x] Standard 15-minute match clock; short deterministic `?demo=1` route for rapid QA.
- [x] Randomized, reachable objective placement; safe spawn points avoid the relay console; four inventory slots with selected-slot use/drop.
- [x] Three required relay components and an actual randomized three-lamp puzzle. Wrong input resets the sequence.
- [x] Gate key + fuel requirement and win/loss result state.
- [x] Listener state machine: patrol, noise investigation, search, line-of-sight chase, timed loss-of-sight search, return, and final enrage.
- [x] Flashlight/battery, stamina, health, healing, footstep/noise events, and WebAudio ambience.
- [x] Real browser smoke checks: menu/lobby/start, pickup, relay switch clicks, pause/resume, Listener chase notice, and wardrobe hiding.
- [x] Automated test suite: 13 tests pass across match progression, items/inventory, randomized puzzle, hiding, damage, Listener perception/search, and safe start distance.
- [x] `pnpm check` passes. Production build passes with focused Babylon imports; client entry bundle is approximately 1.55 MB uncompressed / 401 KB gzip.

## Remaining work / explicit limits

- [x] Complete a full automated browser run from start through extraction/results. QA-only demo runs at 2× simulation speed; it collected all required items, restored the relay, opened the gate, extracted, and rendered the `THE SIGNAL GOT OUT` results screen at 01:20.
- [ ] Online 2–4 player rooms, authoritative shared match state, invites/reconnects, team revive/coordination, and proximity voice are **not implemented**. The current game is a one-player local story demo; no server or hosting configuration should be represented as multiplayer-ready.
- [ ] Before online multiplayer, choose a realtime architecture. An always-on managed server can hold lightweight game rooms, but enabling it changes usage-based hosting costs (up to $37.50/month at full 24/7 CPU/RAM utilization before the included $10 monthly credit, plus egress). Do not enable or publish it without the user's explicit choice.
- [x] Final mobile title and gameplay screenshots reviewed; touch controls, player stats, room name, and inventory have separate layout zones.

## Known QA note

The default Autoscale project is not configured as an always-on realtime room server. The present implementation has no network room state, match authority, or voice transport. Preserve the solo fallback when multiplayer is added.
