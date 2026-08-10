import { expect, test } from '@playwright/test'

test('authenticates, uploads, and receives a realtime update', async ({ browser, request }, testInfo) => {
  const run = Date.now()
  const firstMessage = `first message ${run}`
  const realtimeMessage = `realtime message ${run}`
  const origin = testInfo.project.use.baseURL!
  expect((await request.post('/api/uploads', { headers: { Origin: origin, 'Upload-Length': '1' } })).status()).toBe(401)
  expect((await request.head('/api/uploads/missing')).status()).toBe(401)
  expect((await request.patch('/api/uploads/missing', { headers: { Origin: origin, 'Upload-Offset': '0' } })).status()).toBe(401)
  const alice = await browser.newPage()
  await alice.goto('/')
  await alice.getByLabel('Name').fill('Alice')
  await alice.getByRole('button', { name: 'Continue' }).click()
  await expect(alice.getByRole('heading', { name: 'Hello, Alice' })).toBeVisible()
  await alice.getByLabel('Message').fill(firstMessage)
  await alice.getByRole('button', { name: 'Add message' }).click()
  await expect(alice.getByText(`Alice: ${firstMessage}`)).toBeVisible()

  await alice.getByLabel('Upload').setInputFiles({ name: 'proof.txt', mimeType: 'text/plain', buffer: Buffer.from('workspace proof') })
  await expect(alice.getByText(/Uploaded to .*\/api\/uploads\//)).toBeVisible()

  const bob = await browser.newPage()
  await bob.goto('/')
  await bob.getByLabel('Name').fill('Bob')
  await bob.getByRole('button', { name: 'Continue' }).click()
  await expect(bob.getByText(`Alice: ${firstMessage}`)).toBeVisible()
  await bob.getByLabel('Message').fill(realtimeMessage)
  await bob.getByRole('button', { name: 'Add message' }).click()
  await expect(alice.getByText(`Bob: ${realtimeMessage}`)).toBeVisible()
  await alice.screenshot({ path: testInfo.outputPath('example.png'), fullPage: true })
})
