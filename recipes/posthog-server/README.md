---
name: posthog-server
version: 4
summary: Server PostHog analytics, exceptions, logs, metrics, and spans, with server function telemetry and shutdown flushing.
requires: [start-app, posthog-web]
conflicts: [deploy-cloudflare]
dependencies:
  [posthog-node, '@opentelemetry/api-logs', '@opentelemetry/exporter-logs-otlp-http', '@opentelemetry/resources', '@opentelemetry/sdk-logs']
devDependencies: []
wires: [src/server/app.ts, src/server/rpc.ts]
---

# posthog-server

## Use it when

The application has a server that should report to the same PostHog project as its browser: server events, exceptions, structured logs, metrics, and traces, linked to the browser session that caused them. This is the default for every full-stack application.

It runs on Dokploy, not Cloudflare Workers: a Worker never closes the composition root, so queued events, spans, and logs would never be sent. A client-only tool needs only `posthog-web`.

## Decisions

- **One telemetry resource in `app()`.** `createTelemetry()` is created first in `createApp`, so it closes last and records the other resources closing. Closing the app runs `telemetry.shutdown()`, which flushes queued events, spans, metrics, and logs; the deploy recipe closes it once the server has drained (`deploy-dokploy` from Nitro's close hook). The package's own signal handler, which flushed and re-raised the signal, is not used: it would flush while requests were still running and race the server to exit.
- **The OpenTelemetry log packages share one exact version.** `@opentelemetry/sdk-logs` pins `api-logs`, `core`, and `resources` exactly, so a caret range on the application's own `api-logs` or `resources` can resolve a second copy; `SeverityNumber` and `Resource` from that copy then fail type-aware lint against the one `sdk-logs` uses. Install `api-logs`, `sdk-logs`, `exporter-logs-otlp-http`, and `resources` at the exact versions `sdk-logs` names, and update them together.
- **Dokploy only, so it conflicts with `deploy-cloudflare`.** Telemetry sends in batches and relies on `closeApp()` to flush, which the Node server runs on shutdown and a Worker never does. Flushing each request through `ctx.waitUntil` would need the Worker's execution context in every server function, a client configured to send each event at once, and Workers-only tests; the applications on Cloudflare are client-only or keep their backend in Convex, so that waits for one that needs it.
- **The native `posthog-node` client is the API.** `telemetry.posthog` is used directly for `capture`, `captureException`, `metrics`, `withSpan`, and `withContext`. Without `VITE_POSTHOG_PROJECT_TOKEN` it is constructed with `disabled: true`, which sends nothing at all (checked for events, metrics, and traces) while `withSpan` still runs its work, so callers never branch. Exception autocapture is on only when enabled, so tests and local runs keep Node's default crash behavior.
- **Logs go through OpenTelemetry, because `posthog-node` has no logs API.** `telemetry.log(severity, body, attributes)` emits an OTLP record to `<host>/i/v1/logs` authenticated with the project token. The OpenTelemetry logs packages must move together: Dependabot once raised `@opentelemetry/exporter-logs-otlp-http` to 0.300 alone, which needs `@opentelemetry/api` 1.10 and failed at import while mocked tests stayed green. The tests here export to a real local HTTP server, so a mismatched upgrade fails them.
- **Logs are bounded.** The body is cut to 2,048 characters, records keep at most 64 attributes, string values are cut to 2,048 characters, and objects become JSON (an unserializable one becomes a marker), so one careless attribute cannot produce an oversized or failing record.
- **Logs carry the PostHog person, session, and server function.** `log` reads `posthogDistinctId` and `sessionId` from the current `posthog-node` context, the same attribute names the browser SDK uses, and `server_function` from `start-app`'s server function identity, so a log reads without reversing the opaque `/_serverFn/<hash>` path.
- **Client-claimed identity is never trusted.** Browsers send `X-POSTHOG-DISTINCT-ID` and `X-POSTHOG-SESSION-ID` (from `posthog-web`'s tracing headers), and any client can send any value. `requestContext` keeps the session id, and keeps the distinct id only when it equals the id the application's own authentication produced. A signed-out caller's claim is kept only when it is a version 7 UUID, the form posthog-js gives an anonymous browser person, so server work joins that visitor's anonymous person and carries over when they sign in; Better Auth's 32-character ids never take that form, so a forged claim cannot attach server events to an account. A signed-in caller claiming an anonymous id is ignored, because their server work belongs to their account. An application that makes Better Auth generate UUIDs (`advanced.database.generateId`) loses that guarantee and should drop the anonymous case. Both ids must be 1–128 characters from a fixed set, so neither can inject into logs or properties.
- **Each server function runs inside one server span and that context.** `observeServerFunction` wraps `rpc`'s `try`, so the span continues the browser's `traceparent`, captures and logs inside it carry the session, and exceptions carry the active trace. It records `server_function.requests` and `server_function.duration` (milliseconds).
- **Metric attributes are low-cardinality.** They are the method, the server function name (bounded by the application's code), and the outcome. URLs, query strings, user ids, and session ids never become metric attributes, because each distinct value creates a new series.
- **A thrown 4xx `Response` is `refused`, not an error.** Applications throw 4xx responses on purpose, and counting them as failures made a signed-out caller's 401 inflate server error rates. The span records `http.response.status_code` and stays unfailed, and the request counts as `refused`; a 5xx counts as `error`, like any other throw.
- **Failures are reported once, with only bounded details.** `reportServerFunctionFailure` replaces `start-app`'s `reportFailure`: it keeps the `server_function_failed` server log, captures the exception with the request method and path, the function name, and a thrown response's status, and writes an error log with the same properties. Without a person, `posthog-node` gives the exception a random distinct id without a person profile, rather than one `server` person collecting every failure. A telemetry error is logged and swallowed, so the client sees the application's failure.
- **Shutdown has a two-second deadline.** `posthog.shutdown(timeoutMs)` bounds the client, and the log provider gets the same deadline, because a stalled OTLP connection otherwise held process exit open. Two seconds is telemetry's slot in the shutdown budget in `start-app`'s README: with ten, the drain and the other resources used Docker's whole grace period first and the container was killed before the events describing that slow shutdown were sent. After shutdown the client is disabled, so a request still running then cannot queue events that a later flush would send. Telemetry is not flushed early instead, because closing last is what lets it record the others closing, and the budget leaves it its slot.
- **The application's additions go in `createTelemetry`'s `options`.** `serviceVersion` becomes `service.version` on logs, metrics, and spans, `resourceAttributes` adds attributes such as the deployment's host to all three, and `beforeSend` is `posthog-node`'s `beforeSend` for every event. They are passed in, not read from the environment, because a release name or host usually comes from the build or the application's own settings. The recipe's `service.name` and `deployment.environment` win over a resource attribute of the same name.
- **The server reads the token at runtime.** `createTelemetry` reads `process.env`, so a server can be pointed at a project without rebuilding, the same variables `email-posthog` reads. It uses the same `postHogEnvironment` parsing as the browser.

## Files

| File                              | Job                                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| `src/server/telemetry.ts`         | `createTelemetry`: the PostHog client, OTLP logs, flush, and shutdown; `requestContext`. |
| `src/server/rpcTelemetry.ts`      | `observeServerFunction` and `reportServerFunctionFailure` for `rpc`.                     |
| `src/server/telemetry.test.ts`    | Disabled and enabled exports against a local server, log bounds, identity trust.         |
| `src/server/rpcTelemetry.test.ts` | Spans, metrics, outcomes, session linking, and failure reports.                          |

## Wiring

With `start-app`, see `stacks/postgres/`:

- `src/server/app.ts`: first in `createApp`, `const telemetry = resources.adopt(createTelemetry(), (created) => created.shutdown())`, and return `telemetry`. Pass `createTelemetry(process.env, { serviceVersion })` and the other options there when the application needs them.
- `src/server/rpc.ts`: in `run`, take `const { telemetry } = app()` and return `observeServerFunction(telemetry, request, async () => { try { ... } catch { ... } })` around the existing `try`. Replace the `reportFailure(error, context)` call with `reportServerFunctionFailure(telemetry, error, context)` and delete `reportFailure`.

With `auth`, `posthog-auth-identity` passes the session's user id as `observeServerFunction`'s fourth argument, `authenticatedDistinctId`, so server work joins the signed-in person; see `stacks/full-stack/src/server/rpc.ts`.

Elsewhere, use `app().telemetry`:

```ts
app().telemetry.posthog.capture({ distinctId: user.id, event: 'roster_saved', properties: { units: 12 } })
app().telemetry.log('warn', 'import skipped rows', { skipped: 3 })
app().telemetry.posthog.metrics.count('imports.completed', 1, { attributes: { source: 'csv' } })
await app().telemetry.posthog.withSpan('catalogue.refresh', { kind: 'internal' }, () => refreshCatalogue())
```

Wrap an API route's work in `app().telemetry.posthog.withContext(requestContext(request, userId), work)` to link it to the browser session.

## Configuration

| Variable                     | Where  | Value                                                                    |
| ---------------------------- | ------ | ------------------------------------------------------------------------ |
| `VITE_POSTHOG_PROJECT_TOKEN` | Server | The project token, the same as the browser's. Turns server telemetry on. |
| `VITE_POSTHOG_HOST`          | Server | Optional; the same host as the browser's.                                |
| `NODE_ENV`                   | Server | Names the deployment environment on logs, metrics, and spans.            |

Enable Logs and Metrics once in the PostHog project. Metrics are in alpha and tracing in beta upstream, so their SDK surface may still change.

## Verify

- With the token set, call a server function that throws: PostHog shows a `$exception` with `server_function` and the browser's `$session_id`, an error log named `server function failed` with the same session, and a `server_function` span.
- Call one that throws a 401 `Response`: no exception, and `server_function.requests` counts it as `refused`.
- Stop the production server (`pnpm start`) with `Ctrl+C`: it exits promptly and the last events still arrive.
