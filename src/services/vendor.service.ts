import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';

const logger = pino();

export interface Vendor {
  id: string;
  branchId: string;
  brandId?: string;
  vendorName: string;
  vendorType: string;
  description?: string;
  merchantId: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  commissionType: 'percentage' | 'fixed';
  commissionValue: number;
  status: 'active' | 'inactive' | 'suspended';
  createdAt: Date;
  updatedAt: Date;
}

export interface VendorMenuItem {
  id: string;
  branchId: string;
  vendorId: string;
  itemName: string;
  category: string;
  description?: string;
  cost: number;
  quantityAvailable: number;
  reorderLevel?: number;
  commissionOverride: boolean;
  commissionType?: string;
  commissionValue?: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommissionHistory {
  id: string;
  branchId: string;
  vendorId: string;
  reservationId?: string;
  commissionAmount: number;
  commissionType: string;
  status: 'charged' | 'refunded' | 'pending' | 'failed';
  createdAt: Date;
}

/**
 * VendorService: Handles all vendor account management operations
 */
export class VendorService {
  constructor(private pool: Pool) {}

  /**
   * Create a new vendor
   */
  async createVendor(branchId: string, data: Partial<Vendor>): Promise<Vendor> {
    const vendorId = uuidv4();
    const query = `
      INSERT INTO vendors (
        id, branch_id, brand_id, vendor_name, vendor_type, description,
        merchant_id, contact_person, contact_email, contact_phone,
        commission_type, commission_value, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *;
    `;

    try {
      const result = await this.pool.query(query, [
        vendorId,
        branchId,
        data.brandId || null,
        data.vendorName,
        data.vendorType,
        data.description || null,
        data.merchantId,
        data.contactPerson || null,
        data.contactEmail || null,
        data.contactPhone || null,
        data.commissionType || 'percentage',
        data.commissionValue || 0,
        'active'
      ]);

      logger.info({ vendorId, branchId }, 'Vendor created successfully');
      return this.mapVendorRow(result.rows[0]);
    } catch (error: any) {
      logger.error({ error, branchId, merchantId: data.merchantId }, 'Failed to create vendor');
      throw new Error(`Failed to create vendor: ${error.message}`);
    }
  }

  /**
   * Get all vendors for a branch
   */
  async getVendorsByBranch(branchId: string): Promise<Vendor[]> {
    const query = `
      SELECT * FROM vendors
      WHERE branch_id = $1
      ORDER BY created_at DESC;
    `;

    try {
      const result = await this.pool.query(query, [branchId]);
      return result.rows.map(row => this.mapVendorRow(row));
    } catch (error: any) {
      logger.error({ error, branchId }, 'Failed to fetch vendors');
      throw new Error(`Failed to fetch vendors: ${error.message}`);
    }
  }

  /**
   * Get a specific vendor by ID
   */
  async getVendorById(vendorId: string): Promise<Vendor | null> {
    const query = `SELECT * FROM vendors WHERE id = $1;`;

    try {
      const result = await this.pool.query(query, [vendorId]);
      return result.rows.length > 0 ? this.mapVendorRow(result.rows[0]) : null;
    } catch (error: any) {
      logger.error({ error, vendorId }, 'Failed to fetch vendor');
      throw new Error(`Failed to fetch vendor: ${error.message}`);
    }
  }

  /**
   * Update vendor details
   */
  async updateVendor(vendorId: string, data: Partial<Vendor>): Promise<Vendor> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.vendorName !== undefined) {
      updates.push(`vendor_name = $${paramCount++}`);
      values.push(data.vendorName);
    }
    if (data.commissionValue !== undefined) {
      updates.push(`commission_value = $${paramCount++}`);
      values.push(data.commissionValue);
    }
    if (data.status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(data.status);
    }
    if (data.contactEmail !== undefined) {
      updates.push(`contact_email = $${paramCount++}`);
      values.push(data.contactEmail);
    }

    updates.push(`updated_at = NOW()`);
    values.push(vendorId);

    const query = `
      UPDATE vendors
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *;
    `;

