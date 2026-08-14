---
'ras-stack': minor
---

Remove the adoption policy. `ras policy check` and `ras policy sync` now only generate and verify the files that cannot inherit — the Changesets config, the Dependabot config, and the pnpm cooldown — and no longer govern which ras-stack version, Node version, pnpm version, or shared configuration a repository is on.

`ras-stack/policy` drops the `adoptionDrift`, `adoptionSnapshotDrift`, and `syncAdoptionPolicy` exports. The `adoption` argument fails with the usage message rather than quietly running a repository sync in its place. An `adoption` block left in a `ras-stack.policy.json` is ignored rather than rejected, so upgrading does not break a repository that still declares one, but it no longer does anything and can be deleted.

Choose the ras-stack version you want to ship. If it lacks something you use, the type checker and the failing import report it more precisely than a declared minimum.
