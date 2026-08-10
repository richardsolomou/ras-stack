#!/usr/bin/env node
import { previewStatusFromEnvironment } from './environment.js'
import { reportPreviewStatus } from './github.js'

const { options, status } = previewStatusFromEnvironment(process.argv[2])
await reportPreviewStatus(options, status)
console.log(`Preview status set to ${status.state}`)
