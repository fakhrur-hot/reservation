/**
 * useTableStatus.ts
 *
 * Purpose: Manages a WebSocket connection for real-time table status updates.
 *
 * Features:
 * - Connects to WebSocket on component mount
 * - Listens for table status updates (table.status_changed events)
 * - Updates local state immutably on each message received
 * - Disconnects cleanly on component unmount
 * - Automatic reconnection with exponential backoff (up to 5 attempts, max 30s delay)
 * - Error handling and manual reconnect support
 *
 * Usage:
 * ```tsx
 * const { tables, isConnected, error, reconnect } = useTableStatus(branchId);
 * // tables is a Map<tableId, TableStatusState>
 * ```
 *
 * Dependencies: React (useState, useEffect, useCallback, useRef)
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape of a WebSocket message from the server for table status changes */
export interface TableStatusMessage {
  event: 'table.status_changed';
  tableId: string;
  branchId: string;
  status: 'available' | 'locked' | 'reserved' | 'occupied';
  colour: string;
  timestamp: string;
}

/** Local state shape stored per table in the Map */
export interface TableStatusState {
  id: string;
  status: 'available' | 'locked' | 'reserved' | 'occupied';
  colour: string;
  lastUpdated: string;
}

/** Return type of the useTableStatus hook */
export interface UseTableStatusReturn {
  /** Map of tableId → TableStatusState, updated in real-time */
  tables: Map<string, TableStatusState>;
  /** Whether the WebSocket is currently connected */
  isConnected: boolean;
  /** Error message if connection failed or max retries exceeded */
  error: string | null;
  /** Manually trigger a reconnect (resets retry counter) */
  reconnect: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 1000; // 1 second
const MAX_RECONNECT_DELAY_MS = 30_000; // 30 seconds

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useTableStatus
 *
 * Connects to the WebSocket endpoint for a given branch and maintains a
 * live Map of table statuses. Handles reconnection automatically.
 *
 * @param branchId - The branch UUID to subscribe to
 */
export function useTableStatus(branchId: string): UseTableStatusReturn {
  // Map<tableId, TableStatusState> — using Map for O(1) lookups and targeted updates
  const [tables, setTables] = useState<Map<string, TableStatusState>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs to avoid stale closures and manage lifecycle without triggering re-renders
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);

  // ── Connect ─────────────────────────────────────────────────────────────────

  const connect = useCallback(() => {
    // Guard: skip if already open
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // Guard: skip if branchId is empty — prevents connecting to /ws/branch/
    if (!branchId) {
      setError('No branch configured. Please log in again.');
      return;
    }

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // Use window.location.host (includes port) so Vite's /ws proxy handles dev
      // and production reverse proxies handle prod — no hardcoded port needed
      const token = localStorage.getItem('staff_token') ?? '';
      const wsUrl = `${protocol}//${window.location.host}/ws/branch/${encodeURIComponent(branchId)}?token=${encodeURIComponent(token)}`;

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[useTableStatus] Connected', { branchId });
        setIsConnected(true);
        setError(null);
        // Reset retry counter on successful connection
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const message = JSON.parse(event.data as string) as TableStatusMessage;

          // Only handle table status change events; ignore others (e.g. "connected" ping)
          if (message.event === 'table.status_changed') {
            // REASONING: Immutable Map update — only the affected table entry changes.
            // This prevents unnecessary re-renders for unrelated tables.
            setTables((prev) => {
              const next = new Map(prev);
              next.set(message.tableId, {
                id: message.tableId,
                status: message.status,
                colour: message.colour,
                lastUpdated: message.timestamp,
              });
              return next;
            });
          }
        } catch (parseErr) {
          console.error('[useTableStatus] Failed to parse message', { parseErr, raw: event.data });
        }
      };

      ws.onerror = () => {
        // NOTE: The error event carries no useful detail in browsers; the close event follows.
        console.error('[useTableStatus] WebSocket error', { branchId });
        setError('WebSocket connection error');
      };

