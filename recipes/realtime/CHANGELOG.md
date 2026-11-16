# realtime

## 2

`createRealtime` takes the channel policy, `channelPolicy` in `src/server/realtimeChannels.ts`, which is now a starter: the recipe's tests use a policy of their own, so an application's channels no longer break them, and `serverChannels` and `canSubscribe` may be asynchronous. `publish` takes `{ coalesce: false }` for a publication a newer one must not replace, such as a typing ping, instead of a second publisher. The hook tests render with React's `createRoot` in happy-dom instead of the deprecated `react-test-renderer`.

Upgrade: export the application's rules as `channelPolicy: RealtimePolicy` from `src/server/realtimeChannels.ts` and pass it as `createRealtime`'s second argument in `src/server/app.ts`; a rule that read `app()` becomes a function of the services it needs, called there. Remove the policy assertions the application added to `src/server/realtime.test.ts` and keep them in `src/server/realtimeChannels.test.ts`. Replace a second `createRealtime` instance kept for publications that must not coalesce with `{ coalesce: false }`. Check that the Vitest `include` matches `src/**/*.test.tsx`, or the hook tests do not run.

## 1

Centrifugo publisher, tokens, client and React hooks, development command, and container supervisor.
