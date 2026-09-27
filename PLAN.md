# Game Plan: The Hollow Relay

## Risk Tasks

### 1. First-person movement and collision
- **Why isolated:** Pointer/touch look and collision response can fail silently across embedded browser contexts and mobile input.
- **Approach:** Keep a semantic input state; move the camera through a fixed-step-ish frame update; resolve movement against an explicit set of static AABBs; provide click-to-capture mouse look plus touch drag and on-screen joystick/buttons.
- **Verify:** WASD and touch move relative to camera yaw; walls block without trapping the player; switching idle→walk→sprint and crouch→stand updates speed/height smoothly; pointer capture is not required for the game to remain usable.

### 2. Monster navigation and perception
- **Why isolated:** Runtime pathfinding is risky without a navmesh or an imported navigation plugin.
- **Approach:** Use a graph of named map nodes and authored room connections. The Listener patrols/interpolates between nodes, investigates recent noise events, enters a short chase only after line-of-sight / close-range evidence, then searches the last-known node and returns to patrol. It is not omniscient.
- **Verify:** Monster states change on sight/hearing, line of sight is tested against room walls, target loss leads to a bounded search, and the player can evade it by breaking line of sight and hiding.

## Implementation Status (2026-09-26)

- **Completed:** Browser-local 15-minute solo match, connected estate, movement/collision, flashlight/stamina/health, four-slot inventory, randomized relay/gate objectives, actual sequence puzzle, Listener states, pause/results, mobile controls, and audio.
- **Verified:** title → lobby → shift, live item pickup, inventory update, relay control interaction, pause/resume, wardrobe hiding, and live Listener chase notice. `pnpm test` passes 13 tests; `pnpm check` passes; production build passes.
- **Verified end to end:** the deterministic demo ran through all required pickups, the relay sequence, gate unlock, extraction, and rendered win/results screen. QA-only demo runs at 2× speed; normal shifts remain 900 seconds.
- **Not implemented:** online 2–4 player shared rooms, authoritative networking, reconnects, team systems, and proximity voice. The present build is explicitly single-player; preserve it as a fallback.
- **Hosting decision required before online play:** a realtime room server needs an always-on service. Estimated full-usage ceiling is $37.50/month for 1 vCPU and 0.5 GB RAM before the included $10/month usage credit, plus metered egress. No hosting change or public publish has been made.

## Main Build

- Build a connected, multi-room 3D signal estate interior with a small surrounding yard, distinct navigation loops, room names, hiding points, an escape courtyard, and readable landmarks.
- Provide an immersive first-person camera, responsive desktop controls, mobile joystick/look/buttons, interaction prompts, flashlight, stamina, four-slot inventory, pickup/drop/use, doors, hiding, revive-free single-player fallback, and audio feedback synthesized after user input.
- Seed match randomization for reachable item placement. Main loop: find a fuse, copper spool, and brass valve; restore the relay through the randomized three-lamp puzzle; recover the gate key and fuel cell; unlock the gate; and survive the final pressure phase.
- Provide title/briefing lobby/start flow, in-game HUD, pause/resume/leave, end states, results summary, deterministic `?demo` behavior, and development-only diagnostics gated from production.
- Implement browser-local solo/demo as the verified runtime. Do not imply online matchmaking or authoritative multiplayer until a dedicated always-on realtime server is provisioned and exercised.

- **Assets needed:** generated 16:9 visual reference for the relay hall; generated tileable weathered plaster / wet wood surface material; generated first-person gloved hands or character reference if available. Use procedural meshes for room geometry, cabinet, doors, hiding furniture, item silhouettes, and the Listener to keep assets lightweight.
- **Verify:**
  - Movement direction matches input; pointer/touch look works; collision stops at walls.
  - Inventory stays at four slots, items can be picked up/dropped/used, and duplicate pickup is prevented.
  - Relay and escape objectives are server/state validated locally (not client calls); randomized spawns remain reachable.
  - Noise pings trigger investigate/search without omniscient tracking; chase, hide, lose-target, and escape states can all be reached.
  - Timer advances, danger escalates, win/loss/results flow completes, and no input or timer softlocks the demo.
  - UI remains readable without overflow at desktop and mobile viewport sizes; audio begins only after a user gesture.
  - No missing textures or obvious fallback materials; no browser console errors during capture.
  - Visual style matches the generated target's near-black slate, damp timber, amber practical lights, and restrained red warnings.
  - **Presentation proof:** WebDev screenshots at desktop and mobile sizes, plus deterministic `?demo` gameplay visible in preview.
