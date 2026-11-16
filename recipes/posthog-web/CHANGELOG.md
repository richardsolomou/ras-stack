# posthog-web

## 2

Move the token and host variable names and the default host into `projectTokenVariable`, `hostVariable`, and `defaultHost` at the top of `src/contracts/posthog.ts`, so an application that keeps another name or defaults to EU Cloud edits constants instead of `bundledPostHog`. The recipe also documents source-map uploads from Cloudflare Workers Builds.

Upgrade: an application that edited `bundledPostHog` for another variable name or host puts those values in the new constants and restores `bundledPostHog`.

## 1

Browser PostHog with privacy defaults, a same-origin ingest proxy at `/t`, render error capture, and source-map upload from CI.
