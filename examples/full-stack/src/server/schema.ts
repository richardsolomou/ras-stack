import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const messages = sqliteTable('messages', {
  id: integer().primaryKey({ autoIncrement: true }),
  author: text().notNull(),
  body: text().notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

export type Message = typeof messages.$inferSelect
