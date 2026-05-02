import { query, transaction } from '../config/database.js';
import { logger } from '../config/logger.js';

export interface CreateMenuSectionData {
  name: string;
  description?: string;
  sort_order?: number;
  section_type?: string;
}

export interface CreateMenuItemData {
  section_id: string;
  name: string;
  description?: string;
  price: number;
  image_url?: string;
  special_tag?: string;
  sort_order?: number;
}

export interface UpdateMenuItemData {
  name?: string;
  description?: string;
  price?: number;
  image_url?: string;
  is_available?: boolean;
  special_tag?: string;
  sort_order?: number;
}

export class MenuService {
  /**
   * Get all menu sections for a branch, including items
   */
  static async getSections(branchId: string) {
    const result = await query(
      `SELECT * FROM menu_sections WHERE branch_id = $1 ORDER BY sort_order ASC`,
      [branchId]
    );
    
    const sections = result.rows;
    
    // Fetch items for each section
    for (const section of sections) {
      const itemsResult = await query(
        `SELECT * FROM menu_items WHERE section_id = $1 ORDER BY sort_order ASC`,
        [section.id]
      );
      section.items = itemsResult.rows;
    }
    
    return sections;
  }

  /**
   * Create a new menu section
   */
  static async createSection(branchId: string, data: CreateMenuSectionData) {
    const result = await query(
      `INSERT INTO menu_sections (branch_id, name, description, sort_order, section_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [branchId, data.name, data.description, data.sort_order || 0, data.section_type || 'standard']
    );
    return result.rows[0];
  }

  /**
   * Update a menu section
   */
  static async updateSection(branchId: string, sectionId: string, data: any) {
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${i++}`);
      values.push(data.name);
    }
    if (data.description !== undefined) {
      fields.push(`description = $${i++}`);
      values.push(data.description);
    }
    if (data.sort_order !== undefined) {
      fields.push(`sort_order = $${i++}`);
      values.push(data.sort_order);
    }
    if (data.is_active !== undefined) {
      fields.push(`is_active = $${i++}`);
      values.push(data.is_active);
    }
    if (data.section_type !== undefined) {
      fields.push(`section_type = $${i++}`);
      values.push(data.section_type);
    }

    if (fields.length === 0) return null;

    values.push(sectionId, branchId);
    const result = await query(
      `UPDATE menu_sections 
       SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${i++} AND branch_id = $${i++}
       RETURNING *`,
      values
    );

