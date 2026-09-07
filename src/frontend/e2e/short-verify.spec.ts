import { expect, test } from '@playwright/test'

/**
 * The address printed as a QR code on every certificate. It is short and
 * uppercase so the symbol stays large enough to scan (see the backend's
 * src/utils/verify-url.ts), which means the redirect that receives it has to
 * tolerate the uppercase path a scanner hands back.
 *
 * A certificate is printed and handed to people, so this contract outlives any
 * particular deployment: once a QR is in someone's hands it cannot be edited.
 */
const HEX = 'A4F6F3B3C56F41F7A4AD8D2BF7EE79F8'
const CREDENTIAL_PATH = '/credentials/urn%3Auuid%3Aa4f6f3b3-c56f-41f7-a4ad-8d2bf7ee79f8'

test('the uppercase short URL from a certificate QR reaches the credential page', async ({ page }) => {
  await page.goto(`/V/${HEX}`)

  expect(new URL(page.url()).pathname + new URL(page.url()).search)
    .toBe(CREDENTIAL_PATH)
})

test('the lowercase and dashed spellings resolve to the same page', async ({ page }) => {
  await page.goto(`/v/${HEX.toLowerCase()}`)
  expect(new URL(page.url()).pathname).toBe(CREDENTIAL_PATH)

  await page.goto('/v/a4f6f3b3-c56f-41f7-a4ad-8d2bf7ee79f8')
  expect(new URL(page.url()).pathname).toBe(CREDENTIAL_PATH)
})

test('a path that is not a credential id is not redirected', async ({ page }) => {
  const response = await page.goto('/v/not-a-credential')

  expect(response?.status()).toBe(404)
  expect(new URL(page.url()).pathname).toBe('/v/not-a-credential')
})
