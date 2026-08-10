# Full-stack example

[Back to the ras-stack overview](../README.md)

`examples/full-stack` is a private workspace application whose `ras-stack` dependency is `workspace:*`. It imports only public package entrypoints, so the repository gate catches integration breakage before a release reaches consumers.

The example builds a real TanStack application and production image. Its browser journey signs two independent users in, writes through mutation-protected RPC into SQLite, uploads a bounded text file through TUS, and observes a cross-context message through Centrifugo and Caddy. The same app also consumes the shared query client, React realtime hooks, persisted auth secret, SMTP environment parsing, health response, singleton, TypeScript, and Oxlint contracts.

Run the compile and unit boundary with:

```sh
pnpm --filter @ras-stack/example-full-stack check
```

To run the application locally, start the pinned realtime container and Vite in separate terminals:

```sh
pnpm --filter @ras-stack/example-full-stack realtime
pnpm --filter @ras-stack/example-full-stack dev
```

Open `http://localhost:3100`. The realtime command stays on loopback, mounts the example's Centrifugo configuration read-only, and forwards connect authorization to the local application.

The CI `Full-stack example` job builds the container with a read-only root, starts the complete Node/Centrifugo/Caddy runtime, and runs the Playwright journey. Dokploy and GitHub preview reporting remain workflow integrations because exercising them requires repository credentials rather than application behavior.
