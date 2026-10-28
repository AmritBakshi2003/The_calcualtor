import { test, expect } from '@playwright/test';

test.describe('Calculator Suite E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('Simple calculation: 2 + 3 = 5', async ({ page }) => {
    // Switch to Simple mode if not already
    await page.click('button:has-text("Simple")');

    // Click digit buttons
    await page.click('button[aria-label="2"]');
    await page.click('button[aria-label="Add"]');
    await page.click('button[aria-label="3"]');

    // Click equals
    await page.click('button[aria-label="Equals"]');

    // Verify result
    const result = page.locator('[aria-live="polite"]');
    await expect(result.nth(1)).toContainText('5');
  });

  test('Tab navigation', async ({ page }) => {
    // Test switching between tabs
    await expect(page.getByText('Simple')).toBeVisible();
    await expect(page.getByText('Finance')).toBeVisible();
    await expect(page.getByText('Scan')).toBeVisible();

    // Click Finance tab
    await page.click('button:has-text("Finance")');
    await expect(page.getByRole('button', { name: 'EMI', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Interest', exact: true })).toBeVisible();

    // Click Scan tab
    await page.click('button:has-text("Scan")');
    await expect(page.getByText('Capture Camera')).toBeVisible();
  });

  test('History panel opens and closes', async ({ page }) => {
    // Click history button
    await page.click('button[aria-label="History"]');

    // Check if history panel is visible
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();

    // Close history panel
    await page.click('button[aria-label="Close history"]');

    // Check if panel is closed
    await expect(page.getByRole('heading', { name: 'History' })).not.toBeVisible();
  });

  test('Scientific functions work', async ({ page }) => {
    // Click scientific button to expand
    await page.click('button[aria-label="Toggle Scientific"]');

    // Check for scientific functions
    await expect(page.getByText('sin')).toBeVisible();
    await expect(page.getByText('cos')).toBeVisible();
    await expect(page.getByText('tan')).toBeVisible();
    await expect(page.getByText('√')).toBeVisible();
    await expect(page.getByText('^')).toBeVisible();
    await expect(page.getByText('π')).toBeVisible();
  });

  test('Finance calculators display', async ({ page }) => {
    await page.click('button:has-text("Finance")');

    // Check for finance calculator tabs
    await expect(page.getByRole('button', { name: 'EMI', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Interest', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'SIP', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Investment', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cash Flow', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tax/GST', exact: true })).toBeVisible();
  });

  test('EMI calculator inputs', async ({ page }) => {
    await page.click('button:has-text("Finance")');
    await page.click('button:has-text("EMI")');

    // Check for input fields
    await expect(page.getByPlaceholder('Enter principal amount')).toBeVisible();
    await expect(page.getByPlaceholder('Enter annual interest rate')).toBeVisible();
    await expect(page.getByPlaceholder('Enter tenure in months')).toBeVisible();
  });
});
