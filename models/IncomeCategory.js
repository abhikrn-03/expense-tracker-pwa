import db, { backup1Db, backup2Db } from './database.js';

class IncomeCategory {
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
     * Get all income categories
     * @returns {Array} Array of income category objects
     */
    static getAll() {
        const stmt = db.prepare('SELECT * FROM income_categories ORDER BY name ASC');
        return stmt.all();
    }

    /**
     * Get a single income category by ID
     * @param {number} id - Income category ID
     * @returns {Object|null} Income category object or null
     */
    static getById(id) {
        const stmt = db.prepare('SELECT * FROM income_categories WHERE id = ?');
        return stmt.get(id);
    }

    /**
     * Create a new income category
     * @param {Object} categoryData - { name, icon, hexColor }
     * @returns {Object} Created income category with ID
     */
    static create({ name, icon, hexColor }) {
        return this.tripleWrite((database) => {
            const stmt = database.prepare(`
                INSERT INTO income_categories (name, icon, hexColor)
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
     * Update an existing income category
     * @param {number} id - Income category ID
     * @param {Object} updates - Fields to update
     * @returns {Object|null} Updated income category or null
     */
    static update(id, updates) {
        const allowedFields = ['name', 'icon', 'hexColor'];
        const fields = Object.keys(updates).filter(key => allowedFields.includes(key));

        if (fields.length === 0) return null;

        const setClause = fields.map(field => `${field} = ?`).join(', ');
        const values = fields.map(field => updates[field]);
        values.push(id);

        return this.tripleWrite((database) => {
            const stmt = database.prepare(`UPDATE income_categories SET ${setClause} WHERE id = ?`);
            stmt.run(...values);

            if (database === db) {
                return this.getById(id);
            }
            return null;
        });
    }

    /**
     * Delete an income category
     * @param {number} id - Income category ID
     * @returns {boolean} True if deleted, false otherwise
     */
    static delete(id) {
        let deletedFromMain = false;

        this.tripleWrite((database) => {
            const stmt = database.prepare('DELETE FROM income_categories WHERE id = ?');
            const result = stmt.run(id);

            if (database === db) {
                deletedFromMain = result.changes > 0;
            }
            return result;
        });

        return deletedFromMain;
    }
}

export default IncomeCategory;
