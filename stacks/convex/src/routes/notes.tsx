import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { api } from '../../convex/_generated/api'

const notesQuery = convexQuery(api.notes.list, {})

export const Route = createFileRoute('/notes')({
  loader: ({ context }) => context.queryClient.ensureQueryData(notesQuery),
  component: Notes,
})

function Notes() {
  const { data: notes } = useSuspenseQuery(notesQuery)
  const [text, setText] = useState('')
  const add = useMutation({ mutationFn: useConvexMutation(api.notes.add), onSuccess: () => setText('') })
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          add.mutate({ text })
        }}
      >
        <input
          aria-label="Note"
          className="flex-1 rounded border px-3 py-2"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-white">
          Add
        </button>
      </form>
      {add.error && <p className="mt-2 text-red-700">{add.error.message}</p>}
      <ul className="mt-6 space-y-2">
        {notes.map((note) => (
          <li key={note._id}>{note.text}</li>
        ))}
      </ul>
    </main>
  )
}
