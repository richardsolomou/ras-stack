import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'

const NOTE_MAX_LENGTH = 500

export const list = query({
  args: {},
  handler: (ctx) => ctx.db.query('notes').order('desc').take(50),
})

export const add = mutation({
  args: { text: v.string() },
  handler: async (ctx, { text }) => {
    const trimmed = text.trim()
    if (!trimmed || trimmed.length > NOTE_MAX_LENGTH) throw new ConvexError(`A note is 1 to ${NOTE_MAX_LENGTH} characters`)
    await ctx.db.insert('notes', { text: trimmed })
  },
})
