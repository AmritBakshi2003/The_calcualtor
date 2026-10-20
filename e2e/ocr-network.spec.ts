import { test, expect } from '@playwright/test';

test('OCR uses only local assets (no external network requests)', async ({ page, context }) => {
  // Track all network requests
  const externalRequests: string[] = [];
  context.on('request', (request) => {
    const url = request.url();
    // Allow same-origin and localhost requests
    if (!url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1')) {
      externalRequests.push(url);
    }
  });

  // Navigate to the app
  await page.goto('http://localhost:4173');

  // Navigate to Scan calculator
  await page.click('text=Scan');

  // Create a simple test image URL (using a data URI to avoid external requests for the test itself)
  const testImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  // Inject the test image into the file input
  await page.evaluate((imageUrl) => {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (input) {
      const file = new File([Uint8Array.from(atob(imageUrl.split(',')[1]), c => c.charCodeAt(0))], 'test.png', { type: 'image/png' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input.files = dataTransfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, testImage);

  // Wait a moment for the image to load
  await page.waitForTimeout(1000);

  // Check that no external requests were made
  expect(externalRequests).toHaveLength(0);
});
