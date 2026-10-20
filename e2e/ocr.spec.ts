import { test, expect } from '@playwright/test';

test.describe('OCR/Scanner Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Scan")');
  });

  test('OCR workflow structure exists', async ({ page }) => {
    // Verify upload button is present
    await expect(page.locator('text=Upload Image')).toBeVisible();

    // Verify camera button is present
    await expect(page.locator('text=Capture Camera')).toBeVisible();
  });

  test('Scanner displays info banner', async ({ page }) => {
    // Verify info banner is displayed
    await expect(page.locator('text=Scanner v1: Supports printed arithmetic')).toBeVisible();
  });

  test('Scanner has upload and camera buttons', async ({ page }) => {
    // Verify upload button is present
    await expect(page.locator('text=Upload Image')).toBeVisible();

    // Verify camera button is present
    await expect(page.locator('text=Capture Camera')).toBeVisible();
  });

  // Note: Full OCR accuracy tests with 20 test images are deferred
  // They require a test image dataset with known expressions
  // Target: >85% accuracy on printed arithmetic
});

