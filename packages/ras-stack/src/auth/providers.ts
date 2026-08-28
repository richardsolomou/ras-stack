export type ProviderCredentials = { clientId: string; clientSecret: string }
export type ProviderEnvironmentOptions = { prefix?: string; rejectPartial?: boolean }

function providerEnvironmentKeys(provider: string, prefix = '') {
  const name = provider.toUpperCase().replaceAll('-', '_')
  return { clientId: `${prefix}${name}_CLIENT_ID`, clientSecret: `${prefix}${name}_CLIENT_SECRET` }
}

export function configuredProviders<const Provider extends string>(
  providers: readonly Provider[],
  environment: NodeJS.ProcessEnv = process.env,
  options: ProviderEnvironmentOptions = {},
) {
  return providers.filter((provider) => Boolean(providerCredentials(provider, environment, options)))
}

export function providerCredentials(
  provider: string,
  environment: NodeJS.ProcessEnv = process.env,
  options: ProviderEnvironmentOptions = {},
): ProviderCredentials | undefined {
  const keys = providerEnvironmentKeys(provider, options.prefix)
  const clientId = environment[keys.clientId]?.trim()
  const clientSecret = environment[keys.clientSecret]?.trim()
  if (options.rejectPartial && Boolean(clientId) !== Boolean(clientSecret)) {
    throw new Error(`${keys.clientId} and ${keys.clientSecret} must be configured together`)
  }
  return clientId && clientSecret ? { clientId, clientSecret } : undefined
}

export function configuredProviderOptions<const Provider extends string>(
  providers: readonly Provider[],
  environment: NodeJS.ProcessEnv = process.env,
  environmentOptions: ProviderEnvironmentOptions = {},
): Partial<Record<Provider, ProviderCredentials>> {
  const providerOptions: Partial<Record<Provider, ProviderCredentials>> = {}
  for (const provider of providers) {
    const credentials = providerCredentials(provider, environment, environmentOptions)
    if (credentials) providerOptions[provider] = credentials
  }
  return providerOptions
}
