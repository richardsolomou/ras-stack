# Contributing to ras-stack

Install Node 24.x and pnpm 11.15.0, then run:

```sh
pnpm install
pnpm check
```

`pnpm check` runs formatting, linting, shared-configuration resolution, type checking, unit tests, and the package build.

Keep exports composable. Shared code may implement duplicated infrastructure mechanics, but applications retain direct access to upstream libraries and ownership of schemas, migrations, authorization, routes, plugins, domain events, and product policy. Prefer one independently useful function over a configuration facade.

Every exported behavior needs a contract test. Avoid runtime dependencies when a platform API or injected capability is sufficient.
