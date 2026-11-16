import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { user } from './authSchema'

export * from './authSchema'

export const note = sqliteTable('note', {
  id: integer().primaryKey(),
  body: text().notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
})

export const upload = sqliteTable('upload', {
  id: text().primaryKey(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  filename: text().notNull(),
  size: integer().notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
})
