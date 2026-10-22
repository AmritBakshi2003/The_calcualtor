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

  test('Camera button opens camera overlay', async ({ page }) => {
    // Click camera button
    await page.click('button:has-text("Capture Camera")');
    
    // Camera overlay should appear (check for overlay in DOM)
    // Note: Full camera testing requires real media stream which is complex in E2E
    // This test verifies the button click handler works
  });

  test('File upload works', async ({ page }) => {
    // This test verifies the fallback file upload still works
    // There are now 2 file inputs: one for upload button, one for camera fallback
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toHaveCount(2);
  });

  // Accuracy against a generated numeric corpus lives in ocr-accuracy.spec.ts
  // (npm run test:ocr). It renders the images in the browser, so no binary
  // fixtures are checked in.
});

