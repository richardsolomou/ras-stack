import { runRealtimeStack } from 'ras-stack/runtime'

const required = (name: string) => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

const apiKey = required('CENTRIFUGO_API_KEY')
const proxySecret = required('CENTRIFUGO_PROXY_SECRET')
const realtime: NodeJS.ProcessEnv = { ...process.env, CENTRIFUGO_VAR_PROXY_SECRET: proxySecret }
delete realtime.CENTRIFUGO_API_KEY
delete realtime.CENTRIFUGO_PROXY_SECRET
delete realtime.CENTRIFUGO_API_URL
delete realtime.CENTRIFUGO_CONFIG

process.exitCode = await runRealtimeStack({
  app: { command: process.execPath, args: ['.output/server/index.mjs'], env: { ...process.env, PORT: '3101' } },
  centrifugo: {
    configPath: process.env.CENTRIFUGO_CONFIG ?? '/app/centrifugo.json',
    env: realtime,
    environment: { apiKey, allowedOrigins: process.env.APP_URL ?? 'http://localhost:3100' },
  },
  caddy: {
    configPath: '/tmp/ras-stack-example-Caddyfile',
    env: process.env,
    proxy: { publicPort: 3100, appPort: 3101, realtimePort: 8100 },
  },
})
