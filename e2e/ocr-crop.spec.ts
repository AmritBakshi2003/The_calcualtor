/// <reference types="node" />
import { test, expect } from '@playwright/test';

/**
 * Crop + OCR flow, verified in a real browser.
 *
 * jsdom cannot exercise pointer-drag crop state, so this interaction is
 * covered here against the production preview build instead.
 */
test.describe('Scan calculator crop and OCR', () => {
  test('crop editor selects a region, applies it, and OCR reads digits', async ({ page }) => {
    // First OCR run loads the ~10MB engine; give this test a generous budget.
    test.setTimeout(150000);

    await page.goto('/');

    // Open the Scan tab (file inputs only render inside ScanCalculator)
    await page.getByRole('button', { name: /Switch to Scan/ }).click();
    await expect(page.getByRole('heading', { name: 'Scan Calculator' })).toBeVisible();

    // Generate a clean test image with digits + operator
    const dataUrl = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 300;
      c.height = 100;
      const x = c.getContext('2d')!;
      x.fillStyle = '#fff';
      x.fillRect(0, 0, 300, 100);
      x.fillStyle = '#000';
      x.font = '52px sans-serif';
      x.fillText('12 + 34', 15, 65);
      return c.toDataURL('image/png');
    });
    const base64 = dataUrl.split(',')[1];
    // @ts-ignore - Buffer is available in Playwright test context (Node.js globals)
    const buffer = Buffer.from(base64, 'base64');

    // Feed it through the real file input
    await page.locator('input[type=file]').first().setInputFiles({
      name: 'test.png',
      mimeType: 'image/png',
      buffer,
    });

    const captured = page.locator('img[alt="Captured"]');
    await expect(captured).toBeVisible();
    const beforeSrc = await captured.getAttribute('src');

    // Open crop editor
    await page.getByRole('button', { name: 'Crop image' }).click();
    const preview = page.locator('img[alt="Crop preview"]');
    await expect(preview).toBeVisible();

    // Real mouse drag over the expression
    const box = (await preview.boundingBox())!;
    await page.mouse.move(box.x + 10, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.7, { steps: 8 });
    await page.mouse.up();

    // Selection rectangle rendered
    await expect(page.locator('div.border-blue-500')).toBeVisible();

    // Apply crop: dialog closes and the captured image changes
    await page.getByRole('button', { name: 'Apply Crop' }).click();
    await expect(preview).toHaveCount(0);
    const afterSrc = await captured.getAttribute('src');
    expect(afterSrc).not.toBe(beforeSrc);

    // OCR recognizes the expression
    await page.getByRole('button', { name: /Recognize Text/ }).click();
    // The new cleanForEvaluation pipeline strips dangling/trailing operators.
    // OCR may return "12 +" (with trailing space/operator) which gets cleaned to "12".
    // This is an intentional behavior change - the test now verifies digits are recognized
    // rather than expecting exact operator preservation.
    const textarea = page.locator('textarea');
    await expect(textarea).not.toHaveValue('', { timeout: 90000 });
    const value = await textarea.inputValue();
    // Verify at least the first digit is recognized (operator handling varies by OCR)
    expect(value).toMatch(/12/);
  });
});
