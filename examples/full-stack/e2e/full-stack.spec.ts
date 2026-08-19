import { expect, test } from '@playwright/test'

test('signs up, authorizes resources, persists an upload, and receives an outbox publication', async ({ browser, request }, testInfo) => {
  const run = Date.now()
  const firstMessage = `first message ${run}`
  const realtimeMessage = `realtime message ${run}`
  const origin = testInfo.project.use.baseURL!
  expect((await request.get('/api/live')).status()).toBe(200)
  expect((await request.get('/api/ready')).status()).toBe(200)
  expect((await request.get('/')).headers()['x-content-type-options']).toBe('nosniff')
  expect((await request.post('/api/uploads', { headers: { Origin: origin, 'Upload-Length': '1' } })).status()).toBe(401)
  expect((await request.head('/api/uploads/missing')).status()).toBe(401)

  const alice = await browser.newPage()
  await alice.goto('/')
  await signUp(alice, 'Alice', 'alice@example.test')
  await alice.getByLabel('Message').fill(firstMessage)
  await alice.getByRole('button', { name: 'Add message' }).click()
  await expect(alice.getByText(`Alice: ${firstMessage}`)).toBeVisible()

  await alice.getByLabel('Upload').setInputFiles({ name: 'proof.txt', mimeType: 'text/plain', buffer: Buffer.from('workspace proof') })
  const upload = alice.getByText(/Uploaded to .*\/api\/uploads\//)
  await expect(upload).toBeVisible()
  const uploadUrl = (await upload.textContent())!.replace('Uploaded to ', '')

  const bob = await browser.newPage()
  await bob.goto('/')
  await signUp(bob, 'Bob', 'bob@example.test')
  expect(await bob.evaluate((url) => fetch(url, { method: 'HEAD' }).then((response) => response.status), uploadUrl)).toBe(404)
  await expect(bob.getByText(`Alice: ${firstMessage}`)).toBeVisible()
  await bob.getByLabel('Message').fill(realtimeMessage)
  await bob.getByRole('button', { name: 'Add message' }).click()
  await expect(alice.getByText(`Bob: ${realtimeMessage}`)).toBeVisible()
  await alice.getByRole('button', { name: 'Sign out' }).click()
  await expect(alice.getByRole('heading', { name: 'Create account' })).toBeVisible()
  await alice.screenshot({ path: testInfo.outputPath('example.png'), fullPage: true })
})

async function signUp(page: import('@playwright/test').Page, name: string, email: string) {
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('correct horse battery staple')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('heading', { name: `Hello, ${name}` })).toBeVisible()
}
