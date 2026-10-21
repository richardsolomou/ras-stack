import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { json } from './files.js'

const exec = promisify(execFile)

export async function testRegistry() {
  const directory = await mkdtemp(join(tmpdir(), 'ras-registry-'))
  const packages = new Map<string, { archive: Buffer; manifest: Record<string, unknown> }>()
  await Promise.all(
    (
      [
        ['@ras-test/alpha', { '@ras-test/child': '1.0.0' }],
        ['@ras-test/alpha-old', {}],
        ['@ras-test/child', {}],
        ['@ras-test/beta', {}],
        ['ras-stack', {}],
      ] as const
    ).map(async ([name, dependencies]) => {
      const parent = join(directory, name.split('/').at(-1)!)
      await mkdir(join(parent, 'package'), { recursive: true })
      const packageName = name === '@ras-test/alpha-old' ? '@ras-test/alpha' : name
      const version = name === '@ras-test/alpha-old' ? '0.9.0' : '1.0.0'
      const manifest = {
        name: packageName,
        version,
        type: 'module',
        exports: { '.': { types: './index.d.ts', default: './index.js' }, './extra': './extra.js' },
        dependencies,
        bin: { 'ras-test-tool': './bin.js' },
        scripts: { install: `node -e "require('node:fs').writeFileSync(process.env.RAS_TEST_MARKER, 'ran')"` },
      }
      await writeFile(join(parent, 'package/package.json'), json(manifest))
      await writeFile(join(parent, 'package/index.js'), `export const name = ${JSON.stringify(name)}; export const identity = {}\n`)
      await writeFile(join(parent, 'package/extra.js'), 'export const extra = true\n')
      await writeFile(join(parent, 'package/index.d.ts'), 'export declare const name: string\n')
      await writeFile(
        join(parent, 'package/bin.js'),
        "#!/usr/bin/env node\nimport { writeFileSync } from 'node:fs'\nwriteFileSync(process.env.RAS_TEST_COMMAND, JSON.stringify({args:process.argv.slice(2), cwd:process.cwd()}))\nprocess.exit(Number(process.env.RAS_TEST_EXIT ?? 0))\n",
      )
      await exec('tar', ['-czf', 'package.tgz', 'package'], { cwd: parent })
      packages.set(name, { manifest, archive: await readFile(join(parent, 'package.tgz')) })
    }),
  )
  let requests = 0
  const server = createServer((request, response) => {
    requests += 1
    const name = decodeURIComponent((request.url ?? '/').slice(1)).replace(/\/-\/[^/]+\.tgz$/, '')
    const pkg = packages.get(name)
    if (!pkg) {
      response.writeHead(404)
      response.end('{}')
      return
    }
    if (request.url?.endsWith('.tgz')) {
      response.writeHead(200, { 'content-type': 'application/octet-stream' })
      response.end(pkg.archive)
      return
    }
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing test registry address')
    const manifest = {
      ...pkg.manifest,
      dist: {
        tarball: `http://127.0.0.1:${address.port}/${name}/-/${name.split('/').at(-1)}-1.0.0.tgz`,
        integrity: `sha512-${createHash('sha512').update(pkg.archive).digest('base64')}`,
      },
    }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(
      json({
        name,
        'dist-tags': { latest: '1.0.0' },
        versions: {
          '1.0.0': manifest,
          ...(name === '@ras-test/alpha'
            ? {
                '0.9.0': {
                  ...manifest,
                  version: '0.9.0',
                  dist: {
                    ...manifest.dist,
                    tarball: manifest.dist.tarball.replace('alpha/-/', 'alpha-old/-/'),
                    integrity: `sha512-${createHash('sha512').update(packages.get('@ras-test/alpha-old')!.archive).digest('base64')}`,
                  },
                },
              }
            : {}),
        },
      }),
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing test registry address')
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests: () => requests,
    close: async () => {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
      await rm(directory, { recursive: true, force: true })
    },
  }
}
