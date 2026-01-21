import db from './database.js';

class Category {
    /**
     * Get all categories
     * @returns {Array} Array of category objects
     */
    static getAll() {
        const stmt = db.prepare('SELECT * FROM categories ORDER BY name ASC');
        return stmt.all();
    }

    /**
     * Get a single category by ID
     * @param {number} id - Category ID
     * @returns {Object|null} Category object or null
     */
    static getById(id) {
        const stmt = db.prepare('SELECT * FROM categories WHERE id = ?');
        return stmt.get(id);
    }

    /**
     * Create a new category
     * @param {Object} categoryData - { name, icon, hexColor }
     * @returns {Object} Created category with ID
     */
    static create({ name, icon, hexColor }) {
        const stmt = db.prepare(`
      INSERT INTO categories (name, icon, hexColor)
      VALUES (?, ?, ?)
    `);

        const result = stmt.run(name, icon, hexColor);
        return this.getById(result.lastInsertRowid);
    }

    /**
     * Update an existing category
     * @param {number} id - Category ID
     * @param {Object} updates - Fields to update
     * @returns {Object|null} Updated category or null
     */
    static update(id, updates) {
        const allowedFields = ['name', 'icon', 'hexColor'];
        const fields = Object.keys(updates).filter(key => allowedFields.includes(key));

        if (fields.length === 0) return null;

        const setClause = fields.map(field => `${field} = ?`).join(', ');
        const values = fields.map(field => updates[field]);
        values.push(id);

        const stmt = db.prepare(`UPDATE categories SET ${setClause} WHERE id = ?`);
        stmt.run(...values);

        return this.getById(id);
    }

    /**
     * Delete a category
     * @param {number} id - Category ID
     * @returns {boolean} True if deleted, false otherwise
     */
    static delete(id) {
        const stmt = db.prepare('DELETE FROM categories WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    }
}

export default Category;
