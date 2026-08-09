#!/usr/bin/env node
import { checkServerAssets, loadServerAssetsConfig, syncServerAssets } from './index.js'

const command = process.argv[2]
const configFile = process.argv[3]
if (command !== 'check' && command !== 'sync') {
  console.error('usage: ras-stack-assets <check|sync> [config-file]')
  process.exitCode = 2
} else {
  const root = process.cwd()
  const config = await loadServerAssetsConfig(root, configFile)
  if (command === 'sync') {
    await syncServerAssets(root, config)
  } else {
    const drift = await checkServerAssets(root, config)
    for (const destination of drift) console.error(`server asset drift: ${destination}`)
    if (drift.length > 0) {
      console.error('run ras-stack-assets sync after the production build')
      process.exitCode = 1
    }
  }
}
