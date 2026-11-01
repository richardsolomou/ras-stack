import net from 'node:net'
import { createTransport, type Transporter } from 'nodemailer'

/** `cid` lets the HTML body reference the attachment inline as `cid:<value>`. */
export type EmailAttachment = { filename: string; content: Buffer; contentType: string; cid?: string }

export type EmailMessage = {
  to: string
  subject: string
  text: string
  html?: string
  attachments?: EmailAttachment[]
  /** Replaces the display name of the configured sender; the address stays the configured one so SPF and DKIM still pass. */
  fromName?: string
  replyTo?: string
}

export type SmtpConfig = {
  from: string
  host: string
  port: number
  secure: boolean
  user?: string
  password?: string
  /** The name TLS presents and verifies when `host` is an address the application already resolved. */
  servername?: string
  /** Fails and disconnects a send or verify that runs longer than this, and bounds each wait on the server to the same limit. */
  timeoutMs?: number
}

export type SmtpEnvironmentOptions = {
  host?: string
  port?: string
  secure?: string
  user?: string
  password?: string
  from?: string
}

export type EmailDelivery = {
  send(message: EmailMessage): Promise<void>
  verify(): Promise<void>
}

export type AuthEmailInput<User extends { email: string } = { email: string }> = {
  user: User
  url: string
  token: string
}

export function smtpConfigFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  keys: SmtpEnvironmentOptions = {},
): SmtpConfig | undefined {
  const host = environment[keys.host ?? 'SMTP_HOST']?.trim()
  const from = environment[keys.from ?? 'EMAIL_FROM']?.trim()
  if (!host && !from) return undefined
  if (!host) throw new Error(`${keys.host ?? 'SMTP_HOST'} is required for SMTP email`)
  if (!from) throw new Error(`${keys.from ?? 'EMAIL_FROM'} is required for SMTP email`)

  const portKey = keys.port ?? 'SMTP_PORT'
  const port = Number(environment[portKey] ?? 587)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error(`${portKey} must be a valid TCP port`)

  const userKey = keys.user ?? 'SMTP_USER'
  const passwordKey = keys.password ?? 'SMTP_PASSWORD'
  const user = environment[userKey]?.trim()
  const password = environment[passwordKey]
  if (Boolean(user) !== Boolean(password)) throw new Error(`${userKey} and ${passwordKey} must be configured together`)

  return {
    from,
    host,
    port,
    secure: environment[keys.secure ?? 'SMTP_SECURE']?.trim().toLowerCase() === 'true',
    ...(user && password ? { user, password } : {}),
  }
}

export function createSmtpDelivery(config: SmtpConfig): EmailDelivery {
  const timeout = config.timeoutMs
  const options = {
    host: config.host,
    port: config.port,
    secure: config.secure,
    servername: config.servername,
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
    ...(timeout === undefined ? {} : { connectionTimeout: timeout, greetingTimeout: timeout, socketTimeout: timeout }),
  }
  if (timeout === undefined) {
    const transport = createTransport(options)
    return smtpDelivery(config.from, async (work) => void (await work(transport)))
  }
  return smtpDelivery(config.from, async (work) => {
    // nodemailer cannot abort an exchange, so each one gets its own socket for the deadline to destroy.
    const socket = new net.Socket()
    await withinDeadline(work(createTransport({ ...options, socket })), timeout, () => socket.destroy())
  })
}

function smtpDelivery(from: string, exchange: (work: (transport: Transporter) => Promise<unknown>) => Promise<void>): EmailDelivery {
  return {
    send: ({ fromName, ...message }) =>
      exchange((transport) => transport.sendMail({ from: fromName ? { name: fromName, address: senderAddress(from) } : from, ...message })),
    verify: () => exchange((transport) => transport.verify()),
  }
}

// A server that trickles bytes keeps each socket wait short of its timeout, so the whole exchange needs its own deadline.
async function withinDeadline(work: Promise<unknown>, timeoutMs: number, abort: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      abort()
      reject(new Error(`SMTP server did not finish within ${timeoutMs} ms`))
    }, timeoutMs)
  })
  try {
    await Promise.race([work, deadline])
  } finally {
    clearTimeout(timer)
  }
}

function senderAddress(from: string) {
  return /<([^<>]+)>\s*$/.exec(from)?.[1] ?? from
}

export type StandardAuthEmailOptions = { productName: string }

export function standardAuthEmails<User extends { email: string } = { email: string }>(
  delivery: EmailDelivery,
  options: StandardAuthEmailOptions,
) {
  const expiry = 'This link expires in one hour.'
  const send =
    (subject: string, label: string) =>
    async ({ user, url }: AuthEmailInput<User>) =>
      delivery.send({
        to: user.email,
        subject,
        text: `${subject} using this link: ${url}\n\n${expiry}`,
        html: `<p>${escapeHtml(subject)} using the link below.</p><p><a href="${escapeHtml(url)}">${label}</a></p><p>${expiry}</p>`,
      })
  return {
    sendResetPassword: send(`Reset your ${options.productName} password`, 'Reset password'),
    sendVerificationEmail: send(`Verify your ${options.productName} email address`, 'Verify email address'),
  }
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}
