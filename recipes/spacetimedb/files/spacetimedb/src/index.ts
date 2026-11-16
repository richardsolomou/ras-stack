import { schema, SenderError, t, table } from 'spacetimedb/server'

const NOTE_MAX_LENGTH = 500

const note = table(
  { name: 'note', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    author: t.identity(),
    text: t.string(),
    sentAt: t.timestamp(),
  },
)

const spacetime = schema({ note })
export default spacetime

export const addNote = spacetime.reducer({ text: t.string() }, (ctx, { text }) => {
  const trimmed = text.trim()
  if (!trimmed || trimmed.length > NOTE_MAX_LENGTH) throw new SenderError(`A note is 1 to ${NOTE_MAX_LENGTH} characters`)
  ctx.db.note.insert({ id: 0n, author: ctx.sender, text: trimmed, sentAt: ctx.timestamp })
})
