# The Hollow Relay

A cooperative survival-horror browser game built with React, Vite, Babylon.js, Express, and WebSockets.

## Local development

- Node.js 22 or newer
- pnpm 10 (Corepack can provide it)

```sh
pnpm install
pnpm dev
```

Useful checks:

```sh
pnpm test
pnpm check
pnpm build
```

The game source is in `client/src/game/`; the authoritative multiplayer room manager is `server/roomManager.ts`. Multiplayer uses in-memory rooms and a persistent WebSocket server process. See [HOSTING.md](./HOSTING.md) before deploying online co-op.

## Environment and assets

This archive intentionally excludes credentials and environment-specific WebDev metadata. Configure any server environment values separately; never commit secrets. The game textures in `client/src/game/assets.ts` currently reference `/manus-storage/...` paths, so they remain hosted by the Manus project and are not embedded in this source archive. For another host, transfer those image assets to that host and update the paths.
