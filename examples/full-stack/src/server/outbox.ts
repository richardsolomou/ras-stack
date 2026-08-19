import { asc, eq, isNull, sql } from 'drizzle-orm'
import type { app } from './app'
import { outbox } from './schema'

type Database = ReturnType<typeof app>['database']
export const outboxCapacity = 1_000

export class OutboxWorker {
  private timer?: NodeJS.Timeout
  private draining?: Promise<void>
  private scheduled?: Promise<void>

  constructor(
    private readonly options: {
      database: Database
      enabled: boolean
      publish: (channel: string, payload: unknown) => Promise<void>
      intervalMs?: number
      batchSize?: number
      maxAttempts?: number
      onError?: (error: unknown) => void
    },
  ) {}

  start() {
    if (!this.options.enabled || this.timer) return
    this.timer = setInterval(() => this.scheduleDrain(), this.options.intervalMs ?? 500)
    this.timer.unref()
    this.scheduleDrain()
  }

  drain() {
    if (this.draining) return this.draining
    this.draining = this.drainBatch().finally(() => {
      this.draining = undefined
    })
    return this.draining
  }

  async close() {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
    await this.draining
    if (this.options.enabled) await this.drain()
  }

  private scheduleDrain() {
    if (this.scheduled) return
    const scheduled = this.drain()
      .catch((error: unknown) => {
        if (this.options.onError) this.options.onError(error)
        else console.error({ event: 'example_outbox_drain_failed', error })
      })
      .finally(() => {
        if (this.scheduled === scheduled) this.scheduled = undefined
      })
    this.scheduled = scheduled
  }

  private async drainBatch() {
    const items = this.options.database
      .select()
      .from(outbox)
      .where(isNull(outbox.failedAt))
      .orderBy(asc(outbox.id))
      .limit(this.options.batchSize ?? 20)
      .all()
    for (const item of items) {
      if (item.availableAt.getTime() > Date.now()) break
      try {
        const payload: unknown = JSON.parse(item.payload)
        // oxlint-disable-next-line no-await-in-loop
        await this.options.publish(item.channel, payload)
        this.options.database.delete(outbox).where(eq(outbox.id, item.id)).run()
      } catch (error) {
        const attempts = item.attempts + 1
        const failed = attempts >= (this.options.maxAttempts ?? 8)
        const delay = Math.min(60_000, 500 * 2 ** Math.min(attempts, 7))
        this.options.database
          .update(outbox)
          .set({
            attempts,
            availableAt: new Date(Date.now() + delay),
            failedAt: failed ? new Date() : null,
            lastError: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
          })
          .where(eq(outbox.id, item.id))
          .run()
        console.error({ event: 'example_outbox_delivery_failed', outboxId: item.id, attempts, error })
        break
      }
    }
  }
}

export function outboxStatus(database: Pick<Database, 'select'>): { pending: number; failed: number } {
  const status = database
    .select({
      pending: sql<number>`coalesce(sum(case when ${outbox.failedAt} is null then 1 else 0 end), 0)`,
      failed: sql<number>`coalesce(sum(case when ${outbox.failedAt} is not null then 1 else 0 end), 0)`,
    })
    .from(outbox)
    .get()
  return status ?? { pending: 0, failed: 0 }
}

export function assertOutboxCapacity(database: Pick<Database, 'select'>) {
  const status = outboxStatus(database)
  if (status.pending + status.failed >= outboxCapacity) throw new Response('Realtime queue is full', { status: 503 })
}
