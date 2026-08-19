# create-ras-app

Create a production-ready [ras-stack](https://github.com/richardsolomou/ras-stack) application:

```sh
pnpm create ras-app my-app
```

The package is a thin in-process entrypoint for `ras-stack`'s canonical scaffold. It accepts the same destination and `--dry-run` arguments as `ras create` without carrying a separate template.
