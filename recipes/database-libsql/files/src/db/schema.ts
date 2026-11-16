import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const note = sqliteTable('note', {
  id: integer().primaryKey(),
  body: text().notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
})
