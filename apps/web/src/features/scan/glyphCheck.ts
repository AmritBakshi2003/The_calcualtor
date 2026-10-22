/**
 * Decide whether a glyph Tesseract read as "+" was really "÷".
 *
 * The two look alike at low resolution (phone photos of screens), and a wrong
 * "+" quietly evaluates "144÷12" as 156 instead of 12. The shapes in ink terms:
 * a plus is ONE 4-connected component; a divide is a wide bar with a dot above
 * and a dot below. Pure over ImageData so it is unit testable.
 */

import { computeInkMask } from './ocrPreprocess';

interface Component {
  area: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Horizontal center of a component's bounding box. */
const centerX = (c: Component) => (c.x0 + c.x1 + 1) / 2;

export function classifyPlusOrDivide(gray: ImageData): 'plus' | 'divide' | 'unknown' {
  const ink = computeInkMask(gray);
  if (!ink) return 'unknown';

  const { width, height } = gray;
  const totalPixels = width * height;

  // 4-connected components over the ink mask. Iterative flood fill so deep
  // glyphs cannot overflow the call stack.
  const label = new Int32Array(totalPixels);
  const components: Component[] = [];
  const stack: number[] = [];
  let nextLabel = 0;

  for (let start = 0; start < totalPixels; start++) {
    if (!ink.mask[start] || label[start]) continue;
    nextLabel++;
    let area = 0;
    let x0 = width;
    let y0 = height;
    let x1 = -1;
    let y1 = -1;
    stack.push(start);
    label[start] = nextLabel;
    while (stack.length > 0) {
      const p = stack.pop()!;
      const x = p % width;
      const y = (p / width) | 0;
      area++;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
      // 4-connected: left, right, up, down
      if (x > 0 && ink.mask[p - 1] && !label[p - 1]) (stack.push(p - 1)), (label[p - 1] = nextLabel);
      if (x < width - 1 && ink.mask[p + 1] && !label[p + 1]) (stack.push(p + 1)), (label[p + 1] = nextLabel);
      if (y > 0 && ink.mask[p - width] && !label[p - width]) (stack.push(p - width)), (label[p - width] = nextLabel);
      if (y < height - 1 && ink.mask[p + width] && !label[p + width]) (stack.push(p + width)), (label[p + width] = nextLabel);
    }
    components.push({ area, x0, y0, x1, y1 });
  }

  // Specks (scan noise, JPEG debris) are not glyph parts.
  const kept = components.filter((c) => c.area >= totalPixels * 0.03);

  if (kept.length === 1) return 'plus';
  if (kept.length !== 3) return 'unknown';

  // Order the three parts vertically: dot, bar, dot.
  const [first, second, third] = [...kept].sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
  const top = first;
  const mid = second;
  const bottom = third;

  const midWidth = mid.x1 - mid.x0 + 1;
  if (midWidth < 2) return 'unknown';

  const topWidth = top.x1 - top.x0 + 1;
  const bottomWidth = bottom.x1 - bottom.x0 + 1;
  // The bar is clearly wider than both dots: that is what separates a divide
  // sign from two dots stacked on a short fragment (or a broken plus).
  if (midWidth < 2 * topWidth || midWidth < 2 * bottomWidth) return 'unknown';

  const midCenterX = centerX(mid);
  const tolerance = midWidth * 0.25;
  if (Math.abs(centerX(top) - midCenterX) > tolerance) return 'unknown';
  if (Math.abs(centerX(bottom) - midCenterX) > tolerance) return 'unknown';

  return 'divide';
}
