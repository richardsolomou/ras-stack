export type RateLimitRule = { window: number; max: number }

export function standardSessionOptions() {
  return { expiresIn: 60 * 60 * 24 * 90, updateAge: 60 * 60 * 24 }
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
      ...customRules,
    },
  }
}
