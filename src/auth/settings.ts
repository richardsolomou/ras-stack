export type RateLimitRule = { window: number; max: number }

export type SessionOptions = { expiresIn?: number | undefined; updateAge?: number | undefined }
export type StandardAccountOptions = { encryptOAuthTokens?: boolean }

export function standardSessionOptions<const Options extends object>(overrides: Options & SessionOptions = {} as Options & SessionOptions) {
  return {
    ...overrides,
    expiresIn: overrides.expiresIn ?? 60 * 60 * 24 * 90,
    updateAge: overrides.updateAge ?? 60 * 60 * 24,
  }
}

export function standardAccountOptions<Options extends object>(
  overrides: Options & StandardAccountOptions = {} as Options & StandardAccountOptions,
) {
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
