import db, { backup1Db, backup2Db } from './database.js';

class Account {
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
     * Get all accounts for a user
     * @param {number} userId - User ID (required)
     * @returns {Array} Array of account objects
     */
    static getAll(userId) {
        const stmt = db.prepare('SELECT * FROM accounts WHERE userId = ? ORDER BY isDefault DESC, name ASC');
        return stmt.all(userId);
    }

    /**
     * Get a single account by ID
     * @param {number} id - Account ID
     * @param {number} userId - User ID (required)
     * @returns {Object|null} Account object or null
     */
    static getById(id, userId) {
        const stmt = db.prepare('SELECT * FROM accounts WHERE id = ? AND userId = ?');
        return stmt.get(id, userId);
    }

    /**
     * Get default account for a user, or create "Cash" if none exists
     * @param {number} userId - User ID (required)
     * @returns {Object} Default account object
     */
    static getDefaultAccount(userId) {
        // Try to get explicitly marked default account
        let stmt = db.prepare('SELECT * FROM accounts WHERE userId = ? AND isDefault = 1');
        let account = stmt.get(userId);
        
        if (account) return account;
        
        // No default account, check if any accounts exist
        stmt = db.prepare('SELECT * FROM accounts WHERE userId = ? ORDER BY id ASC LIMIT 1');
        account = stmt.get(userId);
        
        if (account) return account;
        
        // No accounts exist, create "Cash" account
        return this.create(userId, {
            name: 'Cash',
            type: 'Cash',
            icon: '💵',
            hexColor: '#4CAF50',
            isDefault: 1
        });
    }

    /**
     * Create a new account
     * @param {number} userId - User ID (required)
     * @param {Object} accountData - { name, type, icon, hexColor, isDefault }
     * @returns {Object} Created account with ID
     */
    static create(userId, { name, type, icon, hexColor, isDefault = 0 }) {
        return this.tripleWrite((database) => {
            // If this account is set as default, unset other defaults for this user
            if (isDefault) {
                database.prepare('UPDATE accounts SET isDefault = 0 WHERE userId = ?').run(userId);
            }
            
            const stmt = database.prepare(`
                INSERT INTO accounts (name, type, userId, icon, hexColor, isDefault)
                VALUES (?, ?, ?, ?, ?, ?)
            `);

            const result = stmt.run(name, type, userId, icon, hexColor, isDefault);

            if (database === db) {
                return this.getById(result.lastInsertRowid, userId);
            }
            return result;
        });
    }

    /**
     * Update an existing account
     * @param {number} id - Account ID
     * @param {number} userId - User ID (required)
     * @param {Object} updates - Fields to update
     * @returns {Object|null} Updated account or null
     */
    static update(id, userId, updates) {
        const allowedFields = ['name', 'type', 'icon', 'hexColor', 'isDefault'];
        const fields = Object.keys(updates).filter(key => allowedFields.includes(key));

        if (fields.length === 0) return null;

        return this.tripleWrite((database) => {
            // If this account is set as default, unset other defaults for this user
            if (updates.isDefault === 1) {
                database.prepare('UPDATE accounts SET isDefault = 0 WHERE userId = ?').run(userId);
            }
            
            const setClause = fields.map(field => `${field} = ?`).join(', ');
            const values = fields.map(field => updates[field]);
            values.push(id, userId);

            const stmt = database.prepare(`UPDATE accounts SET ${setClause} WHERE id = ? AND userId = ?`);
            stmt.run(...values);

            if (database === db) {
                return this.getById(id, userId);
            }
            return null;
        });
    }

    /**
     * Delete an account
     * @param {number} id - Account ID
     * @param {number} userId - User ID (required)
     * @returns {boolean} True if deleted, false otherwise
     */
    static delete(id, userId) {
        // Check if this is the only account
        const accountsCount = db.prepare('SELECT COUNT(*) as count FROM accounts WHERE userId = ?').get(userId);
        if (accountsCount.count <= 1) {
            throw new Error('Cannot delete the last account. At least one account is required.');
        }
        
        let deletedFromMain = false;

        this.tripleWrite((database) => {
            const stmt = database.prepare('DELETE FROM accounts WHERE id = ? AND userId = ?');
            const result = stmt.run(id, userId);

            if (database === db) {
                deletedFromMain = result.changes > 0;
            }
            return result;
        });

        return deletedFromMain;
    }

    /**
     * Get account types
     * @returns {Array} Array of account type objects
     */
    static getAccountTypes() {
        return [
            { value: 'Savings Account', label: 'Savings Account', icon: '🏦' },
            { value: 'Credit Card', label: 'Credit Card', icon: '💳' },
            { value: 'Debit Card', label: 'Debit Card', icon: '💳' },
            { value: 'Cash', label: 'Cash', icon: '💵' },
            { value: 'Digital Wallet', label: 'Digital Wallet', icon: '📱' },
            { value: 'Investment Account', label: 'Investment Account', icon: '📈' },
            { value: 'Other', label: 'Other', icon: '💼' }
        ];
    }
}

export default Account;
