import { expect, it, vi } from 'vitest'
import { app, closeApp } from './app'

it('closes every resource once and reports aggregate shutdown failure', async () => {
  const failure = new Error('outbox failed')
  const uploadClose = vi.fn().mockResolvedValue(undefined)
  const publisherClose = vi.fn().mockResolvedValue(undefined)
  const telemetryShutdown = vi.fn().mockResolvedValue(undefined)
  const databaseClose = vi.fn()
  const resources = {
    outbox: { close: vi.fn().mockRejectedValue(failure) },
    uploadStore: { close: uploadClose },
    publisher: { close: publisherClose },
    telemetry: { shutdown: telemetryShutdown },
    database: { $client: { close: databaseClose } },
  } as unknown as ReturnType<typeof app>
  const closing = closeApp(resources)
  expect(closeApp(resources)).toBe(closing)
  await expect(closing).rejects.toMatchObject({ errors: [failure] })
  expect(uploadClose).toHaveBeenCalledOnce()
  expect(publisherClose).toHaveBeenCalledOnce()
  expect(telemetryShutdown).toHaveBeenCalledOnce()
  expect(databaseClose).toHaveBeenCalledOnce()
})
