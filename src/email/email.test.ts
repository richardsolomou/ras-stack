import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ sendMail: vi.fn(), verify: vi.fn(), createTransport: vi.fn() }))

vi.mock('nodemailer', () => ({
  default: { createTransport: mocks.createTransport },
}))

import { createSmtpDelivery, smtpConfigFromEnvironment } from './index.js'

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
