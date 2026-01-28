import db, { backup1Db, backup2Db } from './database.js';

class Category {
    /**
     * Execute a write operation across all databases (triple-write)
     */
    static tripleWrite(operation) {
        const transaction = db.transaction(() => {
            // Execute on main database
            const result = operation(db);

            // Sync to backup databases
            try {
                if (backup1Db) {
                    operation(backup1Db);
                }
                if (backup2Db) {
                    operation(backup2Db);
                }
            } catch (error) {
                console.error('Backup write failed:', error);
                throw new Error('Failed to write to backup databases');
            }

            return result;
        });

        return transaction();
    }

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
        return this.tripleWrite((database) => {
            const stmt = database.prepare(`
                INSERT INTO categories (name, icon, hexColor)
                VALUES (?, ?, ?)
            `);

            const result = stmt.run(name, icon, hexColor);

            if (database === db) {
                return this.getById(result.lastInsertRowid);
            }
            return result;
        });
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

        return this.tripleWrite((database) => {
            const stmt = database.prepare(`UPDATE categories SET ${setClause} WHERE id = ?`);
            stmt.run(...values);

            if (database === db) {
                return this.getById(id);
            }
            return null;
        });
    }

    /**
     * Delete a category
     * @param {number} id - Category ID
     * @returns {boolean} True if deleted, false otherwise
     */
    static delete(id) {
        let deletedFromMain = false;

        this.tripleWrite((database) => {
            const stmt = database.prepare('DELETE FROM categories WHERE id = ?');
            const result = stmt.run(id);

            if (database === db) {
                deletedFromMain = result.changes > 0;
            }
            return result;
        });

        return deletedFromMain;
    }
}

export default Category;
