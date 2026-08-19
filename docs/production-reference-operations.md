# Production reference operations

[Back to the full-stack reference](full-stack-example.md)

These procedures describe the example's SQLite deployment. They are an executable reference, not a hosted backup service or a promise about an application's recovery objectives.

## Configuration and trust boundaries

Production startup requires an HTTP origin in `APP_URL` and an absolute `DATA_DIR`. Realtime API URL and key must be configured together, and enabling realtime in production also requires `CENTRIFUGO_PROXY_SECRET`. SMTP credentials must be complete when present. Upload size, per-user quota, deployment byte cap, and deployment file cap must be positive; each byte quota must accept at least one maximum-size upload.

Use an HTTPS `APP_URL` in an internet-facing deployment; Better Auth then emits secure cookies. The HTTP production URL used by container E2E is intentionally a local-only exception. The example reads forwarded origin headers only when `TRUST_PROXY=true`; enable that only when the application is directly behind a controlled proxy that overwrites incoming forwarded headers. Better Auth's client-IP resolution is left on its fail-safe default rather than trusting arbitrary multi-hop `X-Forwarded-For` chains. Applications with a known proxy topology should configure Better Auth's explicit trusted proxy CIDRs.

`BETTER_AUTH_SECRET` should be supplied by the deployment secret store. The persisted data-volume secret is a safe single-instance fallback, not a cross-replica secret distribution mechanism. Better Auth supports rotated `BETTER_AUTH_SECRETS`; applications should plan secret rotation before running multiple replicas.

The reference CSP permits inline script and style because the pinned TanStack Start SSR output emits an inline hydration payload and does not expose a nonce hook in its installed integration. It still restricts sources to the same origin and denies framing, camera, microphone, and geolocation. Applications that can supply a request nonce should replace the inline allowance rather than weakening other directives.

## Migrations and rollout

The application applies checked-in Drizzle migrations before constructing Better Auth, workers, or request handlers. The production build copies `drizzle/` into `.output/server/drizzle` and verifies byte-for-byte drift. On the first upgraded start, a compatibility bootstrap renames the old unjournaled `messages` table, applies the migration, and imports its rows under a synthetic legacy owner in one transaction.

Before deploying a schema change:

1. Back up the live database and verify the emitted path.
2. Build the exact image and run its migration against a restored copy of production data.
3. Exercise sign-in, the changed write path, readiness, and shutdown on that copy.
4. Deploy one instance first and confirm the migration journal and application behavior before widening the rollout.

SQLite/Drizzle migrations are forward-only here. A rollback that needs the old schema is a restore operation and loses writes after the backup. Prefer additive, backward-compatible migrations and a forward fix when writes must be retained.

## Backup and restore

Build the example before invoking its bundled database command:

```sh
pnpm --filter @ras-stack/example-full-stack build
DATA_DIR=/absolute/data pnpm --filter @ras-stack/example-full-stack db:backup
```

The backup command runs `PRAGMA quick_check`, uses SQLite's online backup API, opens the result independently, runs `quick_check` again, and prints the final path. Upload content is stored separately under `$DATA_DIR/uploads`; snapshot that directory together with the database if uploads are part of the recovery objective.

Restore only while the application is stopped:

```sh
DATA_DIR=/absolute/data pnpm --filter @ras-stack/example-full-stack db:restore /absolute/backup.sqlite
```

The restore command validates the candidate, refuses to proceed when WAL/SHM sidecars indicate an active or unclean database, copies and validates a temporary database in the destination filesystem, renames the current database to a timestamped recovery file, and atomically installs the validated copy. If replacement fails, it attempts rollback before temporary cleanup and reports every replacement, rollback, and cleanup failure together. Automated tests cover round-trip restore, corrupt input, replacement rollback, cleanup failure, and simultaneous recovery failures. CI additionally invokes `.output/server/database.mjs` inside the built image for an online backup, gracefully stops the source, restores the database and separately captured upload into a fresh named volume using that same non-root image, and verifies a known sign-in, message, and exact upload bytes. Start the exact application version matching any restored schema, wait for readiness, perform a new write, and inspect the outbox before removing the pre-restore file.

Retention, encryption, off-site replication, restore scheduling, and RPO/RTO alerts remain deployment-owned. A backup that has never passed a restore drill is not a recovery plan.

## Shutdown and workers

On `SIGINT` or `SIGTERM`, the outer realtime supervisor first stops Caddy to quiesce new traffic, then stops the application while Centrifugo remains available for its final outbox drain, and finally stops Centrifugo. All phases share one overall timeout; any process still alive at the deadline is force killed. An unexpected child exit instead triggers immediate concurrent sibling teardown. Within the application phase, the application stops scheduling the outbox, completes bounded in-flight work, stops upload cleanup, closes the realtime publisher, flushes telemetry, and closes SQLite. Scheduled outbox and upload-cleanup failures are reported without creating unhandled rejections or stopping future intervals; a final outbox drain failure remains observable during shutdown. Every resource receives a close attempt even when an earlier close fails, and shutdown exits nonzero after reporting the aggregate failure. Deployments should stop accepting new traffic before sending the signal so mutations cannot race the drain.

The outbox retries the absolute oldest item first with capped exponential backoff and a bounded batch, so a delayed failure cannot be overtaken. Writes reject with 503 when 1,000 queued or dead-lettered items exist. Eight failed attempts move an item to a dead-letter state and make readiness fail until an operator repairs or removes it. Message insertion, capacity enforcement, and outbox insertion share one synchronous SQLite transaction. When realtime URL and key are absent, message writes bypass capacity enforcement and outbox insertion entirely. Better Auth's Drizzle adapter intentionally uses its default sequential mode: Better Auth 1.7 supplies asynchronous adapter operations, while `better-sqlite3` transactions must be synchronous. Do not enable the adapter's `transaction` option for this driver.

Upload creation checks the per-user quota and deployment-wide declared-byte/file caps and inserts metadata inside one immediate synchronous SQLite transaction, preventing concurrent requests from reserving beyond the configured limits. Active uploads older than 24 hours are removed in bounded batches; completed uploads are retained and count toward every applicable cap. Deployments must define a completed-upload retention policy and delete both the metadata row and matching content file through application-owned tooling or while the application is stopped. Multi-replica filesystem coordination, external object storage, and automated retention remain application-owned.

## Supply chain

The runtime-binaries workflow and shared production-image action publish BuildKit provenance and an SBOM. The npm release uses trusted publishing provenance. This repository's full-stack example additionally scans its final image with Anchore and fails CI on high or critical vulnerabilities, proving a concrete policy for the reference artifact. Consumers still own their production image-signing identity, admission rules, vulnerability exceptions and severity policy, registry retention, and remediation workflow because those depend on the deployment platform and risk model.
