import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { clearGlobalSingleton } from 'ras-stack/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app, closeApp } from './app'
import { uploads, user } from './schema'
import { UploadStore } from './uploads'

let directory: string

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'ras-stack-example-upload-'))
  process.env.DATA_DIR = directory
  process.env.APP_URL = 'http://localhost:3100'
  const now = new Date()
  app()
    .database.insert(user)
    .values([
      { id: 'alice', name: 'Alice', email: 'alice@example.test', createdAt: now, updatedAt: now },
      { id: 'bob', name: 'Bob', email: 'bob@example.test', createdAt: now, updatedAt: now },
    ])
    .run()
})

afterEach(async () => {
  vi.useRealTimers()
  await clearGlobalSingleton('ras-stack.example.full-stack', closeApp)
  await rm(directory, { recursive: true, force: true })
  delete process.env.DATA_DIR
  delete process.env.APP_URL
})

describe('durable upload store', () => {
  it('persists completed content and metadata', async () => {
    const id = app().uploadStore.create('alice', 5, metadata('proof.txt', 'text/plain'))
    const upload = await app().uploadStore.append(id, 'alice', 0, new TextEncoder().encode('proof'))
    expect({ filename: upload.filename, offset: upload.offset, state: upload.state }).toEqual({
      filename: 'proof.txt',
      offset: 5,
      state: 'complete',
    })
    expect((await stat(path.join(directory, 'uploads', `${id}.bin`))).size).toBe(5)
  })

  it('continues after a rejected chunk without retaining a poisoned queue', async () => {
    const id = app().uploadStore.create('alice', 5, metadata('proof.txt', 'text/plain'))
    await expect(app().uploadStore.append(id, 'alice', 1, new TextEncoder().encode('wrong'))).rejects.toMatchObject({ status: 409 })
    await expect(app().uploadStore.append(id, 'alice', 0, new TextEncoder().encode('proof'))).resolves.toMatchObject({
      offset: 5,
      state: 'complete',
    })
  })

  it('does not reveal another user upload', () => {
    const id = app().uploadStore.create('alice', 5, metadata('proof.txt', 'text/plain'))
    expect(app().uploadStore.getOwned(id, 'bob')).toBeUndefined()
  })

  it('rejects unsafe metadata and quota overflow', () => {
    expect(capture(() => app().uploadStore.create('alice', 5, metadata('../proof.txt', 'text/plain')))).toMatchObject({ status: 400 })
    expect(capture(() => app().uploadStore.create('alice', 5, 'filename YWJj!,filetype dGV4dC9wbGFpbg=='))).toMatchObject({
      status: 400,
    })
    for (let index = 0; index < 5; index += 1) app().uploadStore.create('alice', 1_000_000, metadata(`proof-${index}.txt`, 'text/plain'))
    expect(capture(() => app().uploadStore.create('alice', 1, metadata('overflow.txt', 'text/plain')))).toMatchObject({ status: 413 })
  })

  it('removes content when metadata persistence fails', async () => {
    expect(capture(() => app().uploadStore.create('missing-user', 5, metadata('proof.txt', 'text/plain')))).toBeInstanceOf(Error)
    expect(await readdir(path.join(directory, 'uploads'))).toEqual([])
  })

  it('enforces the deployment byte cap across users', () => {
    const store = deploymentStore({ globalQuotaBytes: 6 })
    store.create('alice', 5, metadata('alice.txt', 'text/plain'))
    expect(capture(() => store.create('bob', 2, metadata('bob.txt', 'text/plain')))).toMatchObject({ status: 507 })
  })

  it('enforces the deployment file cap across users', () => {
    const store = deploymentStore({ globalMaxFiles: 1 })
    store.create('alice', 1, metadata('alice.txt', 'text/plain'))
    expect(capture(() => store.create('bob', 1, metadata('bob.txt', 'text/plain')))).toMatchObject({ status: 507 })
  })

  it('periodically removes uploads abandoned after startup', async () => {
    await app().uploadStore.close()
    vi.useFakeTimers()
    app().uploadStore.startCleanup(10)
    const id = app().uploadStore.create('alice', 5, metadata('stale.txt', 'text/plain'))
    app()
      .database.update(uploads)
      .set({ updatedAt: new Date(0) })
      .where(eq(uploads.id, id))
      .run()
    await vi.advanceTimersByTimeAsync(10)
    await expect(stat(path.join(directory, 'uploads', `${id}.bin`))).rejects.toMatchObject({ code: 'ENOENT' })
    vi.useRealTimers()
  })

  it('reports a scheduled cleanup failure and continues scheduling', async () => {
    vi.useFakeTimers()
    const onError = vi.fn()
    const store = deploymentStore({ onError })
    const cleanup = vi.spyOn(store, 'cleanupStale').mockImplementationOnce(() => {
      throw new Error('database unavailable')
    })
    store.startCleanup(10)
    await vi.advanceTimersByTimeAsync(10)
    expect({ calls: cleanup.mock.calls.length, errors: onError.mock.calls }).toEqual({
      calls: 2,
      errors: [[expect.objectContaining({ message: 'database unavailable' })]],
    })
    await store.close()
  })
})

function deploymentStore(overrides: Partial<ConstructorParameters<typeof UploadStore>[0]> = {}) {
  return new UploadStore({
    database: app().database,
    directory: path.join(directory, 'deployment-uploads'),
    maxBytes: 5,
    quotaBytes: 5,
    globalQuotaBytes: 100,
    globalMaxFiles: 100,
    ...overrides,
  })
}

function metadata(filename: string, filetype: string) {
  return `filename ${Buffer.from(filename).toString('base64')},filetype ${Buffer.from(filetype).toString('base64')}`
}

function capture(operation: () => unknown) {
  try {
    operation()
  } catch (error) {
    return error
  }
  throw new Error('Expected operation to fail')
}
