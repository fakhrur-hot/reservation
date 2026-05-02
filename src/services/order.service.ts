/**
 * Order Service
 * Handles order CRUD operations, order item management, and order workflow
 */

import { query } from '../config/database.js';
import { logger } from '../config/logger.js';

export type OrderStatus = 'open' | 'submitted' | 'completed' | 'cancelled';
export type OrderItemStatus = 'pending' | 'in-progress' | 'ready' | 'served' | 'cancelled';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Order {
  id: string;
  branch_id: string;
  reservation_id: string | null;
  table_id: string;
  status: OrderStatus;
  total_price: number;
  special_instructions: string | null;
  submitted_at: string | null;
  submitted_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  item_name: string;
  item_price: number;
  quantity: number;
  customization: string | null;
  status: OrderItemStatus;
  created_at: string;
  updated_at: string;
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
}

export interface CreateOrderData {
  reservation_id?: string;
  table_id: string;
  special_instructions?: string;
}

export interface CreateOrderItemData {
  menu_item_id?: string;
  item_name: string;
  item_price: number;
  quantity?: number;
  customization?: string;
}

export interface UpdateOrderItemData {
  quantity?: number;
  customization?: string;
  status?: OrderItemStatus;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class OrderService {
  /**
   * Get or create an open order for a table
   */
  static async getOrCreateOrder(
    branchId: string,
    tableId: string,
    reservationId?: string
  ): Promise<{ order: Order; created: boolean }> {
    const existingQuery = `
      SELECT * FROM orders
      WHERE branch_id = $1 AND table_id = $2 AND status = 'open'
      LIMIT 1
    `;
    const existing = await query(existingQuery, [branchId, tableId]);

    if (existing.rows.length > 0) {
      return { order: existing.rows[0] as Order, created: false };
    }

    const createQuery = `
      INSERT INTO orders (branch_id, reservation_id, table_id, status)
      VALUES ($1, $2, $3, 'open')
      RETURNING *
    `;
    const result = await query(createQuery, [branchId, reservationId || null, tableId]);
    return { order: result.rows[0] as Order, created: true };
  }

  /**
   * Get order with all its items
   */
  static async getOrderWithItems(branchId: string, orderId: string): Promise<OrderWithItems | null> {
    const queryStr = `
      SELECT * FROM orders
      WHERE id = $1 AND branch_id = $2
      LIMIT 1
    `;
    const result = await query(queryStr, [orderId, branchId]);
    if (result.rows.length === 0) return null;

    const order = result.rows[0] as Order;

    const itemsQueryStr = `
      SELECT * FROM order_items
      WHERE order_id = $1
      ORDER BY created_at ASC
    `;
    const itemsResult = await query(itemsQueryStr, [orderId]);
    const items = itemsResult.rows as OrderItem[];

    return { ...order, items };
  }

  /**
   * Get open order for a table (with items)
   */
  static async getTableOpenOrder(branchId: string, tableId: string): Promise<OrderWithItems | null> {
    const queryStr = `
      SELECT * FROM orders
      WHERE branch_id = $1 AND table_id = $2 AND status = 'open'
      LIMIT 1
    `;
    const result = await query(queryStr, [branchId, tableId]);
    if (result.rows.length === 0) return null;

    const order = result.rows[0] as Order;

    const itemsQueryStr = `
      SELECT * FROM order_items
      WHERE order_id = $1
      ORDER BY created_at ASC
    `;
    const itemsResult = await query(itemsQueryStr, [order.id]);
    const items = itemsResult.rows as OrderItem[];

    return { ...order, items };
  }

  /**
   * Add item to order
   */
  static async addOrderItem(branchId: string, orderId: string, data: CreateOrderItemData): Promise<OrderItem> {
    // Verify order exists and belongs to this branch
    const orderCheck = await query('SELECT * FROM orders WHERE id = $1 AND branch_id = $2', [orderId, branchId]);
    if (orderCheck.rows.length === 0) {
      throw new Error('Order not found');
    }

    const insertQuery = `
      INSERT INTO order_items (order_id, menu_item_id, item_name, item_price, quantity, customization, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'pending')
      RETURNING *
    `;
    const result = await query(insertQuery, [
      orderId,
      data.menu_item_id || null,
      data.item_name,
      data.item_price,
      data.quantity || 1,
      data.customization || null,
    ]);

    // Recalculate order total
    await this.recalculateOrderTotal(branchId, orderId);

    return result.rows[0] as OrderItem;
  }

  /**
   * Update order item
   */
  static async updateOrderItem(branchId: string, orderId: string, itemId: string, data: UpdateOrderItemData): Promise<OrderItem> {
    // Verify item belongs to order
    const itemCheck = await query(
      'SELECT * FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE oi.id = $1 AND o.branch_id = $2 AND o.id = $3',
      [itemId, branchId, orderId]
    );
    if (itemCheck.rows.length === 0) {
      throw new Error('Order item not found');
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.quantity !== undefined) {
      updates.push(`quantity = $${paramCount++}`);
      values.push(data.quantity);
    }
    if (data.customization !== undefined) {
      updates.push(`customization = $${paramCount++}`);
      values.push(data.customization);
    }
    if (data.status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(data.status);
    }

    if (updates.length === 0) {
      return itemCheck.rows[0] as OrderItem;
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    const updateQuery = `
      UPDATE order_items
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
    values.push(itemId);

    const result = await query(updateQuery, values);

    // Recalculate order total
    await this.recalculateOrderTotal(branchId, orderId);

    return result.rows[0] as OrderItem;
  }

  /**
   * Remove item from order
   */
  static async removeOrderItem(branchId: string, orderId: string, itemId: string): Promise<void> {
    // Verify item belongs to order
    const itemCheck = await query(
      'SELECT * FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE oi.id = $1 AND o.branch_id = $2 AND o.id = $3',
      [itemId, branchId, orderId]
    );
    if (itemCheck.rows.length === 0) {
      throw new Error('Order item not found');
    }

    await query('DELETE FROM order_items WHERE id = $1', [itemId]);

    // Recalculate order total
    await this.recalculateOrderTotal(branchId, orderId);
  }

  /**
   * Submit order to kitchen
   */
  static async submitOrder(branchId: string, orderId: string, staffId: string): Promise<Order> {
    const order = await query('SELECT * FROM orders WHERE id = $1 AND branch_id = $2', [orderId, branchId]);
    if (order.rows.length === 0) {
      throw new Error('Order not found');
    }

    const updateQuery = `
      UPDATE orders
      SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP, submitted_by = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND branch_id = $2
      RETURNING *
    `;
    const result = await query(updateQuery, [orderId, branchId, staffId]);
    return result.rows[0] as Order;
  }

  /**
   * Complete order (ready for payment)
   */
  static async completeOrder(branchId: string, orderId: string, staffId: string): Promise<Order> {
    const order = await query('SELECT * FROM orders WHERE id = $1 AND branch_id = $2', [orderId, branchId]);
    if (order.rows.length === 0) {
      throw new Error('Order not found');
    }

    const updateQuery = `
      UPDATE orders
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP, completed_by = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND branch_id = $2
      RETURNING *
    `;
    const result = await query(updateQuery, [orderId, branchId, staffId]);
    return result.rows[0] as Order;
  }

  /**
   * Recalculate order total based on order items
   */
  private static async recalculateOrderTotal(branchId: string, orderId: string): Promise<number> {
    const sumQuery = `
      SELECT COALESCE(SUM(item_price * quantity), 0) as total
      FROM order_items
      WHERE order_id = $1
    `;
    const result = await query(sumQuery, [orderId]);
    const total = parseFloat(result.rows[0].total);

    await query(
      'UPDATE orders SET total_price = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [total, orderId]
    );

    return total;
  }

  /**
   * Update order special instructions
   */
  static async updateOrderInstructions(branchId: string, orderId: string, instructions: string): Promise<Order> {
    const updateQuery = `
      UPDATE orders
      SET special_instructions = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND branch_id = $3
      RETURNING *
    `;
    const result = await query(updateQuery, [instructions, orderId, branchId]);
    if (result.rows.length === 0) {
      throw new Error('Order not found');
    }
    return result.rows[0] as Order;
  }

  /**
   * Cancel order
   */
  static async cancelOrder(branchId: string, orderId: string): Promise<Order> {
    const updateQuery = `
      UPDATE orders
      SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND branch_id = $2
      RETURNING *
    `;
    const result = await query(updateQuery, [orderId, branchId]);
    if (result.rows.length === 0) {
      throw new Error('Order not found');
    }
    return result.rows[0] as Order;
  }
}
