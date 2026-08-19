import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { betterAuth } from 'better-auth'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { standardRateLimitOptions, standardSessionOptions } from 'ras-stack/auth'
import type { EmailDelivery } from 'ras-stack/email'
import type { AppEnvironment } from './environment'
import * as schema from './schema'

type Database = Parameters<typeof drizzleAdapter>[0]

export function createAuth(options: { database: Database; email?: EmailDelivery; environment: AppEnvironment; secret: string }) {
  const email = options.email
  const mail = email
    ? {
        emailVerification: {
          sendOnSignUp: true,
          autoSignInAfterVerification: true,
          sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
            await email.send({
              to: user.email,
              subject: 'Verify your ras-stack example account',
              text: `Verify your email: ${url}`,
            })
          },
        },
      }
    : {}
  return betterAuth({
    appName: 'ras-stack full-stack example',
    baseURL: options.environment.appUrl,
    secret: options.secret,
    trustedOrigins: [options.environment.appUrl],
    database: drizzleAdapter(options.database, { provider: 'sqlite', schema }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: Boolean(email) && options.environment.requireEmailVerification,
      revokeSessionsOnPasswordReset: true,
      ...(email
        ? {
            sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
              await email.send({
                to: user.email,
                subject: 'Reset your ras-stack example password',
                text: `Reset your password: ${url}`,
              })
            },
          }
        : {}),
    },
    ...mail,
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
