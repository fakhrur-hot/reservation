export const API_BASE = 'http://localhost:3001';
export const PORTAL_BASE = 'http://localhost:5174';
export const DASHBOARD_BASE = 'http://localhost:5173';

export async function get(path: string, headers?: Record<string, string>): Promise<Response> {
  return fetch(API_BASE + path, {
    method: 'GET',
    headers,
  });
}

export async function post(path: string, body: unknown, headers?: Record<string, string>): Promise<Response> {
  return fetch(API_BASE + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

export async function patch(path: string, body: unknown, headers?: Record<string, string>): Promise<Response> {
  return fetch(API_BASE + path, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

export async function del(path: string, headers?: Record<string, string>): Promise<Response> {
  return fetch(API_BASE + path, {
    method: 'DELETE',
    headers,
  });
}
