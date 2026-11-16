import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { authEmails, emailDelivery, type EmailDelivery } from '../adapters/email'
import { configuredOrigin, trustedOrigins } from './origins'

export type Auth = ReturnType<typeof createAuth>

/** The sign-in providers this application offers, each enabled by its `<NAME>_CLIENT_ID` and `<NAME>_CLIENT_SECRET`. */
export const SOCIAL_PROVIDERS = ['google', 'discord'] as const
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number]

/** Better Auth for this application; `database` is the Drizzle adapter, created where the database is. */
export function createAuth(database: BetterAuthOptions['database'], email: EmailDelivery | undefined = emailDelivery()) {
  requireSecretInProduction()
  const emails = email && authEmails(email)
  return betterAuth({
    database,
    baseURL: configuredOrigin(),
    trustedOrigins,
    socialProviders: socialProviders(),
    emailAndPassword: { enabled: true, revokeSessionsOnPasswordReset: true, sendResetPassword: emails?.sendResetPassword },
    emailVerification: emails && {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: emails.sendVerificationEmail,
    },
    account: { encryptOAuthTokens: true },
    session: { expiresIn: 60 * 60 * 24 * 90, updateAge: 60 * 60 * 24 },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 120,
      customRules: {
        '/sign-in/email': { window: 60, max: 20 },
        '/sign-up/email': { window: 60, max: 15 },
        '/request-password-reset': { window: 60, max: 5 },
        '/send-verification-email': { window: 60, max: 5 },
        '/admin/set-user-password': { window: 60, max: 10 },
      },
    },
    // Better Auth skips its origin check under test unless this is set, so tests exercise the check production runs.
    advanced: { disableOriginCheck: false, trustedProxyHeaders: process.env.TRUST_PROXY === 'true' },
    // Sets the cookies of `auth.api` calls made inside server functions; it must stay the last plugin.
    plugins: [tanstackStartCookies()],
  })
}

/** Credentials for each provider with both values set; a provider with only one throws, so a typo cannot hide its button. */
export function socialProviders(environment: NodeJS.ProcessEnv = process.env) {
  const providers: Partial<Record<SocialProvider, { clientId: string; clientSecret: string }>> = {}
  for (const provider of SOCIAL_PROVIDERS) {
    const name = provider.toUpperCase()
    const clientId = environment[`${name}_CLIENT_ID`]?.trim()
    const clientSecret = environment[`${name}_CLIENT_SECRET`]?.trim()
    if (Boolean(clientId) !== Boolean(clientSecret)) throw new Error(`${name}_CLIENT_ID and ${name}_CLIENT_SECRET must be set together`)
    if (clientId && clientSecret) providers[provider] = { clientId, clientSecret }
  }
  return providers
}

// Better Auth reads the secret itself but falls back to a public default unless NODE_ENV is production, which a build does not guarantee.
function requireSecretInProduction() {
  if (!import.meta.env.PROD || process.env.BETTER_AUTH_SECRET?.trim() || process.env.BETTER_AUTH_SECRETS?.trim()) return
  throw new Error('BETTER_AUTH_SECRET is required in production; generate one with `openssl rand -base64 32`')
}
