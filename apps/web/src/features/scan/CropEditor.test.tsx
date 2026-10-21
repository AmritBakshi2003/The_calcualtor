import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CropEditor } from './CropEditor';

// jsdom doesn't implement canvas getContext; stub enough for applyCrop.
beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    drawImage: vi.fn(),
  }) as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,CROPPED');
});

describe('CropEditor', () => {
  const onApply = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => vi.clearAllMocks());

  it('renders dialog with preview and controls', () => {
    render(<CropEditor imageSrc="data:image/png;base64,ABC" onApply={onApply} onCancel={onCancel} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByAltText('Crop preview')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply Crop' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('calls onCancel when Cancel is clicked', () => {
    render(<CropEditor imageSrc="data:image/png;base64,ABC" onApply={onApply} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('calls onCancel on Apply when no selection was made', () => {
    render(<CropEditor imageSrc="data:image/png;base64,ABC" onApply={onApply} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply Crop' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  // NOTE: The drag-to-select interaction is covered by a real-browser test in
  // e2e/ocr-crop.spec.ts. jsdom cannot exercise React pointer-drag state
  // updates (no layout, incomplete PointerEvent support), so the drag path is
  // verified in Playwright against the real dev server instead.
});
