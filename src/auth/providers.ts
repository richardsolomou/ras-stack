export type ProviderCredentials = { clientId: string; clientSecret: string }

export function configuredProviders<const Provider extends string>(
  providers: readonly Provider[],
  environment: NodeJS.ProcessEnv = process.env,
) {
  return providers.filter((provider) => {
    const prefix = provider.toUpperCase().replaceAll('-', '_')
    return Boolean(environment[`${prefix}_CLIENT_ID`]?.trim() && environment[`${prefix}_CLIENT_SECRET`]?.trim())
  })
}

export function providerCredentials(provider: string, environment: NodeJS.ProcessEnv = process.env): ProviderCredentials | undefined {
  const prefix = provider.toUpperCase().replaceAll('-', '_')
  const clientId = environment[`${prefix}_CLIENT_ID`]?.trim()
  const clientSecret = environment[`${prefix}_CLIENT_SECRET`]?.trim()
  return clientId && clientSecret ? { clientId, clientSecret } : undefined
}