    return result.rows[0];
  }

  /**
   * Delete a menu section
   */
  static async deleteSection(branchId: string, sectionId: string) {
    await query(
      `DELETE FROM menu_sections WHERE id = $1 AND branch_id = $2`,
      [sectionId, branchId]
    );
  }

  /**
   * Create a new menu item
   */
  static async createItem(branchId: string, data: CreateMenuItemData) {
    // Verify section belongs to branch
    const sectionResult = await query(
      `SELECT id FROM menu_sections WHERE id = $1 AND branch_id = $2`,
      [data.section_id, branchId]
    );
    
    if (sectionResult.rows.length === 0) {
      throw new Error('Section not found in this branch');
    }

    const result = await query(
      `INSERT INTO menu_items (section_id, name, description, price, image_url, special_tag, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [data.section_id, data.name, data.description, data.price, data.image_url, data.special_tag || "Chef's Special", data.sort_order || 0]
    );
    return result.rows[0];
  }

  /**
   * Update a menu item
   */
  static async updateItem(branchId: string, itemId: string, data: UpdateMenuItemData) {
    // Verify item belongs to a section in this branch
    const verifyResult = await query(
      `SELECT i.id FROM menu_items i
       JOIN menu_sections s ON i.section_id = s.id
       WHERE i.id = $1 AND s.branch_id = $2`,
      [itemId, branchId]
    );

    if (verifyResult.rows.length === 0) {
      throw new Error('Item not found in this branch');
    }

    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${i++}`);
      values.push(data.name);
    }
    if (data.description !== undefined) {
      fields.push(`description = $${i++}`);
      values.push(data.description);
    }
    if (data.price !== undefined) {
      fields.push(`price = $${i++}`);
      values.push(data.price);
    }
    if (data.image_url !== undefined) {
      fields.push(`image_url = $${i++}`);
      values.push(data.image_url);
    }
    if (data.is_available !== undefined) {
      fields.push(`is_available = $${i++}`);
      values.push(data.is_available);
    }
    if (data.special_tag !== undefined) {
      fields.push(`special_tag = $${i++}`);
      values.push(data.special_tag);
    }
    if (data.sort_order !== undefined) {
      fields.push(`sort_order = $${i++}`);
      values.push(data.sort_order);
    }

    if (fields.length === 0) return null;

    values.push(itemId);
    const result = await query(
      `UPDATE menu_items 
       SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${i++}
       RETURNING *`,
      values
    );

    return result.rows[0];
  }

  /**
   * Delete a menu item
   */
  static async deleteItem(branchId: string, itemId: string) {
    // Verify item belongs to a section in this branch
    const verifyResult = await query(
      `SELECT i.id FROM menu_items i
       JOIN menu_sections s ON i.section_id = s.id
       WHERE i.id = $1 AND s.branch_id = $2`,
      [itemId, branchId]
    );

    if (verifyResult.rows.length === 0) {
      throw new Error('Item not found in this branch');
    }

    await query(`DELETE FROM menu_items WHERE id = $1`, [itemId]);
  }

  /**
   * Initialize a default premium menu schema for a fresh branch.
   */
  static async initializeDefaultMenu(branchId: string) {
    return await transaction(async (client) => {
      // Helper to get or create section
      const getOrCreateSection = async (name: string, type: string, order: number) => {
        const existing = await client.query(
          `SELECT id FROM menu_sections WHERE branch_id = $1 AND name = $2`,
          [branchId, name]
        );
        if (existing.rows.length > 0) return existing.rows[0].id;

        const result = await client.query(
          `INSERT INTO menu_sections (branch_id, name, section_type, sort_order)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [branchId, name, type, order]
        );
        return result.rows[0].id;
      };

      // 1. Cakes Section (Type: cakes)
      const cId = await getOrCreateSection('Cakes', 'cakes', 0);


      const cakes = [
        { name: 'Black Forest', price: 85, desc: 'Classic chocolate cake with cherries and whipped cream.' },
        { name: 'Red Velvet', price: 90, desc: 'Velvety crimson cocoa cake with smooth cream cheese frosting.' },
        { name: 'Tiramisu', price: 95, desc: 'Authentic Italian coffee-flavoured dessert with mascarpone.' },
        { name: 'Chocolate Indulgence', price: 88, desc: 'Triple layer Belgian chocolate masterpiece.' },
        { name: 'Vanilla Bean', price: 80, desc: 'Light sponge cake with real Madagascan vanilla bean frosting.' }
      ];

      for (const cake of cakes) {
        await client.query(
          `INSERT INTO menu_items (section_id, name, description, price, is_available)
           VALUES ($1, $2, $3, $4, true)`,
          [cId, cake.name, cake.desc, cake.price]
        );
      }

      // 2. Main Courses
      const mId = await getOrCreateSection('Main Courses', 'standard', 1);

      const mains = [
        { name: 'Grilled Salmon', price: 42, desc: 'Fresh Atlantic salmon with lemon butter sauce.' },
        { name: 'Wagyu Beef Burger', price: 38, desc: 'Premium wagyu patty with caramelized onions.' },
        { name: 'Truffle Pasta', price: 35, desc: 'Creamy linguine with black truffle and parmesan.' }
      ];

      for (const main of mains) {
        await client.query(
          `INSERT INTO menu_items (section_id, name, description, price, is_available)
           VALUES ($1, $2, $3, $4, true)`,
          [mId, main.name, main.desc, main.price]
        );
      }

      // 3. Drinks
      const dId = await getOrCreateSection('Drinks', 'standard', 2);

      const drinks = [
        { name: 'Iced Signature Latte', price: 15, desc: 'Our famous house blend with silky milk.' },
        { name: 'Fresh Watermelon Juice', price: 12, desc: '100% natural, no added sugar.' },
        { name: 'Passionfruit Mojito', price: 18, desc: 'Refreshing mocktail with mint and lime.' }
      ];

      for (const drink of drinks) {
        await client.query(
          `INSERT INTO menu_items (section_id, name, description, price, is_available)
           VALUES ($1, $2, $3, $4, true)`,
          [dId, drink.name, drink.desc, drink.price]
        );
      }

      return { success: true };
    });
  }
}
