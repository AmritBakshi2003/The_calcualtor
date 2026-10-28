/// <reference types="node" />
import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * End-to-end journey for the Gemini-powered scanner.
 *
 * The real Worker API is not part of the Playwright preview server, so the
 * same-origin /api routes are intercepted with mocks around a REAL build and
 * real local Tesseract — recognition, editing, solving and graceful
 * degradation all run exactly as a user experiences them.
 *
 * The scan pipeline (Phase 3-5) talks to POST /api/scan/consensus
 * (cache -> decide -> protected Gemini arbiter) and POST /api/scan/ocrspace;
 * the consensus response carries { expression, verified, sources,
 * alternatives, stages }, and the UI renders the verdict through the
 * `verification-badge` + `engine-sources` test ids.
 */

function jsonRoute(status: number, body: object) {
  return async (route: Route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  };
}

/** Render one expression on a canvas in the browser and return a data URL. */
async function renderExpression(page: Page, text: string): Promise<string> {
  return page.evaluate((expression) => {
    const c = document.createElement('canvas');
    c.width = 560;
    c.height = 150;
    const x = c.getContext('2d')!;
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#000000';
    x.font = 'bold 62px sans-serif';
    x.textBaseline = 'top';
    x.fillText(expression, 20, 30);
    return c.toDataURL('image/png');
  }, text);
}

async function uploadImage(page: Page, dataUrl: string, name: string): Promise<void> {
  const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
  await page.locator('input[type=file][accept^="image/jpeg"]').first().setInputFiles({
    name: `${name}.png`,
    mimeType: 'image/png',
    buffer,
  });
  await expect(page.locator('img[alt="Captured"]')).toBeVisible();
}

async function openScanTab(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: /Switch to Scan/ }).click();
  await expect(page.getByRole('heading', { name: 'Scan Calculator' })).toBeVisible();
}

