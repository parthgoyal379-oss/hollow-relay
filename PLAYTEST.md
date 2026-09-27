# The Hollow Relay — Playtest Notes

## Build

A local, single-player first-person survival-horror demo set in Blackwater Estate. The default shift is 15 minutes. The development preview is available at:

[Open The Hollow Relay preview](https://3000-ilmxw6bk93nmbt2rihca9-82923008.sg2.manus.computer/)

The preview is not a published public release.

## Controls

| Action | Desktop | Touch |
|---|---|---|
| Move | WASD / arrows | Left joystick |
| Look | Mouse / drag | Drag screen |
| Interact / collect | E | Use |
| Sprint | Hold Shift | Run button |
| Crouch | C / Ctrl | Crouch button |
| Hide / leave cover | H | Hide button |
| Flashlight | F | Lamp button |
| Noise ping | G | Ping button |
| Drop selected item | Q | Drop button |
| Use selected item | Space | Use button |
| Pause | Escape | Pause icon |
| Select inventory | 1–4 / click slot | Tap slot |
| Relay puzzle | 1–3 / click lamp | Tap lamp |

## Objective

Find the fuse, copper spool, and brass valve. Return to the relay hall, align the randomized three-lamp sequence, then recover the gate key and fuel cell. Open the iron gate and reach the escape point before the 15-minute clock ends. Running and machinery create noise; the Listener investigates sound and only begins a direct chase after sighting the player. Break line of sight, hide, and wait out a bounded search.

## Verification performed

- Started a regular shift from the title/briefing screens and confirmed the 15-minute timer and randomized item prompt.
- Collected an item with E and verified the inventory updated.
- Paused with Escape and resumed from the pause screen.
- Entered a wardrobe with H during a live match; the HUD confirmed cover.
- Confirmed a fresh normal shift begins with the Listener roughly 34 meters from spawn, health and stamina at 100, and time to explore.
- Exercised the actual three relay controls in the live page using the randomized sequence; the puzzle reached `relayReady` and advanced the objective.
- Observed the Listener chase state/notice in a live browser match.
- Reviewed mobile title and gameplay HUD at 390×844; touch actions, vitals, and inventory remain separately reachable.
- Completed the accelerated `?demo=1` browser run end to end: collected all five required items, restored the relay, opened the gate, escaped, and confirmed the visible results panel reads `THE SIGNAL GOT OUT`, `RESTORED`, escape count `1`, and elapsed time `01:20`.
- Automated tests: **13 passed**. TypeScript check passed. Production build passed (Babylon-focused split entry ~1.55 MB / 401 KB gzip).

The deterministic QA demo runs at twice normal simulation speed; regular matches remain on the 15-minute clock. The full objective, extraction, and results transitions were exercised in the browser as well as covered by game-state tests.

## Multiplayer status

This is currently a **local single-player demo**, not an online multiplayer build. There is no shared room server, matchmaking, authoritative shared state, reconnect flow, or proximity voice. The project remains on request-scaled hosting. A live room server requires a realtime hosting decision; maximum estimate is $37.50/month for full continuous 1 vCPU + 0.5 GB RAM use, less the included $10/month credit, plus metered egress. No hosting change or public publish was performed.
