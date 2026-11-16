import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export * from './authSchema'

export const note = pgTable('note', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  body: text().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
