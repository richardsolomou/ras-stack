import { createServer, type Server, type Socket } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { clearGlobalSingleton } from 'ras-stack/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { app, closeApp } from './app'
import { currentUser } from './session'

let directory: string
let smtp: TestSmtp | undefined

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'ras-stack-example-auth-flow-'))
  process.env.DATA_DIR = directory
})

afterEach(async () => {
  await clearGlobalSingleton('ras-stack.example.full-stack', closeApp)
  await smtp?.close()
  smtp = undefined
  await rm(directory, { recursive: true, force: true })
  for (const name of ['APP_URL', 'SMTP_HOST', 'SMTP_PORT', 'EMAIL_FROM', 'EMAIL_REQUIRE_VERIFICATION']) delete process.env[name]
})

describe('production auth flows', () => {
  it('verifies an email over SMTP and completes a password reset', async () => {
    smtp = await TestSmtp.start()
    process.env.APP_URL = 'http://localhost:3100'
    process.env.SMTP_HOST = '127.0.0.1'
    process.env.SMTP_PORT = String(smtp.port)
    process.env.EMAIL_FROM = 'auth@example.test'
    process.env.EMAIL_REQUIRE_VERIFICATION = 'true'

    expect(
      (
        await authRequest('/sign-up/email', {
          name: 'Ada',
          email: 'ada@example.test',
          password: 'correct horse battery staple',
        })
      ).status,
    ).toBe(200)
    expect((await authRequest('/sign-in/email', { email: 'ada@example.test', password: 'correct horse battery staple' })).status).toBe(403)

    const verification = await app().auth.handler(new Request(messageUrl(smtp.messages[0]!)))
    const cookie = verification.headers.get('set-cookie')
    expect(cookie).toContain('ras_stack_example.session_token=')
    expect((await currentUser(new Request('http://localhost:3100', { headers: { cookie: cookie! } })))?.email).toBe('ada@example.test')

    expect((await authRequest('/request-password-reset', { email: 'ada@example.test', redirectTo: '/' })).status).toBe(200)
    const resetLink = new URL(messageUrl(smtp.messages[1]!))
    const token = resetLink.pathname.split('/').at(-1)
    expect((await authRequest('/reset-password', { newPassword: 'new correct horse battery staple', token })).status).toBe(200)
    expect(await currentUser(new Request('http://localhost:3100', { headers: { cookie: cookie! } }))).toBeUndefined()
    expect((await authRequest('/reset-password', { newPassword: 'replayed password', token })).status).toBe(400)
    expect((await authRequest('/sign-in/email', { email: 'ada@example.test', password: 'correct horse battery staple' })).status).toBe(401)
    expect((await authRequest('/sign-in/email', { email: 'ada@example.test', password: 'new correct horse battery staple' })).status).toBe(
      200,
    )
  })

  it('marks session cookies Secure for an HTTPS origin', async () => {
    process.env.APP_URL = 'https://example.test'
    const response = await authRequest('/sign-up/email', {
      name: 'Grace',
      email: 'grace@example.test',
      password: 'correct horse battery staple',
    })
    expect(response.headers.get('set-cookie')).toContain('; Secure')
  })
})

function authRequest(endpoint: string, body: object) {
  const origin = process.env.APP_URL!
  return app().auth.handler(
    new Request(`${origin}/api/auth${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify(body),
    }),
  )
}

function messageUrl(message: string) {
  const decoded = message
    .replace(/=\r?\n/g, '')
    .replace(/=([\dA-F]{2})/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
  const match = decoded.match(/https?:\/\/[^\s]+/)
  if (!match) throw new Error(`SMTP message contains no URL: ${decoded}`)
  return match[0]
}

class TestSmtp {
  private constructor(
    private readonly server: Server,
    readonly port: number,
    readonly messages: string[],
  ) {}

  static async start() {
    const messages: string[] = []
    const server = createServer((socket) => acceptSmtp(socket, messages))
    await new Promise<void>((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('SMTP sink did not bind a TCP port')
    return new TestSmtp(server, address.port, messages)
  }

  close() {
    return new Promise<void>((resolve, reject) => this.server.close((error) => (error ? reject(error) : resolve())))
  }
}

function acceptSmtp(socket: Socket, messages: string[]) {
  socket.setEncoding('utf8')
  socket.write('220 localhost ESMTP\r\n')
  let buffer = ''
  let data = false
  let message = ''
  socket.on('data', (chunk: string) => {
    buffer += chunk
    while (buffer.includes('\n')) {
      const index = buffer.indexOf('\n')
      const line = buffer.slice(0, index).replace(/\r$/, '')
      buffer = buffer.slice(index + 1)
      if (data) {
        if (line === '.') {
          messages.push(message)
          message = ''
          data = false
          socket.write('250 queued\r\n')
        } else {
          message += `${line.startsWith('..') ? line.slice(1) : line}\r\n`
        }
      } else if (/^(EHLO|HELO)/i.test(line)) {
        socket.write('250-localhost\r\n250 PIPELINING\r\n')
      } else if (/^(MAIL FROM|RCPT TO|RSET|NOOP)/i.test(line)) {
        socket.write('250 ok\r\n')
      } else if (/^DATA/i.test(line)) {
        data = true
        socket.write('354 end with .\r\n')
      } else if (/^QUIT/i.test(line)) {
        socket.end('221 bye\r\n')
      } else {
        socket.write('502 unsupported\r\n')
      }
    }
  })
}
