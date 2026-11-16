---
name: posthog-auth-identity
version: 1
summary: Identify and reset PostHog from the Better Auth session in the browser, and link server telemetry to the signed-in person.
requires: [posthog-web, auth]
conflicts: []
dependencies: ['@posthog/react']
devDependencies: [react-test-renderer, '@types/react-test-renderer']
wires: [src/routes/__root.tsx, src/server/rpc.ts]
---

# posthog-auth-identity

## Use it when

The application has accounts (`auth`) and browser PostHog (`posthog-web`), and its analytics, replays, and server telemetry should belong to the signed-in person rather than an anonymous visitor. Every application with both recipes takes it.

## Decisions

- **The identity is the Better Auth user id, and nothing else by default.** `posthog.identify(user.id)` sends no name or email, so personal data does not reach PostHog unless the application adds a property on purpose. Pass product-safe properties, such as a role, as `identify`'s second argument in `src/client/postHogIdentity.tsx`.
- **Sign-out resets PostHog.** Once the session ends, the next visitor on the browser starts a new anonymous person instead of continuing the last one.
- **A saved identity with no session resets too.** A password reset ends every session and its link loads the application fresh, so the component never saw the sign-in it would reset after; `posthog-js` still holds the earlier `$user_id`. Comparing against that property catches it.
- **A different user resets before identifying.** When the signed-in id differs from the saved one, as when an administrator impersonates someone, `identify` alone would merge the two people and continue the administrator's session and replay under the other person. Resetting first starts a clean session.
- **No reset while the session loads or after a failed refresh.** `useSession` reports `isPending` on the first render and an `error` when a refresh fails offline; treating either as signed out would reset PostHog on every page load or network blip and split one person's history.
- **Nothing runs without PostHog.** Without a project token `posthog-web` never initializes the SDK, so the component checks `posthog.__loaded` and does nothing, and local development needs no PostHog project.
- **The server trusts the browser's claim only when the session agrees.** `posthog-web`'s tracing headers send the browser's distinct id with every same-origin request, and any client can send any value. `rpc` looks up the signed-in user and passes its id to `observeServerFunction`, whose `requestContext` keeps the claimed id only when it equals that one, so server spans, logs, and exceptions join the person without letting a caller attach them to someone else. The lookup reuses `currentSession`'s per-request answer, and a failed lookup leaves the work unattributed rather than failing it; the work then meets the same failure itself if it needs the session.

## Files

| File                                  | Job                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| `src/client/postHogIdentity.tsx`      | `PostHogIdentity`: identify, reset, and the impersonation and remount cases. |
| `src/client/postHogIdentity.test.tsx` | Each transition, including PostHog being off and a failed refresh.           |

## Wiring

See `stacks/full-stack/`:

- `src/routes/__root.tsx`: render `<PostHogIdentity />` inside `<PostHogIntegration>`, before `<Outlet />`.
- `src/server/rpc.ts` (with `posthog-server`): in `run`, before `observeServerFunction`, read `const user = request && (await currentUser(request).catch(() => null))` (`currentUser` from `./session`) and pass `user?.id` as `observeServerFunction`'s fourth argument. `stacks/full-stack/src/server/telemetryIdentity.test.ts` proves the server keeps a matching claim and drops a forged one.

Elsewhere on the server, pass the user id to `requestContext(request, user.id)` when wrapping an API route's work in `app().telemetry.posthog.withContext`.

## Configuration

None beyond `posthog-web` and `auth`.

## Verify

- With the token set, sign in: PostHog's activity view shows `$identify` for the user id, and the person has no name or email. Sign out: the next events belong to a new anonymous person.
- Request a password reset, open the emailed link in the same browser, and set a new password: the reset page's events are not attributed to the old person.
- Call a server function while signed in: its `server_function` span and any exception carry the user's distinct id.
