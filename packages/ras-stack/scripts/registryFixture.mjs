import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'

const packages = process.argv.slice(2).map((archive) => ({
  archive: readFileSync(archive),
  manifest: JSON.parse(execFileSync('tar', ['-xOf', archive, 'package/package.json'], { encoding: 'utf8' })),
}))

const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost')
  if (url.pathname === '/ras-stack') {
    const address = server.address()
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(
      JSON.stringify({
        name: 'ras-stack',
        'dist-tags': { latest: packages[0].manifest.version },
        time: Object.fromEntries(packages.map(({ manifest }) => [manifest.version, '2020-01-01T00:00:00.000Z'])),
        versions: Object.fromEntries(
          packages.map(({ archive, manifest }) => [
            manifest.version,
            {
              ...manifest,
              dist: {
                tarball: `http://127.0.0.1:${address.port}/ras-stack-${manifest.version}.tgz`,
                integrity: `sha512-${createHash('sha512').update(archive).digest('base64')}`,
              },
            },
          ]),
        ),
      }),
    )
    return
  }
  const pkg = packages.find(({ manifest }) => url.pathname === `/ras-stack-${manifest.version}.tgz`)
  if (pkg) {
    response.writeHead(200, { 'content-type': 'application/octet-stream' })
    response.end(pkg.archive)
    return
  }
  response.writeHead(302, { location: `https://registry.npmjs.org${request.url}` })
  response.end()
})
server.listen(0, '127.0.0.1', () => process.send({ url: `http://127.0.0.1:${server.address().port}/` }))
