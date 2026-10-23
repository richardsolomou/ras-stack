import { createElement, Suspense } from 'react'
import { act, create } from 'react-test-renderer'
import { dehydrate, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { createQueryClient, QueryProvider } from './index.js'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
afterEach(() => vi.restoreAllMocks())

it('keeps hydrated queries fresh for one minute by default', () => {
  expect(createQueryClient().getDefaultOptions().queries?.staleTime).toBe(60_000)
})

it('preserves application query and mutation settings', () => {
  expect(
    createQueryClient({ defaultOptions: { queries: { staleTime: 0, retry: false }, mutations: { retry: 2 } } }).getDefaultOptions(),
  ).toEqual({
    queries: { staleTime: 0, retry: false },
    mutations: { retry: 2 },
  })
})

it('does not share cache data between server requests', () => {
  const first = createQueryClient()
  first.setQueryData(['private'], 'first request')
  expect(createQueryClient().getQueryData(['private'])).toBeUndefined()
  first.clear()
})

it('retains the provider client across renders and hydrates server data', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const server = createQueryClient()
  server.setQueryData(['probe'], 42)
  const clients: ReturnType<typeof createQueryClient>[] = []
  function Probe() {
    clients.push(useQueryClient())
    return null
  }
  let rendered!: ReturnType<typeof create>
  await act(async () => {
    rendered = create(createElement(QueryProvider, { client: server, state: dehydrate(server) }, createElement(Probe)))
  })
  await act(async () => rendered.update(createElement(QueryProvider, { client: server }, createElement(Probe))))
  expect({ sameClient: clients[0] === clients[1], hydratedData: clients[0]!.getQueryData(['probe']) }).toEqual({
    sameClient: true,
    hydratedData: 42,
  })
  await act(async () => rendered.unmount())
  server.clear()
  clients[0]!.clear()
})

it('rejects missing client ownership', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  await expect(
    act(async () => {
      // @ts-expect-error JavaScript callers can omit a required prop.
      create(createElement(QueryProvider, {}))
    }),
  ).rejects.toThrow('QueryProvider requires a client')
})

it('finishes an initially suspended query without replacing its client', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const client = createQueryClient()
  let complete!: (value: string) => void
  const result = new Promise<string>((resolve) => {
    complete = resolve
  })
  const request = vi.fn(() => result)
  function Page() {
    const { data } = useSuspenseQuery({ queryKey: ['suspense'], queryFn: request })
    return createElement('p', null, data)
  }
  let rendered!: ReturnType<typeof create>
  try {
    await act(async () => {
      rendered = create(createElement(Suspense, { fallback: 'loading' }, createElement(QueryProvider, { client }, createElement(Page))))
    })
    await act(async () => complete('loaded'))
    expect({ output: rendered.toJSON(), requests: request.mock.calls.length }).toEqual({
      output: { type: 'p', props: {}, children: ['loaded'] },
      requests: 1,
    })
  } finally {
    await act(async () => rendered.unmount())
    client.clear()
  }
})

it('uses a supplied client without replacing application caches', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const client = createQueryClient()
  let actual: unknown
  function Probe() {
    actual = useQueryClient()
    return null
  }
  let rendered!: ReturnType<typeof create>
  await act(async () => {
    rendered = create(createElement(QueryProvider, { client }, createElement(Probe)))
  })
  expect(actual).toBe(client)
  await act(async () => rendered.unmount())
  client.clear()
})
