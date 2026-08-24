import type { ProviderEnvironmentOptions, SessionOptions, StandardAccountOptions } from 'ras-stack/auth'

export const value: string = 'configuration resolved'

export type AuthConfiguration = {
  account: StandardAccountOptions
  providerEnvironment: ProviderEnvironmentOptions
  session: SessionOptions
}
