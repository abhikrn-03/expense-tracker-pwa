import db, { BackupManager, backup1Db, backup2Db } from './database.js';

class Investment {
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
     * Get all investments for a user
     * @param {number} userId - User ID (required)
     * @returns {Array} Array of investment objects
     */
    static getAll(userId) {
        const query = `
            SELECT * FROM investments 
            WHERE userId = ?
            ORDER BY ticker ASC
        `;
        
        const stmt = db.prepare(query);
        return stmt.all(userId);
    }

    /**
     * Get a specific investment by ticker
     * @param {number} userId - User ID
     * @param {string} ticker - Stock ticker symbol
     * @returns {Object|undefined} Investment object or undefined
     */
    static getByTicker(userId, ticker) {
        const stmt = db.prepare('SELECT * FROM investments WHERE userId = ? AND ticker = ?');
        return stmt.get(userId, ticker);
    }

    /**
     * Create or update an investment (upsert)
     * @param {number} userId - User ID
     * @param {Object} data - Investment data
     * @returns {Object} Created/updated investment
     */
    static upsert(userId, { ticker, shares_owned, manual_price_override = null, manual_rate_override = null }) {
        if (!ticker || shares_owned === undefined || shares_owned === null) {
            throw new Error('Ticker and shares_owned are required');
        }

        return this.tripleWrite((database) => {
            const timestamp = Date.now();
            
            const stmt = database.prepare(`
                INSERT INTO investments (userId, ticker, shares_owned, manual_price_override, manual_rate_override, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(userId, ticker) 
                DO UPDATE SET 
                    shares_owned = excluded.shares_owned,
                    manual_price_override = excluded.manual_price_override,
                    manual_rate_override = excluded.manual_rate_override,
                    timestamp = excluded.timestamp
            `);
            
            const result = stmt.run(
                userId,
                ticker.toUpperCase(),
                shares_owned,
                manual_price_override,
                manual_rate_override,
                timestamp
            );

            // Return the investment from main database
            if (database === db) {
                return this.getByTicker(userId, ticker.toUpperCase());
            }
            
            return result;
        });
    }

    /**
     * Delete an investment
     * @param {number} userId - User ID
     * @param {string} ticker - Stock ticker symbol
     * @returns {boolean} Success status
     */
    static delete(userId, ticker) {
        return this.tripleWrite((database) => {
            const stmt = database.prepare('DELETE FROM investments WHERE userId = ? AND ticker = ?');
            const result = stmt.run(userId, ticker.toUpperCase());
            
            if (database === db) {
                return result.changes > 0;
            }
            
            return result;
        });
    }

    /**
     * Update manual overrides only
     * @param {number} userId - User ID
     * @param {string} ticker - Stock ticker symbol
     * @param {Object} overrides - Manual overrides
     * @returns {Object} Updated investment
     */
    static updateOverrides(userId, ticker, { manual_price_override, manual_rate_override }) {
        return this.tripleWrite((database) => {
            const timestamp = Date.now();
            
            const stmt = database.prepare(`
                UPDATE investments 
                SET manual_price_override = ?, 
                    manual_rate_override = ?,
                    timestamp = ?
                WHERE userId = ? AND ticker = ?
            `);
            
            const result = stmt.run(
                manual_price_override,
                manual_rate_override,
                timestamp,
                userId,
                ticker.toUpperCase()
            );

            if (database === db) {
                if (result.changes === 0) {
                    throw new Error('Investment not found');
                }
                return this.getByTicker(userId, ticker.toUpperCase());
            }
            
            return result;
        });
    }
}

export default Investment;
