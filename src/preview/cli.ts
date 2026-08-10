import { previewStatusFromEnvironment } from './environment.js'
import { reportPreviewStatus } from './github.js'

export async function runPreviewCli(arguments_: string[]): Promise<void> {
  const { options, status } = previewStatusFromEnvironment(arguments_[0])
  await reportPreviewStatus(options, status)
  console.log(`Preview status set to ${status.state}`)
}
