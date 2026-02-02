import db, { BackupManager, backup1Db, backup2Db } from './database.js';

class FixedDeposit {
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

    static getAll(userId) {
        const query = `SELECT * FROM fixed_deposits WHERE userId = ? ORDER BY maturityDate ASC`;
        const stmt = db.prepare(query);
        return stmt.all(userId);
    }

    static getById(id, userId) {
        const stmt = db.prepare('SELECT * FROM fixed_deposits WHERE id = ? AND userId = ?');
        return stmt.get(id, userId);
    }

    static create(userId, { bankName, principal, rateOfInterest, startDate, maturityDate, note = '' }) {
        return this.tripleWrite((database) => {
            const timestamp = Date.now();
            const stmt = database.prepare(`
                INSERT INTO fixed_deposits (userId, bankName, principal, rateOfInterest, startDate, maturityDate, note, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const result = stmt.run(userId, bankName, principal, rateOfInterest, startDate, maturityDate, note, timestamp);
            if (database === db) {
                return this.getById(result.lastInsertRowid, userId);
            }
            return result;
        });
    }

    static update(id, userId, { bankName, principal, rateOfInterest, startDate, maturityDate, note }) {
        return this.tripleWrite((database) => {
            const timestamp = Date.now();
            const stmt = database.prepare(`
                UPDATE fixed_deposits 
                SET bankName = ?, principal = ?, rateOfInterest = ?, startDate = ?, maturityDate = ?, note = ?, timestamp = ?
                WHERE id = ? AND userId = ?
            `);
            const result = stmt.run(bankName, principal, rateOfInterest, startDate, maturityDate, note, timestamp, id, userId);
            if (database === db) {
                return this.getById(id, userId);
            }
            return result;
        });
    }

    static delete(id, userId) {
        return this.tripleWrite((database) => {
            const stmt = database.prepare('DELETE FROM fixed_deposits WHERE id = ? AND userId = ?');
            const result = stmt.run(id, userId);
            if (database === db) {
                return result.changes > 0;
            }
            return result;
        });
    }

    // Calculate pro-rata current value
    static calculateCurrentValue(fd) {
        const now = new Date();
        const start = new Date(fd.startDate);
        const maturity = new Date(fd.maturityDate);
        
        // If matured, return maturity value
        if (now >= maturity) {
            const years = (maturity - start) / (1000 * 60 * 60 * 24 * 365);
            return fd.principal * Math.pow(1 + fd.rateOfInterest / 100, years);
        }
        
        // Pro-rata calculation (compound interest)
        const yearsElapsed = (now - start) / (1000 * 60 * 60 * 24 * 365);
        if (yearsElapsed <= 0) return fd.principal;
        
        return fd.principal * Math.pow(1 + fd.rateOfInterest / 100, yearsElapsed);
    }

    static calculateMaturityValue(fd) {
        const start = new Date(fd.startDate);
        const maturity = new Date(fd.maturityDate);
        const years = (maturity - start) / (1000 * 60 * 60 * 24 * 365);
        return fd.principal * Math.pow(1 + fd.rateOfInterest / 100, years);
    }
}

export default FixedDeposit;
