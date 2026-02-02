import db, { BackupManager, backup1Db, backup2Db } from './database.js';

class PFEntry {
    static tripleWrite(operation) {
        const transaction = db.transaction(() => {
            const result = operation(db);
            try {
                if (backup1Db) operation(backup1Db);
                if (backup2Db) operation(backup2Db);
            } catch (error) {
                console.error('Backup write failed:', error);
                throw new Error('Failed to write to backup databases');
            }
            return result;
        });
        return transaction();
    }

    static getAll(userId, filters = {}) {
        let query = `SELECT * FROM pf_entries WHERE userId = ?`;
        const params = [userId];

        if (filters.type) {
            query += ` AND type = ?`;
            params.push(filters.type);
        }

        if (filters.financialYear) {
            query += ` AND financialYear = ?`;
            params.push(filters.financialYear);
        }

        query += ` ORDER BY date DESC, id DESC`;

        const stmt = db.prepare(query);
        return stmt.all(...params);
    }

    static getById(id, userId) {
        const stmt = db.prepare('SELECT * FROM pf_entries WHERE id = ? AND userId = ?');
        return stmt.get(id, userId);
    }

    static getSummary(userId) {
        const depositsStmt = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total 
            FROM pf_entries 
            WHERE userId = ? AND type = 'deposit'
        `);
        const interestStmt = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total 
            FROM pf_entries 
            WHERE userId = ? AND type = 'interest'
        `);

        const deposits = depositsStmt.get(userId).total;
        const interest = interestStmt.get(userId).total;

        return {
            totalDeposits: deposits,
            totalInterest: interest,
            grandTotal: deposits + interest
        };
    }

    static getFinancialYears(userId) {
        const stmt = db.prepare(`
            SELECT DISTINCT financialYear 
            FROM pf_entries 
            WHERE userId = ? AND financialYear IS NOT NULL
            ORDER BY financialYear DESC
        `);
        return stmt.all(userId).map(row => row.financialYear);
    }

    static create(userId, { type, amount, date, financialYear = null, note = '' }) {
        if (!['deposit', 'interest'].includes(type)) {
            throw new Error('Type must be either "deposit" or "interest"');
        }

        return this.tripleWrite((database) => {
            const timestamp = Date.now();
            const stmt = database.prepare(`
                INSERT INTO pf_entries (userId, type, amount, date, financialYear, note, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            const result = stmt.run(userId, type, amount, date, financialYear, note, timestamp);

            if (database === db) {
                return this.getById(result.lastInsertRowid, userId);
            }
            return result;
        });
    }

    static delete(id, userId) {
        return this.tripleWrite((database) => {
            const stmt = database.prepare('DELETE FROM pf_entries WHERE id = ? AND userId = ?');
            const result = stmt.run(id, userId);
            if (database === db) {
                return result.changes > 0;
            }
            return result;
        });
    }
}

export default PFEntry;
