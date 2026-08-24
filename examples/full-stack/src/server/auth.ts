import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { betterAuth } from 'better-auth'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { standardAccountOptions, standardEmailAndPasswordOptions, standardRateLimitOptions, standardSessionOptions } from 'ras-stack/auth'
import { createAuthEmailHandler, type EmailDelivery } from 'ras-stack/email'
import type { AppEnvironment } from './environment'
import * as schema from './schema'

type Database = Parameters<typeof drizzleAdapter>[0]

export function createAuth(options: { database: Database; email?: EmailDelivery; environment: AppEnvironment; secret: string }) {
  const email = options.email
  const sendVerificationEmail = email
    ? createAuthEmailHandler(email, ({ user, url }) => ({
        to: user.email,
        subject: 'Verify your ras-stack example account',
        text: `Verify your email: ${url}`,
      }))
    : undefined
  const sendResetPassword = email
    ? createAuthEmailHandler(email, ({ user, url }) => ({
        to: user.email,
        subject: 'Reset your ras-stack example password',
        text: `Reset your password: ${url}`,
      }))
    : undefined
  return betterAuth({
    appName: 'ras-stack full-stack example',
    baseURL: options.environment.appUrl,
    secret: options.secret,
    trustedOrigins: [options.environment.appUrl],
    database: drizzleAdapter(options.database, { provider: 'sqlite', schema }),
    account: standardAccountOptions(),
    emailAndPassword: standardEmailAndPasswordOptions({
      requireEmailVerification: Boolean(email) && options.environment.requireEmailVerification,
      ...(sendResetPassword ? { sendResetPassword } : {}),
    }),
    ...(sendVerificationEmail
      ? {
          emailVerification: {
            sendOnSignUp: true,
            autoSignInAfterVerification: true,
            sendVerificationEmail,
          },
        }
      : {}),
    session: standardSessionOptions(),
    rateLimit: standardRateLimitOptions(),
    advanced: {
      cookiePrefix: 'ras_stack_example',
      useSecureCookies: options.environment.appUrl.startsWith('https://'),
      disableOriginCheck: false,
    },
    plugins: [tanstackStartCookies()],
  })
}
