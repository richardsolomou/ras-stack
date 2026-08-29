import { execFileSync } from 'node:child_process'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../../..')
const reference = /ghcr\.io\/([^\s:@'"]+ras-stack-runtime-binaries):(runtime-v[\d.]+)@(sha256:[0-9a-f]{64})/g

const found = new Map()
for (const line of gitGrep('ras-stack-runtime-binaries')) {
  const [file, ...rest] = line.split(':')
  for (const [pinned, repository, tag, digest] of rest.join(':').matchAll(reference)) {
    found.set(pinned, { repository, tag, digest, files: [...(found.get(pinned)?.files ?? []), file] })
  }
}

if (found.size === 0) throw new Error('No pinned runtime binaries image found; the pin check would silently pass')
if (found.size > 1) {
  const drift = [...found].map(([pinned, { files }]) => `  ${pinned}\n    ${[...new Set(files)].join('\n    ')}`)
  throw new Error(`Pinned runtime binaries image differs between files:\n${drift.join('\n')}`)
}

const [pinned, { repository, tag, digest }] = [...found][0]
const token = await request(`https://ghcr.io/token?scope=repository:${repository}:pull&service=ghcr.io`).then((response) => response.json())
const manifest = await request(`https://ghcr.io/v2/${repository}/manifests/${tag}`, {
  headers: {
    accept: 'application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.list.v2+json',
    authorization: `Bearer ${token.token}`,
  },
})

const published = manifest.headers.get('docker-content-digest')
if (published !== digest) throw new Error(`${tag} publishes ${published}, but the repository pins ${digest}`)

const platforms = new Set(
  (await manifest.json()).manifests
    ?.map(({ platform }) => `${platform?.os}/${platform?.architecture}`)
    .filter((platform) => !platform.includes('unknown')),
)
for (const required of ['linux/amd64', 'linux/arm64']) {
  if (!platforms.has(required)) {
    throw new Error(`${tag} has no ${required} manifest; it publishes ${[...platforms].join(', ')}`)
  }
}

console.log(`${pinned} resolves, covering ${[...platforms].join(' and ')}`)

function gitGrep(term) {
  try {
    return execFileSync('git', ['grep', '--fixed-strings', '--line-number', term], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
  } catch (error) {
    if (error.status === 1) return []
    throw error
  }
}

async function request(url, options) {
  const response = await fetch(url, options)
  if (!response.ok) throw new Error(`${url} responded ${response.status} ${response.statusText}`)
  return response
}
