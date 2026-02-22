/**
 * Standardized Error Handling Utilities for VibeSpeak Server
 * 
 * This module provides consistent error types and handling patterns
 * across all API endpoints and services.
 */

import { logger } from './logger.js';

// Standard error codes
export enum ErrorCode {
  // Authentication errors (401)
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  
  // Authorization errors (403)
  FORBIDDEN = 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  
  // Validation errors (400)
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_FIELD = 'MISSING_FIELD',
  INVALID_FORMAT = 'INVALID_FORMAT',
  
  // Not found errors (404)
  NOT_FOUND = 'NOT_FOUND',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  CHANNEL_NOT_FOUND = 'CHANNEL_NOT_FOUND',
  SERVER_NOT_FOUND = 'SERVER_NOT_FOUND',
  MESSAGE_NOT_FOUND = 'MESSAGE_NOT_FOUND',
  
  // Conflict errors (409)
  CONFLICT = 'CONFLICT',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',
  
  // Server errors (500)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  
  // Rate limiting (429)
  RATE_LIMITED = 'RATE_LIMITED',
}

// HTTP status code mapping
const statusCodeMap: Record<ErrorCode, number> = {
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.INVALID_TOKEN]: 401,
  [ErrorCode.TOKEN_EXPIRED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.INSUFFICIENT_PERMISSIONS]: 403,
  [ErrorCode.INVALID_INPUT]: 400,
  [ErrorCode.MISSING_FIELD]: 400,
  [ErrorCode.INVALID_FORMAT]: 400,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.USER_NOT_FOUND]: 404,
  [ErrorCode.CHANNEL_NOT_FOUND]: 404,
  [ErrorCode.SERVER_NOT_FOUND]: 404,
  [ErrorCode.MESSAGE_NOT_FOUND]: 404,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.ALREADY_EXISTS]: 409,
  [ErrorCode.DUPLICATE_ENTRY]: 409,
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.DATABASE_ERROR]: 500,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
  [ErrorCode.RATE_LIMITED]: 429,
};

/**
 * Custom API Error class with structured error information
 */
export class ApiError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details: Record<string, unknown> | undefined;
  public readonly isOperational: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    details: Record<string, unknown> | undefined = undefined,
    isOperational: boolean = true
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCodeMap[code];
    this.details = details;
    this.isOperational = isOperational;

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert to JSON response format
   */
  toJSON(): Record<string, unknown> {
    return {
      error: this.message,
      code: this.code,
      ...(this.details && { details: this.details }),
    };
  }
}

// Factory functions for common errors
export const Errors = {
  unauthorized: (message: string = 'Unauthorized') => 
    new ApiError(ErrorCode.UNAUTHORIZED, message),
  
  invalidToken: (message: string = 'Invalid or expired token') => 
    new ApiError(ErrorCode.INVALID_TOKEN, message),
  
  forbidden: (message: string = 'Access denied') => 
    new ApiError(ErrorCode.FORBIDDEN, message),
  
  insufficientPermissions: (required: string) => 
    new ApiError(ErrorCode.INSUFFICIENT_PERMISSIONS, `Missing permission: ${required}`, { required }),
  
  invalidInput: (field: string, reason: string) => 
    new ApiError(ErrorCode.INVALID_INPUT, `Invalid ${field}: ${reason}`, { field, reason }),
  
  missingField: (field: string) => 
    new ApiError(ErrorCode.MISSING_FIELD, `Missing required field: ${field}`, { field }),
  
  notFound: (resource: string, id?: string | number) => 
    new ApiError(ErrorCode.NOT_FOUND, `${resource} not found`, id ? { id } : undefined),
  
  userNotFound: (id?: number) => 
    new ApiError(ErrorCode.USER_NOT_FOUND, 'User not found', id ? { userId: id } : undefined),
  
  channelNotFound: (id?: number) => 
    new ApiError(ErrorCode.CHANNEL_NOT_FOUND, 'Channel not found', id ? { channelId: id } : undefined),
  
  serverNotFound: (id?: number) => 
    new ApiError(ErrorCode.SERVER_NOT_FOUND, 'Server not found', id ? { serverId: id } : undefined),
  
  messageNotFound: (id?: number) => 
    new ApiError(ErrorCode.MESSAGE_NOT_FOUND, 'Message not found', id ? { messageId: id } : undefined),
  
  conflict: (message: string, details?: Record<string, unknown>) => 
    new ApiError(ErrorCode.CONFLICT, message, details),
  
  alreadyExists: (resource: string, field: string, value: string) => 
    new ApiError(ErrorCode.ALREADY_EXISTS, `${resource} already exists`, { field, value }),
  
  databaseError: (operation: string, originalError?: Error) => {
    logger.error(`Database error during ${operation}:`, originalError);
    return new ApiError(ErrorCode.DATABASE_ERROR, 'Database operation failed', { operation }, false);
  },
  
  serviceUnavailable: (service: string) => 
    new ApiError(ErrorCode.SERVICE_UNAVAILABLE, `${service} is currently unavailable`),
  
  rateLimited: (retryAfter?: number) => 
    new ApiError(ErrorCode.RATE_LIMITED, 'Too many requests', retryAfter ? { retryAfter } : undefined),
  
  internal: (message: string = 'Internal server error', originalError?: Error) => {
    logger.error('Internal error:', originalError);
    return new ApiError(ErrorCode.INTERNAL_ERROR, message, undefined, false);
  },
};

/**
 * Error handler for async route handlers
 * Wraps an async function and catches any errors, passing them to the error handler
 */
export function asyncHandler<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T
): (...args: Parameters<T>) => Promise<void> {
  return async (...args: Parameters<T>) => {
    try {
      await fn(...args);
    } catch (error) {
      // Log the error
      if (error instanceof ApiError) {
        if (!error.isOperational) {
          logger.error('Non-operational error:', error);
        }
      } else {
        logger.error('Unexpected error:', error);
      }
      throw error;
    }
  };
}

/**
 * Type guard to check if an error is an ApiError
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Type guard to check if an error is an operational error (expected)
 */
export function isOperationalError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Convert unknown error to ApiError
 */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  
  if (error instanceof Error) {
    return Errors.internal(error.message, error);
  }
  
  return Errors.internal('Unknown error occurred');
}