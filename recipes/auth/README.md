---
name: auth
version: 2
summary: Email, password, and social sign-in with Better Auth, sessions for server functions, and the client pieces sign-in pages share.
requires: [start-app]
conflicts: []
dependencies: [better-auth, drizzle-orm, zod]
devDependencies: [happy-dom]
wires: [src/server/app.ts, src/db/schema.ts, drizzle/meta/_journal.json, .github/workflows/preview-deploy.yml]
---

# auth

## Use it when

The application has accounts: people sign up, sign in with a password or a provider, and reset forgotten passwords. It needs `start-app` and a database recipe (`database-sqlite`, `database-libsql`, or `database-postgres`), and an email recipe (`email-posthog` or `email-smtp`) for verification and reset links.

An application whose backend owns identity, such as Convex Auth or SpacetimeDB's own tokens, does not use it.

## Decisions

- **The application keeps Better Auth's whole configuration in one file.** `src/server/auth.ts` calls `betterAuth` directly with the standard values written in, instead of composing option helpers. Change a value there; plugins (admin, two-factor, organization) go in `plugins` before `tanstackStartCookies()`.
- **`createAuth` takes the database adapter.** The Drizzle adapter is created in `createApp` next to the database, so `auth.ts` does not depend on which database recipe the application uses, and its tests run on Better Auth's memory adapter. Do not turn on the Drizzle adapter's `transaction` option with `better-sqlite3`: Better Auth's transactions are asynchronous and `better-sqlite3`'s must be synchronous.
- **The application declares `zod`.** Better Auth 1.7 needs zod 4.5 or later, and the built server keeps one copy of each package it bundles. With an older `zod` in the application's own dependencies, that copy can be the application's: development worked, and every sign-in in the built server answered 500. Keep `zod` at the version in `recipes/package.json` or later.
- **The Better Auth tables are in `src/db/authSchema.ts`, in Better Auth's generator layout** (snake_case columns, its index names), so a plugin's new columns can be copied from `auth generate` output. It is SQLite's dialect, which `database-sqlite` and `database-libsql` share; `database-postgres` replaces the file with the `pg-core` equivalent. Better Auth 1.7 checks the Drizzle schema against its configuration on first use and fails with the missing columns, so a forgotten migration fails loudly.
- **OAuth access and refresh tokens are encrypted at rest** (`encryptOAuthTokens`), with the auth secret. ID tokens are not. Turning this on in a running deployment needs a drain: an old replica cannot read a token a new one encrypted, and rolling back after an encrypted write has the same problem.
- **Sessions last 90 days and refresh once a day**, so people who come back within three months stay signed in, at one session write per day.
- **A password reset revokes every session** of the account, so resetting a password locks out whoever else was signed in with it.
- **Rate limits live in the database** (`storage: 'database'`), so a restart or deploy does not reset them and replicas share them. Sign-in allows 20 attempts a minute, sign-up 15, reset and verification emails 5, and everything else 120: generous enough for a group of friends signing up behind one home connection, tight enough that guessing passwords is pointless. Better Auth's own default of 3 sign-ins per 10 seconds per address would lock out the last few people in a room sharing Wi-Fi. `/admin/set-user-password` is limited too, for applications that add the admin plugin.
- **The client IP comes from a single-value `X-Forwarded-For`**, Better Auth's fail-safe default. Traefik sets it to the visitor; with `realtime`, Caddy sits between Traefik and the app and passes the visitor's address on as the only value. Behind Cloudflare and Traefik the header has two values, Better Auth cannot pick one safely, and every visitor shares one rate-limit bucket; set `advanced.ipAddress.ipAddressHeaders: ['cf-connecting-ip']` only when the origin accepts traffic from Cloudflare alone, since anyone reaching it directly can send that header.
- **The secret comes from `BETTER_AUTH_SECRET`, and a production build refuses to start without it.** Better Auth reads the variable itself (and `BETTER_AUTH_SECRETS` for rotation), but outside `NODE_ENV=production` it silently uses a public default, and a build does not guarantee that variable. The secret signs sessions and encrypts OAuth tokens: changing it signs everyone out and makes stored tokens unreadable. There is no generated-file fallback: it only worked for one instance on one volume, and a deployment secret is one `openssl rand -base64 32` away.
- **Origins come from `start-app`.** `baseURL` is `APP_URL`, so reset and verification links and OAuth redirect URIs use the public address even behind a proxy, and the secure-cookie choice follows its scheme (HTTPS gets `Secure` cookies). `trustedOrigins` is `start-app`'s callback. Without `APP_URL`, `trustedProxyHeaders` follows `TRUST_PROXY`, so Better Auth uses forwarded headers only when `start-app` does.
- **The origin check stays on under test.** Better Auth skips it whenever `NODE_ENV` is `test`, so `disableOriginCheck: false` makes the tests run the check production runs.
- **`tanstackStartCookies()` is the last plugin.** It copies cookies from `auth.api` calls made inside a server function, such as a session refresh, onto the server function's response; calls through `/api/auth` set their own.
- **Social providers come from the environment, and half a pair throws.** Every application chose this: `GOOGLE_CLIENT_ID` without `GOOGLE_CLIENT_SECRET` would otherwise hide the Google button in production without a word, so startup fails and names both variables. The list is Google and Discord; add a provider to `SOCIAL_PROVIDERS` and its pair to the environment.
- **Account linking keeps Better Auth's safeguards.** A provider sign-in joins an existing account with the same email only when the provider verified the email and, when required, the local account did too. Listing providers in `trustedProviders` skips that check, which hands an account to anyone who controls a provider account with that address.
- **`currentSession` asks once per request.** A server-rendered page runs many server functions inside one request, and each would otherwise query the session. The answer is kept in a `WeakMap` keyed by the request, so it never outlives or crosses requests, and a failed lookup is dropped so the next caller asks again.
- **`requireUser` throws a 401 `Response`**, which `start-app`'s `rpc` turns into an error whose message reaches the client, without reporting it as a server failure.
- **Sign-in failure classification puts 429 first**, because a rate-limited attempt can still carry the credential code. Callback classification lowercases Better Auth 1.7's `?error=` codes, including the link-account step's `account not linked`, which has spaces, and treats `access_denied` (and Apple's `user_cancelled_authorize`) as a cancelled sign-in rather than an error.
- **`localRedirectPath` resolves a `?next=` destination against a fixed origin twice.** `//evil.example`, `/\evil.example`, and dot segments that normalize into `//evil.example` (`/a/..//evil.example`, `/a/%2e%2e//evil.example`) are local as written but leave the site once the browser navigates.
- **`useAuthAction` is busy until hydration.** A server-rendered form submitted before React hydrates posts natively as a `GET`, putting the password in the URL and the server log; a submit button disabled while `busy` cannot do that. Only the latest call of a mounted component updates the state, so a slow earlier answer cannot overwrite a newer one, and a thrown transport failure comes back as the result's `error` like Better Auth's own.
- **No sign-in pages.** Every application builds them differently (shadcn cards, translated copy, two-factor steps, provider buttons, invitation flows), so the recipe ships what they share and `stacks/full-stack/src/routes/sign-in.tsx` and `sign-up.tsx` show the shape. Forms read their values with `FormData` in `onSubmit`, not from `onChange` state, so values a password manager filled without input events are sent.
- **The Content Security Policy blocks provider avatars.** `user.image` from Google or Discord is on their hosts, which `img-src 'self' data:` does not allow. Re-host the picture on sign-up or leave it out; widening `img-src` to every provider's image host is the last resort.
- **`randomToken` and `randomId`** make URL-safe secrets and short ids for the application's own records, such as invite links.

## Files

| File                          | Job                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| `src/server/auth.ts`          | `createAuth`, `SOCIAL_PROVIDERS`, and `socialProviders()` from the environment.     |
| `src/server/session.ts`       | `currentSession`, `currentUser`, and `requireUser` for server functions.            |
| `src/server/random.ts`        | `randomToken` and `randomId`.                                                       |
| `src/db/authSchema.ts`        | The Better Auth tables for Drizzle (SQLite dialect).                                |
| `src/routes/api/auth.$.ts`    | Hands every `/api/auth/*` request to Better Auth.                                   |
| `src/client/auth.ts`          | `authClient`.                                                                       |
| `src/client/authFailures.ts`  | `classifySignInFailure`, `classifyAuthCallbackFailure`, and `authFailureMessage`.   |
| `src/client/localRedirect.ts` | `localRedirectPath` for `?next=` destinations.                                      |
| `src/client/useAuthAction.ts` | Busy and error state for one auth client call.                                      |
| `src/server/auth.test.ts`     | Sign-up, sign-out, origins, secure cookies, rate limits, the secret, and providers. |
| `src/**/*.test.ts` (others)   | Tests for each of the above.                                                        |

## Wiring

**`src/server/app.ts`** (from `start-app`). Create Better Auth in `createApp` after the database and return it. See `stacks/full-stack/src/server/app.ts`:

```ts
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import * as authSchema from '../db/authSchema'
import { createAuth } from './auth'

const auth = createAuth(drizzleAdapter(database, { provider: 'sqlite', schema: authSchema }))
return { database, auth, close: () => resources.disposeAsync() }
```

Better Auth holds no connection of its own, so it registers no cleanup. With `database-libsql` or `database-postgres` the database is a promise, so `auth` is one too; those recipes describe the change and wire `src/server/session.ts` and `src/routes/api/auth.$.ts` to await it.

**`src/db/schema.ts`** (from the database recipe). Add `export * from './authSchema'`, so drizzle-kit sees the auth tables, and run `pnpm db:generate --name auth`. That writes the tables as the next migration and adds it to **`drizzle/meta/_journal.json`**; commit the new `.sql` file and snapshot with it. See `stacks/full-stack/drizzle/`, `stacks/spacetime/drizzle/`, and, for PostgreSQL, `stacks/postgres/drizzle/`.

**The email recipe** (`email-posthog` or `email-smtp`) wires `src/server/auth.ts`; see `stacks/full-stack/src/server/auth.ts`. `createAuth` takes the delivery as a second argument, defaulting to `emailDelivery()`, so tests can pass one that records what was sent:

```ts
export function createAuth(database: BetterAuthOptions['database'], email: EmailDelivery | undefined = emailDelivery()) {
  const emails = email && authEmails(email)
  // ...
  emailAndPassword: { enabled: true, revokeSessionsOnPasswordReset: true, sendResetPassword: emails?.sendResetPassword },
  emailVerification: emails && { sendOnSignUp: true, autoSignInAfterVerification: true, sendVerificationEmail: emails.sendVerificationEmail },
```

Verification is sent but not required to sign in; set `requireEmailVerification: true` in `emailAndPassword` when the product needs proven addresses.

**`.github/workflows/preview-deploy.yml`** (from `deploy-dokploy`). Add `BETTER_AUTH_SECRET={{RANDOM_HEX_32}}` to `environment`, after `APP_URL`. A preview runs the production image, which refuses to start without the secret, so without it `/api/health` answers 503 and the preview never becomes ready; a fresh secret per deploy only signs out the preview's disposable sessions. See `stacks/full-stack/.github/workflows/preview-deploy.yml`.

**Pages.** The application writes its sign-in, sign-up, forgot-password, and reset-password routes:

- Sign-in validates `next` with `localRedirectPath` in `validateSearch`, runs `authClient.signIn.email` through `useAuthAction`, maps `classifySignInFailure` to its own copy, and shows `classifyAuthCallbackFailure(search.error)` after a failed provider sign-in (pass `errorCallbackURL: '/sign-in'` to `authClient.signIn.social`).
- A server function returns the configured providers (`SOCIAL_PROVIDERS.filter((provider) => socialProviders()[provider])`) so the page offers only those; clients may import server functions but not `src/server/auth.ts`.
- Forgot-password calls `authClient.requestPasswordReset({ email, redirectTo: '/reset-password' })` and always shows the same answer, so the page does not reveal which addresses have accounts.
- Reset-password reads `token` (or `error=INVALID_TOKEN`) from the search and calls `authClient.resetPassword({ newPassword, token })`.

## Configuration

| Variable                                     | Where       | Value                                                                                   |
| -------------------------------------------- | ----------- | --------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`                         | Server only | Required in production: `openssl rand -base64 32`. Never change it casually; see above. |
| `BETTER_AUTH_SECRETS`                        | Server only | Optional rotation list, `2:new,1:old`, in place of `BETTER_AUTH_SECRET`.                |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`   | Server only | Optional; both or neither.                                                              |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | Server only | Optional; both or neither.                                                              |
| `APP_URL`, `TRUST_PROXY`                     | Server only | From `start-app`; set `APP_URL` in production so links and OAuth redirects are public.  |

Register each provider's redirect URI as `<APP_URL>/api/auth/callback/<provider>`, such as `https://example.com/api/auth/callback/google`, and `http://localhost:3000/api/auth/callback/google` for development.

An application moving from `ras-stack`'s `persistedSecret` must copy the contents of `$DATA_DIR/auth.secret` into `BETTER_AUTH_SECRET` before deploying, and one using `AUTH_SECRET` renames it; otherwise every session ends and encrypted OAuth tokens cannot be read.

## Verify

- `curl -i -X POST localhost:3000/api/auth/sign-up/email -H 'content-type: application/json' -H 'origin: http://localhost:3000' -d '{"name":"Ada","email":"ada@example.test","password":"correct horse battery staple"}'` answers 200 with a `better-auth.session_token` cookie; the same request with `-H 'origin: https://evil.example' -H 'cookie: a=b'` answers 403.
- Keep a flow test on the real database like `stacks/full-stack/src/server/authFlow.test.ts` (or `stacks/postgres/src/server/authFlow.test.ts`, which runs when `DATABASE_URL` is set): sign up, sign in, read the session, sign out, verify from the emailed link, and reset from the emailed link, after which the old session is gone and the token cannot be replayed.
- With provider credentials set, sign in with each provider in a browser and return to the page `next` named.
- `vite build` with `BETTER_AUTH_SECRET` unset, then start the server: the first request that builds `app()` fails with the missing-secret message.
