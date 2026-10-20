import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCamera } from './useCamera';

describe('useCamera', () => {
  const originalMediaDevices = navigator.mediaDevices;
  const mockGetUserMedia = vi.fn();
  const mockEnumerateDevices = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: mockGetUserMedia,
        enumerateDevices: mockEnumerateDevices,
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: originalMediaDevices,
    });
    vi.restoreAllMocks();
  });

  it('should start camera successfully', async () => {
    const mockStream = {
      getTracks: vi.fn(() => []),
      getVideoTracks: vi.fn(() => [{ getCapabilities: vi.fn(() => ({})) }]),
    } as unknown as MediaStream;

    mockGetUserMedia.mockResolvedValue(mockStream);
    mockEnumerateDevices.mockResolvedValue([
      { kind: 'videoinput', deviceId: '1' },
      { kind: 'videoinput', deviceId: '2' },
    ]);

    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera();
    });

    expect(result.current.stream).toBe(mockStream);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(result.current.hasMultipleCameras).toBe(true);
  });

  it('should handle NotAllowedError', async () => {
    const error = new Error('Permission denied') as Error & { name: string };
    error.name = 'NotAllowedError';
    mockGetUserMedia.mockRejectedValue(error);

    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera();
    });

    expect(result.current.error?.type).toBe('NotAllowedError');
    expect(result.current.error?.message).toContain('Camera permission was denied');
  });

  it('should handle NotFoundError', async () => {
    const error = new Error('No device') as Error & { name: string };
    error.name = 'NotFoundError';
    mockGetUserMedia.mockRejectedValue(error);

    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera();
    });

    expect(result.current.error?.type).toBe('NotFoundError');
    expect(result.current.error?.message).toContain('No camera found');
  });

  it('should handle NotReadableError', async () => {
    const error = new Error('In use') as Error & { name: string };
    error.name = 'NotReadableError';
    mockGetUserMedia.mockRejectedValue(error);

    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera();
    });

    expect(result.current.error?.type).toBe('NotReadableError');
    expect(result.current.error?.message).toContain('Camera is in use');
  });

  it('should retry with plain video constraint on OverconstrainedError', async () => {
    const mockStream = {
      getTracks: vi.fn(() => []),
      getVideoTracks: vi.fn(() => []),
    } as unknown as MediaStream;

    const constrainedError = new Error('Overconstrained') as Error & { name: string };
    constrainedError.name = 'OverconstrainedError';
    
    mockGetUserMedia
      .mockRejectedValueOnce(constrainedError)
      .mockResolvedValueOnce(mockStream);

    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera();
    });

    expect(mockGetUserMedia).toHaveBeenCalledTimes(2);
    expect(result.current.stream).toBe(mockStream);
  });

  it('should stop camera and cleanup tracks', async () => {
    const mockTrack = { stop: vi.fn() };
    const mockStream = {
      getTracks: vi.fn(() => [mockTrack]),
      getVideoTracks: vi.fn(() => []),
    } as unknown as MediaStream;

    mockGetUserMedia.mockResolvedValue(mockStream);

    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera();
    });

    act(() => {
      result.current.stopCamera();
    });

    expect(mockTrack.stop).toHaveBeenCalled();
    expect(result.current.stream).toBe(null);
  });

  it('should handle unsupported browser', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: undefined,
    });

    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera();
    });

    expect(result.current.error?.type).toBe('NotSupportedError');
    expect(result.current.error?.message).toContain('Camera not supported');
  });

  it('should cleanup on unmount', async () => {
    const mockTrack = { stop: vi.fn() };
    const mockStream = {
      getTracks: vi.fn(() => [mockTrack]),
      getVideoTracks: vi.fn(() => []),
    } as unknown as MediaStream;

    mockGetUserMedia.mockResolvedValue(mockStream);

    const { result, unmount } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera();
    });

    unmount();

    expect(mockTrack.stop).toHaveBeenCalled();
  });
});
