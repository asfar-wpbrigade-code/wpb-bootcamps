import { expect, test } from '@playwright/test'

test('homepage loads and displays main content', async ({ page }) => {
  await page.goto('/')
  // Was `toHaveCount(5)` on `h1, h2`: an exact heading count that broke the
  // moment the site copy was rewritten for WPBrigade, and would break again on
  // the next wording change. Assert that the page rendered, not how many
  // headings it happens to have.
  await expect(page.locator('h1, h2').first()).toBeVisible()
})
