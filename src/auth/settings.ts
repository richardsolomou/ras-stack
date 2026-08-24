export type RateLimitRule = { window: number; max: number }

export type SessionOptions = { expiresIn: number; updateAge: number }

export type StandardAccountLinkingOptions = {
  enabled?: boolean
  allowDifferentEmails?: boolean
  allowUnlinkingAll?: boolean
  disableImplicitLinking?: boolean
  requireLocalEmailVerified?: boolean
  trustedProviders?: string[] | ((request?: Request) => string[] | Promise<string[]>)
  updateUserInfoOnLink?: boolean
}

export type StandardAccountOptions = {
  encryptOAuthTokens?: boolean
  accountLinking?: StandardAccountLinkingOptions
}

export function standardSessionOptions(overrides: Partial<SessionOptions> = {}) {
  return { expiresIn: 60 * 60 * 24 * 90, updateAge: 60 * 60 * 24, ...overrides }
}

export function standardAccountOptions(overrides: StandardAccountOptions = {}) {
  return {
    ...overrides,
    encryptOAuthTokens: overrides.encryptOAuthTokens ?? true,
  }
}

export function standardRateLimitOptions(customRules: Record<string, RateLimitRule> = {}) {
  return {
    enabled: true,
    storage: 'database' as const,
    window: 60,
    max: 120,
    customRules: {
      '/sign-in/email': { window: 60, max: 20 },
      '/sign-up/email': { window: 60, max: 15 },
      '/request-password-reset': { window: 60, max: 5 },
      '/admin/set-user-password': { window: 60, max: 10 },
      ...customRules,
    },
  }
}
