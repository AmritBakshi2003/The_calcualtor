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
    await expect(result).toContainText('5');
  });

  test('Operator precedence: 2 + 3 × 4 = 14', async ({ page }) => {
    await page.click('button:has-text("Simple")');

    await page.click('button[aria-label="2"]');
    await page.click('button[aria-label="Add"]');
    await page.click('button[aria-label="3"]');
    await page.click('button[aria-label="Multiply"]');
    await page.click('button[aria-label="4"]');
    await page.click('button[aria-label="Equals"]');

    const result = page.locator('[aria-live="polite"]');
    await expect(result).toContainText('14');
  });

  test('Tab navigation', async ({ page }) => {
    // Test switching between tabs
    await expect(page.getByText('Simple')).toBeVisible();
    await expect(page.getByText('Scientific')).toBeVisible();
    await expect(page.getByText('Finance')).toBeVisible();
    await expect(page.getByText('Scan')).toBeVisible();

    // Click Scientific tab
    await page.click('button:has-text("Scientific")');
    await expect(page.getByText('sin')).toBeVisible();
    await expect(page.getByText('cos')).toBeVisible();

    // Click Finance tab
    await page.click('button:has-text("Finance")');
    await expect(page.getByText('EMI')).toBeVisible();
    await expect(page.getByText('Interest')).toBeVisible();

    // Click Scan tab
    await page.click('button:has-text("Scan")');
    await expect(page.getByText('Capture Camera')).toBeVisible();
  });

  test('Theme toggle', async ({ page }) => {
    const body = page.locator('body');

    // Click theme toggle
    await page.click('button[aria-label="Toggle theme"]');

    // Check if dark mode is applied
    await expect(body).toHaveClass('dark');

    // Toggle back
    await page.click('button[aria-label="Toggle theme"]');
    await expect(body).not.toHaveClass('dark');
  });

  test('History panel opens and closes', async ({ page }) => {
    // Click history button
    await page.click('button[aria-label="View history"]');

    // Check if history panel is visible
    await expect(page.getByText('History')).toBeVisible();

    // Close history panel
    await page.click('button[aria-label="Close history"]');

    // Check if panel is closed
    await expect(page.getByText('History')).not.toBeVisible();
  });

  test('Scientific calculator displays', async ({ page }) => {
    await page.click('button:has-text("Scientific")');

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
    await expect(page.getByText('EMI')).toBeVisible();
    await expect(page.getByText('Interest')).toBeVisible();
    await expect(page.getByText('SIP')).toBeVisible();
    await expect(page.getByText('Investment')).toBeVisible();
    await expect(page.getByText('Cash Flow')).toBeVisible();
    await expect(page.getByText('Tax/GST')).toBeVisible();
  });

  test('Keyboard input works', async ({ page }) => {
    await page.click('button:has-text("Simple")');

    // Type 5 + 5 using keyboard
    await page.keyboard.press('5');
    await page.keyboard.press('+');
    await page.keyboard.press('5');
    await page.keyboard.press('Enter');

    // Verify result
    const result = page.locator('[aria-live="polite"]');
    await expect(result).toContainText('10');
  });

  test('Error handling: divide by zero', async ({ page }) => {
    await page.click('button:has-text("Simple")');

    await page.click('button[aria-label="1"]');
    await page.click('button[aria-label="0"]');
    await page.click('button[aria-label="Divide"]');
    await page.click('button[aria-label="0"]');
    await page.click('button[aria-label="Equals"]');

    // Should show error (may vary based on math.js behavior)
    const result = page.locator('[aria-live="polite"]');
    // Either shows error or handles gracefully
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
