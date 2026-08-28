import { cpSync, rmSync } from 'node:fs'
import path from 'node:path'

const packageRoot = path.resolve(import.meta.dirname, '..')
const source = path.resolve(packageRoot, '../../examples/full-stack')
const destination = path.resolve(packageRoot, 'dist/create/template')
const excluded = new Set(['.data', '.output', 'node_modules', 'test-results'])

rmSync(destination, { recursive: true, force: true })
cpSync(source, destination, {
  recursive: true,
  filter: (entry) => !excluded.has(path.relative(source, entry).split(path.sep)[0]),
})
