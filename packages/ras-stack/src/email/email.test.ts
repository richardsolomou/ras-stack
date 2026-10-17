import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ sendMail: vi.fn(), verify: vi.fn(), createTransport: vi.fn() }))

vi.mock('nodemailer', () => ({
  createTransport: mocks.createTransport,
}))

import { createSmtpDelivery, smtpConfigFromEnvironment, standardAuthEmails } from './index.js'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail, verify: mocks.verify })
})

describe('SMTP configuration', () => {
  it('returns undefined when SMTP is not configured', () => {
    expect(smtpConfigFromEnvironment({})).toBeUndefined()
  })

  it('parses a complete authenticated configuration', () => {
    expect(
      smtpConfigFromEnvironment({
        SMTP_HOST: ' smtp.example.com ',
        SMTP_PORT: '465',
        SMTP_SECURE: 'TRUE',
        SMTP_USER: ' user ',
        SMTP_PASSWORD: 'secret',
        EMAIL_FROM: 'mail@example.com',
      }),
    ).toEqual({
      from: 'mail@example.com',
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      user: 'user',
      password: 'secret',
    })
  })

  it('rejects partial credentials', () => {
    expect(() => smtpConfigFromEnvironment({ SMTP_HOST: 'smtp.example.com', EMAIL_FROM: 'mail@example.com', SMTP_USER: 'user' })).toThrow(
      'SMTP_USER and SMTP_PASSWORD must be configured together',
    )
  })

  it('rejects an invalid port', () => {
    expect(() => smtpConfigFromEnvironment({ SMTP_HOST: 'smtp.example.com', EMAIL_FROM: 'mail@example.com', SMTP_PORT: '0' })).toThrow(
      'SMTP_PORT must be a valid TCP port',
    )
  })

  it('supports application-specific environment keys', () => {
    expect(
      smtpConfigFromEnvironment({ MAIL_HOST: 'smtp.example.com', MAIL_FROM: 'mail@example.com' }, { host: 'MAIL_HOST', from: 'MAIL_FROM' }),
    ).toEqual({ from: 'mail@example.com', host: 'smtp.example.com', port: 587, secure: false })
  })
})

describe('SMTP delivery', () => {
  it('sends application-owned messages through the configured transport', async () => {
    mocks.sendMail.mockResolvedValue({})
    const delivery = createSmtpDelivery({ from: 'from@example.com', host: 'smtp.example.com', port: 587, secure: false })
    await delivery.send({ to: 'to@example.com', subject: 'Hello', text: 'Body' })
    expect(mocks.sendMail).toHaveBeenCalledWith({ from: 'from@example.com', to: 'to@example.com', subject: 'Hello', text: 'Body' })
  })

  it('exposes transport verification', async () => {
    mocks.verify.mockResolvedValue(true)
    const delivery = createSmtpDelivery({ from: 'from@example.com', host: 'smtp.example.com', port: 587, secure: false })
    await delivery.verify()
    expect(mocks.verify).toHaveBeenCalledOnce()
  })
})

describe('standard auth emails', () => {
  const user = { email: 'person@example.com' }

  it('sends the reset message with a plain-text link and an HTML button', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const { sendResetPassword } = standardAuthEmails({ send, verify: vi.fn() }, { productName: 'Example' })
    await sendResetPassword({ user, url: 'https://app.test/reset?token=1&x=2', token: '1' })
    expect(send).toHaveBeenCalledWith({
      to: 'person@example.com',
      subject: 'Reset your Example password',
      text: 'Reset your Example password using this link: https://app.test/reset?token=1&x=2\n\nThis link expires in one hour.',
      html: '<p>Reset your Example password using the link below.</p><p><a href="https://app.test/reset?token=1&amp;x=2">Reset password</a></p><p>This link expires in one hour.</p>',
    })
  })

  it('sends the verification message and escapes the product name in HTML', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const { sendVerificationEmail } = standardAuthEmails({ send, verify: vi.fn() }, { productName: 'A <B>' })
    await sendVerificationEmail({ user, url: 'https://app.test/verify', token: '1' })
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Verify your A <B> email address',
        html: expect.stringContaining(
          '<p>Verify your A &lt;B&gt; email address using the link below.</p><p><a href="https://app.test/verify">Verify email address</a></p>',
        ),
      }),
    )
  })

  it('propagates delivery failures to Better Auth', async () => {
    const failure = new Error('SMTP unavailable')
    const { sendResetPassword } = standardAuthEmails(
      { send: vi.fn().mockRejectedValue(failure), verify: vi.fn() },
      { productName: 'Example' },
    )
    await expect(sendResetPassword({ user, url: 'https://app.test/reset', token: 'reset-token' })).rejects.toBe(failure)
  })
})
