import { useQueryClient } from '@tanstack/react-query'
import { createSameOriginRealtimeClient } from 'ras-stack/realtime/client'
import { useConnectedRealtimeClient, useRealtimeSubscription } from 'ras-stack/realtime/react'
import { useCallback } from 'react'
import { snapshotQuery } from './queries'

export function useRealtime(enabled: boolean) {
  const queryClient = useQueryClient()
  const create = useCallback(() => createSameOriginRealtimeClient({}), [])
  const client = useConnectedRealtimeClient(create, enabled)
  const configure = useCallback(
    (subscription: NonNullable<ReturnType<typeof useRealtimeSubscription>>) => {
      const refresh = () => void queryClient.invalidateQueries({ queryKey: snapshotQuery().queryKey })
      subscription.on('publication', refresh)
      return () => subscription.off('publication', refresh)
    },
    [queryClient],
  )
  useRealtimeSubscription({ client, channel: 'messages:all', enabled, configure })
}
