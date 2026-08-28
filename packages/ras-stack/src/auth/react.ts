import { useCallback, useEffect, useRef, useState } from 'react'
import { authFailureMessage } from './client.js'

export type AuthActionResult<T, TFailure = unknown> = { data?: T; error?: TFailure | null }
export type AuthActionState = { busy: boolean; error?: string }

const defaultFailureMessage = (failure: unknown) => authFailureMessage(failure, 'That did not work. Try again.')

export function useAuthAction(options: { failureMessage?: (failure: unknown) => string } = {}) {
  const failureMessage = options.failureMessage ?? defaultFailureMessage
  const [state, setState] = useState<AuthActionState>({ busy: false })
  const active = useRef(true)
  const invocation = useRef(0)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  const clearError = useCallback(() => setState((current) => ({ busy: current.busy })), [])
  const run = useCallback(
    async <T, TFailure>(work: () => Promise<AuthActionResult<T, TFailure>>) => {
      const current = ++invocation.current
      setState({ busy: true })
      try {
        const result = await work()
        if (active.current && current === invocation.current) {
          setState(result.error ? { busy: false, error: failureMessage(result.error) } : { busy: false })
        }
        return result
      } catch (error) {
        if (active.current && current === invocation.current) setState({ busy: false, error: failureMessage(error) })
        return { error } satisfies AuthActionResult<never>
      }
    },
    [failureMessage],
  )
  return { ...state, clearError, run }
}
