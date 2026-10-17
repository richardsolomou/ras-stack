export type ChunkRecoveryOptions = {
  storageKey: string
  noticeId?: string
  retryWindowMs?: number
}

// Serialized into an inline <head> script, so it must stay self-contained: no imports, helpers, or closures.
function installChunkRecovery(win: Window, { storageKey, noticeId, retryWindowMs = 10_000 }: ChunkRecoveryOptions) {
  win.addEventListener(
    'error',
    (event) => {
      const script = event.target as HTMLScriptElement | null
      if (script?.tagName !== 'SCRIPT' || script.type !== 'module' || !script.src) return
      // Module scripts from elsewhere, such as browser extensions, are not part of the application's build.
      if (new URL(script.src).origin !== win.location.origin) return
      try {
        if (Date.now() - Number(win.sessionStorage.getItem(storageKey)) >= retryWindowMs) {
          win.sessionStorage.setItem(storageKey, String(Date.now()))
          win.location.reload()
          return
        }
      } catch {
        // Without sessionStorage a reload cannot be bounded, so fall through to the notice.
      }
      const notice = noticeId ? win.document.getElementById(noticeId) : null
      if (notice) notice.hidden = false
    },
    true,
  )
}

/**
 * An inline script that reloads the page, at most once per retry window, when an entry module fails to load after a
 * deploy replaced the build. Without it the server-rendered HTML stays inert. TanStack Router already reloads for lazy
 * route chunks; this covers the entry graph it cannot reach. Optionally reveals a hidden element once reloading stops.
 */
export function chunkRecoveryScript(options: ChunkRecoveryOptions) {
  return `(${installChunkRecovery.toString()})(window, ${JSON.stringify(options)})`
}
