import { mkdtemp, readFile, rm, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUploads, type UploadHooks } from './uploads'

const origin = 'https://app.example'
let directory: string
let uploads: ReturnType<typeof createUploads>
let complete: ReturnType<typeof vi.fn<UploadHooks['complete']>>

beforeEach(async () => {
  vi.stubEnv('APP_URL', undefined)
  vi.stubEnv('TRUST_PROXY', undefined)
  directory = await mkdtemp(join(tmpdir(), 'uploads-'))
  complete = vi.fn<UploadHooks['complete']>()
  uploads = createUploads({ owner: (request) => request.headers.get('x-test-owner') || undefined, complete }, directory)
})

afterEach(async () => {
  uploads.close()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true })
})

function tusRequest(method: string, path: string, headers: Record<string, string>, body?: string) {
  const sameOrigin: Record<string, string> = method === 'HEAD' ? {} : { origin, 'sec-fetch-site': 'same-origin' }
  return new Request(`${origin}${path}`, {
    method,
    headers: { 'tus-resumable': '1.0.0', 'x-test-owner': 'ada', ...sameOrigin, ...headers },
    ...(body === undefined ? {} : { body }),
  })
}

const metadata = (values: Record<string, string>) =>
  Object.entries(values)
    .map(([key, value]) => `${key} ${Buffer.from(value).toString('base64')}`)
    .join(',')

async function create(length: number, headers: Record<string, string> = {}) {
  const response = await uploads.handle(
    tusRequest('POST', '/api/uploads', {
      'upload-length': String(length),
      'upload-metadata': metadata({ filename: 'notes.txt' }),
      ...headers,
    }),
  )
  return { response, location: response.headers.get('location') ?? '' }
}

const patch = (location: string, body: string, headers: Record<string, string> = {}) =>
  uploads.handle(
    tusRequest('PATCH', location, { 'upload-offset': '0', 'content-type': 'application/offset+octet-stream', ...headers }, body),
  )

const idOf = (location: string) => location.split('/').at(-1)!

describe('creating an upload', () => {
  it('answers with a relative location under the uploads path', async () => {
    const { response, location } = await create(4)
    expect({ status: response.status, location: location.startsWith('/api/uploads/') }).toEqual({ status: 201, location: true })
  })

  it('records the owner from the server, not the client', async () => {
    const { location } = await create(4, { 'upload-metadata': metadata({ filename: 'notes.txt', owner: 'mallory' }) })
    const info = JSON.parse(await readFile(join(directory, `${idOf(location)}.json`), 'utf8')) as { metadata: Record<string, string> }
    expect(info.metadata.owner).toBe('ada')
  })

  it('refuses an anonymous request', async () => {
    const { response } = await create(4, { 'x-test-owner': '' })
    expect(response.status).toBe(401)
  })

  it('refuses a request from another site', async () => {
    const { response } = await create(4, { origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site' })
    expect(response.status).toBe(403)
  })

  it('refuses a file above the size limit', async () => {
    const { response } = await create(200 * 1024 * 1024)
    expect(response.status).toBe(413)
  })

  it('requires the length up front', async () => {
    const response = await uploads.handle(
      tusRequest('POST', '/api/uploads', { 'upload-defer-length': '1', 'upload-metadata': metadata({ filename: 'notes.txt' }) }),
    )
    expect(response.status).toBe(400)
  })

  it('refuses a filename with a path', async () => {
    const { response } = await create(4, { 'upload-metadata': metadata({ filename: '../notes.txt' }) })
    expect(response.status).toBe(400)
  })

  it('limits unfinished uploads per owner', async () => {
    for (let index = 0; index < 3; index++) await create(4)
    const { response } = await create(4)
    expect(response.status).toBe(429)
  })

  it('frees the slot of an upload abandoned for fifteen minutes', async () => {
    const { location } = await create(4)
    await create(4)
    await create(4)
    const stale = new Date(Date.now() - 16 * 60 * 1000)
    await utimes(join(directory, idOf(location)), stale, stale)
    const { response } = await create(4)
    expect(response.status).toBe(201)
  })
})

describe('finishing an upload', () => {
  it('records it with its owner once the last byte arrives', async () => {
    const { location } = await create(4)
    const response = await patch(location, 'data')
    expect({ status: response.status, owner: complete.mock.calls[0]?.[0], offset: complete.mock.calls[0]?.[1].offset }).toEqual({
      status: 204,
      owner: 'ada',
      offset: 4,
    })
  })

  it('records it again when a client resumes an upload whose recording failed', async () => {
    const { location } = await create(4)
    complete.mockRejectedValueOnce(new Error('database unavailable'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await patch(location, 'data')
    const response = await uploads.handle(tusRequest('HEAD', location, {}))
    expect({ status: response.status, calls: complete.mock.calls.length }).toEqual({ status: 200, calls: 2 })
  })

  it('hides the detail of an unexpected failure from the client', async () => {
    const { location } = await create(4)
    complete.mockRejectedValueOnce(new Error('ENOSPC: /data/uploads/secret-path'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = await patch(location, 'data')
    expect({ status: response.status, body: await response.text() }).toEqual({ status: 500, body: 'upload failed' })
  })

  it('serves the stored file to the application', async () => {
    const { location } = await create(4)
    await patch(location, 'data')
    expect(await readFile(await uploads.file(idOf(location)), 'utf8')).toBe('data')
  })
})

describe('another owner', () => {
  it('cannot see an upload', async () => {
    const { location } = await create(4)
    const response = await uploads.handle(tusRequest('HEAD', location, { 'x-test-owner': 'mallory' }))
    expect(response.status).toBe(404)
  })

  it('cannot write to an upload', async () => {
    const { location } = await create(4)
    const response = await patch(location, 'data', { 'x-test-owner': 'mallory' })
    expect(response.status).toBe(404)
  })
})

describe('cancelling an upload', () => {
  it('deletes an unfinished upload', async () => {
    const { location } = await create(4)
    const response = await uploads.handle(tusRequest('DELETE', location, {}))
    const after = await uploads.handle(tusRequest('HEAD', location, {}))
    expect([response.status, after.status]).toEqual([204, 404])
  })

  it('leaves a finished upload to the application', async () => {
    const { location } = await create(4)
    await patch(location, 'data')
    const response = await uploads.handle(tusRequest('DELETE', location, {}))
    expect(response.status).toBe(400)
  })
})
