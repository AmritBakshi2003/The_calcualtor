import { test, expect } from '@playwright/test';

test.describe('Basic Calculator Workflows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173');
  });

  test('app loads and tabs are visible', async ({ page }) => {
    await expect(page.locator('button:has-text("Simple")')).toBeVisible();
    await expect(page.locator('button:has-text("Scientific")')).toBeVisible();
    await expect(page.locator('button:has-text("Finance")')).toBeVisible();
    await expect(page.locator('button:has-text("Scan")')).toBeVisible();
  });

  test('tab navigation works', async ({ page }) => {
    // Navigate to scientific tab
    await page.click('button:has-text("Scientific")');
    await expect(page.locator('button:has-text("sin")')).toBeVisible();

    // Navigate to finance tab
    await page.click('button:has-text("Finance")');
    // Just verify we're on finance tab by checking for calculator text
    await expect(page.locator('text=Finance Calculator')).toBeVisible();

    // Navigate to scan tab
    await page.click('button:has-text("Scan")');
    await expect(page.locator('text=Scan Calculator')).toBeVisible();

    // Navigate back to simple tab
    await page.click('button:has-text("Simple")');
    await expect(page.locator('button[aria-label="7"]')).toBeVisible();
  });

  test('scan calculator loads', async ({ page }) => {
    await page.click('button:has-text("Scan")');
    await expect(page.locator('text=Scan Calculator')).toBeVisible();
    await expect(page.locator('text=Capture Camera')).toBeVisible();
    await expect(page.locator('text=Upload Image')).toBeVisible();
  });
});

