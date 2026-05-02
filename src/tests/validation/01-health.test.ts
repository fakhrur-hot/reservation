import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { get, API_BASE, DASHBOARD_BASE, PORTAL_BASE } from './helpers/http-client';

describe('Health and Startup Validation', () => {
  // Req 1.6 â€” .env.example smoke test
  it('should have .env.example with all required variable names', () => {
    const envExamplePath = path.resolve(process.cwd(), '.env.example');
    let content: string;

    expect(() => {
      content = fs.readFileSync(envExamplePath, 'utf-8');
    }, '.env.example must exist at project root').not.toThrow();

    const requiredVars = ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'PORT', 'NODE_ENV'];
    for (const varName of requiredVars) {
      expect(content!, `.env.example must contain ${varName}`).toContain(varName);
    }
  });

  // Req 1.3 â€” health endpoint example test
  it('should return HTTP 200 with postgres and redis up from GET /health', async () => {
    let response: Response;
    try {
      response = await get('/health');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Backend not reachable on port 3000. Start with: npm run dev\n  (original error: ${msg})`
      );
    }

    expect(response.status, 'GET /health must return HTTP 200').toBe(200);

    const body = await response.json() as Record<string, unknown>;

    expect(
      ['up', 'ok'].includes(body.postgres as string),
      `Expected body.postgres to be 'up' or 'ok', got: ${JSON.stringify(body.postgres)}`
    ).toBe(true);

    expect(
      ['up', 'ok'].includes(body.redis as string),
      `Expected body.redis to be 'up' or 'ok', got: ${JSON.stringify(body.redis)}`
    ).toBe(true);
  });

  // Req 1.1 â€” backend port reachability
  it('should be reachable on port 3000 (backend)', async () => {
    try {
      const response = await fetch(`${API_BASE}/health`);
      expect(response, 'Backend must respond on port 3000').not.toBeNull();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
        throw new Error('Backend not reachable on port 3000. Start with: npm run dev');
      }
      throw err;
    }
  });

  // Req 13.3 â€” Sneat Dashboard port reachability
  it('should be reachable on port 5173 (Sneat Dashboard)', async () => {
    try {
      const response = await fetch(`${DASHBOARD_BASE}/`);
      expect(response, 'Sneat Dashboard must respond on port 5173').not.toBeNull();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
        console.warn('Sneat Dashboard not reachable on port 5173. Start with: npm run client:dashboard');
        return; // skip â€” frontend may not be running in CI
      }
      throw err;
    }
  });

  // Req 13.4 â€” sejiwa Portal port reachability
  it('should be reachable on port 5174 (sejiwa Portal)', async () => {
    try {
      const response = await fetch(`${PORTAL_BASE}/`);
      expect(response, 'sejiwa Portal must respond on port 5174').not.toBeNull();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
        console.warn('sejiwa Portal not reachable on port 5174. Start with: npm run client:portal');
        return; // skip â€” frontend may not be running in CI
      }
      throw err;
    }
  });
});

