# Memory

- Project: `/home/ubuntu/hollow-relay`; WebDev scaffold initialized with `web-db-user`.
- Preview was reported running at the managed project preview URL on port 3000.
- Installed `@babylonjs/core` successfully using `cd /home/ubuntu/hollow-relay && pnpm add @babylonjs/core` (direct `cwd` was rejected by terminal guard).
- Generated visual reference: `/home/ubuntu/hollow-relay-art/reference.png` (2560×1440), approved as art direction. Upload through `manus-upload-file --webdev` and use managed URL; do not copy large media into project.
- Strict hosting constraint: production autoscale is request-driven. Do not claim a live multiplayer server; no always-on hosting configuration has been enabled. Reserved hosting is usage-based (up to $37.50/mo for full 24/7 resource use, less $10 included monthly credit, plus egress) and requires user choice before enabling.
- Gameplay verification: 13 tests pass; `pnpm check` passes. Browser-smoked lobby/start/pickup/relay/pause/resume/wardrobe hiding and safe opening patrol. Deterministic 2× QA demo completed all objective stages, gate unlock, extraction, and rendered the actual win results panel at elapsed 01:20.
- Final mobile screenshots reviewed at 390×844. Mobile title uses a gradient instead of the screenshot art background to prevent embedded sample HUD text bleeding through.
- Use the WebDev screenshot tool and project scripts for preview verification. Save one final checkpoint before first delivery.