test.describe('Gemini-powered scanner', () => {
  test('cross-validates the scan, then solves local failures and word questions', async ({ page }) => {
    test.setTimeout(240000);

    // Server reports Gemini on; recognition agrees with the local reading.
    const capabilitiesMock = jsonRoute(200, { gemini: true });
    let recognizeCount = 0;
    const consensusMock = async (route: Route) => {
      recognizeCount += 1;
      const body = (await route.request().postDataJSON()) as {
        candidates?: { expression: string }[];
      };
      // The consensus body must carry the local candidates (the proof the
      // arbiter receives exactly what Tesseract read).
      const hint = body.candidates?.[0]?.expression ?? '';
      const hasCandidates = typeof hint === 'string' && body.candidates?.length;
      const status = hasCandidates ? 200 : 500;
      // Mirror the real Worker: structural regex keeps only math characters.
      const corrected = hint.replace(/O/g, '0').replace(/[^0-9+\-*/.()]/g, '');
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(
          corrected
            ? {
                expression: corrected,
                verified: true,
                sources: ['tesseract:grayscale-psm7', 'gemini'],
                alternatives: [],
                stages: ['cache:miss', 'decide:needs_arbiter', 'arbiter:gemini-3.5-flash-lite:match'],
              }
            : {
                expression: '',
                verified: false,
                sources: [],
                alternatives: [],
                stages: ['cache:miss', 'decide:needs_arbiter', 'arbiter:skipped:not_configured'],
              }
        ),
      });
    };
    await page.route('**/api/scan/capabilities', capabilitiesMock);
    await page.route('**/api/scan/consensus', consensusMock);
    let solveCount = 0;
    const solveMock = async (route: Route) => {
      solveCount += 1;
      const body = (await route.request().postDataJSON()) as { question: string };
      const answer = body.question.includes('15%') ? '52.5' : 'UNANSWERABLE';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ answer: answer === 'UNANSWERABLE' ? null : answer, source: 'gemini' }),
      });
    };
    await page.route('**/api/solve/complex', solveMock);

    await openScanTab(page);

    // The badge reflects the capability probe.
    await expect(page.getByTestId('scan-engine-badge')).toHaveText(/Powered by Google Gemini/, {
      timeout: 15000,
    });

    // ---- Lens-style scan: local Tesseract + Gemini cross-validation
    const dataUrl = await renderExpression(page, '12 + 34');
    await uploadImage(page, dataUrl, 'agree');

    const recognize = page.getByRole('button', { name: /Recognize Text/i });
    await recognize.click();
    await expect(recognize).toBeEnabled({ timeout: 120000 });
    await expect(page.locator('#recognized-expression')).toHaveValue('12+34', { timeout: 30000 });
    await expect(page.getByTestId('verification-badge')).toHaveText('✓ Verified');
    await expect(page.getByTestId('engine-sources')).toContainText('Tesseract');
    await expect(page.getByTestId('engine-sources')).toContainText('Gemini');
    expect(recognizeCount).toBe(1);

    // ---- Simple question: solved locally, free, no model call
    await page.getByRole('button', { name: /Solve Expression/i }).click();
    await expect(page.getByTestId('scan-result')).toHaveText('46', { timeout: 15000 });
    expect(solveCount).toBe(0);

    // ---- Word question: local engines decline, the complexity gate asks Gemini
    const box = page.locator('#recognized-expression');
    await box.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('what is 15% of 350?');
    await page.getByRole('button', { name: /Solve Expression/i }).click();
    await expect(page.getByTestId('scan-result')).toHaveText('52.5', { timeout: 20000 });
    await expect(page.getByText(/Computed by Google Gemini/)).toBeVisible();
    expect(solveCount).toBe(1);

    // ---- Manual "Ask Gemini" for an already-solvable expression
    await page.getByTestId('ask-gemini').click();
    await expect(page.getByTestId('scan-result')).toHaveText('52.5', { timeout: 20000 });
    expect(solveCount).toBe(2);

    // ---- Disagreement: Gemini corrects the local reading, UI warns
    recognizeCount = 0;
    await page.route('**/api/scan/consensus', jsonRoute(200, {
      expression: '98-76',
      verified: false,
      sources: ['gemini'],
      alternatives: [],
      stages: ['cache:miss', 'decide:needs_arbiter', 'arbiter:gemini-3.5-flash-lite:no_match'],
    }));
    await page.getByRole('button', { name: /Clear image/i }).click();
    const disagreeUrl = await renderExpression(page, '12 + 34');
    await uploadImage(page, disagreeUrl, 'disagree');
    await recognize.click();
    await expect(recognize).toBeEnabled({ timeout: 120000 });
    await expect(page.locator('#recognized-expression')).toHaveValue('98-76', { timeout: 30000 });
    // The server's answer disagrees with the local reading: unverified.
    await expect(page.getByTestId('verification-badge')).toHaveText('⚠ Unverified — please check');
    await expect(page.getByText('This reading was not confirmed by two engines')).toBeVisible();
  });

  test('degrades gracefully when Gemini is unavailable', async ({ page }) => {
    // Errors happen AFTER a successful local scan in real life; here the
    // consensus service is simply not answering with Gemini.
    test.setTimeout(240000);

    await page.route('**/api/scan/capabilities', jsonRoute(200, { gemini: true }));
    await page.route('**/api/scan/consensus', jsonRoute(503, { error: 'gemini_not_configured' }));

    await openScanTab(page);
    await expect(page.getByTestId('scan-engine-badge')).toHaveText(/Powered by Google Gemini/, {
      timeout: 15000,
    });

    const dataUrl = await renderExpression(page, '63 + 27');
    await uploadImage(page, dataUrl, 'degrade');

    const recognize = page.getByRole('button', { name: /Recognize Text/i });
    await recognize.click();
    await expect(recognize).toBeEnabled({ timeout: 120000 });
    // The local engine's answer stands; the pipeline says where it broke.
    await expect(page.locator('#recognized-expression')).toHaveValue(/63\s*\+\s*27/, { timeout: 40000 });
    await expect(page.getByTestId('verification-badge')).toHaveText('⚠ Unverified — please check');
    await expect(page.getByText('not available')).toBeVisible();
  });

  test('local-only mode without the Worker', async ({ page }) => {
    // No /api routes exist on the bare preview server -> HTML or 404.
    await openScanTab(page);
    await expect(page.getByTestId('scan-engine-badge')).toHaveText(/Local recognition only/, {
      timeout: 15000,
    });
    // No Ask Gemini button without the capability.
    await expect(page.getByTestId('ask-gemini')).toHaveCount(0);
  });
});
