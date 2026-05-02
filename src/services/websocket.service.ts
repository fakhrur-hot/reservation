/**
 * WebSocket Gateway Service
 *
 * Manages real-time table status push to Sneat Dashboard clients.
 * Architecture:
 *   - One WebSocket server attached to the HTTP server
 *   - Clients connect to /ws/branch/:branchId with JWT in Authorization header
 *   - On connect: subscribe to Redis Pub/Sub channel ws:events:{branchId}
 *   - Fan-out TableStatusEvent and NoShowAlertEvent to all branch clients
 *   - On reconnect: resend full table snapshot
 *
 * Requirements: 8.8, 11.1, 11.2, 11.3, 11.4
 */

import { IncomingMessage, Server } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import Redis from 'ioredis';
import { getRedis } from '../config/redis.js';
import { TableService } from './table.service.js';
import { logger } from '../config/logger.js';
import jwt from 'jsonwebtoken';

// ─── Event Types ──────────────────────────────────────────────────────────────

export type TableStatus = 'available' | 'locked' | 'reserved' | 'occupied';

/** Colour mapping for Sneat Dashboard (Requirement 11.3) */
export const TABLE_STATUS_COLOUR: Record<TableStatus, string> = {
  available: 'green',
  locked:    'yellow',
  reserved:  'blue',
  occupied:  'red',
};

export interface TableStatusEvent {
  event: 'table.status_changed';
  tableId: string;
  branchId: string;
  status: TableStatus;
  colour: string;
  timestamp: string;
}

export interface NoShowAlertEvent {
  event: 'reservation.no_show';
  reservationId: string;
  referenceNumber: string;
  tableId: string;
  branchId: string;
  timestamp: string;
}

export type WsEvent = TableStatusEvent | NoShowAlertEvent;

// ─── Internal client record ───────────────────────────────────────────────────

interface BranchClient {
  ws: WebSocket;
  branchId: string;
  staffId: string;
}

// ─── Gateway ──────────────────────────────────────────────────────────────────

export class WebSocketGateway {
  private wss: WebSocketServer;
  /** branchId → set of connected clients */
  private clients: Map<string, Set<BranchClient>> = new Map();
  /** Dedicated subscriber Redis connection (cannot share with publisher) */
  private subscriber: Redis;

