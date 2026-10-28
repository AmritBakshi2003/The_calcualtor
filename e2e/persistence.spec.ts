import { test, expect } from '@playwright/test';

test.describe('Basic E2E Tests', () => {
  test('app loads successfully', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Calculator Suite/);
  });

  test('calculator tabs are visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('button:has-text("Simple")')).toBeVisible();
    await expect(page.locator('button:has-text("Finance")')).toBeVisible();
    await expect(page.locator('button:has-text("Scan")')).toBeVisible();
  });

  test('simple calculator renders', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('button[aria-label="7"]')).toBeVisible();
    await expect(page.locator('button[aria-label="8"]')).toBeVisible();
    await expect(page.locator('button[aria-label="9"]')).toBeVisible();
  });

  test('scan calculator loads', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Scan")');
    await expect(page.locator('text=Scan Calculator')).toBeVisible();
  });
});

