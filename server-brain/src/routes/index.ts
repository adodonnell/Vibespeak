// Route factory for VibeSpeak API
// Creates a consistent router interface for all API endpoints

import http from 'http';

export interface RouteHandler {
  (req: http.IncomingMessage, res: http.ServerResponse, params?: Record<string, string>): Promise<void>;
}

export interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  handler: RouteHandler;
}

// Simple router implementation
export class Router {
  private routes: Route[] = [];

  get(path: string, handler: RouteHandler): void {
    this.routes.push({ method: 'GET', path, handler });
  }

  post(path: string, handler: RouteHandler): void {
    this.routes.push({ method: 'POST', path, handler });
  }

  put(path: string, handler: RouteHandler): void {
    this.routes.push({ method: 'PUT', path, handler });
  }

  patch(path: string, handler: RouteHandler): void {
    this.routes.push({ method: 'PATCH', path, handler });
  }

  delete(path: string, handler: RouteHandler): void {
    this.routes.push({ method: 'DELETE', path, handler });
  }

  // Match a request to a route
  match(method: string, pathname: string): { handler: RouteHandler; params: Record<string, string> } | null {
    for (const route of this.routes) {
      if (route.method !== method) continue;

      const match = this.matchPath(route.path, pathname);
      if (match) {
        return { handler: route.handler, params: match.params };
      }
    }
    return null;
  }

  // Match path pattern to pathname
  private matchPath(pattern: string, pathname: string): { params: Record<string, string> } | null {
    // Convert pattern to regex
    const regexPattern = pattern
      .replace(/\//g, '\\/')
      .replace(/:(\w+)/g, '(?<$1>[^\\/]+)')
      .replace(/\*/g, '.*');

    const regex = new RegExp(`^${regexPattern}$`);
    const match = pathname.match(regex);

    if (!match) return null;

    // Extract named params
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(match.groups || {})) {
      if (value !== undefined) {
        params[key] = value;
      }
    }

    return { params };
  }

  // Get all routes
  getRoutes(): Route[] {
    return this.routes;
  }
}

// Helper to create a standard API response
export function json(res: http.ServerResponse, data: unknown, statusCode = 200): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(data));
}

// Helper to send error response
export function error(res: http.ServerResponse, message: string, statusCode = 400): void {
  json(res, { error: message }, statusCode);
}

// Helper to parse request body
export async function parseBody(req: http.IncomingMessage): Promise<unknown> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
  }
  return body ? JSON.parse(body) : {};
}
