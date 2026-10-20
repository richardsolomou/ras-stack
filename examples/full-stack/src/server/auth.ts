import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { standardAccountOptions, standardEmailAndPasswordOptions, standardRateLimitOptions, standardSessionOptions } from 'ras-stack/auth'
import { standardAuthEmails, type EmailDelivery } from 'ras-stack/email'
import type { AppEnvironment } from './environment'
import * as schema from './schema'

type Database = Parameters<typeof drizzleAdapter>[0]

export function createAuth(options: { database: Database; email?: EmailDelivery; environment: AppEnvironment; secret: string }) {
  const emails = options.email ? standardAuthEmails(options.email, { productName: 'ras-stack example' }) : undefined
  return betterAuth({
    appName: 'ras-stack full-stack example',
    baseURL: options.environment.appUrl,
    secret: options.secret,
    database: drizzleAdapter(options.database, { provider: 'sqlite', schema }),
    account: standardAccountOptions(),
    emailAndPassword: standardEmailAndPasswordOptions({
      requireEmailVerification: Boolean(options.email) && options.environment.requireEmailVerification,
      ...(emails ? { sendResetPassword: emails.sendResetPassword } : {}),
    }),
    ...(emails
      ? {
          emailVerification: {
            sendOnSignUp: true,
            autoSignInAfterVerification: true,
            sendVerificationEmail: emails.sendVerificationEmail,
          },
        }
      : {}),
    session: standardSessionOptions(),
    rateLimit: standardRateLimitOptions(),
    advanced: {
      cookiePrefix: 'ras_stack_example',
      disableOriginCheck: false,
    },
    plugins: [tanstackStartCookies()],
  })
}
