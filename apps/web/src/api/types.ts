// API request and response types

export interface CalculateRequest {
  expression: string;
  angleMode?: 'deg' | 'rad';
  lastAnswer?: number;
}

export interface CalculateResponse {
  success: boolean;
  result?: number | string;
}

export interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
}

export interface ReadyResponse {
  status: 'ready' | 'not_ready';
  timestamp: string;
  dependencies: {
    mathCore: 'available' | 'unavailable';
  };
}

export interface ApiError {
  error: string;
  code: string;
  details?: string;
}

// Error codes
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_EXPRESSION = 'INVALID_EXPRESSION',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  NOT_FOUND = 'NOT_FOUND',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
}
