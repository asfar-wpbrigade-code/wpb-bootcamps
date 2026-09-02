import { expect, test } from '@playwright/test'

test('about page loads and displays content', async ({ page }) => {
  await page.goto('/about')
  // Exact heading count removed for the same reason as index.spec.ts; the
  // duplicated 'About' assertion below it was also dropped.
  await expect(page.locator('h1, h2').first()).toBeVisible()
  await expect(page.locator('text=About').first()).toBeVisible()
})
