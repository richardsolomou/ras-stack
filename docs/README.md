# ras-stack documentation

[ras-stack](../README.md) is full-stack application code you copy, own, and keep up to date: [recipes](../README.md#recipes-) an application copies once, the [`ras-recipes` skill](../skills/ras-recipes/SKILL.md) that adds them and merges later changes into the application's copy, and [stacks](../README.md#stacks-) that prove them in CI. The [`ras-stack` npm package](../packages/ras-stack/README.md) holds only the shared presets and preview tooling.

| Need                                                                           | Guide                                                 |
| ------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Choose the recipes for an application                                          | [Recipes](../recipes/README.md)                       |
| Add, update, or adopt recipes in an application                                | [`ras-recipes` skill](../skills/ras-recipes/SKILL.md) |
| Write or change a recipe or stack                                              | [Authoring recipes](../recipes/AUTHORING.md)          |
| Extend the compiler and lint presets                                           | [Presets](../packages/ras-stack/README.md#presets)    |
| Use the shared Actions, reusable workflows, previews, and the runtime binaries | [Repository tooling](repository-tooling.md)           |
| Move an application off v5's runtime helpers and managed installs              | [Migrate from v5](upgrades.md)                        |

## Where guidance belongs

A recipe's `README.md` owns its decisions, wiring, configuration, and verification; other pages link to it rather than repeating it. The guides here own the shared package, Actions, and workflow contracts. Application repositories keep their own commands, ports, credentials, product behaviour, and operating procedures, and record their differences from a recipe in `ras-recipes.json`.

[Overview](../README.md) · [Contributing](../CONTRIBUTING.md)
