/// <reference types="node" />
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  readEquationOcrSpace,
} from '../apps/web/src/features/scan/ocrSpace';
import {
  adjudicateExpression,
} from '../apps/web/src/features/scan/geminiOCR';

/**
 * OCR accuracy harness.
 *
 * Renders a deterministic corpus of number images in the browser (real canvas,
 * real fonts), feeds each one through the actual Scan tab — upload → ✂️ crop is
 * NOT used, so this measures the uncropped path a user gets from the camera —
 * and compares what the app puts in the edit box with the expected expression.
 *
 * The report is written to test-results/ocr-report.json so accuracy changes can
 * be compared across runs, plus equations_test_log.csv in the cross-engine log
 * format from the "End-to-End Basic Math OCR Implementation Guide".
 *
 * Optional cross-engine columns are filled only when a key is present in the
 * environment (OCRSPACE_API_KEY / GEMINI_API_KEY); the headers stay in the CSV
 * either way so runs with and without keys stay diffable.
 */

const OCR_SPACE_KEY = process.env.OCRSPACE_API_KEY ?? '';
const GEMINI_KEY = process.env.GEMINI_API_KEY ?? '';
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';

const csvEscape = (value: string) => '"' + String(value).replace(/"/g, '""') + '"';

interface CaseSpec {
  name: string;
  lines: string[];
  expected: string;
  width?: number;
  height?: number;
  fontSize?: number;
  family?: string;
  weight?: string;
  color?: string;
  bg?: string;
  rotate?: number;
  blur?: number;
  noise?: number;
  jpeg?: number;
  header?: string;
  x?: number;
  y?: number;
  /** Known engine limitation; reported but not counted as a regression. */
  knownLimitation?: string;
}

const CASES: CaseSpec[] = [
  { name: 'clean-bold', lines: ['12 + 34'], expected: '12+34' },
  { name: 'mono-no-spaces', lines: ['7*8+2'], expected: '7*8+2', family: 'DejaVu Sans Mono' },
  { name: 'long-digits', lines: ['123456+789012'], expected: '123456+789012', width: 900, fontSize: 52 },
  { name: 'decimal', lines: ['3.14 * 2.5'], expected: '3.14*2.5' },
  { name: 'negative', lines: ['-45 + 12'], expected: '-45+12' },
  {
    name: 'division',
    lines: ['144 ÷ 12'],
    expected: '144/12',
    // The eng model reads "÷" as "+" or "=" at every PSM/scale we tried.
    knownLimitation: 'Tesseract eng confuses ÷ with +',
  },
  { name: 'times-x', lines: ['6 x 7'], expected: '6*7' },
  { name: 'small-in-big', lines: ['12 + 34'], expected: '12+34', width: 1200, height: 800, fontSize: 20 },
  { name: 'low-contrast', lines: ['42 + 8'], expected: '42+8', color: '#9a9a9a', bg: '#d9d9d9', fontSize: 52 },
  { name: 'jpeg-artifacts', lines: ['96 / 4'], expected: '96/4', jpeg: 0.35 },
  { name: 'rotated', lines: ['25 + 17'], expected: '25+17', rotate: 4 },
  { name: 'noisy', lines: ['8 * 9'], expected: '8*9', noise: 22 },
  { name: 'dark-screen', lines: ['0.5*8='], expected: '0.5*8', color: '#7CFC00', bg: '#0b1a2b' },
  { name: 'expression-and-result', lines: ['48 × 12', '= 576'], expected: '48*12', fontSize: 52 },
  { name: 'screenshot-distractor', lines: ['123 + 456 = 579'], expected: '123+456', header: '9:41' },
  { name: 'plain-number', lines: ['20250315'], expected: '20250315' },
  {
    name: 'date-above-expression',
    lines: ['12/03/2025', '2 x 45 = 90'],
    expected: '2*45',
    fontSize: 44,
    width: 640,
    height: 190,
  },
  {
    name: 'off-center-photo',
    lines: ['987 - 654'],
    expected: '987-654',
    width: 1600,
    height: 1200,
    fontSize: 44,
    x: 900,
    y: 780,
  },
  {
    name: 'blurry-photo',
    lines: ['63 + 27'],
    expected: '63+27',
    blur: 1.6,
    rotate: -2,
    noise: 8,
    bg: '#f4f1ea',
    color: '#222222',
  },
  {
    name: 'receipt-line',
    lines: ['2 x 45 = 90', 'TOTAL 90.00'],
    expected: '2*45',
    fontSize: 40,
    width: 700,
    bg: '#fffdf5',
    family: 'DejaVu Sans Mono',
  },
  {
    name: 'percent-of',
    lines: ['200 * 10%'],
    expected: '200*10%',
    fontSize: 52,
  },
  {
    name: 'calculator-keypad',
    lines: ['42 x 7', '7 8 9', '4 5 6', '1 2 3'],
    expected: '42*7',
    fontSize: 34,
    height: 260,
    family: 'DejaVu Sans Mono',
  },
];

/** Draw one case on a canvas inside the browser and return a data URL. */
async function renderCase(page: import('@playwright/test').Page, spec: CaseSpec): Promise<string> {
  return page.evaluate((s) => {
    const c = document.createElement('canvas');
    c.width = s.width ?? 560;
    c.height = s.height ?? 150;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = s.bg ?? '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);

    if (s.header) {
      ctx.save();
      ctx.fillStyle = '#666666';
      ctx.font = '24px "DejaVu Sans"';
      ctx.textBaseline = 'top';
      ctx.fillText(s.header, 18, 14);
      ctx.restore();
    }

    ctx.save();
    if (s.blur) ctx.filter = `blur(${s.blur}px)`;
    if (s.rotate) {
      ctx.translate(c.width / 2, c.height / 2);
      ctx.rotate((s.rotate * Math.PI) / 180);
      ctx.translate(-c.width / 2, -c.height / 2);
    }
    ctx.fillStyle = s.color ?? '#000000';
    ctx.font = `${s.weight ?? 'bold'} ${s.fontSize ?? 62}px "${s.family ?? 'DejaVu Sans'}"`;
    ctx.textBaseline = 'top';
    const lineHeight = (s.fontSize ?? 62) * 1.35;
    const total = s.lines.length * lineHeight;
    let y = s.y ?? Math.max(10, (c.height - total) / 2);
    for (const line of s.lines) {
      ctx.fillText(line, s.x ?? Math.max(10, c.width * 0.05), y);
      y += lineHeight;
    }
    ctx.restore();

    if (s.noise) {
      const img = ctx.getImageData(0, 0, c.width, c.height);
      // Deterministic LCG so runs are comparable
      let seed = 12345;
      const rand = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      };
      for (let i = 0; i < img.data.length; i += 4) {
        const n = (rand() - 0.5) * s.noise! * 2;
        img.data[i] += n;
        img.data[i + 1] += n;
        img.data[i + 2] += n;
      }
      ctx.putImageData(img, 0, 0);
    }

    return c.toDataURL(s.jpeg ? 'image/jpeg' : 'image/png', s.jpeg ?? 0.92);
  }, spec);
}

