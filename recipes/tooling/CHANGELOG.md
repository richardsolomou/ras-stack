# tooling

## 2

Exempt `ras-stack` from the release-age gate, so a fresh ras-stack release installs the day it ships, like PostHog's packages.

Upgrade: remove any exact `ras-stack@<version>` entry from `minimumReleaseAgeExclude`; the `ras-stack` entry covers it. Drop any `notes` entry that records that exemption as a difference from the recipe.

## 1

TypeScript, Oxlint, Oxfmt, and Vitest on the shared presets, with one `pnpm check` that runs them all.
