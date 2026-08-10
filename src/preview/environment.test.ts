import { describe, expect, it } from 'vitest'
import { previewStatusFromEnvironment } from './environment.js'

const common = {
  GITHUB_REPOSITORY: 'owner/app',
  GH_TOKEN: 'token',
  PREVIEW_MARKER: '<!-- app-preview -->',
  PR_NUMBER: '42',
}

describe('preview status environment', () => {
  it('builds an active status request', () => {
    expect(
      previewStatusFromEnvironment('ready', {
        ...common,
        COMMIT_SHA: 'a'.repeat(40),
        PREVIEW_URL: 'https://pr-42.example.com',
        RUN_URL: 'https://github.com/owner/app/actions/runs/1',
        PREVIEW_NOTE: 'Disposable data.',
      }),
    ).toEqual({
      options: {
        repository: 'owner/app',
        token: 'token',
        marker: '<!-- app-preview -->',
        note: 'Disposable data.',
      },
      status: {
        state: 'ready',
        prNumber: '42',
        sha: 'a'.repeat(40),
        previewUrl: 'https://pr-42.example.com',
        runUrl: 'https://github.com/owner/app/actions/runs/1',
      },
    })
  })

  it('builds a deleted status without active deployment fields', () => {
    expect(previewStatusFromEnvironment('deleted', common)).toEqual({
      options: { repository: 'owner/app', token: 'token', marker: '<!-- app-preview -->' },
      status: { state: 'deleted', prNumber: '42' },
    })
  })

  it('rejects missing and invalid inputs before calling GitHub', () => {
    expect(() => previewStatusFromEnvironment('ready', common)).toThrow('COMMIT_SHA is required')
    expect(() => previewStatusFromEnvironment('unknown', common)).toThrow('preview state')
  })
})