async function uploadAndRecognize(
  page: import('@playwright/test').Page,
  dataUrl: string,
  name: string
): Promise<string> {
  const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
  await page.locator('input[type=file][accept^="image/jpeg"]').setInputFiles({
    name: `${name}.${dataUrl.startsWith('data:image/jpeg') ? 'jpg' : 'png'}`,
    mimeType: dataUrl.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png',
    buffer,
  });

  const recognize = page.getByRole('button', { name: /Recognize Text/i });
  await recognize.click();
  // Recognition re-enables the button when it finishes
  await expect(recognize).toBeEnabled({ timeout: 120000 });

  const box = page.locator('#recognized-expression');
  await expect(box).toBeVisible();
  return box.inputValue();
}

test.describe('Scan tab OCR accuracy', () => {
  test('recognizes the numeric corpus', async ({ page }) => {
    // The first scan initializes the ~10MB engine in the page
    test.setTimeout(600000);

    await page.goto('/');
    await page.getByRole('button', { name: /Switch to Scan/ }).click();
    await expect(page.getByRole('heading', { name: 'Scan Calculator' })).toBeVisible();

    const rows: Array<{
      case: string;
      expected: string;
      actual: string;
      pass: boolean;
      knownLimitation?: string;
      ocrSpaceOutput?: string;
      geminiOutput?: string;
    }> = [];
    for (const spec of CASES) {
      const dataUrl = await renderCase(page, spec);
      let actual = '';
      try {
        actual = await uploadAndRecognize(page, dataUrl, spec.name);
      } catch (error) {
        actual = `<error: ${(error as Error).message.split('\n')[0]}>`;
      }
      // Spacing is presentation: mathjs accepts "2 + 3" and "2+3" alike.
      const normalize = (value: string) => value.replace(/\s+/g, '');

      // Optional cross-engine readings of the SAME image (opt-in via keys).
      let ocrSpaceOutput = '';
      if (OCR_SPACE_KEY) {
        const remote = await readEquationOcrSpace(OCR_SPACE_KEY, dataUrl).catch(() => null);
        ocrSpaceOutput = remote?.text ?? '';
      }
      let geminiOutput = '';
      if (GEMINI_KEY) {
        const candidates = [
          { engine: 'tesseract', text: actual || '(nothing read)' },
          ...(ocrSpaceOutput ? [{ engine: 'ocrspace', text: ocrSpaceOutput }] : []),
        ];
        const verdict = await adjudicateExpression(candidates, {
          apiKey: GEMINI_KEY,
          model: GEMINI_MODEL,
          imageBase64: dataUrl.split(',')[1],
          imageMimeType: dataUrl.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png',
        }).catch(() => null);
        geminiOutput = verdict?.expression ?? '';
      }

      rows.push({
        case: spec.name,
        expected: spec.expected,
        actual,
        pass: normalize(actual) === normalize(spec.expected),
        knownLimitation: spec.knownLimitation,
        ocrSpaceOutput,
        geminiOutput,
      });
      // Reset between images so a stale expression cannot mask a failure
      await page.getByRole('button', { name: /Clear image/i }).click();
    }

    const scored = rows.filter((r) => !r.knownLimitation);
    const passed = scored.filter((r) => r.pass).length;
    const report = {
      generatedAt: new Date().toISOString(),
      scored: scored.length,
      passed,
      accuracy: passed / scored.length,
      rows,
    };
    const outDir = join(process.cwd(), 'test-results');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'ocr-report.json'), JSON.stringify(report, null, 2));
    // equations_test_log.csv — the cross-engine log from the implementation
    // guide (image_filename,expected_equation,tesseract_output,ocr_space_output,
    // status) plus our gemini_output extension column.
    const csv = [
      'image_filename,expected_equation,tesseract_output,ocr_space_output,gemini_output,status',
      ...rows.map(
        (r) =>
          [
            r.case + '.png',
            r.expected,
            r.actual,
            r.ocrSpaceOutput,
            r.geminiOutput,
            r.knownLimitation ? 'LIMIT (engine limitation)' : r.pass ? 'PASS' : 'FAIL',
          ]
            .map(csvEscape)
            .join(',')
      ),
    ].join('\n');
    writeFileSync(join(outDir, 'equations_test_log.csv'), csv + '\n');

    const table = rows
      .map((r) => {
        const label = r.knownLimitation ? 'LIMIT' : r.pass ? 'PASS' : 'FAIL';
        const note = r.knownLimitation ? `  (${r.knownLimitation})` : '';
        return `${label}  ${r.case.padEnd(24)} expected "${r.expected}"  got "${r.actual}"${note}`;
      })
      .join('\n');
    console.log(
      `\nOCR accuracy: ${passed}/${scored.length} (${((passed / scored.length) * 100).toFixed(1)}%)\n${table}\n`
    );

    // Baseline guard: the suite must stay within reach of the measured result.
    expect(passed / scored.length, `OCR accuracy dropped\n${table}`).toBeGreaterThanOrEqual(0.9);
  });

  test('editing the recognized expression in the browser re-evaluates', async ({ page }) => {
    test.setTimeout(180000);
    await page.goto('/');
    await page.getByRole('button', { name: /Switch to Scan/ }).click();

    const dataUrl = await renderCase(page, { name: 'edit', lines: ['12 + 34'], expected: '12+34' });
    const text = await uploadAndRecognize(page, dataUrl, 'edit');
    expect(text).not.toBe('');

    // Regression guard: with a character whitelist active Tesseract reports 0%
    // for perfectly read text, which is what the UI used to display.
    const confidenceLine = page.getByText(/Confidence: /);
    await expect(confidenceLine).toBeVisible();
    expect(await confidenceLine.innerText()).not.toContain('0.00%');

    const box = page.locator('#recognized-expression');
    // A user correcting a misread digit: select everything and retype
    await box.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('12+35');
    await expect(box).toHaveValue('12+35');

    // The old result must be cleared while editing, and the new one solved
    await page.getByRole('button', { name: /Solve Expression/i }).click();
    await expect(page.getByText('47')).toBeVisible();
  });
});