    try {
      const result = await this.pool.query(query, values);
      if (result.rows.length === 0) {
        throw new Error('Vendor not found');
      }
      logger.info({ vendorId }, 'Vendor updated successfully');
      return this.mapVendorRow(result.rows[0]);
    } catch (error: any) {
      logger.error({ error, vendorId }, 'Failed to update vendor');
      throw new Error(`Failed to update vendor: ${error.message}`);
    }
  }

  /**
   * Delete/deactivate a vendor
   */
  async deleteVendor(vendorId: string): Promise<void> {
    const query = `
      UPDATE vendors
      SET status = 'inactive', updated_at = NOW()
      WHERE id = $1;
    `;

    try {
      await this.pool.query(query, [vendorId]);
      logger.info({ vendorId }, 'Vendor deactivated successfully');
    } catch (error: any) {
      logger.error({ error, vendorId }, 'Failed to delete vendor');
      throw new Error(`Failed to delete vendor: ${error.message}`);
    }
  }

  /**
   * Add a menu item to a vendor
   */
  async addMenuItem(vendorId: string, branchId: string, data: Partial<VendorMenuItem>): Promise<VendorMenuItem> {
    const itemId = uuidv4();
    const query = `
      INSERT INTO vendor_menu_items (
        id, vendor_id, branch_id, item_name, category, description,
        cost, quantity_available, reorder_level,
        commission_override, commission_type, commission_value, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *;
    `;

    try {
      const result = await this.pool.query(query, [
        itemId,
        vendorId,
        branchId,
        data.itemName,
        data.category,
        data.description || null,
        data.cost,
        data.quantityAvailable || 0,
        data.reorderLevel || null,
        data.commissionOverride || false,
        data.commissionType || null,
        data.commissionValue || null,
        true
      ]);

      logger.info({ itemId, vendorId }, 'Menu item added successfully');
      return this.mapMenuItemRow(result.rows[0]);
    } catch (error: any) {
      logger.error({ error, vendorId }, 'Failed to add menu item');
      throw new Error(`Failed to add menu item: ${error.message}`);
    }
  }

  /**
   * Get all menu items for a vendor
   */
  async getMenuItemsByVendor(vendorId: string): Promise<VendorMenuItem[]> {
    const query = `
      SELECT * FROM vendor_menu_items
      WHERE vendor_id = $1 AND is_active = true
      ORDER BY created_at DESC;
    `;

    try {
      const result = await this.pool.query(query, [vendorId]);
      return result.rows.map(row => this.mapMenuItemRow(row));
    } catch (error: any) {
      logger.error({ error, vendorId }, 'Failed to fetch menu items');
      throw new Error(`Failed to fetch menu items: ${error.message}`);
    }
  }

  /**
   * Update a menu item
   */
  async updateMenuItem(itemId: string, data: Partial<VendorMenuItem>): Promise<VendorMenuItem> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.quantityAvailable !== undefined) {
      updates.push(`quantity_available = $${paramCount++}`);
      values.push(data.quantityAvailable);
    }
    if (data.cost !== undefined) {
      updates.push(`cost = $${paramCount++}`);
      values.push(data.cost);
    }
    if (data.commissionValue !== undefined) {
      updates.push(`commission_value = $${paramCount++}`);
      values.push(data.commissionValue);
    }
    if (data.isActive !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(data.isActive);
    }

    updates.push(`updated_at = NOW()`);
    values.push(itemId);

    const query = `
      UPDATE vendor_menu_items
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *;
    `;

    try {
      const result = await this.pool.query(query, values);
      if (result.rows.length === 0) {
        throw new Error('Menu item not found');
      }
      logger.info({ itemId }, 'Menu item updated successfully');
      return this.mapMenuItemRow(result.rows[0]);
    } catch (error: any) {
      logger.error({ error, itemId }, 'Failed to update menu item');
      throw new Error(`Failed to update menu item: ${error.message}`);
    }
  }

  /**
   * Delete a menu item
   */
  async deleteMenuItem(itemId: string): Promise<void> {
    const query = `
      UPDATE vendor_menu_items
      SET is_active = false, updated_at = NOW()
      WHERE id = $1;
    `;

    try {
      await this.pool.query(query, [itemId]);
      logger.info({ itemId }, 'Menu item deleted successfully');
    } catch (error: any) {
      logger.error({ error, itemId }, 'Failed to delete menu item');
      throw new Error(`Failed to delete menu item: ${error.message}`);
    }
  }

  /**
   * Calculate commission for an item
   */
  calculateCommission(cost: number, commissionType: string, commissionValue: number): number {
    if (commissionType === 'percentage') {
      return (cost * commissionValue) / 100;
    } else if (commissionType === 'fixed') {
      return commissionValue;
    }
    return 0;
  }

  /**
   * Record a commission transaction
   */
  async recordCommission(
    branchId: string,
    vendorId: string,
    reservationId: string,
    commissionAmount: number,
    commissionType: string,
    status: string = 'charged'
  ): Promise<CommissionHistory> {
    const commissionId = uuidv4();
    const query = `
      INSERT INTO vendor_commission_history (
        id, branch_id, vendor_id, reservation_id,
        commission_amount, commission_type, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;

    try {
      const result = await this.pool.query(query, [
        commissionId,
        branchId,
        vendorId,
        reservationId,
        commissionAmount,
        commissionType,
        status
      ]);

      logger.info({ commissionId, vendorId, reservationId }, 'Commission recorded');
      return this.mapCommissionRow(result.rows[0]);
    } catch (error: any) {
      logger.error({ error, vendorId, reservationId }, 'Failed to record commission');
      throw new Error(`Failed to record commission: ${error.message}`);
    }
  }

  /**
   * Get commission history for a vendor
   */
  async getCommissionHistory(vendorId: string, limit: number = 100): Promise<CommissionHistory[]> {
    const query = `
      SELECT * FROM vendor_commission_history
      WHERE vendor_id = $1
      ORDER BY created_at DESC
      LIMIT $2;
    `;

    try {
      const result = await this.pool.query(query, [vendorId, limit]);
      return result.rows.map(row => this.mapCommissionRow(row));
    } catch (error: any) {
      logger.error({ error, vendorId }, 'Failed to fetch commission history');
      throw new Error(`Failed to fetch commission history: ${error.message}`);
    }
  }

  /**
   * Get vendor profile with menu items
   */
  async getVendorProfile(vendorId: string): Promise<any> {
    const vendor = await this.getVendorById(vendorId);
    if (!vendor) {
      throw new Error('Vendor not found');
    }

    const menuItems = await this.getMenuItemsByVendor(vendorId);

    return {
      vendor,
      menuItems,
      summary: {
        totalItems: menuItems.length,
        totalQuantity: menuItems.reduce((sum, item) => sum + item.quantityAvailable, 0),
        totalValue: menuItems.reduce((sum, item) => sum + (item.cost * item.quantityAvailable), 0),
        totalCommission: menuItems.reduce((sum, item) => {
          const commission = this.calculateCommission(
            item.cost,
            item.commissionType || vendor.commissionType,
            item.commissionValue != null ? item.commissionValue : vendor.commissionValue
          );
          return sum + (commission * item.quantityAvailable);
        }, 0)
      }
    };
  }

  /**
   * Map database row to Vendor object
   */
  private mapVendorRow(row: any): Vendor {
    return {
      id: row.id,
      branchId: row.branch_id,
      brandId: row.brand_id,
      vendorName: row.vendor_name,
      vendorType: row.vendor_type,
      description: row.description,
      merchantId: row.merchant_id,
      contactPerson: row.contact_person,
      contactEmail: row.contact_email,
      contactPhone: row.contact_phone,
      commissionType: row.commission_type,
      commissionValue: parseFloat(row.commission_value),
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Map database row to VendorMenuItem object
   */
  private mapMenuItemRow(row: any): VendorMenuItem {
    return {
      id: row.id,
      branchId: row.branch_id,
      vendorId: row.vendor_id,
      itemName: row.item_name,
      category: row.category,
      description: row.description,
      cost: parseFloat(row.cost),
      quantityAvailable: row.quantity_available,
      reorderLevel: row.reorder_level,
      commissionOverride: row.commission_override,
      commissionType: row.commission_type,
      commissionValue: row.commission_value ? parseFloat(row.commission_value) : null,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Map database row to CommissionHistory object
   */
  private mapCommissionRow(row: any): CommissionHistory {
    return {
      id: row.id,
      branchId: row.branch_id,
      vendorId: row.vendor_id,
      reservationId: row.reservation_id,
      commissionAmount: parseFloat(row.commission_amount),
      commissionType: row.commission_type,
      status: row.status,
      createdAt: row.created_at
    };
  }
}
