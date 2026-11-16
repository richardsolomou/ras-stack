import { expect, it } from 'vitest'
import { createQueryClient } from './queryClient'

it('keeps hydrated queries fresh briefly', () => {
  expect(createQueryClient().getDefaultOptions().queries?.staleTime).toBe(1000)
})

it('does not share cached data between clients', () => {
  const first = createQueryClient()
  first.setQueryData(['private'], 'first request')
  expect(createQueryClient().getQueryData(['private'])).toBeUndefined()
})
