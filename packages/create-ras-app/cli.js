#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const createArguments = process.argv.slice(2)
let runCreateCli
try {
  runCreateCli = (await import('ras-stack/create')).runCreateCli
} catch (error) {
  if (error?.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error
  const stack = installedStack()
  if (stack.manifest.version !== '0.40.0') throw error
  await runLegacyCreate(stack, createArguments)
}
if (runCreateCli) await runCreateCli(createArguments)

function installedStack() {
  const buildEntrypoint = fileURLToPath(import.meta.resolve('ras-stack/build'))
  const root = path.resolve(path.dirname(buildEntrypoint), '../..')
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  return { manifest, root }
}

async function runLegacyCreate(stack, cliArguments) {
  const cli = path.resolve(stack.root, stack.manifest.bin.ras)
  const signals = process.platform === 'win32' ? ['SIGINT', 'SIGTERM'] : ['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGTERM']
  let child
  let pendingSignal
  const handlers = Object.fromEntries(
    signals.map((signal) => [
      signal,
      () => {
        pendingSignal ??= signal
        child?.kill(signal)
      },
    ]),
  )
  for (const [signal, handler] of Object.entries(handlers)) process.on(signal, handler)
  let result
  try {
    child = spawn(process.execPath, [cli, 'create', ...cliArguments], { stdio: 'inherit' })
    if (pendingSignal) child.kill(pendingSignal)
    result = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (status, signal) => resolve({ signal, status }))
    })
  } finally {
    for (const [signal, handler] of Object.entries(handlers)) process.removeListener(signal, handler)
  }
  if (result.signal) process.kill(process.pid, result.signal)
  else process.exitCode = result.status ?? 1
}