      ws.onclose = (event: CloseEvent) => {
        console.log('[useTableStatus] Disconnected', { branchId, code: event.code, reason: event.reason });
        setIsConnected(false);

        // Auth failure — token is invalid/expired; attempt a silent refresh before giving up
        if (event.code === 4001) {
          fetch('/auth/refresh', { method: 'POST', credentials: 'include' })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
              if (data?.accessToken) {
                localStorage.setItem('staff_token', data.accessToken);
                // Reset retry counter and reconnect with the new token
                reconnectAttemptsRef.current = 0;
                connect();
              } else {
                setError('Session expired. Please log in again.');
              }
            })
            .catch(() => setError('Session expired. Please log in again.'));
          return;
        }

        // Exponential backoff reconnection
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(
            BASE_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttemptsRef.current),
            MAX_RECONNECT_DELAY_MS
          );
          reconnectAttemptsRef.current += 1;

          console.log(
            `[useTableStatus] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`
          );

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          setError(`Connection lost. Failed to reconnect after ${MAX_RECONNECT_ATTEMPTS} attempts.`);
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('[useTableStatus] Failed to create WebSocket', { err, branchId });
      setError('Failed to establish WebSocket connection');
    }
  }, [branchId]);

  // ── Manual Reconnect ────────────────────────────────────────────────────────

  const reconnect = useCallback(() => {
    console.log('[useTableStatus] Manual reconnect requested');

    // Cancel any pending auto-reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close existing socket if still open
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Reset retry counter so we get a fresh set of attempts
    reconnectAttemptsRef.current = 0;
    setError(null);
    connect();
  }, [connect]);

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  useEffect(() => {
    connect();

    // CLEANUP: Always close the WebSocket and cancel pending timers on unmount.
    // Failing to do this leaks connections and causes state updates on unmounted components.
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { tables, isConnected, error, reconnect };
}

// ─── useTableStatusWithInitial ───────────────────────────────────────────────

/**
 * useTableStatusWithInitial
 *
 * Enhanced version that seeds the Map with existing table data (e.g. from an
 * initial REST API call) and then keeps it live via WebSocket updates.
 *
 * @param branchId - The branch UUID to subscribe to
 * @param initialTables - Snapshot of tables fetched before mounting
 */
export function useTableStatusWithInitial(
  branchId: string,
  initialTables: Array<{
    id: string;
    status: 'available' | 'locked' | 'reserved' | 'occupied';
    colour: string;
  }>
): UseTableStatusReturn {
  // Seed the Map with initial data so the UI is populated immediately
  const [tables, setTables] = useState<Map<string, TableStatusState>>(() => {
    const map = new Map<string, TableStatusState>();
    initialTables.forEach((t) => {
      map.set(t.id, { ...t, lastUpdated: new Date().toISOString() });
    });
    return map;
  });

  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    if (!branchId) {
      setError('No branch configured. Please log in again.');
      return;
    }

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const token = localStorage.getItem('staff_token') ?? '';
      const wsUrl = `${protocol}//${window.location.host}/ws/branch/${encodeURIComponent(branchId)}?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const message = JSON.parse(event.data as string) as TableStatusMessage;
          if (message.event === 'table.status_changed') {
            // REASONING: Merge WebSocket update into the seeded Map.
            // This preserves initial data for tables not yet updated via WS.
            setTables((prev) => {
              const next = new Map(prev);
              next.set(message.tableId, {
                id: message.tableId,
                status: message.status,
                colour: message.colour,
                lastUpdated: message.timestamp,
              });
              return next;
            });
          }
        } catch (parseErr) {
          console.error('[useTableStatusWithInitial] Failed to parse message', parseErr);
        }
      };

      ws.onerror = () => {
        setError('WebSocket connection error');
      };

      ws.onclose = (event: CloseEvent) => {
        setIsConnected(false);
        if (event.code === 4001) {
          fetch('/auth/refresh', { method: 'POST', credentials: 'include' })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
              if (data?.accessToken) {
                localStorage.setItem('staff_token', data.accessToken);
                reconnectAttemptsRef.current = 0;
                connect();
              } else {
                setError('Session expired. Please log in again.');
              }
            })
            .catch(() => setError('Session expired. Please log in again.'));
          return;
        }
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(
            BASE_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttemptsRef.current),
            MAX_RECONNECT_DELAY_MS
          );
          reconnectAttemptsRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        } else {
          setError(`Connection lost. Failed to reconnect after ${MAX_RECONNECT_ATTEMPTS} attempts.`);
        }
      };

      wsRef.current = ws;
    } catch (err) {
      setError('Failed to establish WebSocket connection');
    }
  }, [branchId]);

  const reconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
    setError(null);
    connect();
  }, [connect]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { tables, isConnected, error, reconnect };
}
