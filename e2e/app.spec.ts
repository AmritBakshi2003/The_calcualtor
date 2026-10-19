import { test, expect } from '@playwright/test';

test.describe('Calculator Suite App', () => {
  test('loads the application', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/Calculator Suite/);
    await expect(page.getByText('Calculator Suite')).toBeVisible();
    await expect(page.getByText('Coming soon: Basic, Scientific, Finance, and Scan modes')).toBeVisible();
  });
});
