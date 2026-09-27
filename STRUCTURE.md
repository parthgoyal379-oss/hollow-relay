# Structure — The Hollow Relay

- `client/src/components/GameCanvas.tsx` — lifecycle-safe Babylon canvas and bridge to DOM HUD.
- `client/src/game/scene.ts` — creates the Babylon scene, map geometry, camera, materials, world update loop, cleanup.
- `client/src/game/input.ts` — semantic keyboard, mouse, touch, and mobile controls.
- `client/src/game/world.ts` — match state, local deterministic demo, player stats, inventory, objectives, items, noise events, and safe spawn validation.
- `client/src/game/monster.ts` — graph-based Listener state machine: patrol, investigate, search, chase, return, final-phase enrage.
- `client/src/game/map.ts` — fixed recognizable room layout, authored route graph, randomized reachable item/objective selection.
- `client/src/game/ui.ts` — immersive HUD/menu/result overlay and mobile touch controls, separate from gameplay rules.
- `client/src/game/audio.ts` — WebAudio procedural ambience, footsteps, heartbeat, and UI cues gated by first input.
- `client/src/game/types.ts` — shared game-state types.
- `client/src/index.css` — full-screen canvas, responsive immersive UI, readable typography.

The first release is an in-browser deterministic local demo. The scaffold includes a backend suitable for later persistence, but real-time shared rooms, authoritative host simulation, voice, matchmaking, reconnects, and anti-cheat require an always-on multiplayer service and are not represented as complete by the local demo.
