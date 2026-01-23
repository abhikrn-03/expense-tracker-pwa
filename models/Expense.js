import db, { BackupManager, backup1Db, backup2Db } from './database.js';

class Expense {
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
     * Get all expenses with optional filtering
     * @param {number} userId - User ID (required)
     * @param {Object} filters - Optional filters (e.g., { month, year })
     * @returns {Array} Array of expense objects
     */
    static getAll(userId, filters = {}) {
        let query = `
      SELECT e.*, c.name as categoryName, c.icon as categoryIcon, c.hexColor as categoryColor
      FROM expenses e
      JOIN categories c ON e.categoryId = c.id
    `;

        const conditions = ['e.userId = ?'];
        const params = [userId];

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
     * @param {number} userId - User ID (required)
     * @returns {Object|null} Expense object or null
     */
    static getById(id, userId) {
        const stmt = db.prepare(`
      SELECT e.*, c.name as categoryName, c.icon as categoryIcon, c.hexColor as categoryColor
      FROM expenses e
      JOIN categories c ON e.categoryId = c.id
      WHERE e.id = ? AND e.userId = ?
    `);
        return stmt.get(id, userId);
    }

    /**
     * Create a new expense
     * @param {number} userId - User ID (required)
     * @param {Object} expenseData - { amount, date, categoryId, note, whereSpent }
     * @returns {Object} Created expense with ID
     */
    static create(userId, { amount, date, categoryId, note = '', whereSpent }) {
        const timestamp = Date.now();
        
        return this.tripleWrite((database) => {
            const stmt = database.prepare(`
                INSERT INTO expenses (amount, date, categoryId, userId, note, whereSpent, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            
            const result = stmt.run(amount, date, categoryId, userId, note, whereSpent, timestamp);
            
            // Return expense data only from main db
            if (database === db) {
                return this.getById(result.lastInsertRowid, userId);
            }
            return result;
        });
    }

    /**
     * Update an existing expense
     * @param {number} id - Expense ID
     * @param {number} userId - User ID (required)
     * @param {Object} updates - Fields to update
     * @returns {Object|null} Updated expense or null
     */
    static update(id, userId, updates) {
        const allowedFields = ['amount', 'date', 'categoryId', 'note', 'whereSpent'];
        const fields = Object.keys(updates).filter(key => allowedFields.includes(key));

        if (fields.length === 0) return null;

        const setClause = fields.map(field => `${field} = ?`).join(', ');
        const values = fields.map(field => updates[field]);
        values.push(id, userId);

        return this.tripleWrite((database) => {
            const stmt = database.prepare(`UPDATE expenses SET ${setClause} WHERE id = ? AND userId = ?`);
            stmt.run(...values);

            // Return updated expense only from main db
            if (database === db) {
                return this.getById(id, userId);
            }
            return null;
        });
    }

    /**
     * Delete an expense
     * @param {number} id - Expense ID
     * @param {number} userId - User ID (required)
     * @returns {boolean} True if deleted, false otherwise
     */
    static delete(id, userId) {
        let deletedFromMain = false;
        
        this.tripleWrite((database) => {
            const stmt = database.prepare('DELETE FROM expenses WHERE id = ? AND userId = ?');
            const result = stmt.run(id, userId);
            
            if (database === db) {
                deletedFromMain = result.changes > 0;
            }
            return result;
        });
        
        return deletedFromMain;
    }

    /**
     * Get monthly summary
     * @param {number} userId - User ID (required)
     * @param {number} year - Year
     * @param {number} month - Month (1-12)
     * @returns {Object} Summary with total and category breakdown
     */
    static getMonthlySummary(userId, year, month) {
        const monthStr = `${year}-${String(month).padStart(2, '0')}`;

        // Get total
        const totalStmt = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM expenses
      WHERE strftime('%Y-%m', date) = ? AND userId = ?
    `);
        const { total } = totalStmt.get(monthStr, userId);

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
        AND e.userId = ?
      GROUP BY c.id
      HAVING total > 0
      ORDER BY total DESC
    `);
        const breakdown = breakdownStmt.all(monthStr, userId);

        return {
            total,
            breakdown,
            month,
            year
        };
    }

    /**
     * Get yearly summary with monthly breakdown
     * @param {number} userId - User ID (required)
     * @param {number} year - Year
     * @returns {Object} Summary with monthly totals (all 12 months)
     */
    static getYearlySummary(userId, year) {
        // Get monthly totals
        const monthlyStmt = db.prepare(`
            SELECT 
                CAST(strftime('%m', date) AS INTEGER) as month,
                COALESCE(SUM(amount), 0) as total,
                COUNT(id) as count
            FROM expenses
            WHERE strftime('%Y', date) = ? AND userId = ?
            GROUP BY strftime('%m', date)
        `);
        
        const monthlyData = monthlyStmt.all(String(year), userId);
        
        // Create array for all 12 months with 0 for empty months
        const months = [];
        for (let i = 1; i <= 12; i++) {
            const monthData = monthlyData.find(m => m.month === i);
            months.push({
                month: i,
                monthName: new Date(year, i - 1, 1).toLocaleString('default', { month: 'short' }),
                total: monthData ? monthData.total : 0,
                count: monthData ? monthData.count : 0
            });
        }
        
        // Calculate yearly total
        const yearTotal = months.reduce((sum, m) => sum + m.total, 0);
        
        return {
            year,
            total: yearTotal,
            months
        };
    }
}

export default Expense;
