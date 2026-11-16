import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react'
import { reducers, tables } from '../spacetime/generated'

export const Route = createFileRoute('/notes')({ component: Notes })

function Notes() {
  const { isActive } = useSpacetimeDB()
  const [notes, ready] = useTable(tables.note)
  const addNote = useReducer(reducers.addNote)
  const [text, setText] = useState('')
  const [error, setError] = useState<string>()
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-sm text-neutral-500">{isActive ? 'Connected' : 'Connecting…'}</p>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          addNote({ text }).then(
            () => {
              setText('')
              setError(undefined)
            },
            (failure: unknown) => setError(failure instanceof Error ? failure.message : String(failure)),
          )
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
      {error && <p className="mt-2 text-red-700">{error}</p>}
      <ul className="mt-6 space-y-2">
        {ready && notes.toSorted((a, b) => Number(b.id - a.id)).map((note) => <li key={String(note.id)}>{note.text}</li>)}
      </ul>
    </main>
  )
}
