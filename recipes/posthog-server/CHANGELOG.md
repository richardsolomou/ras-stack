# posthog-server

## 4

Use posthog-node 6, which sends events to the capture v1 endpoint `/i/v1/analytics/events`. `reportServerFunctionFailure` passes the exception's properties as `captureException`'s options, and `createTelemetry` sets `beforeSend`, because 6 removed the positional `captureException` arguments and deprecated `before_send`.

Upgrade: install posthog-node 6 and work through its `MIGRATION.md`. Before deploying, check any reverse proxy forwards `/i/v1/analytics/events` with its `Authorization` and `PostHog-*` headers, and that the application's own `captureException` calls pass options instead of positional arguments.

## 3

`createTelemetry` takes an `options` argument with `serviceVersion`, `resourceAttributes`, and `beforeSend`, so an application adds its release, deployment attributes, and an event filter without editing the function.

Upgrade: an application that edited `createTelemetry` for any of these moves the values into `options` where it calls it.

## 2

Read the token and host from `posthog-web`'s `projectTokenVariable` and `hostVariable`, so a renamed variable reaches the server too.

Upgrade: update `posthog-web` to version 2 first.

## 1

Server PostHog client, OTLP logs, server function spans and metrics, failure reporting, request correlation, and shutdown flushing through the application's resources.
