# deploy-dokploy

## 2

`src/server/shutdown.ts` closes the app it finds on `globalThis` instead of importing `closeApp`, which bundled a second copy of the composition root into the Nitro plugin.

Upgrade: an application whose `app.ts` keys the instance under another `Symbol.for` name uses the same name in `src/server/shutdown.ts`.

## 1

Build TanStack Start as a Nitro Node server into a non-root arm64 image, deploy it to Dokploy from `main`, and give each pull request a preview.
