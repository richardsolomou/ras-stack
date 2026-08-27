import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'ras-stack — Composable TypeScript infrastructure',
  description: 'Strong defaults for auth, data, realtime, observability, and delivery without hiding the libraries underneath.',
  openGraph: {
    title: 'ras-stack — Composable TypeScript infrastructure',
    description: 'Strong defaults for auth, data, realtime, observability, and delivery.',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'ras-stack — Composable TypeScript infrastructure',
    description: 'Strong defaults for auth, data, realtime, observability, and delivery.',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  )
}
