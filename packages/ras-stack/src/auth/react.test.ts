import { createElement } from 'react'
import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { useAuthAction } from './react.js'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('headless auth action state', () => {
  it('tracks pending work and maps Better Auth failures', async () => {
    let resolve!: (value: { error: { message: string } }) => void
    const work = new Promise<{ error: { message: string } }>((done) => {
      resolve = done
    })
    let action!: ReturnType<typeof useAuthAction>
    const warning = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let rendered: ReturnType<typeof create>
    await act(async () => {
      rendered = create(createElement(() => ((action = useAuthAction()), null)))
    })
    let result!: Promise<unknown>
    await act(async () => {
      result = action.run(() => work)
    })
    expect(action.busy).toBe(true)
    await act(async () => {
      resolve({ error: { message: 'Account disabled.' } })
      await result
    })
    const warnings = warning.mock.calls.map(([message]) => String(message))
    await act(async () => rendered.unmount())
    warning.mockRestore()
    expect({ busy: action.busy, error: action.error, warnings }).toEqual({
      busy: false,
      error: 'Account disabled.',
      warnings: ['react-test-renderer is deprecated. See https://react.dev/warnings/react-test-renderer'],
    })
  })

  it('turns thrown transport failures into action results', async () => {
    let action!: ReturnType<typeof useAuthAction>
    const warning = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let rendered: ReturnType<typeof create>
    await act(async () => {
      rendered = create(createElement(() => ((action = useAuthAction()), null)))
    })
    let result: unknown
    await act(async () => {
      result = await action.run(() => Promise.reject(new Error('Network unavailable.')))
    })
    await act(async () => rendered.unmount())
    warning.mockRestore()
    expect({ error: action.error, result }).toEqual({
      error: 'Network unavailable.',
      result: { error: expect.objectContaining({ message: 'Network unavailable.' }) },
    })
  })
})
