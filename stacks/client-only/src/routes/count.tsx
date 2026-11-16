import { usePostHog } from '@posthog/react'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/count')({ component: Count })

/** A tool that works entirely in the browser: the text never leaves the page, only the fact that it was counted. */
function Count() {
  const posthog = usePostHog()
  const [text, setText] = useState('')
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-6 py-16">
      <textarea
        aria-label="Text"
        className="h-40 w-full rounded border px-3 py-2"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          if (words > 0) posthog.capture('text_counted', { words })
        }}
      />
      <p>
        {words} words, {text.length} characters
      </p>
    </main>
  )
}
