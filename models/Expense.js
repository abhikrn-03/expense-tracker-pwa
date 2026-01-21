import db from './database.js';

class Expense {
    /**
     * Get all expenses with optional filtering
     * @param {Object} filters - Optional filters (e.g., { month, year })
     * @returns {Array} Array of expense objects
     */
    static getAll(filters = {}) {
        let query = `
      SELECT e.*, c.name as categoryName, c.icon as categoryIcon, c.hexColor as categoryColor
      FROM expenses e
      JOIN categories c ON e.categoryId = c.id
    `;

        const conditions = [];
        const params = [];

        if (filters.month && filters.year) {
            conditions.push("strftime('%Y-%m', date) = ?");
            params.push(`${filters.year}-${String(filters.month).padStart(2, '0')}`);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY date DESC, timestamp DESC';

        const stmt = db.prepare(query);
        return stmt.all(...params);
    }

    /**
     * Get a single expense by ID
     * @param {number} id - Expense ID
     * @returns {Object|null} Expense object or null
     */
    static getById(id) {
        const stmt = db.prepare(`
      SELECT e.*, c.name as categoryName, c.icon as categoryIcon, c.hexColor as categoryColor
      FROM expenses e
      JOIN categories c ON e.categoryId = c.id
      WHERE e.id = ?
    `);
        return stmt.get(id);
    }

    /**
     * Create a new expense
     * @param {Object} expenseData - { amount, date, categoryId, note }
     * @returns {Object} Created expense with ID
     */
    static create({ amount, date, categoryId, note = '' }) {
        const timestamp = Date.now();
        const stmt = db.prepare(`
      INSERT INTO expenses (amount, date, categoryId, note, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);

        const result = stmt.run(amount, date, categoryId, note, timestamp);
        return this.getById(result.lastInsertRowid);
    }

    /**
     * Update an existing expense
     * @param {number} id - Expense ID
     * @param {Object} updates - Fields to update
     * @returns {Object|null} Updated expense or null
     */
    static update(id, updates) {
        const allowedFields = ['amount', 'date', 'categoryId', 'note'];
        const fields = Object.keys(updates).filter(key => allowedFields.includes(key));

        if (fields.length === 0) return null;

        const setClause = fields.map(field => `${field} = ?`).join(', ');
        const values = fields.map(field => updates[field]);
        values.push(id);

        const stmt = db.prepare(`UPDATE expenses SET ${setClause} WHERE id = ?`);
        stmt.run(...values);

        return this.getById(id);
    }

    /**
     * Delete an expense
     * @param {number} id - Expense ID
     * @returns {boolean} True if deleted, false otherwise
     */
    static delete(id) {
        const stmt = db.prepare('DELETE FROM expenses WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    }

    /**
     * Get monthly summary
     * @param {number} year - Year
     * @param {number} month - Month (1-12)
     * @returns {Object} Summary with total and category breakdown
     */
    static getMonthlySummary(year, month) {
        const monthStr = `${year}-${String(month).padStart(2, '0')}`;

        // Get total
        const totalStmt = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM expenses
      WHERE strftime('%Y-%m', date) = ?
    `);
        const { total } = totalStmt.get(monthStr);

        // Get category breakdown
        const breakdownStmt = db.prepare(`
      SELECT 
        c.id,
        c.name,
        c.icon,
        c.hexColor,
        COALESCE(SUM(e.amount), 0) as total,
        COUNT(e.id) as count
      FROM categories c
      LEFT JOIN expenses e ON c.id = e.categoryId 
        AND strftime('%Y-%m', e.date) = ?
      GROUP BY c.id
      HAVING total > 0
      ORDER BY total DESC
    `);
        const breakdown = breakdownStmt.all(monthStr);

        return {
            total,
            breakdown,
            month,
            year
        };
    }
}

export default Expense;
