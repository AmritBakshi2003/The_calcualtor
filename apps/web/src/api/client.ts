import {
  CalculateRequest,
  CalculateResponse,
  HealthResponse,
  ReadyResponse,
  ErrorCode,
} from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const API_TIMEOUT = 10000; // 10 seconds

class ApiClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl: string = '', timeout: number = 10000) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!this.baseUrl) {
      throw new Error('API not configured');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new ApiRequestError(
          errorBody.error || response.statusText,
          errorBody.code || this.getErrorCode(response.status),
          response.status,
          errorBody.details
        );
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ApiRequestError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new ApiRequestError('Request timeout', ErrorCode.TIMEOUT, 408);
        }
        throw new ApiRequestError('Network error', ErrorCode.NETWORK_ERROR, 0);
      }

      throw new ApiRequestError('Unknown error', ErrorCode.INTERNAL_ERROR, 0);
    }
  }

  private getErrorCode(status: number): ErrorCode {
    if (status === 400) return ErrorCode.VALIDATION_ERROR;
    if (status === 404) return ErrorCode.NOT_FOUND;
    if (status === 429) return ErrorCode.RATE_LIMIT_EXCEEDED;
    if (status === 503) return ErrorCode.SERVICE_UNAVAILABLE;
    return ErrorCode.INTERNAL_ERROR;
  }

  // Health check
  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/api/health');
  }

  // Readiness check
  async ready(): Promise<ReadyResponse> {
    return this.request<ReadyResponse>('/api/health/ready');
  }

  // Calculate expression
  async calculate(request: CalculateRequest): Promise<CalculateResponse> {
    return this.request<CalculateResponse>('/api/calculate', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // Check if API is configured
  isConfigured(): boolean {
    return !!this.baseUrl;
  }
}

class ApiRequestError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public statusCode: number,
    public details?: string
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

// Create singleton instance
const apiClient = new ApiClient(API_BASE_URL || '', API_TIMEOUT);

export { apiClient, ApiClient, ApiRequestError, ErrorCode };

