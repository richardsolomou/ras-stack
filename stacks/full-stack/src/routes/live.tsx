import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import type { PublicationContext, ServerPublicationContext, Subscription } from 'centrifuge'
import { useCallback, useState } from 'react'
import { authClient } from '../client/auth'
import { uploadFile } from '../client/uploads'
import { RealtimeProvider, useRealtimeSubscription, useServerChannel } from '../client/useRealtime'
import { announce, readViewer } from '../server/functions'

export const Route = createFileRoute('/live')({
  loader: async () => {
    const viewer = await readViewer()
    if (!viewer) throw redirect({ to: '/sign-in', search: { next: '/live' } })
    return viewer
  },
  component: Live,
})

function Live() {
  const viewer = Route.useLoaderData()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-6 py-16">
      <p>
        Signed in as <strong>{viewer.name}</strong> ({viewer.email}).{' '}
        <button
          type="button"
          className="underline"
          onClick={async () => {
            await authClient.signOut()
            await queryClient.invalidateQueries()
            await navigate({ to: '/sign-in' })
          }}
        >
          Sign out
        </button>
      </p>
      {/* The connection token belongs to whoever was signed in when it connected. */}
      <RealtimeProvider key={viewer.id}>
        <Updates />
        <Uploads userId={viewer.id} />
      </RealtimeProvider>
    </main>
  )
}

function Updates() {
  const [messages, setMessages] = useState<{ text: string; at: number }[]>([])
  const [text, setText] = useState('')
  const configure = useCallback((subscription: Subscription) => {
    const receive = ({ data }: PublicationContext) => setMessages((current) => [...current, data as { text: string; at: number }])
    subscription.on('publication', receive)
    return () => void subscription.off('publication', receive)
  }, [])
  useRealtimeSubscription('updates:demo', configure)
  return (
    <section className="space-y-2">
      <h2 className="text-xl font-semibold">Updates</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void announce({ data: text })
          setText('')
        }}
      >
        <input aria-label="Message" className="rounded border px-2 py-1" value={text} onChange={(event) => setText(event.target.value)} />
        <button type="submit" className="ml-2 rounded bg-neutral-900 px-3 py-1 text-white">
          Send
        </button>
      </form>
      <ul data-testid="messages">
        {messages.map((message) => (
          <li key={message.at}>{message.text}</li>
        ))}
      </ul>
    </section>
  )
}

function Uploads({ userId }: { userId: string }) {
  const [status, setStatus] = useState('No upload yet.')
  const [finished, setFinished] = useState<string[]>([])
  const onFinished = useCallback(({ data }: ServerPublicationContext) => {
    setFinished((current) => [...current, (data as { id: string }).id])
  }, [])
  useServerChannel(`user:${userId}`, onFinished)
  return (
    <section className="space-y-2">
      <h2 className="text-xl font-semibold">Uploads</h2>
      <input
        aria-label="Upload"
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (!file) return
          setStatus('Uploading…')
          uploadFile(file, { onProgress: ({ percent }) => setStatus(`Uploading… ${percent}%`) }).then(
            (url) => setStatus(`Uploaded to ${url}`),
            (error: unknown) => setStatus(error instanceof Error ? error.message : String(error)),
          )
        }}
      />
      <p data-testid="upload-status">{status}</p>
      <ul data-testid="finished">
        {finished.map((id) => (
          <li key={id}>Finished {id}</li>
        ))}
      </ul>
    </section>
  )
}
