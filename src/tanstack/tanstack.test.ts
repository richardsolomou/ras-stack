import { describe, expect, it, vi } from 'vitest'
import { createStackQueryClient, queryErrorMessage } from './query.js'
import { createTanStackRpc, requireTanStackMutationOrigin } from './server.js'

describe('TanStack RPC integration', () => {
  it('uses the ambient request for mutation policy', async () => {
    const request = new Request('https://example.com/action', { method: 'POST' })
    const requireMutation = vi.fn()
    const { mutationRpc } = createTanStackRpc({ getRequest: () => request, requireMutation })

    await expect(mutationRpc(() => 'saved')).resolves.toBe('saved')
    expect(requireMutation).toHaveBeenCalledWith(request)
  })

  it('applies same-origin policy to an explicit request', () => {
    const request = new Request('https://example.com/action', {
      method: 'POST',
      headers: { origin: 'https://example.com' },
    })

    expect(() => requireTanStackMutationOrigin({}, request)).not.toThrow()
  })
})

describe('TanStack Query integration', () => {
  it('uses the shared stale time by default', () => {
    expect(createStackQueryClient().getDefaultOptions().queries?.staleTime).toBe(1000)
  })

  it('allows applications to replace query defaults', () => {
    expect(createStackQueryClient({ defaultOptions: { queries: { staleTime: 5000 } } }).getDefaultOptions().queries?.staleTime).toBe(5000)
  })

  it('normalizes unknown errors for user-facing messages', () => {
    expect(queryErrorMessage('failed')).toBe('Something went wrong. Try again.')
  })

  it('preserves application error messages', () => {
    expect(queryErrorMessage(new Error('Try another name.'))).toBe('Try another name.')
  })
})
