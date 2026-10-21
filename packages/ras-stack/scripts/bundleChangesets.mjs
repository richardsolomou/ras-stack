import { build } from 'esbuild'

await build({
  entryPoints: ['src/changesets/index.ts'],
  outfile: 'dist/changesets/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  banner: { js: "import { createRequire as __rasCreateRequire } from 'node:module'; const require = __rasCreateRequire(import.meta.url);" },
})
