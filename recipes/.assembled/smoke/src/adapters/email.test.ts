import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authEmails, EMAIL_TEMPLATES, emailDelivery } from './email'

const posthog = vi.hoisted(() => ({ constructor: vi.fn(), send: vi.fn() }))

vi.mock('posthog-node', () => ({
  PostHog: class {
    emails = { send: posthog.send }
    constructor(...args: unknown[]) {
      posthog.constructor(...args)
    }
  },
}))

const environment = { POSTHOG_EMAIL_API_KEY: 'phs_email', VITE_POSTHOG_PROJECT_TOKEN: 'phc_project' }

beforeEach(() => {
  vi.clearAllMocks()
  posthog.send.mockResolvedValue({ data: { id: 'message', replayed: false, warnings: [] }, error: null })
  EMAIL_TEMPLATES.resetPassword = 'reset-template'
  EMAIL_TEMPLATES.verifyEmail = 'verify-template'
})

describe('emailDelivery', () => {
  it('is disabled without an email key', () => {
    expect(emailDelivery({ VITE_POSTHOG_PROJECT_TOKEN: 'phc_project' })).toBeUndefined()
  })

  it('is disabled without a project token', () => {
    expect(emailDelivery({ POSTHOG_EMAIL_API_KEY: 'phs_email' })).toBeUndefined()
  })

  it('never polls flag definitions with the email-only key', () => {
    emailDelivery(environment)
    expect(posthog.constructor).toHaveBeenCalledWith(
      'phc_project',
      expect.objectContaining({ secretKey: 'phs_email', enableLocalEvaluation: false }),
    )
  })

  it('sends the template with its data', async () => {
    await emailDelivery(environment)?.send({ template: 'resetPassword', to: 'ada@example.com', data: { url: 'https://example.com/r' } })
    expect(posthog.send).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'reset-template', templateData: { url: 'https://example.com/r' } }),
    )
  })

  it('throws the error PostHog returns', async () => {
    const error = new Error('rate limited')
    posthog.send.mockResolvedValue({ data: null, error })
    await expect(emailDelivery(environment)?.send({ template: 'resetPassword', to: 'ada@example.com', data: {} })).rejects.toBe(error)
  })

  it('refuses a template with no id', async () => {
    EMAIL_TEMPLATES.verifyEmail = ''
    await expect(emailDelivery(environment)?.send({ template: 'verifyEmail', to: 'ada@example.com', data: {} })).rejects.toThrow(
      'verifyEmail',
    )
  })
})

describe('authEmails', () => {
  it('sends the reset link to the user as their own person', async () => {
    const delivery = { send: vi.fn().mockResolvedValue(undefined) }
    await authEmails(delivery).sendResetPassword({
      user: { id: 'u1', email: 'ada@example.com', name: 'Ada' },
      url: 'https://example.com/r',
    })
    expect(delivery.send).toHaveBeenCalledWith({
      template: 'resetPassword',
      to: 'ada@example.com',
      distinctId: 'u1',
      data: { name: 'Ada', url: 'https://example.com/r' },
    })
  })

  it('sends the verification link with the verification template', async () => {
    const delivery = { send: vi.fn().mockResolvedValue(undefined) }
    await authEmails(delivery).sendVerificationEmail({
      user: { id: 'u1', email: 'ada@example.com', name: 'Ada' },
      url: 'https://example.com/v',
    })
    expect(delivery.send).toHaveBeenCalledWith(expect.objectContaining({ template: 'verifyEmail' }))
  })
})
