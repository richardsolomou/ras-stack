import { previewStatusFromEnvironment } from './environment.js'
import { runDokployPreviewCli } from './dokploy-cli.js'
import { reportPreviewStatus } from './github.js'

export async function runPreviewCli(arguments_: string[]): Promise<void> {
  if (arguments_[0] === 'dokploy') {
    await runDokployPreviewCli(arguments_.slice(1))
    return
  }
  const { options, status } = previewStatusFromEnvironment(arguments_[0])
  await reportPreviewStatus(options, status)
  console.log(`Preview status set to ${status.state}`)
}
