import { expect, test } from '@playwright/test'

// This file used to assert that /register rendered a working sign-up form.
// There is no sign-up: an account is created by issuance, in the same call that
// creates the profile every authenticated page reads, so a self-registered
// account could log in and then found /dashboard and /profile empty. The route
// is kept as a redirect because it was live and indexable for months.

test('register redirects to login', async ({ page }) => {
  await page.goto('/register')
  await expect(page).toHaveURL(/\/login$/)
})

test('login offers no sign-up, and says where an account comes from', async ({ page }) => {
  await page.goto('/login')

  await expect(page.locator('a[href="/register"]')).toHaveCount(0)
  await expect(page.getByText('your certificate was issued')).toBeVisible()
})
