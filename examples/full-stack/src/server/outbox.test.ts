import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { clearGlobalSingleton } from 'ras-stack/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app, closeApp } from './app'
import { assertOutboxCapacity, OutboxWorker, outboxCapacity, outboxStatus } from './outbox'
import { outbox } from './schema'

let directory: string

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'ras-stack-example-outbox-'))
  process.env.DATA_DIR = directory
  process.env.APP_URL = 'http://localhost:3100'
})

afterEach(async () => {
  vi.useRealTimers()
  await clearGlobalSingleton('ras-stack.example.full-stack', closeApp)
  await rm(directory, { recursive: true, force: true })
  delete process.env.DATA_DIR
  delete process.env.APP_URL
})

describe('transactional outbox worker', () => {
  it('retains a failed publication and deletes it only after delivery', async () => {
    const now = new Date()
    app()
      .database.insert(outbox)
      .values({ channel: 'messages:all', payload: JSON.stringify({ id: 1 }), availableAt: now, createdAt: now })
      .run()
    const publish = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
    const worker = new OutboxWorker({ database: app().database, enabled: false, publish, batchSize: 1 })
    await worker.drain()
    const retained = app().database.select().from(outbox).get()!
    expect(retained.attempts).toBe(1)
    app()
      .database.update(outbox)
      .set({ availableAt: new Date(0) })
      .where(eq(outbox.id, retained.id))
      .run()
    await worker.drain()
    expect(app().database.select().from(outbox).all()).toEqual([])
  })

  it('does not overtake the oldest item while it waits for retry', async () => {
    const now = new Date()
    app()
      .database.insert(outbox)
      .values([
        { channel: 'messages:all', payload: JSON.stringify({ id: 1 }), availableAt: now, createdAt: now },
        { channel: 'messages:all', payload: JSON.stringify({ id: 2 }), availableAt: now, createdAt: now },
      ])
      .run()
    const publish = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    const worker = new OutboxWorker({ database: app().database, enabled: false, publish })
    await worker.drain()
    await worker.drain()
    expect(publish).toHaveBeenCalledTimes(1)
    app()
      .database.update(outbox)
      .set({ availableAt: new Date(0) })
      .run()
    await worker.drain()
    expect(publish.mock.calls.map(([, payload]) => payload)).toEqual([{ id: 1 }, { id: 1 }, { id: 2 }])
  })

  it('dead-letters terminal failures and exposes degraded status', async () => {
    const now = new Date()
    app()
      .database.insert(outbox)
      .values({ channel: 'messages:all', payload: JSON.stringify({ id: 1 }), availableAt: now, createdAt: now })
      .run()
    const worker = new OutboxWorker({
      database: app().database,
      enabled: false,
      publish: vi.fn().mockRejectedValue(new Error('offline')),
      maxAttempts: 2,
    })
    await worker.drain()
    app()
      .database.update(outbox)
      .set({ availableAt: new Date(0) })
      .run()
    await worker.drain()
    expect(outboxStatus(app().database)).toEqual({ pending: 0, failed: 1 })
  })

  it('rejects new work when pending and dead-lettered items reach capacity', () => {
    const now = new Date()
    app().database.transaction((transaction) => {
      for (let index = 0; index < outboxCapacity - 1; index += 1) {
        transaction.insert(outbox).values({ channel: 'messages:all', payload: '{}', availableAt: now, createdAt: now }).run()
      }
      transaction.insert(outbox).values({ channel: 'messages:all', payload: '{}', availableAt: now, createdAt: now, failedAt: now }).run()
    })
    expect(capture(() => assertOutboxCapacity(app().database))).toMatchObject({ status: 503 })
  })

  it('reports a scheduled drain failure and keeps scheduling', async () => {
    vi.useFakeTimers()
    const onError = vi.fn()
    const worker = new OutboxWorker({ database: app().database, enabled: true, publish: vi.fn(), intervalMs: 10, onError })
    const drain = vi.spyOn(worker, 'drain').mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValue()
    worker.start()
    await vi.advanceTimersByTimeAsync(10)
    expect({ calls: drain.mock.calls.length, errors: onError.mock.calls }).toEqual({
      calls: 2,
      errors: [[expect.objectContaining({ message: 'database unavailable' })]],
    })
    await worker.close()
  })

  it('propagates the final drain failure during close', async () => {
    const worker = new OutboxWorker({ database: app().database, enabled: true, publish: vi.fn() })
    vi.spyOn(worker, 'drain').mockRejectedValue(new Error('database unavailable'))
    await expect(worker.close()).rejects.toThrow('database unavailable')
  })
})

function capture(operation: () => unknown) {
  try {
    operation()
  } catch (error) {
    return error
  }
  throw new Error('Expected operation to fail')
}
