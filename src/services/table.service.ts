/**
 * Table Service
 *
 * Handles section and table CRUD operations, and table status derivation.
 * Requirements: 7.1, 7.2, 7.3, 7.5, 7.6, 7.7, 7.8, 8.6
 */

import { getDatabase } from '../config/database.js';
import { getRedis } from '../config/redis.js';
import { logger } from '../config/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TableStatus = 'available' | 'locked' | 'reserved' | 'occupied';

export interface CreateSectionData {
  name: string;
  description?: string;
  sort_order?: number;
}

export interface CreateTableData {
  section_id: string;
  name: string;
  capacity: number;
  table_type?: string;
  has_window_view?: boolean;
  is_wheelchair_accessible?: boolean;
  supports_decoration?: boolean;
}

export interface UpdateTableData {
  name?: string;
  capacity?: number;
  table_type?: string;
  has_window_view?: boolean;
  is_wheelchair_accessible?: boolean;
  supports_decoration?: boolean;
  is_active?: boolean;
  section_id?: string;
}

export interface SectionRow {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  tables: TableWithStatus[];
}

export interface TableWithStatus {
  id: string;
  name: string;
  capacity: number;
  section_id: string;
  section_name?: string;
  status: TableStatus | null;
  is_active: boolean;
  supports_decoration?: boolean;
  // Decoration fields from active reservation (reserved/occupied only)
  has_decoration?: boolean;
  occasion_type?: string | null;
  decoration_color?: string | null;
  cake_choice?: string | null;
  decoration_notes?: string | null;
  reservation_ref?: string | null;
  cake_menu_id?: string | null;
  cake_custom_notes?: string | null;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class TableService {
  /**
   * Derive real-time table status:
   *   1. Redis lock check → 'locked'
   *   2. Active reservation check → 'reserved' | 'occupied'
   *   3. Default → 'available'
   */
  static async deriveTableStatus(branchId: string, tableId: string): Promise<TableStatus> {
    try {
      const redis = getRedis();
      const lockValue = await redis.get(`lock:${branchId}:${tableId}`);
      if (lockValue) {
        return 'locked';
      }
    } catch (err) {
      logger.warn({ err, branchId, tableId }, 'Redis unavailable during status derivation, falling back to DB');
    }

    const db = getDatabase();
    // 2. Active walk-in check (Requirement 18.3)
    const walkInResult = await db.query(
      `SELECT id FROM walk_ins
       WHERE table_id = $1 AND branch_id = $2 AND status = 'open'
       LIMIT 1`,
      [tableId, branchId]
    );
    if (walkInResult.rows.length > 0) {
      return 'occupied';
    }

    // 3. Active reservation check
    const result = await db.query(
      `SELECT status FROM reservations
       WHERE table_id = $1 AND branch_id = $2
         AND (
           status = 'seated'
           OR (status = 'confirmed' AND reservation_time <= (NOW() + INTERVAL '4 hours') AND reservation_time >= (NOW() - INTERVAL '2 hours'))
         )
       ORDER BY reservation_time DESC
       LIMIT 1`,
      [tableId, branchId]
    );

    if (result.rows.length > 0) {
      const status = result.rows[0].status as string;
      if (status === 'seated') return 'occupied';
      if (status === 'confirmed') return 'reserved';
    }

    return 'available';
  }

  // ─── Sections ──────────────────────────────────────────────────────────────

  /**
   * Create a new section for a branch.
   */
  static async createSection(branchId: string, data: CreateSectionData) {
    const db = getDatabase();
    const result = await db.query(
      `INSERT INTO sections (branch_id, name, description, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING id, branch_id, name, description, sort_order, is_active, created_at, updated_at`,
      [branchId, data.name, data.description ?? null, data.sort_order ?? 0]
    );
    return result.rows[0];
  }

  /**
   * List active sections for a branch, each with their active tables and derived status.
   */
  static async listSections(branchId: string): Promise<SectionRow[]> {
    const db = getDatabase();

    // Fetch active sections
    const sectionsResult = await db.query(
      `SELECT id, name, description, sort_order
       FROM sections
       WHERE branch_id = $1 AND is_active = true
       ORDER BY sort_order ASC, name ASC`,
      [branchId]
    );

    // Fetch active tables for this branch
    const tablesResult = await db.query(
      `SELECT t.id, t.name, t.capacity, t.section_id, t.can_be_decorated
       FROM tables t
       WHERE t.branch_id = $1 AND t.is_active = true
       ORDER BY t.name ASC`,
      [branchId]
    );

    // Derive status for each active table
    const tablesWithStatus: TableWithStatus[] = await Promise.all(
      tablesResult.rows.map(async (t) => ({
        id: t.id,
        name: t.name,
        capacity: t.capacity,
        section_id: t.section_id,
        status: await TableService.deriveTableStatus(branchId, t.id),
        is_active: true,
        supports_decoration: t.can_be_decorated,
      }))
    );

    // Group tables by section
    const tablesBySection = new Map<string, TableWithStatus[]>();
    for (const t of tablesWithStatus) {
      const list = tablesBySection.get(t.section_id) ?? [];
      list.push(t);
      tablesBySection.set(t.section_id, list);
    }

    return sectionsResult.rows.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      sort_order: s.sort_order,
      tables: tablesBySection.get(s.id) ?? [],
    }));
  }

  // ─── Tables ────────────────────────────────────────────────────────────────

  /**
   * Create a new table for a branch.
   */
  static async createTable(branchId: string, data: CreateTableData) {
    const db = getDatabase();
    const result = await db.query(
      `INSERT INTO tables
         (branch_id, section_id, name, capacity, table_type, has_window_view, is_wheelchair_accessible, can_be_decorated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, branch_id, section_id, name, capacity, is_active,
                 table_type, has_window_view, is_wheelchair_accessible, can_be_decorated AS supports_decoration,
                 created_at, updated_at`,
      [
        branchId,
        data.section_id,
        data.name,
        data.capacity,
        data.table_type ?? null,
        data.has_window_view ?? false,
        data.is_wheelchair_accessible ?? false,
        data.supports_decoration ?? false,
      ]
    );
    return result.rows[0];
  }

  /**
   * Update a table (including deactivation).
   * Returns the old row (before update) and the new row.
   */
  static async updateTable(
    branchId: string,
    tableId: string,
    data: UpdateTableData
  ): Promise<{ old: Record<string, any>; updated: Record<string, any> } | null> {
    const db = getDatabase();

    // Fetch current row for audit
    const current = await db.query(
      `SELECT id, branch_id, section_id, name, capacity, is_active,
              table_type, has_window_view, is_wheelchair_accessible, can_be_decorated AS supports_decoration
       FROM tables
       WHERE id = $1 AND branch_id = $2`,
      [tableId, branchId]
    );

    if (current.rows.length === 0) return null;
    const old = current.rows[0];

    // Build dynamic SET clause
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.name !== undefined) { fields.push(`name = $${idx++}`); values.push(data.name); }
    if (data.capacity !== undefined) { fields.push(`capacity = $${idx++}`); values.push(data.capacity); }
    if (data.table_type !== undefined) { fields.push(`table_type = $${idx++}`); values.push(data.table_type); }
    if (data.has_window_view !== undefined) { fields.push(`has_window_view = $${idx++}`); values.push(data.has_window_view); }
    if (data.is_wheelchair_accessible !== undefined) { fields.push(`is_wheelchair_accessible = $${idx++}`); values.push(data.is_wheelchair_accessible); }
    if (data.supports_decoration !== undefined) { fields.push(`can_be_decorated = $${idx++}`); values.push(data.supports_decoration); }
    if (data.is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(data.is_active); }
    if (data.section_id !== undefined) { fields.push(`section_id = $${idx++}`); values.push(data.section_id); }

    if (fields.length === 0) return { old, updated: old };

    fields.push(`updated_at = NOW()`);
    values.push(tableId, branchId);

    const updateResult = await db.query(
      `UPDATE tables SET ${fields.join(', ')}
       WHERE id = $${idx++} AND branch_id = $${idx++}
       RETURNING id, branch_id, section_id, name, capacity, is_active,
                 table_type, has_window_view, is_wheelchair_accessible, can_be_decorated AS supports_decoration,
                 created_at, updated_at`,
      values
    );

    return { old, updated: updateResult.rows[0] };
  }

  /**
   * Get a single table by ID, verifying it belongs to the given branch.
   * Returns null if not found or branch mismatch.
   */
  static async getTable(branchId: string, tableId: string): Promise<TableWithStatus | null> {
    const db = getDatabase();
    const result = await db.query(
      `SELECT t.id, t.name, t.capacity, t.section_id, t.is_active, t.can_be_decorated, s.name AS section_name
       FROM tables t
       LEFT JOIN sections s ON s.id = t.section_id
       WHERE t.id = $1 AND t.branch_id = $2`,
      [tableId, branchId]
    );

    if (result.rows.length === 0) return null;

    const t = result.rows[0];
    const status = t.is_active
      ? await TableService.deriveTableStatus(branchId, t.id)
      : null;

    return {
      id: t.id,
      name: t.name,
      capacity: t.capacity,
      section_id: t.section_id,
      section_name: t.section_name,
      status,
      is_active: t.is_active,
      supports_decoration: t.can_be_decorated,
    };
  }

  /**
   * List active tables for a branch with derived status (public view).
   */
  static async listActiveTables(branchId: string): Promise<TableWithStatus[]> {
    const db = getDatabase();
    const result = await db.query(
      `SELECT t.id, t.name, t.capacity, t.section_id, t.can_be_decorated, s.name AS section_name
       FROM tables t
       LEFT JOIN sections s ON s.id = t.section_id
       WHERE t.branch_id = $1 AND t.is_active = true
       ORDER BY t.name ASC`,
      [branchId]
    );

    return Promise.all(
      result.rows.map(async (t) => ({
        id: t.id,
        name: t.name,
        capacity: t.capacity,
        section_id: t.section_id,
        section_name: t.section_name,
        status: await TableService.deriveTableStatus(branchId, t.id),
        is_active: true,
        supports_decoration: t.can_be_decorated,
      }))
    );
  }

  /**
   * List all tables (including inactive) for a branch (staff/manager view).
   * Inactive tables get status: null.
   * Active reserved/occupied tables include decoration fields from the current reservation.
   */
  static async listAllTables(branchId: string): Promise<TableWithStatus[]> {
    const db = getDatabase();
    const result = await db.query(
      `SELECT t.id, t.name, t.capacity, t.section_id, t.is_active, t.can_be_decorated, s.name AS section_name,
              r.reference_number AS reservation_ref,
              r.has_decoration, r.occasion_type, r.decoration_color,
              r.cake_choice, r.decoration_notes, r.cake_menu_id, r.cake_custom_notes
       FROM tables t
       LEFT JOIN sections s ON s.id = t.section_id
       LEFT JOIN LATERAL (
         SELECT reference_number, has_decoration, occasion_type,
                 decoration_color, cake_choice, decoration_notes,
                 cake_menu_id, cake_custom_notes
         FROM reservations
         WHERE table_id = t.id AND branch_id = $1
           AND status IN ('confirmed', 'seated')
         ORDER BY reservation_time DESC
         LIMIT 1
       ) r ON true
       WHERE t.branch_id = $1
       ORDER BY t.is_active DESC, t.name ASC`,
      [branchId]
    );

    return Promise.all(
      result.rows.map(async (t) => {
        const status = t.is_active
          ? await TableService.deriveTableStatus(branchId, t.id)
          : null;
        return {
          id: t.id,
          name: t.name,
          capacity: t.capacity,
          section_id: t.section_id,
          section_name: t.section_name,
          status,
          is_active: t.is_active,
          supports_decoration: t.can_be_decorated,
          has_decoration: t.has_decoration ?? false,
          occasion_type: t.occasion_type ?? null,
          decoration_color: t.decoration_color ?? null,
          cake_choice: t.cake_choice ?? null,
          decoration_notes: t.decoration_notes ?? null,
          reservation_ref: t.reservation_ref ?? null,
          cake_menu_id: t.cake_menu_id ?? null,
          cake_custom_notes: t.cake_custom_notes ?? null,
        };
      })
    );
  }
}

export default TableService;
