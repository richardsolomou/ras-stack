# Full-stack reference and starter

[Back to the ras-stack overview](../README.md)

`examples/full-stack` is both the repository's `workspace:*` integration contract and the source used by `ras create`. The checked-in example is allowed to change with this repository; a generated application instead receives a normal semver dependency on the installed `ras-stack` version and becomes application-owned immediately.

The reference proves one production-shaped vertical slice:

- Better Auth 1.7 with its React client, Drizzle adapter, database sessions, email/password sign-up, sign-in, sign-out, email verification, and password reset.
- A checked-in Drizzle migration copied into the Nitro server output through `ras assets`, plus a compatibility bootstrap that preserves rows from the pre-migration `messages` table.
- SQLite messages, user-owned upload metadata, and a durable transactional outbox.
- Filesystem-backed TUS content with metadata validation, per-user and deployment-wide limits, offset recovery after a partial write, completed-file retention, and bounded stale-upload cleanup.
- SMTP delivery through Nodemailer when configured, with Mailpit as the deterministic CI sink.
- Centrifugo publication from a bounded, ordered outbox with dead-letter diagnostics, separate liveness/readiness endpoints, security headers, mutation-origin checks, route rate limits, and coordinated application shutdown.
- A read-only production container whose writable `/data` volume survives restart.

## Create an application

Build the package locally before exercising the repository CLI:

```sh
pnpm build
node packages/ras-stack/dist/cli.js create ../my-app
```

For an installed package, run `pnpm create ras-app my-app`. The thin `create-ras-app` package calls the public `ras-stack/create` implementation in-process; it does not carry a separate template. Its initial `0.40.0` bootstrap can also delegate to the matching `ras create` executable because that already-published version predates the direct export. The destination must not exist or must be empty. `--dry-run` resolves and prints the destination without writing it. A repository enforcing pnpm's `minimumReleaseAge` must include both `create-ras-app` and `ras-stack` in `minimumReleaseAgeExclude` to use newly published versions immediately; generated applications include both exclusions.

The generated application is deliberately not hidden behind an application factory. Its schema, migrations, authorization, upload policy, email copy, outbox payloads, deployment, and UI belong to it.

The scaffold rewrites repository-relative build commands to the installed `ras` executable, emits `.gitignore` and `.dockerignore` files that exclude local environment secrets while retaining `.env.example`, excludes `ras-stack` from pnpm's release-age gate so a newly published scaffold version is immediately installable, and replaces the integration-contract Dockerfile with a standalone build-context Dockerfile. Packed-package CI installs and builds the generated application; CI also builds its standalone Docker build stage.

## Local development

Copy `.env.example` to `.env` and replace the development secrets. Start a local SMTP sink if email verification and password reset should be exercised; Mailpit listens on SMTP port 1025 and web port 8025 in the CI example.

Run the pinned realtime container and Vite in separate terminals:

```sh
pnpm --filter @ras-stack/example-full-stack realtime
pnpm --filter @ras-stack/example-full-stack dev
```

Open `http://localhost:3100`. With SMTP unset, local sign-up completes without verification. With SMTP configured, `EMAIL_REQUIRE_VERIFICATION` defaults to `true`. Disabling it is useful only for deterministic test environments that still need to prove mail delivery.

Realtime is optional when running the application directly. If `CENTRIFUGO_API_URL` and `CENTRIFUGO_API_KEY` are both absent, message writes skip the outbox rather than accumulating work that cannot be delivered. The combined production container includes Centrifugo and expects its realtime secrets.

## Build and verify

```sh
pnpm build
pnpm --filter @ras-stack/example-full-stack check
```

The build runs `ras assets sync` after Nitro and then `ras assets check`, so a missing or stale production migration fails the build. CI scans the final image for high and critical vulnerabilities, then runs the actual Node/Centrifugo/Caddy image, signs up two isolated users, rejects cross-user upload access, retains completed bytes, delivers verification mail to Mailpit, observes the outbox-driven realtime invalidation, and signs in again after a restart. It also takes an online database backup through the bundled command, gracefully stops the source stack, restores into a fresh named volume using the same image, restores the separately stored upload content, and verifies the known account, message, and exact upload bytes.

`/api/live` proves only that the HTTP process can respond. `/api/ready` checks the database, configured SMTP connection, and dead-lettered outbox state. `/api/health` remains a compatibility alias for readiness.

See [Production reference operations](production-reference-operations.md) for migration, backup, restore, rollback, shutdown, and proxy boundaries.
