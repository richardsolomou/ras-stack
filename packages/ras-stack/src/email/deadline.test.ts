import net from 'node:net'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { createSmtpDelivery } from './index.js'

const servers: net.Server[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))))
})

/** Greets, then answers every command one byte at a time, so no single wait on the server ever times out. */
async function tricklingServer() {
  const closed: Promise<void>[] = []
  const server = net.createServer((socket) => {
    closed.push(new Promise((resolve) => socket.once('close', () => resolve())))
    socket.on('error', () => undefined)
    socket.write('220 smtp.test ESMTP\r\n')
    socket.once('data', () => {
      const timer = setInterval(() => socket.write('2'), 20)
      socket.once('close', () => clearInterval(timer))
    })
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { port: (server.address() as AddressInfo).port, closed }
}

describe('SMTP deadline', () => {
  it('closes the connection when the deadline passes', async () => {
    const server = await tricklingServer()
    const delivery = createSmtpDelivery({ from: 'from@example.com', host: '127.0.0.1', port: server.port, secure: false, timeoutMs: 200 })
    await expect(delivery.send({ to: 'to@example.com', subject: 'Hello', text: 'Hi' })).rejects.toThrow('did not finish within 200 ms')
    const closedSoon = await Promise.race([
      Promise.all(server.closed).then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 500)),
    ])
    expect(closedSoon).toBe(true)
  })
})
