// Request Logging Middleware for VibeSpeak
// Provides structured logging for HTTP requests

import http from 'http';
import { logger } from '../utils/logger.js';

export interface RequestLogOptions {
  includeBody?: boolean;
  includeHeaders?: boolean;
  excludePaths?: string[];
  maxBodyLength?: number;
}

const DEFAULT_OPTIONS: RequestLogOptions = {
  includeBody: false,
  includeHeaders: false,
  excludePaths: ['/health', '/api/info'],
  maxBodyLength: 1000,
};

// Request counter for unique IDs
let requestCounter = 0;

export function createRequestLogger(options: RequestLogOptions = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };

  return (req: http.IncomingMessage, res: http.ServerResponse, startTime: number): void => {
    const requestId = ++requestCounter;
    const method = req.method || 'UNKNOWN';
    const url = req.url || '/';
    const ip = req.socket.remoteAddress || 'unknown';

    // Skip excluded paths
    if (config.excludePaths?.some(path => url.startsWith(path))) {
      return;
    }

    // Capture response finish
    const originalEnd = res.end.bind(res);
    res.end = ((chunk?: any, encoding?: any) => {
      const duration = Date.now() - startTime;
      const statusCode = res.statusCode;

      // Log level based on status code
      const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

      const logData = {
        requestId,
        method,
        url,
        ip,
        statusCode,
        duration,
        userAgent: req.headers['user-agent'] || 'unknown',
      };

      // Log at appropriate level
      if (level === 'error') {
        logger.error(`[${requestId}] ${method} ${url} - ${statusCode} (${duration}ms)`, logData);
      } else if (level === 'warn') {
        logger.warn(`[${requestId}] ${method} ${url} - ${statusCode} (${duration}ms)`, logData);
      } else {
        logger.info(`[${requestId}] ${method} ${url} - ${statusCode} (${duration}ms)`, logData);
      }

      // Restore original end and call it
      res.end = originalEnd;
      return originalEnd(chunk, encoding);
    });
  };
}

// Quick log function for use in routes
export function logRequest(req: http.IncomingMessage, message: string, data?: Record<string, unknown>): void {
  const ip = req.socket.remoteAddress || 'unknown';
  const method = req.method || 'UNKNOWN';
  const url = req.url || '/';

  logger.info(`[${method}] ${url} - ${message}`, {
    ip,
    ...data,
  });
}

// Error logging helper
export function logError(req: http.IncomingMessage, error: unknown, context?: string): void {
  const ip = req.socket.remoteAddress || 'unknown';
  const method = req.method || 'UNKNOWN';
  const url = req.url || '/';

  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  logger.error(`[${method}] ${url} - ${context || 'Error'}: ${errorMessage}`, {
    ip,
    error: errorMessage,
    stack: errorStack,
    context,
  });
}

// Performance monitoring decorator
export function measurePerformance<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  operationName: string
): T {
  return ((...args: unknown[]) => {
    const startTime = Date.now();
    return fn(...args).then(result => {
      const duration = Date.now() - startTime;
      logger.debug(`${operationName} completed in ${duration}ms`);
      return result;
    }).catch(error => {
      const duration = Date.now() - startTime;
      logger.error(`${operationName} failed after ${duration}ms:`, error);
      throw error;
    });
  }) as T;
}
