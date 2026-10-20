import { useState, useEffect, useRef, useCallback } from 'react';

export interface CameraError {
  type: 'NotAllowedError' | 'NotFoundError' | 'NotReadableError' | 'OverconstrainedError' | 'NotSupportedError' | 'UnknownError';
  message: string;
}

export interface UseCameraReturn {
  stream: MediaStream | null;
  error: CameraError | null;
  isLoading: boolean;
  hasMultipleCameras: boolean;
  hasTorch: boolean;
  isTorchOn: boolean;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  switchCamera: () => Promise<void>;
  toggleTorch: () => Promise<void>;
}

export function useCamera(): UseCameraReturn {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<CameraError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  
  const streamRef = useRef<MediaStream | null>(null);
  const cancelledRef = useRef(false);
  const isMountedRef = useRef(true);
  const currentFacingModeRef = useRef<'environment' | 'user'>('environment');

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (isMountedRef.current) {
      setStream(null);
      setIsTorchOn(false);
    }
  }, []);

  const startCamera = useCallback(async (facingMode: 'environment' | 'user' = 'environment') => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError({
        type: 'NotSupportedError',
        message: 'Camera not supported in this browser or insecure context'
      });
      return;
    }

    cancelledRef.current = false;
    setIsLoading(true);
    setError(null);

    try {
      const constraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      };

      let mediaStream: MediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        if (err instanceof Error && err.name === 'OverconstrainedError') {
          // Retry with plain video constraint
          mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } else {
          throw err;
        }
      }

      if (cancelledRef.current || !isMountedRef.current) {
        mediaStream.getTracks().forEach(track => track.stop());
        return;
      }

      streamRef.current = mediaStream;
      setStream(mediaStream);
      currentFacingModeRef.current = facingMode;

      // Check for multiple cameras
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      setHasMultipleCameras(videoDevices.length > 1);

      // Check for torch support
      const videoTrack = mediaStream.getVideoTracks()[0];
      if (videoTrack) {
        const capabilities = (videoTrack.getCapabilities() as MediaTrackCapabilities & { torch?: boolean });
        if (capabilities?.torch) {
          setHasTorch(true);
        }
      }

    } catch (err) {
      if (!isMountedRef.current) return;

      let errorType: CameraError['type'] = 'UnknownError';
      let errorMessage = 'Failed to access camera';

      if (err instanceof Error) {
        switch (err.name) {
          case 'NotAllowedError':
          case 'PermissionDeniedError':
            errorType = 'NotAllowedError';
            errorMessage = 'Camera permission was denied. Allow camera access in your browser settings, or upload an image instead.';
            break;
          case 'NotFoundError':
          case 'DevicesNotFoundError':
            errorType = 'NotFoundError';
            errorMessage = 'No camera found on this device.';
            break;
          case 'NotReadableError':
            errorType = 'NotReadableError';
            errorMessage = 'Camera is in use by another app.';
            break;
          case 'OverconstrainedError':
            errorType = 'OverconstrainedError';
            errorMessage = 'Camera does not support the requested constraints.';
            break;
          default:
            errorMessage = err.message;
        }
      }

      setError({ type: errorType, message: errorMessage });
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const switchCamera = useCallback(async () => {
    const newFacingMode = currentFacingModeRef.current === 'environment' ? 'user' : 'environment';
    stopCamera();
    await startCamera(newFacingMode);
  }, [stopCamera, startCamera]);

  const toggleTorch = useCallback(async () => {
    const videoTrack = streamRef.current?.getVideoTracks()[0];
    if (!videoTrack) return;

    try {
      const capabilities = videoTrack.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
      if (!capabilities?.torch) return;

      const newValue = !isTorchOn;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (videoTrack.applyConstraints as any)({
        advanced: [{ torch: newValue }]
      });
      setIsTorchOn(newValue);
    } catch (err) {
      console.error('Failed to toggle torch:', err);
    }
  }, [isTorchOn]);

  // Handle visibility change - stop camera when tab is hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && streamRef.current) {
        stopCamera();
      } else if (!document.hidden && !streamRef.current && !error) {
        // Restart camera when tab becomes visible, if it was previously open
        startCamera(currentFacingModeRef.current);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [error, stopCamera, startCamera]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cancelledRef.current = true;
      stopCamera();
    };
  }, [stopCamera]);

  return {
    stream,
    error,
    isLoading,
    hasMultipleCameras,
    hasTorch,
    isTorchOn,
    startCamera,
    stopCamera,
    switchCamera,
    toggleTorch
  };
}
