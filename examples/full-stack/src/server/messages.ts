import type { app } from './app'
import { assertOutboxCapacity } from './outbox'
import { messages, outbox } from './schema'

type Database = ReturnType<typeof app>['database']

export function writeMessage(
  database: Database,
  realtimeEnabled: boolean,
  values: { authorId: string; author: string; body: string; createdAt: Date },
) {
  return database.transaction((transaction) => {
    if (realtimeEnabled) assertOutboxCapacity(transaction)
    const [message] = transaction.insert(messages).values(values).returning().all()
    if (realtimeEnabled) {
      transaction
        .insert(outbox)
        .values({
          channel: 'messages:all',
          payload: JSON.stringify({ type: 'message-added', id: message!.id }),
          availableAt: values.createdAt,
          createdAt: values.createdAt,
        })
        .run()
    }
    return message!
  })
}
