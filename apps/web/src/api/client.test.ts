import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApiClient, ApiRequestError, ErrorCode } from './client';
import type { CalculateRequest } from './types';

describe('API Client', () => {
  beforeEach(() => {
    // Mock fetch
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isConfigured', () => {
    it('should return false when no base URL is configured', () => {
      const client = new ApiClient('');
      expect(client.isConfigured()).toBe(false);
    });

    it('should return true when base URL is configured', () => {
      const client = new ApiClient('http://localhost:3001');
      expect(client.isConfigured()).toBe(true);
    });
  });

  describe('health endpoint', () => {
    it('should call GET /api/health', async () => {
      const mockFetch = global.fetch as any;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok', timestamp: '2024-01-01T00:00:00Z' }),
      });

      const client = new ApiClient('http://localhost:3001');
      const result = await client.health();

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/api/health', {
        headers: { 'Content-Type': 'application/json' },
        signal: expect.any(AbortSignal),
      });
      expect(result).toEqual({
        status: 'ok',
        timestamp: '2024-01-01T00:00:00Z',
      });
    });

    it('should throw error when not configured', async () => {
      const client = new ApiClient('');
      await expect(client.health()).rejects.toThrow('API not configured');
    });
  });

  describe('calculate endpoint', () => {
    it('should call POST /api/calculate with request body', async () => {
      const mockFetch = global.fetch as any;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, result: 14 }),
      });

      const client = new ApiClient('http://localhost:3001');
      const request: CalculateRequest = {
        expression: '2 + 3 * 4',
        angleMode: 'deg',
      };

      const result = await client.calculate(request);

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/api/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: expect.any(AbortSignal),
      });
      expect(result).toEqual({ success: true, result: 14 });
    });

    it('should handle 400 error with validation error code', async () => {
      const mockFetch = global.fetch as any;
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Invalid request', code: 'VALIDATION_ERROR' }),
      });

      const client = new ApiClient('http://localhost:3001');

      try {
        await client.calculate({ expression: '' });
        throw new Error('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiRequestError);
        if (error instanceof ApiRequestError) {
          expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
          expect(error.statusCode).toBe(400);
        }
      }
    });

    it('should handle 404 error', async () => {
      const mockFetch = global.fetch as any;
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not Found', code: 'NOT_FOUND' }),
      });

      const client = new ApiClient('http://localhost:3001');

      try {
        await client.calculate({ expression: '2+2' });
        throw new Error('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiRequestError);
        if (error instanceof ApiRequestError) {
          expect(error.code).toBe(ErrorCode.NOT_FOUND);
          expect(error.statusCode).toBe(404);
        }
      }
    });

    it('should handle network error', async () => {
      const mockFetch = global.fetch as any;
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const client = new ApiClient('http://localhost:3001');

      try {
        await client.calculate({ expression: '2+2' });
        throw new Error('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiRequestError);
        if (error instanceof ApiRequestError) {
          expect(error.code).toBe(ErrorCode.NETWORK_ERROR);
        }
      }
    });
  });
});
