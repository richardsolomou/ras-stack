import { checkServerAssets, loadServerAssetsConfig, syncServerAssets } from './index.js'

export async function runAssetsCli(arguments_: string[]): Promise<void> {
  const [command, configFile] = arguments_
  if (command !== 'check' && command !== 'sync') {
    console.error('usage: ras assets <check|sync> [config-file]')
    process.exitCode = 2
    return
  }

  const root = process.cwd()
  const config = await loadServerAssetsConfig(root, configFile)
  if (command === 'sync') {
    await syncServerAssets(root, config)
  } else {
    const drift = await checkServerAssets(root, config)
    for (const destination of drift) console.error(`server asset drift: ${destination}`)
    if (drift.length > 0) {
      console.error('run ras assets sync after the production build')
      process.exitCode = 1
    }
  }
}
