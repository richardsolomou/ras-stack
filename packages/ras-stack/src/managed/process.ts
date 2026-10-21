import { spawn } from 'node:child_process'

export async function runProcess(
  command: string,
  args: string[],
  cwd: string,
  options: { env?: NodeJS.ProcessEnv; signal?: AbortSignal } = {},
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', ...options })
    let aborted: Error | undefined
    child.once('error', (error) => {
      if (error.name === 'AbortError') aborted = error
      else reject(error)
    })
    child.once('exit', (code, signal) => {
      if (aborted) reject(aborted)
      else if (code === 0) resolve()
      else reject(new Error(`${command} ${args[0] ?? ''} failed (${signal ?? code})`))
    })
  })
}

export async function runPnpm(args: string[], cwd: string, signal?: AbortSignal): Promise<void> {
  const executable = process.env.npm_execpath
  if (executable && /pnpm[^/\\]*\.(?:c?js|mjs)$/.test(executable)) {
    await runProcess(process.execPath, [executable, ...args], cwd, signal ? { signal } : {})
  } else {
    await runProcess('pnpm', args, cwd, signal ? { signal } : {})
  }
}
