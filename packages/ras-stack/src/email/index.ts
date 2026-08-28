import nodemailer from 'nodemailer'

export type EmailMessage = { to: string; subject: string; text: string; html?: string }

export type SmtpConfig = {
  from: string
  host: string
  port: number
  secure: boolean
  user?: string
  password?: string
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

export type AuthEmailMessageFactory<User extends { email: string } = { email: string }> = (
  input: AuthEmailInput<User>,
  request?: Request,
) => EmailMessage | Promise<EmailMessage>

export function createAuthEmailHandler<User extends { email: string } = { email: string }>(
  delivery: EmailDelivery,
  message: AuthEmailMessageFactory<User>,
) {
  return async (input: AuthEmailInput<User>, request?: Request) => delivery.send(await message(input, request))
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
  const transport = createSmtpTransport(config)
  return {
    send: async (message) => transport.sendMail({ from: config.from, ...message }).then(() => undefined),
    verify: async () => transport.verify().then(() => undefined),
  }
}

export function createSmtpTransport(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
  })
}