  constructor(httpServer: Server) {
    // Use noServer mode so we can handle upgrades manually — this avoids
    // conflicts with Fastify's HTTP server taking over the upgrade event.
    this.wss = new WebSocketServer({ noServer: true });

    // Create a dedicated subscriber connection
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.subscriber = new Redis(redisUrl);

    this.subscriber.on('error', (err) => {
      logger.error({ err }, 'WebSocket Redis subscriber error');
    });

    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));

    logger.info('WebSocket gateway initialised on path /ws/branch/:branchId');
  }

  /**
   * Handle HTTP upgrade request — called explicitly from index.ts to ensure
   * WebSocket upgrades are processed even when Fastify owns the HTTP server.
   * Only handles requests to /ws/branch/:branchId paths.
   */
  handleUpgrade(req: IncomingMessage, socket: any, head: Buffer): void {
    const url = req.url ?? '';
    if (!url.startsWith('/ws/branch/')) {
      socket.destroy();
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.wss.emit('connection', ws, req);
    });
  }

  // ─── Connection handler ─────────────────────────────────────────────────

  private async handleConnection(ws: WebSocket, req: IncomingMessage) {
    // Extract branchId from URL: /ws/branch/:branchId
    const url = req.url ?? '';
    const match = url.match(/^\/ws\/branch\/([^/?]+)/);
    if (!match) {
      ws.close(4000, 'Invalid path — expected /ws/branch/:branchId');
      return;
    }
    const branchId = match[1];

    // Authenticate via JWT — accept from Authorization header OR ?token= query param
    // (browsers cannot set custom headers on WebSocket connections)
    const authHeader = req.headers['authorization'] ?? '';
    const urlParams = new URLSearchParams(url.split('?')[1] ?? '');
    const queryToken = urlParams.get('token');
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : queryToken ?? null;
    if (!token) {
      ws.close(4001, 'Authorization header with Bearer token required');
      return;
    }

    let staffId: string;
    try {
      const secret = process.env.JWT_SECRET ?? 'dev-secret';
      const payload = jwt.verify(token, secret) as { sub?: string; staffId?: string };
      staffId = payload.sub ?? payload.staffId ?? 'unknown';
    } catch (err) {
      ws.close(4001, 'Invalid or expired JWT');
      return;
    }

    const client: BranchClient = { ws, branchId, staffId };
    this.addClient(client);

    logger.info({
      event: 'ws_connected',
      branch_id: branchId,
      staff_id: staffId,
      timestamp: new Date().toISOString(),
    }, 'WebSocket client connected');

    // Subscribe to Redis Pub/Sub channel for this branch (if first client)
    await this.ensureSubscribed(branchId);

    // Send full table snapshot on connect
    await this.sendTableSnapshot(client);

    ws.on('close', () => {
      this.removeClient(client);
      logger.info({
        event: 'ws_disconnected',
        branch_id: branchId,
        staff_id: staffId,
        timestamp: new Date().toISOString(),
      }, 'WebSocket client disconnected');
    });

    ws.on('error', (err) => {
      logger.error({ err, branch_id: branchId, staff_id: staffId }, 'WebSocket client error');
      this.removeClient(client);
    });

    // Pong on ping to keep connection alive
    ws.on('ping', () => ws.pong());
  }

  // ─── Client registry ────────────────────────────────────────────────────

  private addClient(client: BranchClient) {
    if (!this.clients.has(client.branchId)) {
      this.clients.set(client.branchId, new Set());
    }
    this.clients.get(client.branchId)!.add(client);
  }

  private removeClient(client: BranchClient) {
    const set = this.clients.get(client.branchId);
    if (set) {
      set.delete(client);
      if (set.size === 0) {
        this.clients.delete(client.branchId);
      }
    }
  }

  // ─── Redis Pub/Sub subscription ─────────────────────────────────────────

  private subscribedChannels = new Set<string>();

  private async ensureSubscribed(branchId: string) {
    const channel = `ws:events:${branchId}`;
    if (this.subscribedChannels.has(channel)) return;

    await this.subscriber.subscribe(channel);
    this.subscribedChannels.add(channel);

    this.subscriber.on('message', (ch, message) => {
      if (ch !== channel) return;
      try {
        const event: WsEvent = JSON.parse(message);
        this.fanOut(branchId, event);
      } catch (err) {
        logger.error({ err, channel: ch }, 'Failed to parse WebSocket event from Redis');
      }
    });

    logger.info({ channel }, 'Subscribed to Redis Pub/Sub channel');
  }

  // ─── Fan-out ────────────────────────────────────────────────────────────

  private fanOut(branchId: string, event: WsEvent) {
    const set = this.clients.get(branchId);
    if (!set || set.size === 0) return;

    const payload = JSON.stringify(event);
    let delivered = 0;

    for (const client of set) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
        delivered++;
      }
    }

    logger.debug({
      event: event.event,
      branch_id: branchId,
      delivered,
      timestamp: new Date().toISOString(),
    }, 'WebSocket event fanned out');
  }

  // ─── Table snapshot ─────────────────────────────────────────────────────

  private async sendTableSnapshot(client: BranchClient) {
    try {
      const tables = await TableService.listActiveTables(client.branchId);
      const snapshot = {
        event: 'table.snapshot',
        branchId: client.branchId,
        tables: tables.map((t) => ({
          tableId: t.id,
          name: t.name,
          capacity: t.capacity,
          sectionId: t.section_id,
          status: t.status ?? 'available',
          colour: TABLE_STATUS_COLOUR[(t.status ?? 'available') as TableStatus] ?? 'green',
        })),
        timestamp: new Date().toISOString(),
      };

      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(snapshot));
      }
    } catch (err) {
      logger.error({ err, branch_id: client.branchId }, 'Failed to send table snapshot');
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  /**
   * Returns the number of connected clients for a branch.
   */
  getClientCount(branchId: string): number {
    return this.clients.get(branchId)?.size ?? 0;
  }

  /**
   * Gracefully close all connections and the subscriber.
   */
  async close() {
    this.wss.close();
    await this.subscriber.quit();
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let gateway: WebSocketGateway | null = null;

export function initializeWebSocketGateway(httpServer: Server): WebSocketGateway {
  gateway = new WebSocketGateway(httpServer);
  return gateway;
}

export function getWebSocketGateway(): WebSocketGateway {
  if (!gateway) {
    throw new Error('WebSocket gateway not initialized. Call initializeWebSocketGateway() first.');
  }
  return gateway;
}
