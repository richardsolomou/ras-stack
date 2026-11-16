import type { NitroApp } from 'nitro/types'
import { afterEach, expect, it, vi } from 'vitest'
import { app, closeApp } from './app'
import shutdown from './shutdown'

afterEach(() => closeApp())

function closeHooks() {
  const hooks: Array<() => unknown> = []
  shutdown({ hooks: { hook: (_name: string, hook: () => unknown) => hooks.push(hook) } } as unknown as NitroApp & {
    hooks: NonNullable<NitroApp['hooks']>
  })
  return hooks
}

it('closes the app when Nitro closes', async () => {
  const close = vi.spyOn(app(), 'close')
  await Promise.all(closeHooks().map((hook) => hook()))
  expect(close).toHaveBeenCalledOnce()
})
