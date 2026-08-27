import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}

export const user = sqliteTable(
  'user',
  {
    id: text().primaryKey(),
    name: text().notNull(),
    email: text().notNull(),
    emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
    image: text(),
    ...timestamps,
  },
  (table) => [uniqueIndex('user_email_unique').on(table.email)],
)

export const session = sqliteTable(
  'session',
  {
    id: text().primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text().notNull(),
    ...timestamps,
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [uniqueIndex('session_token_unique').on(table.token), index('session_user_id_idx').on(table.userId)],
)

export const account = sqliteTable(
  'account',
  {
    id: text().primaryKey(),
    accountId: text('account_id').notNull(),
    issuer: text().notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
    scope: text(),
    password: text(),
    ...timestamps,
  },
  (table) => [
    index('account_user_id_idx').on(table.userId),
    uniqueIndex('account_issuer_account_id_unique').on(table.issuer, table.accountId),
  ],
)

export const verification = sqliteTable(
  'verification',
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    ...timestamps,
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
)

export const rateLimit = sqliteTable(
  'rate_limit',
  {
    id: text().primaryKey(),
    key: text().notNull(),
    count: integer().notNull(),
    lastRequest: integer('last_request').notNull(),
  },
  (table) => [uniqueIndex('rate_limit_key_unique').on(table.key)],
)

export const messages = sqliteTable(
  'messages',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    authorId: text('author_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    author: text().notNull(),
    body: text().notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('messages_author_id_idx').on(table.authorId)],
)

export const uploads = sqliteTable(
  'uploads',
  {
    id: text().primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    filename: text().notNull(),
    mediaType: text('media_type').notNull(),
    length: integer().notNull(),
    offset: integer().notNull().default(0),
    state: text({ enum: ['active', 'complete'] })
      .notNull()
      .default('active'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('uploads_owner_id_state_idx').on(table.ownerId, table.state)],
)

export const outbox = sqliteTable(
  'outbox',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    channel: text().notNull(),
    payload: text().notNull(),
    attempts: integer().notNull().default(0),
    availableAt: integer('available_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    failedAt: integer('failed_at', { mode: 'timestamp_ms' }),
    lastError: text('last_error'),
  },
  (table) => [index('outbox_available_at_idx').on(table.availableAt, table.id)],
)

export type Message = typeof messages.$inferSelect
