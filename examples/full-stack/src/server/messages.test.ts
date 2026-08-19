import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { clearGlobalSingleton } from 'ras-stack/server'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { app, closeApp } from './app'
import { writeMessage } from './messages'
import { outboxCapacity } from './outbox'
import { messages, outbox, user } from './schema'

let directory: string

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'ras-stack-example-messages-'))
  process.env.DATA_DIR = directory
  process.env.APP_URL = 'http://localhost:3100'
  const now = new Date()
  app().database.insert(user).values({ id: 'alice', name: 'Alice', email: 'alice@example.test', createdAt: now, updatedAt: now }).run()
})

afterEach(async () => {
  await clearGlobalSingleton('ras-stack.example.full-stack', closeApp)
  await rm(directory, { recursive: true, force: true })
  delete process.env.DATA_DIR
  delete process.env.APP_URL
})

it('writes without adding to a full outbox when realtime is disabled', () => {
  const now = new Date()
  app().database.transaction((transaction) => {
    for (let index = 0; index < outboxCapacity; index += 1) {
      transaction.insert(outbox).values({ channel: 'messages:all', payload: '{}', availableAt: now, createdAt: now }).run()
    }
  })
  writeMessage(app().database, false, { authorId: 'alice', author: 'Alice', body: 'stored without realtime', createdAt: now })
  expect(app().database.select().from(messages).all()).toHaveLength(1)
  expect(app().database.select().from(outbox).all()).toHaveLength(outboxCapacity)
})
