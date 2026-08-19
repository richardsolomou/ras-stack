import { describe, expect, it, vi } from 'vitest'
import { reportPreviewStatus } from './github.js'

describe('GitHub preview status', () => {
  it('creates one successful check and pull request comment', async () => {
    const request = githubFetch({ checks: [], comments: [] })
    await reportPreviewStatus(previewOptions(request), {
      state: 'ready',
      prNumber: '42',
      sha: 'a'.repeat(40),
      previewUrl: 'https://pr-42.example.com',
    })

    expect(request.calls.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'GET /repos/owner/app/commits/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/check-runs',
      'POST /repos/owner/app/check-runs',
      'GET /repos/owner/app/issues/42/comments',
      'POST /repos/owner/app/issues/42/comments',
    ])
    expect(request.calls[1]?.body).toMatchObject({ status: 'completed', conclusion: 'success' })
    expect(request.calls[3]?.body).toEqual({
      body: '<!-- app-preview -->\n✅ Preview is up to date with commit `aaaaaaa`.\n\nPreview: https://pr-42.example.com\n\nDisposable test data.',
    })
  })

  it('updates existing records and reports the still-running commit', async () => {
    const request = githubFetch({
      checks: [{ id: 7 }],
      comments: [{ id: 8, body: '<!-- app-preview -->\n✅ Preview is up to date with commit `bbbbbbb`.' }],
    })
    await reportPreviewStatus(previewOptions(request), {
      state: 'building',
      prNumber: '42',
      sha: 'a'.repeat(40),
      previewUrl: 'https://pr-42.example.com',
    })

    expect(request.calls.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'GET /repos/owner/app/commits/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/check-runs',
      'PATCH /repos/owner/app/check-runs/7',
      'GET /repos/owner/app/issues/42/comments',
      'PATCH /repos/owner/app/issues/comments/8',
    ])
    expect(request.calls[3]?.body).toMatchObject({ body: expect.stringContaining('The preview of `bbbbbbb` stays up until it does.') })
  })

  it('reports a generated preview before its URL is resolved', async () => {
    const request = githubFetch({ checks: [], comments: [] })
    await reportPreviewStatus(previewOptions(request), {
      state: 'building',
      prNumber: '42',
      sha: 'a'.repeat(40),
    })

    expect(request.calls[3]?.body).toEqual({
      body: '<!-- app-preview -->\n🔄 Deploying `aaaaaaa`.\n\nDisposable test data.',
    })
  })

  it('reports a failed generated preview without a resolved URL', async () => {
    const request = githubFetch({ checks: [], comments: [] })
    await reportPreviewStatus(previewOptions(request), {
      state: 'failed',
      prNumber: '42',
      sha: 'a'.repeat(40),
      runUrl: 'https://github.com/owner/app/actions/runs/1',
    })

    expect(request.calls[1]?.body).toMatchObject({ status: 'completed', conclusion: 'failure' })
    expect(request.calls[3]?.body).toEqual({
      body: '<!-- app-preview -->\n❌ Deploying commit `aaaaaaa` failed ([workflow run](https://github.com/owner/app/actions/runs/1)). The preview may be stale or unavailable.\n\nDisposable test data.',
    })
  })

  it('deletes the comment state without requiring a commit SHA', async () => {
    const request = githubFetch({ checks: [], comments: [{ id: 8, body: '<!-- app-preview -->' }] })
    await reportPreviewStatus(previewOptions(request), { state: 'deleted', prNumber: '42' })

    expect(request.calls.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'GET /repos/owner/app/issues/42/comments',
      'PATCH /repos/owner/app/issues/comments/8',
    ])
    expect(request.calls[1]?.body).toEqual({ body: '<!-- app-preview -->\n🗑️ Preview deleted because this pull request was closed.' })
  })

  it('rejects a ready status without a URL before changing GitHub state', async () => {
    const request = githubFetch({ checks: [], comments: [] })

    await expect(reportPreviewStatus(previewOptions(request), { state: 'ready', prNumber: '42', sha: 'a'.repeat(40) })).rejects.toThrow(
      'preview URL is required',
    )
    expect(request).not.toHaveBeenCalled()
  })

  it('rejects untrusted repository, pull request, and commit values', async () => {
    const request = githubFetch({ checks: [], comments: [] })
    await expect(
      reportPreviewStatus({ ...previewOptions(request), repository: '../admin' }, { state: 'deleted', prNumber: '42' }),
    ).rejects.toThrow('repository')
    await expect(reportPreviewStatus({ ...previewOptions(request), marker: '' }, { state: 'deleted', prNumber: '42' })).rejects.toThrow(
      'marker',
    )
    await expect(reportPreviewStatus(previewOptions(request), { state: 'deleted', prNumber: '../42' })).rejects.toThrow('pull request')
    await expect(reportPreviewStatus(previewOptions(request), { state: 'ready', prNumber: '42', sha: 'HEAD' })).rejects.toThrow(
      'commit SHA',
    )
  })
})

function previewOptions(fetch: typeof globalThis.fetch) {
  return {
    repository: 'owner/app',
    token: 'secret',
    marker: '<!-- app-preview -->',
    note: 'Disposable test data.',
    fetch,
  }
}

function githubFetch(initial: { checks: { id: number }[]; comments: { id: number; body?: string }[] }) {
  const calls: { method: string; path: string; body?: unknown }[] = []
  const request = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = input instanceof Request ? new URL(input.url) : new URL(input)
    const method = init?.method ?? 'GET'
    calls.push({ method, path: url.pathname, ...(typeof init?.body === 'string' ? { body: JSON.parse(init.body) } : {}) })
    if (url.pathname.endsWith('/check-runs') && method === 'GET') return Response.json({ check_runs: initial.checks })
    if (url.pathname.endsWith('/comments') && method === 'GET') return Response.json(initial.comments)
    return Response.json({ id: 1 })
  }) as unknown as typeof globalThis.fetch & { calls: typeof calls }
  request.calls = calls
  return request
}
