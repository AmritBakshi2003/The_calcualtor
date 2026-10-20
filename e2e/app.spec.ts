import { test, expect } from '@playwright/test';

test.describe('Calculator Suite App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('loads the application', async ({ page }) => {
    await expect(page).toHaveTitle(/Calculator Suite/);
    await expect(page.getByText('Calculator Suite')).toBeVisible();
    await expect(page.getByText('Simple')).toBeVisible();
    await expect(page.getByText('Finance')).toBeVisible();
    await expect(page.getByText('Scan')).toBeVisible();
  });
});
