import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CameraCapture } from './CameraCapture';

// Mock useCamera hook
const mockStartCamera = vi.fn();
const mockStopCamera = vi.fn();
const mockSwitchCamera = vi.fn();
const mockToggleTorch = vi.fn();

vi.mock('./useCamera', () => ({
  useCamera: () => ({
    stream: null,
    error: null,
    isLoading: false,
    hasMultipleCameras: false,
    hasTorch: false,
    isTorchOn: false,
    startCamera: mockStartCamera,
    stopCamera: mockStopCamera,
    switchCamera: mockSwitchCamera,
    toggleTorch: mockToggleTorch,
  }),
}));

describe('CameraCapture', () => {
  const mockOnClose = vi.fn();
  const mockOnCapture = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not render when isOpen is false', () => {
    const { container } = render(
      <CameraCapture isOpen={false} onClose={mockOnClose} onCapture={mockOnCapture} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render when isOpen is true', () => {
    render(
      <CameraCapture isOpen={true} onClose={mockOnClose} onCapture={mockOnCapture} />
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
  });

  it('should have correct accessibility attributes', () => {
    render(
      <CameraCapture isOpen={true} onClose={mockOnClose} onCapture={mockOnCapture} />
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Camera capture');
  });

  it('should call startCamera when isOpen becomes true', () => {
    const { rerender } = render(
      <CameraCapture isOpen={false} onClose={mockOnClose} onCapture={mockOnCapture} />
    );

    expect(mockStartCamera).not.toHaveBeenCalled();

    rerender(<CameraCapture isOpen={true} onClose={mockOnClose} onCapture={mockOnCapture} />);

    expect(mockStartCamera).toHaveBeenCalled();
  });

  it('should call stopCamera when isOpen becomes false', () => {
    const { rerender } = render(
      <CameraCapture isOpen={true} onClose={mockOnClose} onCapture={mockOnCapture} />
    );

    rerender(<CameraCapture isOpen={false} onClose={mockOnClose} onCapture={mockOnCapture} />);

    expect(mockStopCamera).toHaveBeenCalled();
  });
});
