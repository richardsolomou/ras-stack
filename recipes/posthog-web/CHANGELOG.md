# posthog-web

## 5

Use the slim browser SDK with explicit bundles for analytics, error tracking, feature flags, logs, metrics, replay and tracing. The provider supplies the same client even when no project token is configured.

Upgrade: install `posthog-js` 1.450.1 or newer and use `@posthog/react` 1.11.3 or newer. Copy the two exact-match Vite aliases from a wired stack and move any alternative browser SDK imports to the same slim entry. Add bundles for any extra PostHog features the application uses to `__extensionClasses` in `src/client/posthogOptions.ts`.

## 4

Read `import.meta.env` with an optional chain in `src/contracts/posthog.ts`, so a script run with Node or tsx can import the contract instead of failing on load.

Upgrade: a Dockerfile that copies selected files into its build stage, instead of `COPY . .`, adds `scripts/posthogSourceMaps.ts`, which `vite.config.ts` imports.

## 3

Move `postHogOptions` and its tests into `src/client/posthogOptions.ts` and `posthogOptions.test.ts`, which import neither React nor the router, so an application without them can take the SDK options alone.

Upgrade: if the application changed `postHogOptions` or its tests, carry those changes into the new files and keep the recipe's removal from `src/client/posthog.tsx` and `posthog.test.tsx` when resolving their conflicts.

## 2

Move the token and host variable names and the default host into `projectTokenVariable`, `hostVariable`, and `defaultHost` at the top of `src/contracts/posthog.ts`, so an application that keeps another name or defaults to EU Cloud edits constants instead of `bundledPostHog`. The recipe also documents source-map uploads from Cloudflare Workers Builds.

Upgrade: an application that edited `bundledPostHog` for another variable name or host puts those values in the new constants and restores `bundledPostHog`.

## 1

Browser PostHog with privacy defaults, a same-origin ingest proxy at `/t`, render error capture, and source-map upload from CI.
