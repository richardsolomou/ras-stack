import { afterEach, expect, it } from 'vitest'
import { app, closeApp } from './app'

afterEach(() => closeApp())

it('creates one instance and shares it', () => {
  expect(app()).toBe(app())
})

it('creates a fresh instance after closing', async () => {
  const first = app()
  await closeApp()
  expect(app()).not.toBe(first)
})
