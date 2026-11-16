# RAS documentation

RAS builds applications from [recipes](../recipes/README.md): working code an application copies once and then owns, with the decisions behind it written down. Each application records the recipes it took in `ras-recipes.json`, and the [`ras-recipes` skill](../skills/ras-recipes/SKILL.md) adds them, merges later recipe changes into the application's copy, and reports drift. The [stacks](../stacks) are complete applications assembled from recipes and checked in CI.

The `ras-stack` npm package holds what applications share without copying: the TypeScript and Oxlint presets the `tooling` recipe extends, and the `ras preview` command and `ras-stack/preview/dokploy` export the preview workflows run.

| Need                                                                           | Guide                                                 |
| ------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Choose the recipes for an application                                          | [Recipes](../recipes/README.md)                       |
| Add, update, or adopt recipes in an application                                | [`ras-recipes` skill](../skills/ras-recipes/SKILL.md) |
| Write or change a recipe or stack                                              | [Authoring recipes](../recipes/AUTHORING.md)          |
| Extend the compiler and lint presets                                           | [Presets](../README.md#presets)                       |
| Use the shared Actions, reusable workflows, previews, and the runtime binaries | [Repository tooling](repository-tooling.md)           |
| Move an application off v5's runtime helpers and managed installs              | [Migrate from v5](upgrades.md)                        |

## Where guidance belongs

A recipe's `RECIPE.md` owns its decisions, wiring, configuration, and verification; other pages link to it rather than repeating it. The guides here own the shared package, Actions, and workflow contracts. Application repositories keep their own commands, ports, credentials, product behaviour, and operating procedures, and record their differences from a recipe in `ras-recipes.json`.

[Package overview](../README.md) · [Contributing to RAS](../CONTRIBUTING.md)
