import { queryOptions } from '@tanstack/react-query'
import { snapshot } from '../server/fns'

export const snapshotQuery = () => queryOptions({ queryKey: ['example', 'snapshot'], queryFn: () => snapshot() })
